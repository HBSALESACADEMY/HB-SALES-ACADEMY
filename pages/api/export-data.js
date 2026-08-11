import { requireUser } from "../../lib/supabaseServer";

// Auskunfts-/Mitnahmerecht (Art. 15/20 DSGVO): liefert alle personenbezogenen
// Daten der aufrufenden Person als JSON zum Download. Läuft über den RLS-
// gebundenen Client (nicht Service-Role) — jede Abfrage ist zusätzlich
// explizit auf die eigene user_id/created_by gefiltert, damit hier unter
// keinen Umständen fremde Daten mit ausgeliefert werden können.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const uid = auth.user.id;
  const { client } = auth;

  try {
    const [
      profile, leads, callRecordings, quizResults, examResults, roleplaySessions,
      communityPosts, communityComments, friendships, xpLog, loginEvents,
    ] = await Promise.all([
      client.from("profiles").select("*").eq("id", uid).maybeSingle(),
      client.from("leads").select("*").eq("created_by", uid),
      client.from("call_recordings").select("id, label, status, evaluation_score, evaluation_summary, outcome, created_at").eq("created_by", uid),
      client.from("quiz_results").select("*").eq("user_id", uid),
      client.from("exam_results").select("*").eq("user_id", uid),
      client.from("roleplay_sessions").select("*").eq("user_id", uid),
      client.from("community_posts").select("id, content, visibility, created_at").eq("user_id", uid),
      client.from("community_comments").select("id, content, created_at").eq("user_id", uid),
      client.from("friendships").select("*").or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
      client.from("xp_log").select("*").eq("user_id", uid),
      client.from("login_events").select("created_at").eq("user_id", uid),
    ]);

    const payload = {
      exportiert_am: new Date().toISOString(),
      hinweis: "Export aller dir zugeordneten personenbezogenen Daten gemäß Art. 15/20 DSGVO. Nachrichten sind aus Rücksicht auf Gesprächspartner:innen nicht enthalten — bei Bedarf bitte separat anfragen.",
      profil: profile.data,
      leads: leads.data || [],
      anruf_aufnahmen: callRecordings.data || [],
      quiz_ergebnisse: quizResults.data || [],
      pruefungs_ergebnisse: examResults.data || [],
      rollenspiele: roleplaySessions.data || [],
      community_beitraege: communityPosts.data || [],
      community_kommentare: communityComments.data || [],
      freundschaften: friendships.data || [],
      xp_verlauf: xpLog.data || [],
      logins: loginEvents.data || [],
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="meine-daten-${uid}.json"`);
    return res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Export fehlgeschlagen." });
  }
}
