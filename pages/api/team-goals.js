import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { goalMetric } from "../../lib/goalMetrics";

// Liefert die Wochenziele der eigenen Teams samt Fortschritt.
//
// Warum auf dem Server: der Fortschritt ist eine Team-Summe, die Rohdaten
// dahinter sind es nicht. Die Anruf-Zahlen (call_log_days) darf ein normales
// Teammitglied nur für sich selbst lesen — würde der Browser die Summe
// bilden, sähe jede/r nur den EIGENEN Beitrag und das Team wirkte dauerhaft
// weit hinter dem Ziel. Hier wird deshalb mit erweiterten Rechten gerechnet,
// aber ausschliesslich für Teams, in denen die anfragende Person Mitglied
// ist, und herausgegeben wird nur die aggregierte Zahl.
export const config = { maxDuration: 20 };

function wochenStart(d = new Date()) {
  const tag = d.getDay();
  const montag = new Date(d);
  montag.setDate(d.getDate() + ((tag === 0 ? -6 : 1) - tag));
  montag.setHours(0, 0, 0, 0);
  return montag;
}

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  try {
    // Mitgliedschaften über den RLS-gebundenen Client: nur echte eigene Teams.
    const { data: eigene } = await client.from("team_members").select("team_id").eq("user_id", user.id);
    const teamIds = (eigene || []).map((m) => m.team_id);
    // Teamleads sind nicht zwingend als Mitglied eingetragen.
    const { data: gefuehrte } = await client.from("teams").select("id").eq("created_by", user.id);
    (gefuehrte || []).forEach((t) => { if (!teamIds.includes(t.id)) teamIds.push(t.id); });
    if (!teamIds.length) return res.status(200).json({ ziele: [] });

    const admin = getAdminSupabase();
    const start = wochenStart();
    const startISO = start.toISOString();
    const startTag = startISO.slice(0, 10);

    const [{ data: ziele }, { data: mitglieder }] = await Promise.all([
      admin.from("team_goals").select("*").in("team_id", teamIds).eq("week_start", startTag).order("created_at", { ascending: true }),
      admin.from("team_members").select("team_id, user_id").in("team_id", teamIds),
    ]);
    if (!ziele?.length) return res.status(200).json({ ziele: [] });

    const mitgliederVon = new Map();
    (mitglieder || []).forEach((m) => {
      if (!mitgliederVon.has(m.team_id)) mitgliederVon.set(m.team_id, []);
      mitgliederVon.get(m.team_id).push(m.user_id);
    });

    const ergebnis = await Promise.all(ziele.map(async (ziel) => {
      const ids = mitgliederVon.get(ziel.team_id) || [];
      const metrik = goalMetric(ziel.metric);
      let fortschritt = 0;

      if (ids.length && metrik) {
        if (metrik.quelle === "zeilen") {
          const { count } = await admin.from(metrik.tabelle)
            .select("id", { count: "exact", head: true }).in("user_id", ids).gte("created_at", startISO);
          fortschritt = count || 0;
        } else if (metrik.quelle === "calltracker") {
          // Die Zähler stehen als Tagessummen in counts — aufaddieren statt
          // Zeilen zählen, eine Zeile ist ein Tag, nicht ein Anruf.
          const { data: tage } = await admin.from("call_log_days")
            .select("counts").in("user_id", ids).gte("log_date", startTag);
          fortschritt = (tage || []).reduce((s, t) => s + (Number(t.counts?.[metrik.feld]) || 0), 0);
        } else if (metrik.quelle === "leads") {
          const { count } = await admin.from("leads")
            .select("id", { count: "exact", head: true }).in("created_by", ids).gte("created_at", startISO);
          fortschritt = count || 0;
        }
      }

      return { ...ziel, fortschritt };
    }));

    return res.status(200).json({ ziele: ergebnis });
  } catch (e) {
    console.error("Team-Ziele konnten nicht geladen werden:", e.message);
    return res.status(500).json({ error: e.message || "Team-Ziele konnten nicht geladen werden." });
  }
}
