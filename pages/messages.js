import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";

export default function Messages() {
  const [selfId, setSelfId] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [unreadByContact, setUnreadByContact] = useState({});
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(true); // mobile: list vs thread view
  const scrollRef = useRef(null);

  async function loadContacts() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const [{ data: profiles }, { data: unread }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("status", "approved").neq("id", session.user.id).order("full_name"),
      supabase.from("direct_messages").select("sender_id").eq("recipient_id", session.user.id).is("read_at", null),
    ]);
    setContacts(profiles || []);
    const counts = {};
    (unread || []).forEach((m) => { counts[m.sender_id] = (counts[m.sender_id] || 0) + 1; });
    setUnreadByContact(counts);
    setLoading(false);
  }

  useEffect(() => { loadContacts(); }, []);

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
    setUnreadByContact((prev) => ({ ...prev, [contact.id]: 0 }));
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
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout fullBleed>
      <div className="flex h-full gap-3">
        <div className={`w-full md:w-64 flex-shrink-0 flex-col gap-1.5 overflow-y-auto ${showList ? "flex" : "hidden md:flex"}`}>
          <h1 className="text-lg font-display text-white px-1 mb-2">Nachrichten</h1>
          {contacts.map((c) => {
            const unread = unreadByContact[c.id] || 0;
            return (
              <button key={c.id} onClick={() => openThread(c)}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left text-sm ${selected?.id === c.id ? "bg-surfaceRaised text-white" : "text-[#9195A6] hover:bg-surfaceRaised hover:text-white"}`}>
                <span className="truncate">{c.full_name || "Unbenannt"}</span>
                {unread > 0 && <span className="bg-coral text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">{unread}</span>}
              </button>
            );
          })}
          {contacts.length === 0 && <p className="text-textMuted text-xs px-3">Keine anderen Nutzer gefunden.</p>}
        </div>

        <div className={`flex-1 flex-col card !p-0 overflow-hidden ${showList ? "hidden md:flex" : "flex"}`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-textMuted text-sm">Wähle links eine Person aus.</div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-line flex-shrink-0">
                <button onClick={() => setShowList(true)} className="md:hidden text-textMuted">←</button>
                <span className="font-semibold text-white text-sm">{selected.full_name || "Unbenannt"}</span>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                {thread.map((m) => (
                  <div key={m.id} className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${m.sender_id === selfId ? "self-end bg-amber text-[#16130A]" : "self-start bg-surfaceRaised text-white"}`}>
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
