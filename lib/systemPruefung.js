// Prüft die Teile, deren Ausfall Kundinnen und Kunden tatsächlich merken.
// Wird vom Tagesbericht und von der Status-Anzeige in der Verwaltung
// genutzt — beide sollen dasselbe zeigen.
//
// Jede Prüfung nennt bei einer Störung ausdrücklich BEIDES: was dadurch
// nicht mehr funktioniert ("folge") und was zu tun ist ("loesung"). Vorher
// stand da nur ein halber Satz wie "CRON_SECRET fehlt" — daraus liess sich
// weder ablesen, was ausfällt, noch wo man es einträgt.
import { getAdminSupabase } from "./supabaseAdmin.js";

const VERCEL_WEG = "Vercel → Projekt → Settings → Environment Variables (Production), danach neu ausliefern (Deployments → ⋯ → Redeploy).";

export async function pruefeSystem() {
  const pruefungen = [];
  const notiere = (name, ok, hinweis, folge, loesung) =>
    pruefungen.push({ name, ok, hinweis, folge: ok ? null : folge, loesung: ok ? null : loesung });

  // Datenbank: eine echte, billige Abfrage — nicht nur "Verbindung steht".
  try {
    const { error } = await getAdminSupabase().from("organizations").select("id", { count: "exact", head: true });
    notiere("Datenbank", !error, error ? error.message : "erreichbar",
      "Ohne Datenbank läuft nichts: kein Login, keine Kurse, keine Termine.",
      "Supabase-Projekt prüfen (pausiert? Kontingent überschritten?) und SUPABASE_SERVICE_ROLE_KEY in Vercel kontrollieren.");
  } catch (e) {
    notiere("Datenbank", false, e.message,
      "Ohne Datenbank läuft nichts: kein Login, keine Kurse, keine Termine.",
      "Supabase-Projekt prüfen und die Zugangsdaten in Vercel kontrollieren.");
  }

  // Dateispeicher: hier liegen Aufnahmen und Logos.
  try {
    const { error } = await getAdminSupabase().storage.from("lead-recordings").list("", { limit: 1 });
    notiere("Dateispeicher", !error, error ? error.message : "erreichbar",
      "Gesprächsaufnahmen lassen sich weder hochladen noch abspielen; Logos werden nicht angezeigt.",
      "In Supabase unter Storage prüfen, ob der Bucket „lead-recordings“ existiert und die Zugriffsregeln stimmen.");
  } catch (e) {
    notiere("Dateispeicher", false, e.message,
      "Gesprächsaufnahmen lassen sich weder hochladen noch abspielen.",
      "In Supabase unter Storage den Bucket „lead-recordings“ prüfen.");
  }

  notiere("KI-Zugang", !!process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY ? "hinterlegt" : "GEMINI_API_KEY fehlt",
    "Rollenspiel-Simulator, die Bewertung offener Prüfungsfragen, der Leitfaden-Generator und die Gesprächsnotizen aus Aufnahmen fallen aus.",
    `Schlüssel unter aistudio.google.com erzeugen und als GEMINI_API_KEY hinterlegen: ${VERCEL_WEG}`);

  notiere("E-Mail-Versand", !!process.env.RESEND_API_KEY, process.env.RESEND_API_KEY ? "hinterlegt" : "RESEND_API_KEY fehlt",
    "Keine Termin-Benachrichtigungen, keine Erinnerungen, keine Freigabe-Meldungen per E-Mail. Telegram läuft davon unabhängig weiter.",
    `Schlüssel unter resend.com erzeugen und als RESEND_API_KEY hinterlegen: ${VERCEL_WEG}`);

  notiere("Absender-Domain", !!process.env.RESEND_FROM_EMAIL, process.env.RESEND_FROM_EMAIL ? "gesetzt" : "RESEND_FROM_EMAIL fehlt",
    "E-Mails erreichen nur das eigene Postfach — an Kundinnen und Kunden geht nichts raus.",
    `Domain bei Resend verifizieren und die Absenderadresse als RESEND_FROM_EMAIL hinterlegen: ${VERCEL_WEG}`);

  notiere("Aufräum-Zugang", !!process.env.CRON_SECRET, process.env.CRON_SECRET ? "gesetzt" : "CRON_SECRET fehlt",
    "Die täglichen Aufträge werden abgewiesen: Protokolltabellen wachsen unbegrenzt weiter und der Morgenbericht um 9 Uhr kommt nicht.",
    `Eine beliebige lange Zeichenfolge als CRON_SECRET hinterlegen (frei wählbar, sie dient nur als Passwort zwischen Vercel und der App): ${VERCEL_WEG}`);

  // Telegram ist inzwischen der Weg, auf dem Meldungen tatsächlich ankommen —
  // gehört deshalb mit in die Prüfung.
  const telegramOk = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  notiere("Telegram", telegramOk, telegramOk ? "eingerichtet" :
    [!process.env.TELEGRAM_BOT_TOKEN && "TELEGRAM_BOT_TOKEN", !process.env.TELEGRAM_CHAT_ID && "TELEGRAM_CHAT_ID"].filter(Boolean).join(" und ") + " fehlt",
    "Weder der Morgenbericht noch Störungsmeldungen kommen an.",
    `Bot-Token von @BotFather holen, die eigene Chat-ID ermitteln und beides hinterlegen: ${VERCEL_WEG}`);

  return { gesund: pruefungen.every((p) => p.ok), pruefungen, zeitpunkt: new Date().toISOString() };
}
