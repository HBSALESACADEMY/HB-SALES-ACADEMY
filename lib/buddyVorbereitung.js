import { zahlenFuerTage } from "./zahlenLaden.js";
import { summiereTage } from "./wochenimpuls.js";
import { KENNZAHLEN } from "./tagesauswertung.js";
import { berlinHeute, wochenStartTag, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";
import { schulungVon } from "./schulung.js";
import { STIMMUNGEN } from "./buddyRueckblick.js";
import { istKundentermin } from "./terminArt.js";

// Die Vorbereitung auf ein Einzelgespräch — für die Leitung.
//
// "Bereite mein Gespräch mit Ernestine vor" ergibt: ihre Zahlen der letzten
// vier Wochen, wie es ihr laut Wochenrückblick ging, woran sie gerade
// arbeitet, was offen ist — und drei Fragen fürs Gespräch.
//
// Was hier NICHT hineinkommt: ein einziger Satz aus ihrem Gespräch mit dem
// Buddy. Die Leitung bekommt, was sie auch auf der Seite Herausforderungen
// sieht — Themen, Stimmung, Vorhaben, Zahlen. Die Zusammenfassung des
// Rückblicks wird nicht einmal geladen.
//
// Die Zahlen rechnet die Academy. Die KI schreibt nur die Einordnung und
// die Fragen.

export const WOCHEN = 4;

// Die Kennzahlen für die Wochenzeile — alle neun wären unlesbar.
const SPALTEN = ["anwahlen", "terminiert", "setting", "closing", "kunden"];

const normal = (t) => String(t || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Aus "Bereite mein Gespräch mit Ernestine vor" den Namen — oder null. */
export function nameAusFrage(text) {
  const t = String(text || "").trim();
  // Nicht schon "Gespräch mit": "Das Gespräch mit Monoke lief gut" handelt
  // von einem Kunden und ist keine Bitte um Vorbereitung.
  const absicht = /(bereite|vorbereit|1:1|1 ?zu ?1|eins zu eins|einzelgespr|mitarbeitergespr|feedbackgespr|jahresgespr|entwicklungsgespr)/i;
  if (!absicht.test(t)) return null;
  const treffer = t.match(/\bmit\s+(.+?)(?:\s+vor(?:bereiten)?)?\s*[.!?]*$/i);
  if (!treffer) return null;
  const name = treffer[1].replace(/^(der|dem|den|die|frau|herrn?)\s+/i, "").trim();
  return name && name.length <= 60 ? name : null;
}

/**
 * Die gemeinte Person finden. Voller Name vor Vorname vor Wortanfang.
 * @returns {person} | {mehrdeutig: [namen]} | null
 */
export function findePerson(mitglieder = [], suche = "") {
  const s = normal(suche);
  if (!s) return null;
  const mitNamen = mitglieder.map((m) => ({ m, n: normal(m.full_name) })).filter((x) => x.n);
  const stufen = [
    (x) => x.n === s,
    (x) => x.n.split(" ")[0] === s,
    (x) => x.n.split(" ").includes(s),
    (x) => x.n.startsWith(s) || x.n.split(" ").some((w) => w.startsWith(s)),
  ];
  for (const passt of stufen) {
    const treffer = mitNamen.filter(passt);
    if (treffer.length === 1) return { person: treffer[0].m };
    if (treffer.length > 1) return { mehrdeutig: treffer.map((x) => x.m.full_name) };
  }
  return null;
}

function kurzDatum(tag) {
  const [, m, t] = tag.split("-").map(Number);
  return `${t}.${m}.`;
}

export function wochenZeile(woche, zahlen, { laufend = false } = {}) {
  const werte = SPALTEN.map((k) => zahlen?.[k] || 0).join(" · ");
  return `ab ${kurzDatum(woche)}${laufend ? " (läuft)" : ""}: ${werte}`;
}

export function kopfZeile() {
  return SPALTEN.map((k) => KENNZAHLEN.find((x) => x.key === k)?.label || k).join(" · ");
}

/** Alles über eine Person, was die Leitung fürs Gespräch braucht. */
export async function ladeVorbereitung(admin, person, { jetzt = new Date() } = {}) {
  const heute = berlinHeute(jetzt);
  const dieseWoche = wochenStartTag(jetzt);
  const wochen = [];
  for (let i = WOCHEN - 1; i >= 0; i -= 1) wochen.push(tagPlus(dieseWoche, -7 * i));
  const tage = [];
  for (let t = wochen[0]; t <= heute; t = tagPlus(t, 1)) tage.push(t);

  const [proTag, rueckblicke, schulungen, termine] = await Promise.all([
    zahlenFuerTage(admin, tage),
    admin.from("buddy_wochen").select("woche, herausforderungen, stimmung, vorhaben")
      .eq("user_id", person.id).gte("woche", wochen[0]).order("woche"),
    admin.from("buddy_schulungen").select("thema, phase, erledigt, gestartet_am")
      .eq("user_id", person.id).order("gestartet_am", { ascending: false }).limit(3),
    admin.from("leads").select("id, appointment_at, status, outcome, termin_art, kein_kundentermin")
      .eq("created_by", person.id).is("geloescht_am", null)
      .gte("appointment_at", tagesBeginnZeitpunkt(tagPlus(heute, -14)))
      .lt("appointment_at", tagesBeginnZeitpunkt(tagPlus(heute, 8))),
  ]);

  const jetztMs = jetzt.getTime();
  const alle = termine.data || [];
  return {
    name: person.full_name,
    wochen: wochen.map((w) => ({
      woche: w,
      laufend: w === dieseWoche,
      zahlen: summiereTage(proTag, tage.filter((t) => t >= w && t < tagPlus(w, 7)), person.id),
    })),
    rueckblicke: rueckblicke.data || [],
    schulungen: schulungen.data || [],
    offeneErgebnisse: alle.filter((l) => new Date(l.appointment_at).getTime() < jetztMs
      && l.status === "geplant" && !l.outcome && istKundentermin(l) && l.termin_art !== "checkin").length,
    kommendeTermine: alle.filter((l) => new Date(l.appointment_at).getTime() >= jetztMs && l.status !== "abgesagt").length,
  };
}

/** Die Fakten als Zeilen — für die Nachricht und als Stoff für die KI. */
export function vorbereitungsZeilen(daten) {
  const zeilen = [`Zahlen je Woche (${kopfZeile()}):`];
  daten.wochen.forEach((w) => zeilen.push(`• ${wochenZeile(w.woche, w.zahlen, { laufend: w.laufend })}`));

  const stimmungen = daten.rueckblicke.filter((r) => STIMMUNGEN[r.stimmung]);
  if (stimmungen.length) {
    zeilen.push("", `Stimmung laut Wochenrückblick: ${stimmungen.map((r) => `${STIMMUNGEN[r.stimmung].label} (${kurzDatum(r.woche)})`).join(" → ")}`);
  }
  const themen = [...new Set(daten.rueckblicke.flatMap((r) => (Array.isArray(r.herausforderungen) ? r.herausforderungen : [])))].slice(-5);
  if (themen.length) zeilen.push(`Themen: ${themen.join("; ")}`);
  const vorhaben = [...daten.rueckblicke].reverse().find((r) => r.vorhaben)?.vorhaben;
  if (vorhaben) zeilen.push(`Zuletzt vorgenommen: ${vorhaben}`);

  const schulung = daten.schulungen[0];
  const baustein = schulungVon(schulung?.thema);
  if (baustein) {
    const stand = schulung.phase === "fertig"
      ? (schulung.erledigt === true ? "abgeschlossen, Übung gemacht" : schulung.erledigt === false ? "abgeschlossen, Übung nicht gemacht" : "abgeschlossen")
      : "läuft";
    zeilen.push(`Schulung mit dem Buddy: ${baustein.titel} (${stand})`);
  }
  if (!stimmungen.length && !themen.length) zeilen.push("", "Aus dem Buddy gibt es für diese Wochen keinen Rückblick.");

  zeilen.push("", `Termine ohne Ergebnis (letzte 14 Tage): ${daten.offeneErgebnisse}`);
  zeilen.push(`Termine in den nächsten 7 Tagen: ${daten.kommendeTermine}`);
  return zeilen;
}

export function vorbereitungsAnweisung({ leitung = "" } = {}) {
  return [
    `Du bist der Vertriebsbuddy der HB Sales Academy und hilfst ${leitung || "der Vertriebsleitung"}, ein Einzelgespräch mit einer Person aus dem Team vorzubereiten. Deutsch, per Du mit der Leitung.`,
    "Du bekommst Zahlen und Stichpunkte. Schreib:",
    "1. Eine Einordnung in zwei bis drei Sätzen: Was fällt auf, was hat sich verändert, was läuft gut.",
    "2. Genau drei offene Fragen für das Gespräch, nummeriert. Wertschätzend, konkret an den Daten, keine Suggestivfragen.",
    "Regeln:",
    "- Nenne keine Zahl, die nicht in den Daten steht. Rechne nichts neu aus.",
    "- Ein Closing Call ist ein Abschlussgespräch, kein Abschluss. Abschlüsse sind nur die \"Kunden\".",
    "- Unterstelle nichts. Wo Daten fehlen, frag lieber.",
    "- Kein Markdown, keine Sternchen. Höchstens 170 Wörter.",
  ].join("\n");
}

/** Wenn die KI nicht antwortet: Fragen aus den Daten, ohne Einordnung. */
export function fragenOhneKI(daten) {
  const fragen = [];
  const letzte = daten.rueckblicke[daten.rueckblicke.length - 1];
  if (letzte?.stimmung === "schwer") fragen.push("Was macht dir gerade am meisten zu schaffen — und was würde dir helfen?");
  const w = daten.wochen[daten.wochen.length - 2]?.zahlen;
  if (w && w.anwahlen > 0 && w.terminiert === 0) fragen.push("Wenn du jemanden am Telefon hast: Woran scheitert es, bevor ein Termin entsteht?");
  if (daten.offeneErgebnisse > 0) fragen.push(`Bei ${daten.offeneErgebnisse} Terminen fehlt das Ergebnis — wie liefen die?`);
  fragen.push("Was lief in den letzten Wochen am besten — und warum?");
  fragen.push("Wobei kann ich dich konkret unterstützen?");
  return fragen.slice(0, 3).map((f, i) => `${i + 1}. ${f}`);
}

export function vorbereitungsText(daten, kiText = "") {
  return [
    `🗂 Gesprächsvorbereitung: ${daten.name}`,
    "",
    ...vorbereitungsZeilen(daten),
    "",
    kiText ? kiText.trim() : ["Fragen fürs Gespräch:", ...fragenOhneKI(daten)].join("\n"),
    "",
    `Was ${String(daten.name || "").split(/\s+/)[0] || "die Person"} mit dem Buddy schreibt, bleibt privat — hier steht nur, was du auch unter Herausforderungen siehst.`,
  ].join("\n");
}
