import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { auswertungsTage } from "../../../lib/tagesauswertung";
import { briefingFenster } from "../../../lib/buddyBriefing";
import { berlinHeute } from "../../../lib/woche";

// Wer hat seine Morgennachricht bekommen — und wer nicht, und warum?
//
// Am 25.09.2026 starb der Morgenlauf im Timeout. Die Frage danach war:
// "Haben die Vertriebler die Nachricht mit den Vergleichen zu gestern
// bekommen?" Sie liess sich nicht beantworten. Die Antwort stand in zwei
// Spalten der Datenbank (auswertung_fuer, briefing_fuer), und die sieht
// niemand.
//
// Dabei ist das die einzige Frage, die morgens zählt: Nicht "ist der Cron
// gelaufen", sondern "hat Sarah ihre Zahlen gesehen".
//
// Zwei Nachrichten werden hier leicht verwechselt, deshalb stehen sie
// getrennt:
//   - Die TAGESAUSWERTUNG: die eigenen Zahlen von gestern mit dem Vergleich
//     zum Vortag und einem Impuls. Geht an jede Person mit verbundenem
//     Telegram.
//   - Der TAGESBERICHT: die Zahlen aller Organisationen, nur an den
//     Betreiber.
//
// Nur für den Plattform-Betreiber: zeigt Personen über Organisationen
// hinweg.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles")
    .select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_platform_admin) {
    return res.status(403).json({ error: "Das darf nur der Plattform-Betreiber." });
  }

  const admin = getAdminSupabase();
  const jetzt = new Date();
  const tage = auswertungsTage(jetzt);
  const fenster = briefingFenster(jetzt);

  const { data: verknuepfungen, error } = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, tagesauswertung, auswertung_fuer, briefing, briefing_fuer");
  if (error) return res.status(200).json({ fehler: error.message, personen: [] });

  // Alle Personen, nicht nur die verbundenen: Wer kein Telegram hat, ist der
  // häufigste Grund für "hat nichts bekommen" — und der fehlt in einer Liste
  // der Verbindungen naturgemäss.
  const { data: profile } = await admin.from("profiles")
    .select("id, full_name, organization_id, status")
    .neq("status", "rejected");
  const { data: orgs } = await admin.from("organizations").select("id, name");
  const orgName = new Map((orgs || []).map((o) => [o.id, o.name]));
  const vonPerson = new Map((verknuepfungen || []).map((v) => [v.user_id, v]));

  const personen = (profile || []).map((p) => {
    const v = vonPerson.get(p.id);
    const verbunden = !!v?.chat_id;
    return {
      id: p.id,
      name: p.full_name || "Unbenannt",
      organisation: orgName.get(p.organization_id) || null,
      verbunden,
      // "an" heisst: die Person will sie haben. Standard ist true
      // (migration_165 / migration_175) — wer sie abbestellt hat, ist kein
      // Fehler, sondern eine Entscheidung.
      auswertungAn: verbunden ? v.tagesauswertung !== false : false,
      auswertungBekommen: !!tage && v?.auswertung_fuer === tage.berichtTag,
      briefingAn: verbunden ? v.briefing !== false : false,
      briefingBekommen: v?.briefing_fuer === fenster.heute,
    };
  }).sort((a, b) => String(a.organisation).localeCompare(String(b.organisation))
    || a.name.localeCompare(b.name));

  const erwartet = personen.filter((p) => p.auswertungAn);
  return res.status(200).json({
    heute: berlinHeute(jetzt),
    // Am Wochenende gibt es keine Auswertung — dann ist "0 bekommen" richtig
    // und kein Ausfall.
    berichtTag: tage?.berichtTag || null,
    vergleichTag: tage?.vergleichTag || null,
    wochenende: !tage,
    personen,
    bekommen: erwartet.filter((p) => p.auswertungBekommen).length,
    erwartet: erwartet.length,
    ohneTelegram: personen.filter((p) => !p.verbunden).length,
  });
}
