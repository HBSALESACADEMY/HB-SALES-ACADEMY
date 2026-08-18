// Prüft die Teile, deren Ausfall Kundinnen und Kunden tatsächlich merken.
// Wird von der Überwachung (pages/api/cron/health-check.js) und der
// Status-Anzeige in der Verwaltung genutzt — beide sollen dasselbe zeigen.
import { getAdminSupabase } from "./supabaseAdmin.js";

export async function pruefeSystem() {
  const pruefungen = [];
  const notiere = (name, ok, hinweis) => pruefungen.push({ name, ok, hinweis });

  // Datenbank: eine echte, billige Abfrage — nicht nur "Verbindung steht".
  try {
    const { error } = await getAdminSupabase().from("organizations").select("id", { count: "exact", head: true });
    notiere("Datenbank", !error, error ? error.message : "erreichbar");
  } catch (e) {
    notiere("Datenbank", false, e.message);
  }

  // Dateispeicher: hier liegen Aufnahmen und Logos.
  try {
    const { error } = await getAdminSupabase().storage.from("lead-recordings").list("", { limit: 1 });
    notiere("Dateispeicher", !error, error ? error.message : "erreichbar");
  } catch (e) {
    notiere("Dateispeicher", false, e.message);
  }

  // Zugänge: fehlt einer, fallen ganze Funktionen still aus.
  notiere("KI-Zugang", !!process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY ? "hinterlegt" : "GEMINI_API_KEY fehlt — Rollenspiel, Prüfungen und Notizen fallen aus");
  notiere("E-Mail-Versand", !!process.env.RESEND_API_KEY,
    process.env.RESEND_API_KEY ? "hinterlegt" : "RESEND_API_KEY fehlt — keine Benachrichtigungen");
  notiere("Absender-Domain", !!process.env.RESEND_FROM_EMAIL,
    process.env.RESEND_FROM_EMAIL ? "gesetzt" : "RESEND_FROM_EMAIL fehlt — Mails erreichen nur das eigene Postfach");

  // Tägliche Aufräumung: läuft sie nicht, wachsen die Protokolltabellen
  // unbegrenzt (siehe pages/api/cron/cleanup-logs.js).
  notiere("Aufräum-Zugang", !!process.env.CRON_SECRET,
    process.env.CRON_SECRET ? "gesetzt" : "CRON_SECRET fehlt — die tägliche Aufräumung läuft nicht");

  return { gesund: pruefungen.every((p) => p.ok), pruefungen, zeitpunkt: new Date().toISOString() };
}
