import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";

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

export default function Messages() {
  const router = useRouter();
  const [selfId, setSelfId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
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
    setSelfId(session.user.id);

    const [{ data: friendships }, { data: allMsgs }, { data: unread }] = await Promise.all([
      supabase.from("friendships").select("*").eq("status", "accepted").or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`),
      supabase.from("direct_messages").select("*").or(`sender_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`).order("created_at", { ascending: false }),
      supabase.from("direct_messages").select("sender_id").eq("recipient_id", session.user.id).is("read_at", null),
    ]);

    const friendIds = (friendships || []).map((f) => f.requester_id === session.user.id ? f.addressee_id : f.requester_id);
    if (friendIds.length === 0) { setConversations([]); setLoading(false); return; }

    const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", friendIds);

    const unreadCounts = {};
    (unread || []).forEach((m) => { unreadCounts[m.sender_id] = (unreadCounts[m.sender_id] || 0) + 1; });

    const lastMsgByContact = {};
    (allMsgs || []).forEach((m) => {
      const otherId = m.sender_id === session.user.id ? m.recipient_id : m.sender_id;
      if (!lastMsgByContact[otherId]) lastMsgByContact[otherId] = m;
    });

    const convos = (profiles || []).map((c) => ({
      ...c,
      lastMessage: lastMsgByContact[c.id] || null,
      unread: unreadCounts[c.id] || 0,
    })).sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const tb = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return tb - ta;
    });

    setConversations(convos);
    setLoading(false);

    if (router.query.to) {
      const preselect = convos.find((c) => c.id === router.query.to);
      if (preselect) openThread(preselect, session.user.id);
    }
  }

  useEffect(() => { loadConversations(); }, [router.query.to]);

  async function openThread(contact, uidOverride) {
    const uid = uidOverride || selfId;
    setSelected(contact);
    setShowList(false);
    const { data } = await supabase.from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${uid},recipient_id.eq.${contact.id}),and(sender_id.eq.${contact.id},recipient_id.eq.${uid})`)
      .order("created_at", { ascending: true });
    setThread(await resolveAttachments(data || []));
    await supabase.from("direct_messages").update({ read_at: new Date().toISOString() })
      .eq("recipient_id", uid).eq("sender_id", contact.id).is("read_at", null);
    setConversations((prev) => prev.map((c) => c.id === contact.id ? { ...c, unread: 0 } : c));
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  }

  async function refreshThread() {
    const { data } = await supabase.from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${selfId},recipient_id.eq.${selected.id}),and(sender_id.eq.${selected.id},recipient_id.eq.${selfId})`)
      .order("created_at", { ascending: true });
    setThread(await resolveAttachments(data || []));
    await loadConversations();
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  }

  async function send() {
    if (!input.trim() || !selected) return;
    const content = input.trim();
    setInput("");
    await supabase.from("direct_messages").insert({ sender_id: selfId, recipient_id: selected.id, content });
    await refreshThread();
  }

  async function uploadAndSend(file, attachmentType, defaultLabel) {
    setUploading(true);
    const folder = conversationFolder(selfId, selected.id);
    const ext = file.name?.split(".").pop() || (attachmentType === "audio" ? "webm" : "bin");
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("dm-uploads").upload(path, file);
    if (!error) {
      await supabase.from("direct_messages").insert({
        sender_id: selfId, recipient_id: selected.id,
        content: defaultLabel || "",
        attachment_path: path, attachment_type: attachmentType, attachment_name: file.name || null,
      });
      await refreshThread();
    }
    setUploading(false);
  }

  function handleFilePick(e) {
    const file = e.target.files[0];
    if (!file) return;
    uploadAndSend(file, attachmentTypeFor(file));
    e.target.value = "";
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const file = new File([blob], "sprachnachricht.webm", { type: "audio/webm" });
      stream.getTracks().forEach((t) => t.stop());
      await uploadAndSend(file, "audio", "🎤 Sprachnachricht");
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout fullBleed>
      <div className="flex h-full gap-3">
        <div className={`w-full md:w-72 flex-shrink-0 flex-col gap-0.5 overflow-y-auto ${showList ? "flex" : "hidden md:flex"}`}>
          <h1 className="text-lg font-display text-white px-2 mb-2">Nachrichten</h1>
          {conversations.map((c) => {
            const preview = c.lastMessage
              ? (c.lastMessage.sender_id === selfId ? "Du: " : "") + (c.lastMessage.content || (c.lastMessage.attachment_type === "image" ? "📷 Foto" : c.lastMessage.attachment_type === "audio" ? "🎤 Sprachnachricht" : c.lastMessage.attachment_type === "video" ? "🎬 Video" : "📎 Datei"))
              : "Noch keine Nachrichten";
            return (
              <button key={c.id} onClick={() => openThread(c)}
                className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left ${selected?.id === c.id ? "bg-surfaceRaised" : "hover:bg-surfaceRaised"}`}>
                <Avatar name={c.full_name || "?"} src={c.avatar_url} size={42} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${c.unread > 0 ? "font-bold text-white" : "font-medium text-white"}`}>{c.full_name || "Unbenannt"}</span>
                    {c.lastMessage && <span className="text-[10px] text-textMuted flex-shrink-0">{formatPreviewTime(c.lastMessage.created_at)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs truncate ${c.unread > 0 ? "text-white font-medium" : "text-textMuted"}`}>{preview}</span>
                    {c.unread > 0 && <span className="badge-count flex-shrink-0">{c.unread > 9 ? "9+" : c.unread}</span>}
                  </div>
                </div>
              </button>
            );
          })}
          {conversations.length === 0 && (
            <div className="px-3 text-xs text-textMuted">
              Noch keine Freunde zum Schreiben. <button onClick={() => router.push("/members")} className="underline text-amber">Mitglieder ansehen</button> und eine Anfrage schicken.
            </div>
          )}
        </div>

        <div className={`flex-1 flex-col card !p-0 overflow-hidden ${showList ? "hidden md:flex" : "flex"}`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-textMuted text-sm">Wähle links eine Person aus.</div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line flex-shrink-0">
                <button onClick={() => setShowList(true)} className="md:hidden text-textMuted">←</button>
                <Avatar name={selected.full_name || "?"} src={selected.avatar_url} size={30} />
                <span className="font-semibold text-white text-sm">{selected.full_name || "Unbenannt"}</span>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                {thread.map((m) => {
                  const mine = m.sender_id === selfId;
                  return (
                    <div key={m.id} className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${mine ? "self-end bg-amber text-white" : "self-start bg-surfaceRaised text-white"}`}>
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
