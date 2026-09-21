import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { berlinHeute } from "../../lib/woche";

// Wer heute wie viel telefoniert hat — als kurze Liste im Call Tracker.
//
// Warum über den Server: Die Anruf-Zahlen einer anderen Person darf ein
// normales Teammitglied nicht lesen (siehe call_log_days in der Datenbank).
// Hier wird mit erweiterten Rechten gerechnet, aber nur das herausgegeben,
// was für eine Rangliste nötig ist: Vorname und zwei Zahlen von HEUTE, aus
// der eigenen Organisation.
//
// Wer nicht in der Rangliste stehen will, steht nicht darin: dasselbe
// Häkchen wie in der grossen Rangliste (profiles.leaderboard_opt_out).
// Man sieht sich selbst immer, auch ausgestiegen — sonst wäre die eigene
// Zahl weg.
export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  try {
    const admin = getAdminSupabase();
    const { data: ich } = await admin.from("profiles")
      .select("id, organization_id, is_platform_admin").eq("id", user.id).maybeSingle();
    const orgId = req.query.activeOrgId && (ich?.is_platform_admin || req.query.activeOrgId === ich?.organization_id)
      ? req.query.activeOrgId
      : await aktiveOrgId(admin, ich, user.id);
    if (!orgId) return res.status(200).json({ heute: berlinHeute(), liste: [] });

    const { data: mitglieder, error } = await admin.from("profiles")
      .select("id, full_name, leaderboard_opt_out")
      .eq("organization_id", orgId).eq("status", "approved");
    if (error) throw error;

    const erlaubt = (mitglieder || []).filter((m) => m.id === user.id || !m.leaderboard_opt_out);
    if (!erlaubt.length) return res.status(200).json({ heute: berlinHeute(), liste: [] });

    const heute = berlinHeute();
    const { data: zeilen } = await admin.from("call_log_days")
      .select("user_id, counts").eq("log_date", heute).in("user_id", erlaubt.map((m) => m.id));

    const zahlen = new Map();
    (zeilen || []).forEach((z) => {
      const bisher = zahlen.get(z.user_id) || { anwahlen: 0, termin: 0 };
      zahlen.set(z.user_id, {
        anwahlen: bisher.anwahlen + (Number(z?.counts?.anwahlen) || 0),
        termin: bisher.termin + (Number(z?.counts?.termin) || 0),
      });
    });

    // Nur der Vorname: Für eine Tagesliste genügt er, und er verrät
    // weniger als der vollständige Name in einer Leistungsübersicht.
    const liste = erlaubt
      .map((m) => ({
        id: m.id,
        name: String(m.full_name || "Unbenannt").trim().split(/\s+/)[0],
        ich: m.id === user.id,
        ...(zahlen.get(m.id) || { anwahlen: 0, termin: 0 }),
      }))
      .filter((p) => p.anwahlen > 0 || p.ich)
      .sort((a, b) => b.anwahlen - a.anwahlen || b.termin - a.termin);

    return res.status(200).json({ heute, liste });
  } catch (e) {
    console.error("Tagesrangliste fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Die Tagesrangliste lässt sich gerade nicht laden." });
  }
}
