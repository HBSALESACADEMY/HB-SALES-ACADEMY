import { randomBytes } from "node:crypto";
import { sendeAlarm } from "./alarm.js";
import { berlinHeute } from "./woche.js";
import { zitatFuer, zitatZeile } from "./zitate.js";

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
 * Sie ist bewusst lang. Es ist die einzige Nachricht, die garantiert
 * gelesen wird — und sie beantwortet die drei Fragen, die ein neuer Mensch
 * wirklich hat: Wofür ist das hier? Was kommt auf mich zu? Wo fange ich an?
 *
 * Der Abschnitt "So arbeiten wir hier" steht bewusst vor den Links. Eine
 * Liste von Adressen erklärt niemandem, warum er morgens die Anwahlen
 * einträgt.
 */
export function willkommensText({
  organisation = "", name = "", appUrl = "", istLeitung = false, imOnboarding = false, tag = berlinHeute(),
} = {}) {
  const vorname = String(name || "").trim().split(/\s+/)[0];
  const ziel = (pfad, titel, zweck) => (appUrl ? `• ${titel}: ${zweck}\n  ${appUrl}${pfad}` : `• ${titel}: ${zweck}`);

  const ankommt = [
    "• Follow-ups: wenn dir eines zugewiesen wird, und morgens, wenn eines fällig ist",
    "• Deine Auswertung: Montag bis Freitag früh — deine Zahlen vom letzten Arbeitstag, verglichen mit dem Tag davor, und wofür es Lob gibt",
    "• Dein Morgen-Briefing: die Termine des Tages mit dem, was du vorher wissen solltest — und Knöpfe, mit denen du Ergebnisse von gestern mit einem Tippen einträgst",
    "• Freitags dein Wochenimpuls: was zusammengekommen ist, eine Einordnung und eine Frage. Antworte einfach — daraus wird ein Gespräch mit deinem Vertriebsbuddy.",
  ];
  if (imOnboarding) ankommt.push("• Onboarding: wenn ein Schritt überfällig ist, und der Glückwunsch, wenn du durch bist");
  if (istLeitung) ankommt.push("• Als Leitung zusätzlich: wenn beim Onboarding deiner Leute etwas liegen bleibt");

  const findest = [
    ziel("/", "Startbildschirm", "deine Termine, Follow-ups und offenen Aufgaben"),
    ziel("/call-tracker", "Call Tracker", "Anrufe erfassen, während du telefonierst"),
    ziel("/termine", "Termine", "Setting Calls, Closings und wie weit jeder Kunde ist"),
    ziel("/kalender", "Kalender", "alles mit Datum an einer Stelle, auch zum Abonnieren aufs Handy"),
    ziel("/email-marketing", "E-Mail-Marketing", "Mails an deine Kontakte und das Nachfassen danach"),
    ziel("/courses", "Kurse und Training", "Lernen, Rollenspiele, Einwand-Trainer und die Tages-Challenge"),
  ];
  if (istLeitung) {
    findest.push(ziel("/onboarding", "Onboarding", "neue Leute einarbeiten und sehen, wo jeder steht"));
    findest.push(ziel("/auswertung", "Auswertung", "die Zahlen des Teams über jeden Zeitraum"));
  }

  const ersteSchritte = imOnboarding
    ? [
      "Deine ersten Schritte stehen schon fest: Auf deinem Startbildschirm findest du deinen Onboarding-Plan.",
      "Hak ab, was du erledigt hast — den Rest hakt die Academy selbst ab, sobald sie es in den Daten sieht.",
    ]
    : [
      "1. Profil ausfüllen, damit dich alle erkennen: Name, Bild, ein, zwei Sätze über dich.",
      "2. Beim nächsten Telefonblock den Call Tracker offen haben und jede Anwahl eintragen.",
      "3. Einen Kurs anfangen oder ein Rollenspiel üben — zehn Minuten reichen für den Anfang.",
    ];

  return [
    `👋 Herzlich willkommen${organisation ? ` bei ${organisation}` : ""}${vorname ? `, ${vorname}` : ""}!`,
    "",
    "Dein Telegram ist jetzt mit der Academy verbunden. Diese Nachrichten siehst nur du. "
    + "Wie dein Vertriebsbuddy hier im Chat funktioniert, erkläre ich dir gleich in der nächsten Nachricht.",
    "",
    "Die Academy ist dein Werkzeug für den Vertriebsalltag: telefonieren, Termine führen, nachfassen, besser werden. "
    + "Alles an einem Ort, damit nichts zwischen Zettel, Postfach und Erinnerung verloren geht.",
    "",
    "So arbeiten wir hier:",
    "• Zahlen sind kein Kontrollwerkzeug, sondern dein Werkzeug. Wo es hakt, siehst du selbst zuerst.",
    "• Kleine Schritte zählen. Eine Anwahl mehr als gestern ist ein Fortschritt — und genau dafür gibt es hier Lob, nicht nur für Spitzenwerte.",
    "• Nachfassen ist die halbe Miete. Die meisten Abschlüsse gehen nicht verloren, weil jemand Nein sagt, sondern weil niemand noch einmal anruft.",
    "• Kein Abschluss ist kein Scheitern. Ein geführtes Gespräch bleibt sichtbar, statt auf null zu fallen.",
    "• Nach dem Abschluss ist nicht Schluss. Erst die Umsetzung und der Anruf einen Monat später machen aus einem Kunden eine Empfehlung.",
    "• Ehrlich statt schön: Was nicht gemacht wurde, steht da. Das ist kein Vorwurf — es ist der Grund, warum die Zahlen hier etwas wert sind.",
    "",
    "Das kommt ab jetzt hier an:",
    ...ankommt,
    "",
    "Das findest du in der Academy:",
    ...findest,
    "",
    imOnboarding ? "Dein Anfang:" : "So fängst du an:",
    ...ersteSchritte,
    "",
    "Was du hier bekommen willst, stellst du in der Academy unter Einstellungen → Telegram ein. "
    + "Dort kannst du die Verbindung auch jederzeit wieder trennen.",
    "",
    zitatZeile(zitatFuer("dranbleiben", tag)),
  ].join("\n");
}

/**
 * Die zweite Nachricht nach dem Verbinden: was der Vertriebsbuddy ist und
 * was man ihm schreiben kann.
 *
 * Eine eigene Nachricht, weil die Begrüssung schon nah an Telegrams Grenze
 * von 4096 Zeichen liegt — und weil "So funktioniert der Bot" für sich
 * stehen soll, statt in einer langen Nachricht unterzugehen. Wer später
 * /hilfe schreibt, bekommt die Kurzfassung.
 */
export function buddyErklaerung({ istLeitung = false } = {}) {
  const zeilen = [
    "🤝 So funktioniert dein Vertriebsbuddy",
    "",
    "Ich bin dein Coach hier im Chat. Schreib mir wie einem Kollegen — ganz normal, ohne besondere Befehle.",
    "",
    "✍️ Ergebnisse eintragen",
    "Schreib einfach, was bei einem Termin herauskam, zum Beispiel:",
    "• „Müller: Kunde geworden“",
    "• „Schneider – Closing am Donnerstag um 14 Uhr“",
    "• „Weber ist nicht erschienen“",
    "Ich suche den passenden Termin unter deinen Terminen und zeige dir, was ich eintragen würde. Erst wenn du auf „Ja, eintragen“ tippst, steht es in der Academy.",
    "",
    "☀️ Jeden Morgen (Mo–Fr)",
    "Deine Termine des Tages mit Notizen und Tipps — und für Termine ohne Ergebnis Knöpfe zum Antippen.",
    "",
    "🗣 Hilfe bei Einwänden",
    "„Kunde sagt, er hat schon eine Agentur“ — du bekommst die Antwort aus eurem eigenen Leitfaden.",
    "",
    "🎭 Üben",
    "/rollenspiel — ich spiele den Kunden, du übst. Danach sage ich dir, was gut war und was besser geht.",
    "",
    "📊 Deine Zahlen",
    "/heute · /woche · /ziel · /termine",
    "",
    "💬 Freitags",
    "Dein Wochenimpuls mit einer Frage. Antworte einfach — daraus wird ein Gespräch, und manchmal eine kleine Schulung mit Übung.",
  ];
  if (istLeitung) {
    zeilen.push(
      "",
      "👥 Für dich als Leitung",
      "• „Bereite mein Gespräch mit Anna vor“ oder /gespraech Anna — Zahlen, Stimmung, Themen und drei Fragen fürs Einzelgespräch",
      "• /team — die Teamlage jetzt, freitags kommt sie von selbst",
      "• Frag mich nach deinen Leuten: „Wie lief die Woche bei Anna?“",
    );
  }
  zeilen.push(
    "",
    "🔒 Privat",
    istLeitung
      ? "Was deine Leute mir schreiben, siehst auch du nicht — nur Themen, Stimmung und Zahlen. Umgekehrt gilt dasselbe."
      : "Was du mir schreibst, sieht deine Leitung nicht. Sie sieht nur Themen, Stimmung und deine Zahlen.",
    "",
    "Tipp: Tippe unten auf „Menü“ oder schreib /, dann siehst du alle Befehle. /hilfe zeigt die Kurzfassung.",
  );
  return zeilen.join("\n");
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
export async function sendePersoenlich(admin, verknuepfung, text, extra = {}) {
  if (!verknuepfung?.chat_id) return { skipped: true };
  const versand = await sendeAlarm(text, verknuepfung.chat_id, extra);
  if (versand?.error && /blocked|chat not found|deactivated|kicked/i.test(versand.meldung || "")) {
    await admin.from("telegram_verknuepfungen")
      .update({ chat_id: null, chat_name: null, verbunden_am: null, updated_at: new Date().toISOString() })
      .eq("user_id", verknuepfung.user_id);
  }
  return versand;
}
