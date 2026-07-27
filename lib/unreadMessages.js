// Eine einzige, gemeinsam genutzte Funktion zum Berechnen ungelesener Nachrichten
// (1:1 und Gruppen). Vorher gab es diese Logik 3x separat nachgebaut (Sidebar,
// Dashboard, Nachrichtenliste) — das führte zu Abweichungen. Jetzt gibt's nur
// noch EINE Quelle der Wahrheit.
export async function getUnreadMessageInfo(supabase, uid) {
  const [{ data: myGroupMemberships }, { data: myReads }, { data: recentMsgs }] = await Promise.all([
    supabase.from("chat_group_members").select("group_id").eq("user_id", uid),
    supabase.from("conversation_reads").select("*").eq("user_id", uid),
    supabase.from("direct_messages").select("id, sender_id, recipient_id, group_id, created_at, content, attachment_type")
      .or(`sender_id.eq.${uid},recipient_id.eq.${uid},group_id.not.is.null`)
      .order("created_at", { ascending: false }),
  ]);

  const myGroupIds = new Set((myGroupMemberships || []).map((m) => m.group_id));
  const readByKey = {};
  (myReads || []).forEach((r) => { readByKey[`${r.is_group ? "g" : "d"}:${r.target_id}`] = r.last_read_at; });

  // Nur Nachrichten, die mich wirklich etwas angehen: eigene Gruppen oder an mich gerichtete 1:1-Nachrichten.
  const relevant = (recentMsgs || []).filter((m) => {
    if (m.group_id) return myGroupIds.has(m.group_id);
    return m.sender_id === uid || m.recipient_id === uid;
  });

  let total = 0;
  const unreadByConvoKey = {};
  relevant.forEach((m) => {
    if (m.sender_id === uid) return; // eigene Nachrichten zählen nie als ungelesen für mich
    const key = m.group_id ? `g:${m.group_id}` : `d:${m.sender_id}`;
    const lastRead = readByKey[key] || "1970-01-01T00:00:00.000Z";
    if (new Date(m.created_at) > new Date(lastRead)) {
      total++;
      unreadByConvoKey[key] = (unreadByConvoKey[key] || 0) + 1;
    }
  });

  return { total, unreadByConvoKey, relevantMessages: relevant, myGroupIds, readByKey };
}
