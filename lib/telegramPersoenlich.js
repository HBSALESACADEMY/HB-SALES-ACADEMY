import { randomBytes } from "node:crypto";
import { sendeAlarm } from "./alarm.js";

// Telegram-Nachrichten an EINE Person statt an eine Gruppe.
//
// Ein Bot kann niemandem von sich aus schreiben und kennt weder Namen noch
// Nummern. Deshalb die Verknüpfung (migration_165): Die Academy gibt einen
// Einmal-Code aus, die Person startet den Bot über einen Link, der den Code
// mitschickt, und die Academy findet den Chat, in dem genau dieser Code
// ankam. Ab dann gehört dieser Chat zu diesem Konto.

export const CODE_GUELTIG_MINUTEN = 10;

// Ohne 0/O und 1/I: wer den Code abtippt, verwechselt sie.
const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Ein neuer Einmal-Code, etwa "HB7K3Q9MX2".
 *
 * Nur Buchstaben und Ziffern: Telegram lässt im Start-Link nichts anderes
 * zu. 32 Zeichen je Stelle teilen 256 ohne Rest — jede Stelle ist damit
 * gleich wahrscheinlich.
 */
export function neuerVerbindungsCode(zufall = randomBytes(8)) {
  let code = "";
  for (let i = 0; i < 8; i += 1) code += ZEICHEN[zufall[i] % ZEICHEN.length];
  return `HB${code}`;
}

/** Der Link, der den Bot öffnet und den Code beim Tippen auf "Start" mitschickt. */
export function startLink(botName, code) {
  return `https://t.me/${botName}?start=${code}`;
}

export function codeGueltig(seit, jetzt = new Date()) {
  if (!seit) return false;
  const alter = jetzt.getTime() - new Date(seit).getTime();
  return alter >= 0 && alter <= CODE_GUELTIG_MINUTEN * 60000;
}

/**
 * Den Chat finden, in dem der Code angekommen ist.
 *
 * NUR private Chats: In einer Gruppe könnte jemand einen fremden Code
 * hineinschreiben, und die persönliche Auswertung landete vor allen.
 * NUR Nachrichten ab der Ausgabe des Codes: ein alter Treffer zählt nicht.
 */
export function findeStart(updates = [], code, seit) {
  if (!code || !seit) return null;
  const ab = Math.floor(new Date(seit).getTime() / 1000) - 60;
  const gesucht = String(code).toUpperCase();
  let treffer = null;
  (updates || []).forEach((u) => {
    const nachricht = u?.message;
    const chat = nachricht?.chat;
    if (chat?.type !== "private" || !chat.id) return;
    if (!nachricht.date || nachricht.date < ab) return;
    const worte = String(nachricht.text || "").toUpperCase().split(/\s+/);
    if (!worte.includes(gesucht)) return;
    treffer = {
      chatId: String(chat.id),
      name: [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || "Telegram",
    };
  });
  return treffer;
}

/**
 * Die erste Nachricht nach dem Verbinden.
 *
 * Sie begrüsst mit dem Namen der Organisation und sagt zweierlei: was hier
 * künftig ankommt, und wo man in der Academy hinkommt. Eine blosse
 * Bestätigung ("verbunden") wäre eine verschenkte Gelegenheit — es ist die
 * einzige Nachricht, die garantiert gelesen wird.
 */
export function willkommensText({ organisation = "", name = "", appUrl = "", istLeitung = false, imOnboarding = false } = {}) {
  const vorname = String(name || "").trim().split(/\s+/)[0];
  const ziel = (pfad, titel, zweck) => (appUrl ? `• ${titel}: ${zweck}\n  ${appUrl}${pfad}` : `• ${titel}: ${zweck}`);

  const ankommt = [
    "• Follow-ups: wenn dir eines zugewiesen wird, und morgens, wenn eines fällig ist",
    "• Deine Auswertung: Montag bis Freitag früh — deine Zahlen vom letzten Arbeitstag im Vergleich, mit Lob",
  ];
  if (imOnboarding) ankommt.push("• Onboarding: wenn ein Schritt überfällig ist, und der Glückwunsch, wenn du durch bist");
  if (istLeitung) ankommt.push("• Als Leitung zusätzlich: wenn beim Onboarding deiner Leute etwas liegen bleibt");

  const findest = [
    ziel("/", "Startbildschirm", "deine Termine, Follow-ups und offenen Aufgaben"),
    ziel("/call-tracker", "Call Tracker", "Anrufe erfassen, während du telefonierst"),
    ziel("/termine", "Termine", "Setting Calls, Closings und der Fortschritt je Kunde"),
    ziel("/kalender", "Kalender", "alles mit Datum an einer Stelle"),
    ziel("/courses", "Kurse und Training", "Lernen, Rollenspiele und die Tages-Challenge"),
  ];
  if (istLeitung) {
    findest.push(ziel("/onboarding", "Onboarding", "neue Leute einarbeiten und den Fortschritt sehen"));
    findest.push(ziel("/auswertung", "Auswertung", "Zahlen des Teams über jeden Zeitraum"));
  }

  return [
    `👋 Herzlich willkommen${organisation ? ` bei ${organisation}` : ""}${vorname ? `, ${vorname}` : ""}!`,
    "",
    "Dein Telegram ist jetzt mit der Academy verbunden. Diese Nachrichten sieht nur du.",
    "",
    "Das kommt hier an:",
    ...ankommt,
    "",
    "Das findest du in der Academy:",
    ...findest,
    "",
    "Was du hier bekommen willst, stellst du in der Academy unter Einstellungen → Telegram ein. Dort kannst du die Verbindung auch wieder trennen.",
  ].join("\n");
}

/**
 * Die Verknüpfungen dieser Personen — nur die verbundenen.
 *
 * Fehlt die Tabelle (migration_165 nicht eingespielt), kommt eine leere
 * Liste zurück: Dann geht eben nichts per Telegram, die Mails laufen
 * trotzdem.
 */
export async function ladeVerknuepfungen(admin, ids = []) {
  const karte = new Map();
  if (!ids.length) return karte;
  const { data, error } = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, tagesauswertung, followups, auswertung_fuer")
    .in("user_id", ids).not("chat_id", "is", null);
  if (error) return karte;
  (data || []).forEach((z) => karte.set(z.user_id, z));
  return karte;
}

/**
 * Eine Nachricht an eine verbundene Person.
 *
 * Hat die Person den Bot blockiert oder den Chat gelöscht, wird die
 * Verbindung gelöst. Sonst versuchte es die Academy jeden Morgen erneut,
 * und in den Einstellungen stünde "verbunden", obwohl nichts ankommt.
 */
export async function sendePersoenlich(admin, verknuepfung, text) {
  if (!verknuepfung?.chat_id) return { skipped: true };
  const versand = await sendeAlarm(text, verknuepfung.chat_id);
  if (versand?.error && /blocked|chat not found|deactivated|kicked/i.test(versand.meldung || "")) {
    await admin.from("telegram_verknuepfungen")
      .update({ chat_id: null, chat_name: null, verbunden_am: null, updated_at: new Date().toISOString() })
      .eq("user_id", verknuepfung.user_id);
  }
  return versand;
}
