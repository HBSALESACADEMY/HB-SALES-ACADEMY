// Das Rollenspiel im Telegram-Chat: Der Buddy spielt den Kunden.
//
// Kurz und am Stück, wie ein echter Anruf: ein paar Wortwechsel, dann eine
// Rückmeldung. Wer mittendrin aufhören will, schreibt /stopp.
//
// Der Wortwechsel steht nur solange in telegram_verknuepfungen.modus_daten,
// wie das Rollenspiel läuft (migration_175) — nicht im Gesprächsverlauf des
// Buddys. Eine Übung ist kein Gespräch über die Woche und gehört weder in
// dessen Gedächtnis noch in den Wochenrückblick für die Leitung.

// Nach so vielen Antworten des Vertrieblers kommt die Rückmeldung.
export const MAX_RUNDEN = 6;

// Ein vergessenes Rollenspiel endet von selbst: Wer drei Stunden später
// "Danke für gestern" schreibt, meint den Buddy, nicht den Kunden.
export const ABLAUF_STUNDEN = 3;

export const SZENARIEN = [
  {
    key: "vorzimmer", titel: "Das Vorzimmer",
    worte: ["vorzimmer", "sekretär", "assistenz", "zentrale", "durchstellen", "empfang"],
    lage: "Du rufst bei einem mittelständischen Unternehmen an und willst die Geschäftsführung sprechen.",
    rolle: "Du bist Frau Berger, Assistenz der Geschäftsführung. Du schützt deinen Chef vor Verkaufsanrufen, bist aber freundlich. Du stellst nur durch, wenn der Anrufer einen konkreten, glaubwürdigen Grund nennt, der für die Firma relevant klingt. Auf Floskeln wie \"Es geht um eine Zusammenarbeit\" reagierst du mit \"Worum genau geht es denn?\" oder \"Schicken Sie doch eine Mail\".",
    start: "Firma Krämer Haustechnik, Berger am Apparat, guten Tag?",
  },
  {
    key: "kein_interesse", titel: "„Kein Interesse“",
    worte: ["interesse", "abwimmeln", "abwürgen", "kalt", "kaltakquise", "erstkontakt"],
    lage: "Du hast den Geschäftsführer eines Handwerksbetriebs direkt am Telefon.",
    rolle: "Du bist Herr Krämer, Geschäftsführer eines Handwerksbetriebs mit 14 Mitarbeitern. Du bekommst viele Verkaufsanrufe und sagst reflexhaft \"Kein Interesse\". Du bleibst aber dran, wenn der Anrufer dich mit einer echten Frage zu deinem Betrieb neugierig macht, statt sein Angebot herunterzubeten.",
    start: "Krämer. … Ja? Worum geht's, ich hab nicht viel Zeit.",
  },
  {
    key: "zu_teuer", titel: "„Zu teuer“",
    worte: ["teuer", "preis", "kosten", "budget", "geld", "rabatt"],
    lage: "Du bist im Closing Call. Das Angebot liegt auf dem Tisch.",
    rolle: "Du bist Frau Schneider, Inhaberin einer Agentur. Das Angebot gefällt dir grundsätzlich, aber du findest es zu teuer und vergleichst mit einem günstigeren Anbieter. Du lässt dich überzeugen, wenn der Verkäufer nicht sofort Rabatt gibt, sondern nachfragt und den Wert für dich konkret macht.",
    start: "Also ehrlich gesagt — das ist mir zu teuer. Ein anderer Anbieter macht das für die Hälfte.",
  },
  {
    key: "unterlagen", titel: "„Schicken Sie mir Unterlagen“",
    worte: ["unterlagen", "infos", "informationen", "mail", "schicken", "prospekt"],
    lage: "Du hast den Entscheider am Telefon und willst einen Termin.",
    rolle: "Du bist Herr Wolff, Geschäftsführer. Du willst den Anrufer höflich loswerden und sagst \"Schicken Sie mir Unterlagen\". Du vereinbarst nur einen Termin, wenn der Anrufer freundlich hinterfragt, was dich konkret interessiert, und dir einen Grund gibt, warum ein kurzes Gespräch mehr bringt als eine Mail.",
    start: "Wissen Sie was, schicken Sie mir doch einfach mal Unterlagen per Mail, ich schau's mir an.",
  },
  {
    key: "ueberlegen", titel: "„Muss ich mir überlegen“",
    worte: ["überlegen", "nachdenken", "zögert", "entscheid", "chef", "partner", "rücksprache"],
    lage: "Ende des Closing Calls. Du hast alles erklärt und fragst nach der Entscheidung.",
    rolle: "Du bist Frau Hoffmann, Geschäftsführerin. Du findest das Angebot gut, schiebst die Entscheidung aber auf (\"Das muss ich mir noch überlegen\", \"Ich muss mit meinem Partner sprechen\"). Dahinter steckt eine Unsicherheit, die du erst nennst, wenn der Verkäufer gezielt und ohne Druck nachfragt.",
    start: "Klingt alles gut, wirklich. Aber das muss ich mir noch mal in Ruhe überlegen.",
  },
];

export function szenarioVon(key) {
  return SZENARIEN.find((s) => s.key === key) || null;
}

/**
 * Welches Szenario gemeint ist: nach den Worten der Nachricht, sonst eines,
 * das zuletzt nicht dran war.
 */
export function waehleSzenario(text = "", zuletzt = null, zufall = Math.random()) {
  const t = String(text || "").toLowerCase();
  const treffer = SZENARIEN.find((s) => s.worte.some((w) => t.includes(w)));
  if (treffer) return treffer;
  const auswahl = SZENARIEN.filter((s) => s.key !== zuletzt);
  return auswahl[Math.floor(zufall * auswahl.length) % auswahl.length];
}

export function startText(szenario) {
  return [
    `🎭 Rollenspiel: ${szenario.titel}`,
    "",
    szenario.lage,
    `Ich spiele den Kunden. Antworte so, wie du es am Telefon sagen würdest. Nach ${MAX_RUNDEN} Antworten bekommst du eine Rückmeldung — mit /stopp schon früher.`,
    "",
    `☎️ ${szenario.start}`,
  ].join("\n");
}

export function kundenAnweisung(szenario) {
  return [
    szenario.rolle,
    "Du bist in einem Telefonat mit einem Vertriebler. Antworte als diese Person, kurz und realistisch: ein bis drei Sätze, gesprochene Sprache, auf Deutsch, in der Sie-Form.",
    "Bleib konsequent in der Rolle. Du bist nicht der Assistent und gibst keine Tipps. Verrate nie, dass du eine KI bist.",
    "Mach es nicht zu leicht, aber auch nicht unmöglich: Wer gut fragt und zuhört, kommt weiter.",
    "Kein Markdown, keine Regieanweisungen in Klammern.",
  ].join("\n");
}

export function rueckmeldungAnweisung(szenario) {
  return [
    "Du bist der Vertriebsbuddy der HB Sales Academy und hast gerade in einem Rollenspiel den Kunden gespielt.",
    `Szenario: ${szenario.titel}. ${szenario.lage}`,
    "Gib dem Vertriebler jetzt eine kurze, ehrliche Rückmeldung, per Du, auf Deutsch:",
    "- Was gut war (ein bis zwei Punkte, konkret an seinen Sätzen festgemacht).",
    "- Was besser geht (ein bis zwei Punkte).",
    "- Ein Satz, den er beim nächsten Mal wörtlich so sagen kann.",
    "Höchstens 130 Wörter. Kein Markdown, keine Überschriften mit Rauten — einfache Zeilen mit ✅, 🔧 und 💬 davor.",
  ].join("\n");
}

export function rueckmeldungOhneKI(szenario) {
  return [
    `Rollenspiel „${szenario.titel}“ beendet.`,
    "Meine Rückmeldung komme ich gerade nicht heran. Frag dich selbst: Habe ich mehr gefragt als erzählt? Und habe ich am Ende einen konkreten nächsten Schritt vorgeschlagen?",
  ].join("\n");
}

/** Der Wortwechsel als Nachrichten für die KI — der Kunde ist die KI. */
export function alsNachrichten(verlauf = []) {
  // Vorneweg der Anruf selbst: Der Kunde spricht zuerst, eine Unterhaltung
  // für die KI beginnt aber besser mit der Gegenseite.
  return [
    { role: "user", content: "(Der Vertriebler ruft an.)" },
    ...verlauf.map((z) => ({ role: z.von === "kunde" ? "assistant" : "user", content: z.text })),
  ];
}

/** Das Protokoll für die Rückmeldung, lesbar statt als Rollen. */
export function alsProtokoll(verlauf = []) {
  return verlauf.map((z) => `${z.von === "kunde" ? "Kunde" : "Vertriebler"}: ${z.text}`).join("\n");
}

export function istAbgelaufen(seit, jetzt = new Date()) {
  if (!seit) return true;
  return jetzt.getTime() - new Date(seit).getTime() > ABLAUF_STUNDEN * 3600000;
}
