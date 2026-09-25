import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { sendeTagesauswertungen } from "../../../lib/tagesauswertungVersand";
import { briefingUmAcht } from "../../../lib/buddyBriefing";
import { erinnereAnBestaetigungen } from "../../../lib/bestaetigungErinnerung";
import { neuesBudget, laufeSchritte } from "../../../lib/zeitbudget";

// Die Morgennachrichten von Hand nachschicken.
//
// Am 25.09.2026 starb der Morgenlauf um 9:49 im Timeout, und das Team bekam
// seine Guten-Morgen-Nachricht nicht. Es gab keinen Weg, sie nachzuholen:
// Der Knopf auf der Statusseite schickt nur den Bericht an den Betreiber.
// Einmal am Tag ausfallen kann immer etwas — dann muss es sich nachholen
// lassen, ohne auf den nächsten Morgen zu warten.
//
// Gefahrlos mehrfach aufrufbar: Jeder dieser Schritte merkt sich JE PERSON,
// was schon raus ist (auswertung_fuer, briefing_fuer). Wer seine Nachricht
// hat, bekommt sie nicht zweimal — wer sie nicht hat, bekommt sie jetzt.
//
// Nur für den Plattform-Betreiber, wie die Statusseite selbst: Der Aufruf
// schickt Nachrichten an alle Organisationen.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles")
    .select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_platform_admin) {
    return res.status(403).json({ error: "Das darf nur der Plattform-Betreiber." });
  }

  const admin = getAdminSupabase();
  const budget = neuesBudget();
  // Dieselbe Reihenfolge wie im Morgenlauf: Was zuerst gebraucht wird, geht
  // zuerst raus, falls die Zeit knapp wird.
  const { ergebnisse, offen, fehler, dauern, dauerMs } = await laufeSchritte([
    { name: "tagesauswertungen", braucht: 12000, lauf: () => sendeTagesauswertungen(admin) },
    { name: "briefings", braucht: 10000, lauf: () => briefingUmAcht(admin) },
    { name: "bestaetigungen", braucht: 6000, lauf: () => erinnereAnBestaetigungen(admin) },
  ], budget);

  const gesendet = (ergebnisse.tagesauswertungen?.gesendet || 0) + (ergebnisse.briefings?.gesendet || 0);
  return res.status(200).json({
    ok: true,
    gesendet,
    // Der Grund gehört in die Antwort: "0 gesendet" kann bedeuten, dass
    // alle ihre Nachricht schon haben, dass Wochenende ist oder dass
    // niemand Telegram verbunden hat. Das sind drei verschiedene Dinge.
    grund: ergebnisse.tagesauswertungen?.grund || null,
    dauerMs,
    dauern,
    offen,
    fehler,
    ergebnisse,
  });
}
