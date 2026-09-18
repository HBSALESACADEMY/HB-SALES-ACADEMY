// Die Mini-Schulungen des Vertriebsbuddys.
//
// Eine Antwort im Chat ist ein Rat. Eine Schulung ist etwas anderes: erst
// verstehen, dann eine Formulierung zum Abschreiben, dann eine Übung mit
// echten Anrufen — und am Ende der Woche die Frage, ob es geholfen hat.
//
// Die Bausteine stehen HIER und kommen nicht aus der KI. Ein Einstiegssatz,
// den eine Sprach-KI frei erfindet, klingt gut und funktioniert am Telefon
// nicht. Die KI führt das Gespräch drumherum, den Kern liefert diese Liste.

export const PHASEN = { gestartet: "Lektion verschickt", uebung: "Übung läuft", fertig: "abgeschlossen" };

export const SCHULUNGEN = [
  {
    key: "telefonzeit",
    titel: "Feste Telefonblöcke",
    erkennung: [/keine zeit/i, /komme nicht zum (telefonieren|anrufen)/i, /zu wenig (zeit|anrufe)/i, /dazwischen/i],
    kern: "Telefonieren verliert gegen alles andere, weil es unangenehmer ist als E-Mails. Wer es nicht in den Kalender stellt, macht es nicht.",
    formulierung: "Trag dir zwei feste Blöcke ein: 9:00–10:30 und 14:00–15:00. In dieser Zeit kein Postfach, kein Chat.",
    uebung: "Trag die zwei Blöcke für die ganze nächste Woche in deinen Kalender ein und halte sie an mindestens drei Tagen durch.",
    link: { pfad: "/kalender", text: "Kalender" },
  },
  {
    key: "vorzimmer",
    titel: "Am Vorzimmer vorbei",
    erkennung: [/vorzimmer/i, /sekretari/i, /assistenz/i, /komme nicht durch/i, /nicht durchgestellt/i, /gatekeeper/i],
    kern: "Das Vorzimmer prüft nicht dein Angebot, sondern ob du klingst wie jemand, der erwartet wird. Kurz, bestimmt und ohne Verkaufston kommt weiter als jede Erklärung.",
    formulierung: "„Guten Tag, hier ist [Name] von [Firma]. Stellen Sie mich bitte zu [Nachname] durch?“ — dann Pause. Auf „Worum geht es?“: „Um die Besetzung Ihrer offenen Stelle, das kläre ich in zwei Minuten direkt mit ihm.“",
    uebung: "Sag bei deinen nächsten 10 Anrufen genau diesen Satz, ohne ihn auszuschmücken. Zähl mit, wie oft du durchkommst.",
    link: { pfad: "/scripts", text: "Skripte" },
  },
  {
    key: "einstieg",
    titel: "Die ersten 15 Sekunden",
    erkennung: [/einstieg/i, /gespräch.{0,12}anfang/i, /aufgelegt/i, /legt auf/i, /keine lust zu reden/i],
    kern: "Du hast den Entscheider dran und trotzdem keinen Termin: Dann entscheidet der Anfang. Wer zuerst erklärt, verliert — wer zuerst einen Grund nennt und fragt, bleibt im Gespräch.",
    formulierung: "„Ich rufe an, weil [konkreter Anlass beim Kunden]. Haben Sie 30 Sekunden, dann wissen Sie, ob das für Sie passt?“",
    uebung: "Formuliere deinen Anlass-Satz für deine drei häufigsten Zielkunden und nutze ihn bei den nächsten 10 Gesprächen.",
    link: { pfad: "/einwand-trainer", text: "Einwand-Trainer" },
  },
  {
    key: "einwand",
    titel: "„Kein Interesse“",
    erkennung: [/kein interesse/i, /kein bedarf/i, /abgewimmelt/i, /einwand/i, /brauchen wir nicht/i],
    kern: "„Kein Interesse“ kommt fast immer vor dem ersten Satz, der etwas wert wäre. Es ist ein Reflex gegen den Anruf, kein Urteil über dein Angebot.",
    formulierung: "„Das verstehe ich, Sie kennen mich ja noch nicht. Eine Frage noch: Wie besetzen Sie Stellen im Moment?“ — dann zuhören.",
    uebung: "Leg bei den nächsten 10 Neins nicht sofort auf, sondern stell genau eine Rückfrage. Notiere, was dabei herauskommt.",
    link: { pfad: "/einwand-trainer", text: "Einwand-Trainer" },
  },
  {
    key: "noshow",
    titel: "Termine, die platzen",
    erkennung: [/nicht erschienen/i, /platzt/i, /geplatzt/i, /no.?show/i, /abgesagt/i, /taucht.{0,10}nicht auf/i],
    kern: "Ein Termin ohne Bestätigung ist eine Notiz im Kalender. Die Bestätigung ist der billigste Schritt im ganzen Verkauf und der, der am häufigsten ausfällt.",
    formulierung: "Am Vortag: „Kurz zur Bestätigung für morgen 10 Uhr — passt das noch bei Ihnen?“ Eine Nachricht reicht.",
    uebung: "Bestätige jeden Termin der nächsten Woche am Vortag und hak ihn in der Academy als bestätigt ab.",
    link: { pfad: "/termine", text: "Termine" },
  },
  {
    key: "abschluss",
    titel: "Die Abschlussfrage",
    erkennung: [/abschluss/i, /closing/i, /unterschrift/i, /entscheidet sich nicht/i, /überlegt.{0,10}noch/i, /hinhalte/i],
    kern: "Gespräche enden oft mit „ich melde mich“, weil niemand gefragt hat. Der Abschluss ist keine Überredung, sondern eine klare Frage am richtigen Punkt.",
    formulierung: "„Aus meiner Sicht passt das. Wollen wir das so machen?“ — dann still sein, bis eine Antwort kommt.",
    uebung: "Stell in jedem Closing dieser Woche die Abschlussfrage und halte danach die Pause aus. Notiere, was passiert.",
    link: { pfad: "/roleplay", text: "Rollenspiel" },
  },
  {
    key: "nachfassen",
    titel: "Dranbleiben nach der Mail",
    erkennung: [/nachfass/i, /follow.?up/i, /meldet sich nicht/i, /keine antwort/i, /hinterher/i],
    kern: "Die meisten Kontakte gehen nicht verloren, weil jemand Nein sagt, sondern weil niemand noch einmal anruft. Eine Mail ohne Anruf danach ist ein halber Kontakt.",
    formulierung: "Zwei Tage nach der Mail anrufen: „Ich wollte kurz hören, ob meine Mail angekommen ist — passt das zeitlich bei Ihnen?“",
    uebung: "Trag zu jeder Mail dieser Woche direkt ein Follow-up ein und ruf an, statt zu warten.",
    link: { pfad: "/follow-up", text: "Follow-up" },
  },
  {
    key: "struktur",
    titel: "Der eigene Tag",
    erkennung: [/überfordert/i, /chaos/i, /keine struktur/i, /verzettel/i, /alles gleichzeitig/i],
    kern: "Vertrieb besteht aus wenigen Tätigkeiten, die täglich wiederkehren. Wer sie nicht in eine Reihenfolge bringt, macht am Ende das, was am wenigsten wehtut.",
    formulierung: "Reihenfolge: erst Follow-ups, dann Neuanrufe, dann alles andere. Mails und Nachbereitung nach 16 Uhr.",
    uebung: "Halte diese Reihenfolge nächste Woche an drei Tagen durch und schreib mir, an welchem Tag es am besten lief.",
    link: { pfad: "/", text: "Startbildschirm" },
  },
];

export function schulungVon(key) {
  return SCHULUNGEN.find((s) => s.key === key) || null;
}

/** Welches Thema steckt in dem, was jemand geschrieben hat? */
export function themaAusText(text) {
  const t = String(text || "");
  if (t.trim().length < 8) return null;
  return SCHULUNGEN.find((s) => s.erkennung.some((r) => r.test(t)))?.key || null;
}

/**
 * Welches Thema legen die Zahlen nahe?
 *
 * Der Reihe nach von vorn: Wer kaum telefoniert, braucht keine
 * Abschlussfrage. Erst die Menge, dann das Durchkommen, dann der Termin,
 * dann der Abschluss.
 */
export function themaAusZahlen(zahlen) {
  const z = zahlen || {};
  const anwahlen = z.anwahlen || 0;
  const entscheider = z.entscheider || 0;
  const terminiert = z.terminiert || 0;
  const setting = z.setting || 0;
  const closing = z.closing || 0;
  const kunden = z.kunden || 0;
  const mails = z.mails || 0;
  const followups = z.followups || 0;

  if (anwahlen > 0 && anwahlen < 50) return "telefonzeit";
  if (anwahlen >= 50 && entscheider / anwahlen < 0.08) return "vorzimmer";
  if (entscheider >= 10 && terminiert / entscheider < 0.15) return "einstieg";
  if (terminiert >= 3 && setting < terminiert * 0.6) return "noshow";
  if (closing >= 2 && kunden === 0) return "abschluss";
  if (mails >= 3 && followups === 0) return "nachfassen";
  return null;
}

/** Das Thema für eine neue Schulung — Gespräch schlägt Zahlen. */
export function naechstesThema({ text = "", zahlen = null, ausser = [] } = {}) {
  const ausText = themaAusText(text);
  if (ausText && !ausser.includes(ausText)) return ausText;
  const ausZahlen = themaAusZahlen(zahlen);
  if (ausZahlen && !ausser.includes(ausZahlen)) return ausZahlen;
  return null;
}

function linkZeile(schulung, appUrl) {
  if (!schulung.link) return null;
  return appUrl
    ? `📎 Mehr dazu in der Academy — ${schulung.link.text}: ${appUrl}${schulung.link.pfad}`
    : `📎 Mehr dazu in der Academy unter ${schulung.link.text}.`;
}

/** Schritt 1: die Lektion. */
export function lektionsText(schulung, appUrl = "") {
  if (!schulung) return "";
  return [
    `📘 Kurz was für dich: ${schulung.titel}`,
    "",
    schulung.kern,
    "",
    `So sagst du es:`,
    `„${schulung.formulierung}“`.replace(/^„„/, "„").replace(/““$/, "“"),
    "",
    linkZeile(schulung, appUrl),
    "",
    "Morgen schicke ich dir die passende Übung dazu.",
  ].filter((z) => z !== null).join("\n");
}

/** Schritt 2: der Übungsauftrag am Folgetag. */
export function uebungsText(schulung) {
  if (!schulung) return "";
  return [
    `🎯 Deine Übung: ${schulung.titel}`,
    "",
    schulung.uebung,
    "",
    "Schreib mir danach kurz, wie es gelaufen ist — ein Satz reicht.",
  ].join("\n");
}

/** Schritt 3: das Fazit im Wochenimpuls. */
export function fazitZeile(schulung, erledigt) {
  if (!schulung) return "";
  if (erledigt === true) return `📘 ${schulung.titel}: Übung gemacht — bleib dran, das wirkt erst nach ein paar Wochen.`;
  if (erledigt === false) return `📘 ${schulung.titel}: Die Übung ist liegen geblieben. Nimm sie dir für nächste Woche noch einmal vor.`;
  return `📘 Thema der Woche war: ${schulung.titel}.`;
}
