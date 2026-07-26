import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";

function formatPreviewTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

export default function Messages() {
  const [selfId, setSelfId] = useState(null);
  const [conversations, setConversations] = useState([]); // sorted, WhatsApp-style
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(true);
  const scrollRef = useRef(null);

  async function loadConversations() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const [{ data: profiles }, { data: allMsgs }, { data: unread }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url").eq("status", "approved").neq("id", session.user.id).order("full_name"),
      supabase.from("direct_messages").select("*").or(`sender_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`).order("created_at", { ascending: false }),
      supabase.from("direct_messages").select("sender_id").eq("recipient_id", session.user.id).is("read_at", null),
    ]);

    const unreadCounts = {};
    (unread || []).forEach((m) => { unreadCounts[m.sender_id] = (unreadCounts[m.sender_id] || 0) + 1; });

    const lastMsgByContact = {};
    (allMsgs || []).forEach((m) => {
      const otherId = m.sender_id === session.user.id ? m.recipient_id : m.sender_id;
      if (!lastMsgByContact[otherId]) lastMsgByContact[otherId] = m; // erste Fund = neueste, da schon sortiert
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
  }

  useEffect(() => { loadConversations(); }, []);

  async function openThread(contact) {
    setSelected(contact);
    setShowList(false);
    const { data } = await supabase.from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${selfId},recipient_id.eq.${contact.id}),and(sender_id.eq.${contact.id},recipient_id.eq.${selfId})`)
      .order("created_at", { ascending: true });
    setThread(data || []);
    await supabase.from("direct_messages").update({ read_at: new Date().toISOString() })
      .eq("recipient_id", selfId).eq("sender_id", contact.id).is("read_at", null);
    setConversations((prev) => prev.map((c) => c.id === contact.id ? { ...c, unread: 0 } : c));
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  }

  async function send() {
    if (!input.trim() || !selected) return;
    const content = input.trim();
    setInput("");
    await supabase.from("direct_messages").insert({ sender_id: selfId, recipient_id: selected.id, content });
    const { data } = await supabase.from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${selfId},recipient_id.eq.${selected.id}),and(sender_id.eq.${selected.id},recipient_id.eq.${selfId})`)
      .order("created_at", { ascending: true });
    setThread(data || []);
    await loadConversations();
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout fullBleed>
      <div className="flex h-full gap-3">
        <div className={`w-full md:w-72 flex-shrink-0 flex-col gap-0.5 overflow-y-auto ${showList ? "flex" : "hidden md:flex"}`}>
          <h1 className="text-lg font-display text-white px-2 mb-2">Nachrichten</h1>
          {conversations.map((c) => {
            const preview = c.lastMessage
              ? (c.lastMessage.sender_id === selfId ? "Du: " : "") + c.lastMessage.content
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
          {conversations.length === 0 && <p className="text-textMuted text-xs px-3">Keine anderen Nutzer gefunden.</p>}
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
                {thread.map((m) => (
                  <div key={m.id} className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${m.sender_id === selfId ? "self-end bg-amber text-white" : "self-start bg-surfaceRaised text-white"}`}>
                    {m.content}
                  </div>
                ))}
                {thread.length === 0 && <p className="text-textMuted text-xs text-center mt-6">Noch keine Nachrichten — schreib was!</p>}
              </div>
              <div className="flex items-center gap-2 p-3 border-t border-line flex-shrink-0">
                <input className="input flex-1" placeholder="Nachricht..." value={input}
                  onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
                <button onClick={send} className="btn">Senden</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
