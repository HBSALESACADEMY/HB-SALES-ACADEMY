import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";
import { getUnreadMessageInfo } from "../lib/unreadMessages";
import { validateChatAttachment } from "../lib/uploadValidation";

function formatPreviewTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function conversationFolder(a, b) {
  return [a, b].sort().join("_");
}

function attachmentTypeFor(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

const EPOCH = "1970-01-01T00:00:00.000Z";

export default function Messages() {
  const router = useRouter();
  const [selfId, setSelfId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [selected, setSelected] = useState(null); // { id, type: 'dm'|'group', full_name, avatar_url }
  const [thread, setThread] = useState([]);
  const [readStates, setReadStates] = useState({});
  const [groupMemberCount, setGroupMemberCount] = useState(0); // { userId: last_read_at } — für DM: 1 Eintrag, für Gruppe: alle anderen Mitglieder
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState(new Set());
  const scrollRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function resolveAttachments(messages) {
    const withUrls = await Promise.all(messages.map(async (m) => {
      if (!m.attachment_path) return m;
      const { data } = await supabase.storage.from("dm-uploads").createSignedUrl(m.attachment_path, 3600);
      return { ...m, signedUrl: data?.signedUrl };
    }));
    return withUrls;
  }

  async function loadConversations() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;
    setSelfId(uid);

    const [{ data: friendships }, { data: me }, unreadInfo] = await Promise.all([
      supabase.from("friendships").select("*").eq("status", "accepted").or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
      supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", uid).maybeSingle(),
      getUnreadMessageInfo(supabase, uid),
    ]);
    const { unreadByConvoKey, relevantMessages, myGroupIds } = unreadInfo;
    // Plattform-Admins können per Firmencode "als" eine andere Organisation
    // eingeloggt sein (sessionStorage) — dann zählen deren Mitglieder als
    // direkt anschreibbar, nicht die der eigenen Heimat-Organisation.
    const activeOrgId = (me?.is_platform_admin && sessionStorage.getItem("hb_active_org_id")) || me?.organization_id;

    const friendIds = (friendships || []).map((f) => f.requester_id === uid ? f.addressee_id : f.requester_id);
    const [{ data: friendProfiles }, { data: orgColleagues }] = await Promise.all([
      friendIds.length ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", friendIds) : Promise.resolve({ data: [] }),
      // Mitglieder der eigenen Organisation sind immer direkt anschreibbar,
      // unabhängig von einer Freundschaft — deshalb hier mit in die
      // Kontakt-/Konversationsliste aufgenommen.
      activeOrgId
        ? supabase.from("profiles").select("id, full_name, avatar_url").eq("organization_id", activeOrgId).eq("status", "approved").neq("id", uid)
        : Promise.resolve({ data: [] }),
    ]);
    const contactById = new Map();
    (friendProfiles || []).forEach((p) => contactById.set(p.id, p));
    (orgColleagues || []).forEach((p) => contactById.set(p.id, p));
    const dmContacts = Array.from(contactById.values());
    setFriendsList(dmContacts);

    const groupIdsArr = Array.from(myGroupIds);
    const { data: groups } = groupIdsArr.length
      ? await supabase.from("chat_groups").select("*").in("id", groupIdsArr)
      : { data: [] };

    const lastMsgByConvo = {};
    relevantMessages.forEach((m) => {
      const key = m.group_id ? `g:${m.group_id}` : `d:${m.sender_id === uid ? m.recipient_id : m.sender_id}`;
      if (!lastMsgByConvo[key]) lastMsgByConvo[key] = m;
    });

    const dmConvos = dmContacts.map((c) => ({
      id: c.id, type: "dm", full_name: c.full_name, avatar_url: c.avatar_url,
      lastMessage: lastMsgByConvo[`d:${c.id}`] || null, unread: unreadByConvoKey[`d:${c.id}`] || 0,
    }));
    const groupConvos = (groups || []).map((g) => ({
      id: g.id, type: "group", full_name: g.name, avatar_url: null,
      lastMessage: lastMsgByConvo[`g:${g.id}`] || null, unread: unreadByConvoKey[`g:${g.id}`] || 0,
    }));

    const convos = [...dmConvos, ...groupConvos].sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const tb = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return tb - ta;
    });

    setConversations(convos);
    setLoading(false);

    if (router.query.to) {
      const preselect = convos.find((c) => c.type === "dm" && c.id === router.query.to);
      if (preselect) openThread(preselect, uid);
    }
  }

  useEffect(() => { loadConversations(); }, [router.query.to]);

  // Echtzeit: neue Nachrichten (eigene oder Gruppen) kommen sofort an, ohne Neuladen.
  useEffect(() => {
    if (!selfId) return;
    const channel = supabase
      .channel("dm-realtime-" + selfId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
        const m = payload.new;
        const belongsToOpenThread = selected && (
          (selected.type === "group" && m.group_id === selected.id) ||
          (selected.type === "dm" && ((m.sender_id === selfId && m.recipient_id === selected.id) || (m.sender_id === selected.id && m.recipient_id === selfId)))
        );
        if (belongsToOpenThread) refreshThread();
        loadConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads" }, () => {
        if (selected) loadReadReceipts(selected, selfId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selfId, selected]);

  async function markRead(contact, uid) {
    await supabase.from("conversation_reads").upsert({
      user_id: uid, target_id: contact.id, is_group: contact.type === "group", last_read_at: new Date().toISOString(),
    }, { onConflict: "user_id,target_id,is_group" });
    setConversations((prev) => prev.map((c) => (c.id === contact.id && c.type === contact.type) ? { ...c, unread: 0 } : c));
  }

  async function loadReadReceipts(contact, uid) {
    if (contact.type === "group") {
      const [{ data: reads }, { count: memberCount }] = await Promise.all([
        supabase.from("conversation_reads").select("user_id, last_read_at").eq("is_group", true).eq("target_id", contact.id).neq("user_id", uid),
        supabase.from("chat_group_members").select("user_id", { count: "exact", head: true }).eq("group_id", contact.id).neq("user_id", uid),
      ]);
      const byUser = {};
      (reads || []).forEach((r) => { byUser[r.user_id] = r.last_read_at; });
      setReadStates(byUser);
      setGroupMemberCount(memberCount || 0);
    } else {
      const { data: read } = await supabase.from("conversation_reads").select("last_read_at").eq("user_id", contact.id).eq("target_id", uid).eq("is_group", false).maybeSingle();
      setReadStates(read ? { [contact.id]: read.last_read_at } : {});
    }
  }

  async function openThread(contact, uidOverride) {
    const uid = uidOverride || selfId;
    setSelected(contact);
    setShowList(false);
    let data;
    if (contact.type === "group") {
      const res = await supabase.from("direct_messages").select("*").eq("group_id", contact.id).order("created_at", { ascending: true });
      data = res.data;
    } else {
      const res = await supabase.from("direct_messages").select("*")
        .or(`and(sender_id.eq.${uid},recipient_id.eq.${contact.id}),and(sender_id.eq.${contact.id},recipient_id.eq.${uid})`)
        .order("created_at", { ascending: true });
      data = res.data;
    }
    const resolved = await resolveAttachments(data || []);
    setThread(resolved);
    await markRead(contact, uid);
    await loadReadReceipts(contact, uid);
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  }

  async function refreshThread() {
    let data;
    if (selected.type === "group") {
      const res = await supabase.from("direct_messages").select("*").eq("group_id", selected.id).order("created_at", { ascending: true });
      data = res.data;
    } else {
      const res = await supabase.from("direct_messages").select("*")
        .or(`and(sender_id.eq.${selfId},recipient_id.eq.${selected.id}),and(sender_id.eq.${selected.id},recipient_id.eq.${selfId})`)
        .order("created_at", { ascending: true });
      data = res.data;
    }
    const resolved = await resolveAttachments(data || []);
    setThread(resolved);
    await loadReadReceipts(selected, selfId);
    await loadConversations();
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  }

  async function send() {
    if (!input.trim() || !selected) return;
    const content = input.trim();
    setInput("");
    const payload = selected.type === "group"
      ? { sender_id: selfId, group_id: selected.id, content }
      : { sender_id: selfId, recipient_id: selected.id, content };
    const { error } = await supabase.from("direct_messages").insert(payload);
    if (error) { alert("Nachricht konnte nicht gesendet werden: " + error.message); setInput(content); return; }
    await refreshThread();
  }

  async function uploadAndSend(file, attachmentType, defaultLabel) {
    setUploading(true);
    const folder = selected.type === "group" ? `grp-${selected.id}` : conversationFolder(selfId, selected.id);
    const ext = file.name?.split(".").pop() || (attachmentType === "audio" ? "webm" : "bin");
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("dm-uploads").upload(path, file);
    if (!error) {
      const payload = selected.type === "group"
        ? { sender_id: selfId, group_id: selected.id, content: defaultLabel || "", attachment_path: path, attachment_type: attachmentType, attachment_name: file.name || null }
        : { sender_id: selfId, recipient_id: selected.id, content: defaultLabel || "", attachment_path: path, attachment_type: attachmentType, attachment_name: file.name || null };
      const { error: insertError } = await supabase.from("direct_messages").insert(payload);
      if (insertError) alert("Anhang konnte nicht gesendet werden: " + insertError.message);
      else await refreshThread();
    } else {
      alert("Datei-Upload fehlgeschlagen: " + error.message);
    }
    setUploading(false);
  }

  function handleFilePick(e) {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateChatAttachment(file);
    if (err) { alert(err); e.target.value = ""; return; }
    uploadAndSend(file, attachmentTypeFor(file));
    e.target.value = "";
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm", "audio/mp4", "audio/ogg"];
      const mimeType = preferred.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const actualType = recorder.mimeType || mimeType || "audio/webm";
        const ext = actualType.includes("mp4") ? "m4a" : actualType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        stream.getTracks().forEach((t) => t.stop());
        if (blob.size === 0) { setRecording(false); return; }
        const file = new File([blob], `sprachnachricht.${ext}`, { type: actualType });
        await uploadAndSend(file, "audio", "🎤 Sprachnachricht");
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (e) {
      alert("Mikrofon-Zugriff nicht möglich — bitte in den Browser-Einstellungen erlauben.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function toggleGroupMember(id) {
    setNewGroupMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function createGroup() {
    if (!newGroupName.trim() || newGroupMembers.size === 0) return;
    const groupId = crypto.randomUUID();
    const { error } = await supabase.from("chat_groups").insert({ id: groupId, name: newGroupName.trim(), created_by: selfId });
    if (error) { alert("Gruppe konnte nicht erstellt werden: " + error.message); return; }
    const members = [{ group_id: groupId, user_id: selfId }, ...Array.from(newGroupMembers).map((id) => ({ group_id: groupId, user_id: id }))];
    const { error: memberError } = await supabase.from("chat_group_members").insert(members);
    if (memberError) { alert("Mitglieder konnten nicht hinzugefügt werden: " + memberError.message); return; }
    setShowNewGroup(false);
    const groupName = newGroupName.trim();
    setNewGroupName("");
    setNewGroupMembers(new Set());
    await loadConversations();
    openThread({ id: groupId, type: "group", full_name: groupName, avatar_url: null });
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout fullBleed>
      <div className="flex h-full gap-3">
        <div className={`w-full md:w-72 flex-shrink-0 flex-col gap-0.5 overflow-y-auto ${showList ? "flex" : "hidden md:flex"}`}>
          <div className="flex items-center justify-between px-2 mb-2">
            <h1 className="text-lg font-display text-textMain">Nachrichten</h1>
            <button onClick={() => setShowNewGroup(true)} className="btn-ghost text-xs px-2 py-1" title="Neue Gruppe">+ Gruppe</button>
          </div>

          {showNewGroup && (
            <div className="card !p-3 mb-2 mx-1">
              <input className="input text-xs mb-2" placeholder="Gruppenname" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto mb-2">
                {friendsList.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-xs text-textMain cursor-pointer">
                    <input type="checkbox" checked={newGroupMembers.has(f.id)} onChange={() => toggleGroupMember(f.id)} />
                    {f.full_name || "Unbenannt"}
                  </label>
                ))}
                {friendsList.length === 0 && <p className="text-textMuted text-xs">Noch niemand, mit dem du eine Gruppe starten könntest.</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowNewGroup(false)} className="btn-ghost text-xs flex-1">Abbrechen</button>
                <button onClick={createGroup} disabled={!newGroupName.trim() || newGroupMembers.size === 0} className="btn text-xs flex-1 disabled:opacity-40">Erstellen</button>
              </div>
            </div>
          )}

          {conversations.map((c) => {
            const preview = c.lastMessage
              ? (c.lastMessage.sender_id === selfId ? "Du: " : "") + (c.lastMessage.content || (c.lastMessage.attachment_type === "image" ? "📷 Foto" : c.lastMessage.attachment_type === "audio" ? "🎤 Sprachnachricht" : c.lastMessage.attachment_type === "video" ? "🎬 Video" : "📎 Datei"))
              : "Noch keine Nachrichten";
            return (
              <button key={`${c.type}:${c.id}`} onClick={() => openThread(c)}
                className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left ${selected?.id === c.id && selected?.type === c.type ? "bg-surfaceRaised" : "hover:bg-surfaceRaised"}`}>
                {c.type === "group" ? (
                  <div className="w-[42px] h-[42px] rounded-full bg-surfaceRaised border border-line flex items-center justify-center flex-shrink-0">
                    <Icon name="users" size={18} color="var(--org-color-1, #7B2FF7)" />
                  </div>
                ) : (
                  <Avatar name={c.full_name || "?"} src={c.avatar_url} size={42} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${c.unread > 0 ? "font-bold text-textMain" : "font-medium text-textMain"}`}>{c.full_name || "Unbenannt"}</span>
                    {c.lastMessage && <span className="text-[10px] text-textMuted flex-shrink-0">{formatPreviewTime(c.lastMessage.created_at)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs truncate ${c.unread > 0 ? "text-textMain font-medium" : "text-textMuted"}`}>{preview}</span>
                    {c.unread > 0 && <span className="badge-count flex-shrink-0">{c.unread > 9 ? "9+" : c.unread}</span>}
                  </div>
                </div>
              </button>
            );
          })}
          {conversations.length === 0 && !showNewGroup && (
            <div className="px-3 text-xs text-textMuted">
              Noch niemand zum Schreiben. <button onClick={() => router.push("/members")} className="underline text-amber">Mitglieder ansehen</button> — Kollegen deiner Organisation kannst du direkt anschreiben, alle anderen erst nach einer Anfrage.
            </div>
          )}
        </div>

        <div className={`flex-1 flex-col card !p-0 overflow-hidden ${showList ? "hidden md:flex" : "flex"}`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-textMuted text-sm">Wähle links eine Person oder Gruppe aus.</div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line flex-shrink-0">
                <button onClick={() => setShowList(true)} className="md:hidden text-textMuted">←</button>
                {selected.type === "group" ? (
                  <div className="flex items-center gap-2.5">
                    <div className="w-[30px] h-[30px] rounded-full bg-surfaceRaised border border-line flex items-center justify-center">
                      <Icon name="users" size={15} color="var(--org-color-1, #7B2FF7)" />
                    </div>
                    <span className="font-semibold text-textMain text-sm">{selected.full_name}</span>
                  </div>
                ) : (
                  <button onClick={() => openProfile(selected.id)} className="flex items-center gap-2.5 hover:opacity-80">
                    <Avatar name={selected.full_name || "?"} src={selected.avatar_url} size={30} />
                    <span className="font-semibold text-textMain text-sm">{selected.full_name || "Unbenannt"}</span>
                  </button>
                )}
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                {thread.map((m) => {
                  const mine = m.sender_id === selfId;
                  let receipt = null;
                  if (mine) {
                    if (selected.type === "group") {
                      const readCount = Object.values(readStates).filter((t) => new Date(t) >= new Date(m.created_at)).length;
                      if (groupMemberCount > 0 && readCount >= groupMemberCount) receipt = "✓✓ Gelesen von allen";
                      else if (readCount > 0) receipt = `✓✓ Gelesen von ${readCount}`;
                      else receipt = "✓ Gesendet";
                    } else {
                      const partnerRead = readStates[selected.id];
                      receipt = partnerRead && new Date(partnerRead) >= new Date(m.created_at) ? "✓✓ Gelesen" : "✓ Gesendet";
                    }
                  }
                  return (
                    <div key={m.id} className="flex flex-col" style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${mine ? "" : "bg-surfaceRaised text-textMain"}`} style={mine ? { background: "var(--org-accent, #3D6FA8)", color: "var(--org-button-text, #fff)" } : {}}>
                        {m.attachment_type === "image" && m.signedUrl && <img src={m.signedUrl} alt="" className="rounded-lg max-h-72 mb-1" />}
                        {m.attachment_type === "video" && m.signedUrl && <video src={m.signedUrl} controls className="rounded-lg max-h-72 mb-1" />}
                        {m.attachment_type === "audio" && m.signedUrl && <audio src={m.signedUrl} controls className="mb-1" />}
                        {m.attachment_type === "file" && m.signedUrl && (
                          <a href={m.signedUrl} target="_blank" rel="noreferrer" className="underline flex items-center gap-1.5 mb-1">
                            <Icon name="download" size={13} /> {m.attachment_name || "Datei"}
                          </a>
                        )}
                        {m.content && <span>{m.content}</span>}
                      </div>
                      {receipt && <span className="text-[10px] text-textMuted mt-0.5 px-0.5">{receipt}</span>}
                    </div>
                  );
                })}
                {thread.length === 0 && <p className="text-textMuted text-xs text-center mt-6">Noch keine Nachrichten — schreib was!</p>}
              </div>
              <div className="flex items-center gap-2 p-3 border-t border-line flex-shrink-0">
                <label className="btn-ghost text-xs cursor-pointer px-2.5 py-2.5" title="Foto/Datei senden">
                  <Icon name="download" size={15} />
                  <input type="file" className="hidden" onChange={handleFilePick} disabled={uploading} />
                </label>
                <button onClick={recording ? stopRecording : startRecording} className={`btn-ghost text-xs px-2.5 py-2.5 ${recording ? "text-coral border-coral/40" : ""}`} title="Sprachnachricht">
                  {recording ? "■" : "🎤"}
                </button>
                <input className="input flex-1" placeholder={uploading ? "Lädt hoch..." : "Nachricht..."} value={input} disabled={uploading}
                  onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
                <button onClick={send} disabled={uploading} className="btn disabled:opacity-40">Senden</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
