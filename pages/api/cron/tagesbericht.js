import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { baueTagesbericht } from "../../../lib/tagesbericht";
import { sendeAlarm } from "../../../lib/alarm";

// Täglicher Überblick um 9 Uhr per Telegram: was gestern in jeder
// Kundenorganisation passiert ist, plus eine Zeile zum Systemzustand.
//
// Erledigt zugleich die Systemprüfung und meldet Störungen — im
// Vercel-Hobby-Tarif sind nur zwei Cron-Aufträge erlaubt, die je einmal
// täglich laufen. Deshalb beides in einem Lauf statt getrennt.
//
// Zur Uhrzeit: Vercel arbeitet in UTC, Deutschland wechselt zwischen Sommer-
// und Winterzeit. Der Lauf um 7 Uhr UTC trifft im Sommer 9 Uhr, im Winter
// 8 Uhr deutscher Zeit — beides wird akzeptiert. Ein Lauf zu einer ganz
// anderen Stunde (versehentlicher Aufruf) sendet dagegen nicht.
export const config = { maxDuration: 60 };

function berlinStunde() {
  // Über formatToParts statt format(): die deutsche Schreibweise hängt " Uhr"
  // an ("09 Uhr"), daraus liesse sich keine Zahl lesen — der Bericht käme nie.
  const teile = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "numeric", hour12: false }).formatToParts(new Date());
  return Number(teile.find((t) => t.type === "hour")?.value);
}

export default async function handler(req, res) {
  const erwartet = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || req.headers.authorization !== erwartet) {
    return res.status(401).json({ error: "Nicht autorisiert." });
  }
  // "force" erlaubt einen Testlauf ausserhalb der 9 Uhr.
  const stunde = berlinStunde();
  if (stunde !== 8 && stunde !== 9 && req.query.force !== "1") {
    return res.status(200).json({ uebersprungen: true, grund: `Lauf um ${stunde} Uhr — Bericht geht nur morgens raus` });
  }

  const admin = getAdminSupabase();
  try {
    // Der Bericht selbst liegt in lib/tagesbericht.js — derselbe Text lässt
    // sich damit auch von Hand auf der Statusseite auslösen.
    const { text } = await baueTagesbericht(admin);
    await sendeAlarm(text);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Tagesbericht fehlgeschlagen:", e.message);
    await sendeAlarm("⚠️ HB Sales Academy: Der Tagesbericht konnte nicht erstellt werden — " + e.message);
    return res.status(500).json({ error: e.message });
  }
}
