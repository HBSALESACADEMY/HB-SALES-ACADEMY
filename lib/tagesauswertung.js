import { berlinHeute, tagPlus } from "./woche.js";

// Die persönliche Tagesauswertung: was jemand am letzten Arbeitstag
// geschafft hat, verglichen mit dem Arbeitstag davor — und wofür es Lob
// gibt.
//
// Hier steht nur das Rechnen und der Text, ohne Datenbank. Der Versand
// liegt in lib/tagesauswertungVersand.js.

// "gruppe" ordnet die Nachricht, "imLob" steht im Satz "Platz 1 im Team …".
export const KENNZAHLEN = [
  { key: "anwahlen", label: "Anwahlen", gruppe: "📞 Call Tracker", imLob: "bei den Anwahlen" },
  { key: "entscheider", label: "Entscheider erreicht", gruppe: "📞 Call Tracker", imLob: "bei den erreichten Entscheidern" },
  { key: "terminiert", label: "Terminiert", gruppe: "📞 Call Tracker", imLob: "bei den Terminierungen" },
  { key: "setting", label: "Setting Calls geführt", gruppe: "📅 Termine", imLob: "bei den Setting Calls" },
  { key: "closing", label: "Closing Calls geführt", gruppe: "📅 Termine", imLob: "bei den Closing Calls" },
  { key: "bestaetigt", label: "Termine bestätigt", gruppe: "📅 Termine", imLob: "bei den Terminbestätigungen" },
  { key: "kunden", label: "Neue Kunden", gruppe: "💵 Abschlüsse", imLob: "bei den neuen Kunden" },
  { key: "mails", label: "Mails verschickt", gruppe: "✉️ E-Mail und Follow-ups", imLob: "bei den verschickten Mails" },
  { key: "followups", label: "Follow-ups erledigt", gruppe: "✉️ E-Mail und Follow-ups", imLob: "bei den erledigten Follow-ups" },
];

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function wochentag(tag) {
  return new Date(`${tag}T00:00:00Z`).getUTCDay();
}

export function istWochenende(tag) {
  const w = wochentag(tag);
  return w === 0 || w === 6;
}

/** Der Arbeitstag vor diesem Tag — vor einem Montag ist das der Freitag. */
export function arbeitstagDavor(tag) {
  let t = tagPlus(tag, -1);
  while (istWochenende(t)) t = tagPlus(t, -1);
  return t;
}

/**
 * Welche Tage die Auswertung an diesem Morgen vergleicht.
 *
 * Samstag und Sonntag kommt keine (null). Am Montag geht es um den Freitag,
 * verglichen mit dem Donnerstag — ein Wochenende mit null Anrufen neben
 * einen Arbeitstag zu stellen, wäre kein Vergleich.
 */
export function auswertungsTage(jetzt = new Date()) {
  const heute = berlinHeute(jetzt);
  if (istWochenende(heute)) return null;
  const berichtTag = arbeitstagDavor(heute);
  return { heute, berichtTag, vergleichTag: arbeitstagDavor(berichtTag) };
}

export function tagesName(tag) {
  return WOCHENTAGE[wochentag(tag)];
}

function datumText(tag) {
  const [, m, t] = tag.split("-").map(Number);
  return `${t}.${m}.`;
}

/** Der Berliner Kalendertag eines Zeitpunkts — ein Anruf um 23:30 gehört zu diesem Tag, nicht zum nächsten. */
export function berlinTagVon(zeitpunkt) {
  if (!zeitpunkt) return null;
  const d = new Date(zeitpunkt);
  return Number.isNaN(d.getTime()) ? null : berlinHeute(d);
}

export function leereZahlen() {
  return Object.fromEntries(KENNZAHLEN.map((k) => [k.key, 0]));
}

export function hatAktivitaet(zahlen) {
  return !!zahlen && KENNZAHLEN.some((k) => zahlen[k.key] > 0);
}

/**
 * Die Zahlen je Tag und Person.
 *
 * @returns Map<tag, Map<userId, zahlen>> — nur für die übergebenen Tage.
 */
export function zaehleTage({ anrufe = [], termine = [], mails = [], followUps = [] } = {}, tage = []) {
  const ergebnis = new Map(tage.map((t) => [t, new Map()]));
  const plus = (tag, person, key, n = 1) => {
    if (!person || !n || !ergebnis.has(tag)) return;
    const jePerson = ergebnis.get(tag);
    if (!jePerson.has(person)) jePerson.set(person, leereZahlen());
    jePerson.get(person)[key] += n;
  };

  (anrufe || []).forEach((a) => {
    const c = a?.counts || {};
    plus(a.log_date, a.user_id, "anwahlen", Number(c.anwahlen) || 0);
    // Wie oft jemand bei der Entscheidung gelandet ist: direkt beim
    // Entscheider oder am Vorzimmer vorbei durchgestellt (lib/callTracker.js).
    plus(a.log_date, a.user_id, "entscheider", (Number(c.entscheider) || 0) + (Number(c.weitergeleitet) || 0));
    plus(a.log_date, a.user_id, "terminiert", Number(c.termin) || 0);
  });

  (termine || []).forEach((l) => {
    if (!l || l.kein_kundentermin) return;
    const besitzer = l.created_by;
    const gespraech = (art, tag) => {
      if (art === "erstgespraech") plus(tag, besitzer, "setting");
      if (art === "closing") plus(tag, besitzer, "closing");
    };
    // Die aktuelle Stufe zählt nur, wenn sie stattgefunden hat. Die
    // abgeschlossenen im Verlauf haben stattgefunden (lib/terminArt.js).
    if (l.status === "wahrgenommen") gespraech(l.termin_art, berlinTagVon(l.appointment_at));
    (Array.isArray(l.stufen_verlauf) ? l.stufen_verlauf : []).forEach((v) => gespraech(v?.art, berlinTagVon(v?.am)));

    // Bestätigt hat, wer den Haken gesetzt hat — nicht unbedingt, wem der
    // Termin gehört.
    ["setting_bestaetigt", "closing_bestaetigt"].forEach((schritt) => {
      const haken = l.schritte?.[schritt];
      if (haken?.am) plus(berlinTagVon(haken.am), haken.von || besitzer, "bestaetigt");
    });

    if (l.kunde_am) plus(berlinTagVon(l.kunde_am), besitzer, "kunden");
  });

  (mails || []).forEach((k) => plus(berlinTagVon(k?.verschickt_am), k?.verschickt_von || k?.user_id, "mails"));
  (followUps || []).forEach((n) => plus(berlinTagVon(n?.erledigt_am), n?.zustaendig, "followups"));

  return ergebnis;
}

/**
 * Bei welchen Kennzahlen diese Person an diesem Tag vorne lag.
 *
 * Verglichen wird nur innerhalb der eigenen Organisation. Heraus kommt
 * nur, DASS jemand vorne lag — nie die Zahlen der anderen. Und nur, wenn
 * mindestens zwei etwas vorzuweisen haben: Platz 1 von einem ist kein Lob.
 */
export function platzEins(person, jePerson, orgVon) {
  const org = orgVon.get(person);
  const eigene = jePerson.get(person);
  if (!org || !eigene) return [];
  const kollegen = [...jePerson.entries()].filter(([id]) => orgVon.get(id) === org);
  return KENNZAHLEN.filter((k) => {
    if (!(eigene[k.key] > 0)) return false;
    const mitWert = kollegen.filter(([, z]) => z[k.key] > 0);
    return mitWert.length >= 2 && mitWert.every(([, z]) => z[k.key] <= eigene[k.key]);
  }).map((k) => k.key);
}

const ANERKENNUNG = ["Stark gemacht!", "Weiter so!", "Das kann sich sehen lassen.", "Genau so geht's."];

function prozent(jetzt, vorher) {
  return vorher > 0 ? Math.round(((jetzt - vorher) / vorher) * 100) : null;
}

/** Die Lob-Zeilen — leer nur, wenn es gar nichts zu zeigen gibt. */
export function lobZeilen({ heute, vorher, bestwerte = [], berichtTag, vergleichTag }) {
  const h = heute || leereZahlen();
  const v = vorher || leereZahlen();
  const lob = [];

  const vorne = KENNZAHLEN.filter((k) => bestwerte.includes(k.key));
  if (vorne.length) {
    lob.push(`🏆 Platz 1 im Team am ${tagesName(berichtTag)}: ${vorne.map((k) => k.imLob).join(", ")}.`);
  }

  if (h.kunden > 0) {
    lob.push(h.kunden === 1
      ? "🎉 Ein neuer Kunde — genau dafür machen wir das."
      : `🎉 ${h.kunden} neue Kunden — genau dafür machen wir das.`);
  }

  const besser = KENNZAHLEN.filter((k) => k.key !== "kunden" && h[k.key] > v[k.key]);
  if (besser.length) {
    lob.push(`📈 Mehr als am ${tagesName(vergleichTag)}: ${besser.map((k) => {
      const p = prozent(h[k.key], v[k.key]);
      return p === null ? k.label : `${k.label} (+${p} %)`;
    }).join(", ")}.`);
  }

  // Nichts besser, nirgends vorne: trotzdem sehen, was da war. Lob heisst
  // hier nicht Schönfärberei — der stärkste echte Wert wird genannt.
  if (!lob.length) {
    const staerkste = KENNZAHLEN.filter((k) => h[k.key] > 0).sort((a, b) => h[b.key] - h[a.key])[0];
    if (!staerkste) return [];
    lob.push(`💪 Dein stärkster Wert am ${tagesName(berichtTag)}: ${staerkste.label} ${h[staerkste.key]}. Heute legst du nach.`);
    return lob;
  }

  // Jeden Tag ein anderer Schlusssatz, aber für denselben Tag immer derselbe.
  const summe = String(berichtTag).split("").reduce((n, z) => n + z.charCodeAt(0), 0);
  lob.push(ANERKENNUNG[summe % ANERKENNUNG.length]);
  return lob;
}

/** Die ganze Nachricht. */
export function auswertungsText({ name = "", berichtTag, vergleichTag, heute, vorher, bestwerte = [] }) {
  const h = heute || leereZahlen();
  const v = vorher || leereZahlen();
  const vorname = String(name || "").trim().split(/\s+/)[0] || "";
  const kurz = tagesName(vergleichTag).slice(0, 2);

  const zeilen = [
    `☀️ Guten Morgen${vorname ? `, ${vorname}` : ""}!`,
    `Deine Auswertung für ${tagesName(berichtTag)}, ${datumText(berichtTag)} — im Vergleich zum ${tagesName(vergleichTag)}.`,
  ];

  // Eine Gruppe erscheint nur, wenn an einem der beiden Tage etwas darin
  // passiert ist. Wer keine Mails schreibt, liest sonst jeden Morgen
  // "Mails verschickt: 0 (Fr: 0)".
  let gruppe = null;
  KENNZAHLEN.forEach((k) => {
    const aktiv = KENNZAHLEN.filter((x) => x.gruppe === k.gruppe).some((x) => h[x.key] > 0 || v[x.key] > 0);
    if (!aktiv) return;
    if (k.gruppe !== gruppe) { zeilen.push("", k.gruppe); gruppe = k.gruppe; }
    const pfeil = h[k.key] > v[k.key] ? " ↑" : h[k.key] < v[k.key] ? " ↓" : "";
    zeilen.push(`${k.label}: ${h[k.key]} (${kurz}: ${v[k.key]})${pfeil}`);
  });

  const lob = lobZeilen({ heute: h, vorher: v, bestwerte, berichtTag, vergleichTag });
  if (lob.length) zeilen.push("", "👏 Lob", ...lob);

  return zeilen.join("\n");
}
