import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { briefingUmAcht } from "../../../lib/buddyBriefing";
import { stelleWebhookSicher } from "../../../lib/telegramWebhook";
import { setzeBefehle } from "../../../lib/telegramApi";
import { sendeErklaerungen } from "../../../lib/buddyErklaerungVersand";
import { BEFEHLE, raeumeRollenspieleAuf } from "../../../lib/buddyBefehle";
import { raeumeAufnahmenAuf } from "../../../lib/aufnahmenAufraeumen";

// DSGVO-Datenminimierung: reine Protokoll-/Telemetriedaten haben keinen
// dauerhaften Geschäftszweck (anders als z.B. Kundendaten/Leads, die aktiv
// von den Nutzer:innen verwaltet werden) und werden hier automatisch nach
// einer angemessenen Frist gelöscht. Läuft täglich per Vercel Cron
// (siehe vercel.json), abgesichert über CRON_SECRET (von Vercel automatisch
// als "Authorization: Bearer <CRON_SECRET>" mitgeschickt).
// Ein Monat (vorher 180 Tage). Diese Tabellen wachsen mit JEDEM Klick jedes
// Nutzers — page_views am schnellsten. Kürzere Aufbewahrung heisst weniger
// Daten, schnellere Auswertungen und weniger gespeicherte Personendaten.
// Geprüft, dass nichts davon abhängt: login_attempts wird nur geschrieben
// (Anmelde-Verlauf), nirgends für Sperren o.ä. ausgewertet. Die Auswertungen
// zeigen ohnehin höchstens einen Monat (siehe pages/admin/insights.js).
const RETENTION_DAYS = {
  login_events: 30,
  login_attempts: 30,
  // Der Telegram-Eingang dient nur der Entdopplung und der Gruppensuche —
  // nach einem Tag hat er seinen Zweck erfüllt.
  telegram_updates: 1,
  page_views: 30,
  // Dient nur der Drosselung von KI-Anfragen im 60-Sekunden-Fenster und
  // räumt sich bei jedem Aufruf selbst auf (siehe lib/aiClient.js) — die
  // Frist hier ist reine Sicherheitsleine.
  ai_request_log: 7,
};

// Mehr Zeit als fürs reine Aufräumen: Im Sommer verschickt dieser Lauf
// auch das Morgen-Briefing (siehe unten).
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || req.headers.authorization !== expected) {
    return res.status(401).json({ error: "Nicht autorisiert." });
  }

  const admin = getAdminSupabase();
  const results = {};
  try {
    for (const [table, days] of Object.entries(RETENTION_DAYS)) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { error, count } = await admin.from(table).delete({ count: "exact" }).lt("created_at", cutoff);
      // Fehlt eine Tabelle (Migration noch nicht eingespielt), darf das
      // nicht das Aufräumen aller anderen verhindern.
      if (error) { console.error(`cleanup-logs: ${table}:`, error.message); results[table] = error.message; continue; }
      results[table] = count || 0;
    }

    // Dieser Lauf ist um 6 Uhr UTC — im Sommer 8 Uhr in Berlin, die Zeit
    // fürs Morgen-Briefing. Im Winter ist es hier 7 Uhr, dann schickt
    // briefingUmAcht nichts, und der Morgenlauf um 8 übernimmt.
    let briefings = { gesendet: 0 };
    try {
      briefings = await briefingUmAcht(admin);
    } catch (e) {
      console.error("Morgen-Briefing fehlgeschlagen:", e.message);
    }

    // Die Wartungsarbeit am Bot liegt seit dem 25.09.2026 hier statt im
    // Morgenlauf. Dort hat sie Sekunden gekostet, die der Guten-Morgen-
    // Nachricht fehlten: Der Lauf starb um 9:49 im Timeout, bevor sie raus
    // war. Hier stört sie niemanden — dieser Lauf löscht alte Protokolle und
    // hat Zeit über.
    //
    // Keine dieser Aufgaben ist an eine Minute gebunden: Der Webhook muss
    // irgendwann am Tag geprüft werden, die Bot-Befehle ändern sich fast
    // nie, und eine Aufnahme darf eine Stunde später gelöscht werden.
    const wartung = {};
    try {
      const webhook = await stelleWebhookSicher();
      wartung.webhook = webhook.aktiv ? (webhook.gesetzt ? "neu eingerichtet" : "läuft") : webhook.grund;
      await setzeBefehle(BEFEHLE);
      await raeumeRollenspieleAuf(admin);
      const erklaerungen = await sendeErklaerungen(admin);
      wartung.erklaerungen = erklaerungen.gesendet || 0;
    } catch (e) {
      console.error("Bot-Wartung fehlgeschlagen:", e.message);
      wartung.fehler = e.message;
    }

    // Fällige Aufnahmen entfernen (DSGVO-Frist, lib/aufnahmenAufraeumen.js).
    try {
      const aufgeraeumt = await raeumeAufnahmenAuf(admin);
      wartung.aufnahmen = aufgeraeumt.geloescht || 0;
    } catch (e) {
      console.error("Aufnahmen aufräumen fehlgeschlagen:", e.message);
    }

    return res.status(200).json({ ok: true, deleted: results, briefings, wartung });
  } catch (e) {
    console.error("cleanup-logs failed:", e.message);
    return res.status(500).json({ error: e.message, deleted: results });
  }
}
