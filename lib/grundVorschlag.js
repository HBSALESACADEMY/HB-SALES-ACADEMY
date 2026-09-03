// Eigene Ablehnungsgründe, die aus dem Team kommen.
//
// Die festen Kategorien werden oben festgelegt — aber am Telefon hört man
// Dinge, an die beim Festlegen niemand gedacht hat. Wer sie unter
// "Sonstiges" verbucht, verliert genau die Information, die interessant
// gewesen wäre. Deshalb darf jede Person einen Grund eintippen; die Leitung
// sieht die Vorschläge gesammelt und macht daraus bei Bedarf eine Kategorie.

// Kurz genug, um in eine Kachel zu passen, lang genug für einen Satzrest.
export const MAX_LAENGE = 60;

/**
 * Freitext säubern.
 *
 * Mehrfache Leerzeichen weg, Länge begrenzt — und ein Ergebnis, das nur aus
 * Satzzeichen besteht, gilt als leer. Sonst stehen in der Vorschlagsliste
 * Einträge wie "..." und "???", die niemand übernehmen kann.
 */
export function saeubere(roh) {
  const text = String(roh || "").replace(/\s+/g, " ").trim().slice(0, MAX_LAENGE);
  return /[\p{L}\p{N}]/u.test(text) ? text : "";
}

/**
 * Zwei Schreibweisen desselben Grundes zusammenführen.
 *
 * "Kein Interesse", "kein interesse" und "Kein  Interesse!" sind dasselbe.
 * Ohne diese Zusammenführung stünden sie dreimal in der Liste, jeweils mit
 * Anzahl 1 — und damit sähe kein einziger Vorschlag wichtig aus.
 */
export function vergleichsForm(text) {
  return saeubere(text).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
}

/** Aus einem Vorschlag einen Kategorie-Schlüssel machen. */
export function schluesselFuer(text, vorhandene = []) {
  const basis = vergleichsForm(text).replace(/ /g, "_").slice(0, 40) || "grund";
  const belegt = new Set(vorhandene.map((k) => (typeof k === "string" ? k : k.key)));
  if (!belegt.has(basis)) return basis;
  // Schon vergeben: durchnummerieren, statt einen bestehenden Grund
  // stillschweigend zu überschreiben.
  for (let i = 2; i < 100; i++) {
    const versuch = `${basis}_${i}`;
    if (!belegt.has(versuch)) return versuch;
  }
  return `${basis}_${Date.now()}`;
}

/**
 * Vorschläge zu einer Liste zusammenfassen: gleiche Gründe zusammen,
 * häufigste zuerst.
 */
export function fasseZusammen(vorschlaege = []) {
  const gruppen = new Map();
  vorschlaege.forEach((v) => {
    const form = vergleichsForm(v.text);
    if (!form) return;
    if (!gruppen.has(form)) {
      gruppen.set(form, { form, text: saeubere(v.text), anzahl: 0, personen: new Set(), ids: [], zuletzt: null });
    }
    const g = gruppen.get(form);
    g.anzahl += 1;
    g.ids.push(v.id);
    if (v.user_id) g.personen.add(v.user_id);
    if (!g.zuletzt || v.created_at > g.zuletzt) g.zuletzt = v.created_at;
  });
  return [...gruppen.values()]
    .map((g) => ({ ...g, personen: g.personen.size }))
    .sort((a, b) => b.anzahl - a.anzahl || b.zuletzt?.localeCompare(a.zuletzt || "") || 0);
}
