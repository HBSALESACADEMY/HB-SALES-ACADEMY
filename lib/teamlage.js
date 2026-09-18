import { KENNZAHLEN, leereZahlen } from "./tagesauswertung.js";
import { wochenName } from "./wochenimpuls.js";
import { STIMMUNGEN } from "./buddyRueckblick.js";
import { schulungVon } from "./schulung.js";

// Die Teamlage für die Leitung: Zahlen, Themen und wo jemand Hilfe braucht.
//
// Ausdrücklich OHNE einen Satz aus den Buddy-Gesprächen. Was hier steht,
// sind Zahlen aus der Academy und die Stichpunkte, die am Freitag ohnehin
// im Reiter "Herausforderungen" landen. Der Chat bleibt zwischen der
// Person und dem Buddy — sonst schreibt dort niemand mehr ehrlich, und
// dann ist auch diese Nachricht nichts mehr wert.

// Welche Zahlen in der Kurzfassung stehen. Mehr liest niemand auf dem Handy.
export const TEAM_KENNZAHLEN = ["anwahlen", "terminiert", "setting", "kunden"];

// Ab wann ein Einbruch ein Einbruch ist: halbiert, und die Vorwoche war
// keine Ausnahme. Ohne die zweite Bedingung wäre jede ruhige Woche nach
// einem starken Tag ein Alarm.
const EINBRUCH_ANTEIL = 0.5;
const EINBRUCH_AB = 20;
const OHNE_ANTWORT_TAGE = 14;

function summe(personen, key) {
  return personen.reduce((s, p) => s + (p.zahlen?.[key] || 0), 0);
}

function pfeil(jetzt, vorher) {
  return jetzt > vorher ? " ↑" : jetzt < vorher ? " ↓" : "";
}

/**
 * Worauf die Leitung diese Woche achten sollte.
 *
 * Bewusst wenige, harte Regeln statt einer Stimmungsampel: Jede Zeile hier
 * soll ein Gespräch auslösen. Wer jede Woche fünf Warnungen bekommt, liest
 * ab der dritten Woche keine mehr.
 */
export function fruehwarnungen(personen = []) {
  const warnungen = [];
  personen.forEach((p) => {
    const name = p.name || "Unbenannt";
    const jetzt = p.zahlen?.anwahlen || 0;
    const vorher = p.vorwoche?.anwahlen || 0;
    if (vorher >= EINBRUCH_AB && jetzt <= vorher * EINBRUCH_ANTEIL) {
      warnungen.push({ name, grund: `Anwahlen von ${vorher} auf ${jetzt} gefallen` });
    }
    if (p.stimmungsFolge >= 2 && p.stimmung === "schwer") {
      warnungen.push({ name, grund: `${p.stimmungsFolge}. Woche in Folge als schwer erlebt` });
    }
    if (p.verbunden && p.letzteAntwortTage !== null && p.letzteAntwortTage >= OHNE_ANTWORT_TAGE) {
      warnungen.push({ name, grund: `seit ${p.letzteAntwortTage} Tagen keine Antwort im Buddy` });
    }
    if (p.onboardingUeberfaellig > 0) {
      warnungen.push({ name, grund: `${p.onboardingUeberfaellig} überfällige Onboarding-Schritte` });
    }
  });
  return warnungen;
}

/** Eine Zeile je Person: Zahlen, Stimmung, Themen, Training. */
export function personenZeile(p) {
  const z = p.zahlen || leereZahlen();
  const v = p.vorwoche || leereZahlen();
  const teile = TEAM_KENNZAHLEN
    .filter((key) => z[key] > 0 || v[key] > 0)
    .map((key) => {
      const k = KENNZAHLEN.find((x) => x.key === key);
      return `${k.label} ${z[key]} (${v[key]})${pfeil(z[key], v[key])}`;
    });
  const zeilen = [`• ${p.name || "Unbenannt"}: ${teile.length ? teile.join(" · ") : "nichts eingetragen"}`];
  const anhang = [];
  if (p.stimmung && STIMMUNGEN[p.stimmung]) anhang.push(`Stimmung ${STIMMUNGEN[p.stimmung].label}`);
  if (p.schulung) anhang.push(`Training: ${schulungVon(p.schulung)?.titel || p.schulung}`);
  if (anhang.length) zeilen.push(`  ${anhang.join(" · ")}`);
  if (p.herausforderungen?.length) zeilen.push(`  Themen: ${p.herausforderungen.join("; ")}`);
  return zeilen.join("\n");
}

/** Die ganze Nachricht an die Leitung. */
export function teamlageText({ organisation = "", woche, personen = [], name = "" }) {
  const aktiv = personen.filter((p) => (p.zahlen?.anwahlen || 0) > 0 || (p.zahlen?.terminiert || 0) > 0);
  const kopfZahlen = TEAM_KENNZAHLEN
    .filter((key) => summe(personen, key) > 0)
    .map((key) => {
      const k = KENNZAHLEN.find((x) => x.key === key);
      const jetzt = summe(personen, key);
      const vorher = personen.reduce((s, p) => s + (p.vorwoche?.[key] || 0), 0);
      return `${k.label} ${jetzt} (${vorher})${pfeil(jetzt, vorher)}`;
    });

  const warnungen = fruehwarnungen(personen);
  const vorname = String(name || "").trim().split(/\s+/)[0];

  return [
    `📊 Teamlage${organisation ? ` — ${organisation}` : ""}`,
    `Woche ab ${wochenName(woche)}${vorname ? `, für dich, ${vorname}` : ""}`,
    "",
    kopfZahlen.length ? kopfZahlen.join(" · ") : "Diese Woche wurde noch nichts eingetragen.",
    "",
    `${aktiv.length} von ${personen.length} haben diese Woche telefoniert oder Termine gemacht.`,
    "",
    ...(personen.length ? ["Je Person:", ...personen.map(personenZeile)] : []),
    ...(warnungen.length
      ? ["", "⚠️ Achte auf:", ...warnungen.map((w) => `• ${w.name}: ${w.grund}`)]
      : ["", "✅ Nichts, das sofort ein Gespräch braucht."]),
    "",
    "Frag mich einfach: „Wie lief die Woche bei …?“ oder „Wer hat kaum telefoniert?“",
  ].join("\n");
}

/**
 * Derselbe Stand als Zeilen für die KI — damit die Leitung dem Buddy
 * Fragen stellen kann.
 *
 * Auch hier: nur Zahlen und Stichpunkte. Der Chat der Leute gehört nicht
 * dazu, und die KI bekommt ihn auch nicht zu sehen.
 */
export function teamZeilenFuerKI(personen = []) {
  if (!personen.length) return [];
  return [
    "Stand deines Teams in dieser Woche (Vorwoche in Klammern):",
    ...personen.map((p) => {
      const z = p.zahlen || leereZahlen();
      const v = p.vorwoche || leereZahlen();
      const zahlen = KENNZAHLEN.filter((k) => z[k.key] > 0 || v[k.key] > 0)
        .map((k) => `${k.label} ${z[k.key]} (${v[k.key]})`).join(", ");
      const extra = [
        p.stimmung ? `Stimmung ${p.stimmung}` : null,
        p.herausforderungen?.length ? `Themen: ${p.herausforderungen.join("; ")}` : null,
        p.schulung ? `Training: ${schulungVon(p.schulung)?.titel || p.schulung}` : null,
        p.onboardingUeberfaellig ? `${p.onboardingUeberfaellig} überfällige Onboarding-Schritte` : null,
        p.letzteAntwortTage !== null && p.letzteAntwortTage !== undefined ? `letzte Antwort vor ${p.letzteAntwortTage} Tagen` : null,
      ].filter(Boolean).join(", ");
      return `- ${p.name}: ${zahlen || "nichts eingetragen"}${extra ? ` · ${extra}` : ""}`;
    }),
    "Diese Angaben darfst du der Leitung nennen. Die Gespräche der Leute kennst du nicht und erfindest sie auch nicht.",
  ];
}
