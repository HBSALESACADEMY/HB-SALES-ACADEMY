// Der Wochenrückblick des Vertriebsbuddys.
//
// Aus dem Gespräch einer Woche werden drei Dinge herausgelesen: woran es
// hakte, wie die Stimmung war, was sich die Person vorgenommen hat. Damit
// kann der Buddy nächste Woche anknüpfen — und die Leitung sieht die
// Herausforderungen, ohne je einen Satz aus dem Chat zu lesen.

export const STIMMUNGEN = {
  gut: { label: "gut", farbe: "#5FCF6B" },
  gemischt: { label: "gemischt", farbe: "#E0A458" },
  schwer: { label: "schwer", farbe: "#E5716A" },
};

export const HOECHSTENS_HERAUSFORDERUNGEN = 3;

/** Die Anweisung an die KI. Antwort ausdrücklich als JSON, sonst ist nichts auslesbar. */
export function rueckblickAnweisung({ name = "" } = {}) {
  return [
    "Du wertest das Wochengespräch eines Vertriebscoachs mit einer Vertriebsperson aus.",
    `Die Person heisst ${name || "unbekannt"}.`,
    "Lies heraus, woran es diese Woche hakte, wie die Stimmung war und was sich die Person vorgenommen hat.",
    "Antworte NUR mit JSON, ohne Erklärung davor oder danach, in dieser Form:",
    '{"herausforderungen": ["…", "…"], "stimmung": "gut|gemischt|schwer", "vorhaben": "…", "zusammenfassung": "…"}',
    `Regeln: höchstens ${HOECHSTENS_HERAUSFORDERUNGEN} Herausforderungen, jede höchstens 80 Zeichen, auf Deutsch, in der dritten Person und ohne Namen.`,
    "Herausforderungen sind fachlich oder organisatorisch (\"kommt selten am Vorzimmer vorbei\", \"zu wenig Zeit zum Telefonieren\"), keine Charakterurteile.",
    "\"vorhaben\" ist ein Satz: was sich die Person für nächste Woche vorgenommen hat, oder leer.",
    "\"zusammenfassung\" sind zwei Sätze für das Gedächtnis des Coachs, auch Persönliches darf hinein.",
    "Gibt das Gespräch nichts her, antworte mit leeren Werten statt zu raten.",
  ].join("\n");
}

function saubererText(wert, hoechstens) {
  return String(wert ?? "").replace(/\s+/g, " ").trim().slice(0, hoechstens);
}

/**
 * Die Antwort der KI auslesen — robust.
 *
 * Sprach-KIs verpacken JSON gern in ```json-Blöcke oder schreiben einen
 * Satz davor. Beides darf nicht dazu führen, dass eine ganze Woche
 * verlorengeht.
 */
export function leseRueckblick(text) {
  const roh = String(text || "");
  const anfang = roh.indexOf("{");
  const ende = roh.lastIndexOf("}");
  if (anfang === -1 || ende <= anfang) return null;
  let daten;
  try {
    daten = JSON.parse(roh.slice(anfang, ende + 1));
  } catch (e) {
    return null;
  }
  const herausforderungen = (Array.isArray(daten.herausforderungen) ? daten.herausforderungen : [])
    .map((h) => saubererText(h, 80))
    .filter(Boolean)
    .slice(0, HOECHSTENS_HERAUSFORDERUNGEN);
  const stimmung = STIMMUNGEN[daten.stimmung] ? daten.stimmung : null;
  const vorhaben = saubererText(daten.vorhaben, 200) || null;
  const zusammenfassung = saubererText(daten.zusammenfassung, 600) || null;
  if (!herausforderungen.length && !stimmung && !vorhaben && !zusammenfassung) return null;
  return { herausforderungen, stimmung, vorhaben, zusammenfassung };
}

/** Was der Buddy aus der Vorwoche mitnimmt — als Zeile in den nächsten Impuls. */
export function anknuepfung(rueckblick) {
  if (!rueckblick) return "";
  const teile = [];
  if (rueckblick.vorhaben) teile.push(`Letzte Woche wolltest du: ${rueckblick.vorhaben}`);
  else if (rueckblick.herausforderungen?.length) teile.push(`Letzte Woche hakte es hier: ${rueckblick.herausforderungen[0]}`);
  return teile.join(" ");
}

/** Dasselbe für die KI: Was war letzte Woche Thema? */
export function gedaechtnisZeilen(rueckblick) {
  if (!rueckblick) return [];
  const zeilen = [];
  if (rueckblick.zusammenfassung) zeilen.push(`Letzte Woche: ${rueckblick.zusammenfassung}`);
  if (rueckblick.herausforderungen?.length) zeilen.push(`Hakte bei: ${rueckblick.herausforderungen.join("; ")}`);
  if (rueckblick.vorhaben) zeilen.push(`Hatte sich vorgenommen: ${rueckblick.vorhaben}`);
  if (rueckblick.stimmung) zeilen.push(`Stimmung: ${rueckblick.stimmung}`);
  return zeilen;
}

/**
 * Für die Leitung: welche Herausforderungen im Team wie oft vorkommen.
 *
 * Zusammengefasst wird über die Schreibweise hinweg (Gross- und
 * Kleinschreibung, Punkt am Ende) — sonst stünde dieselbe Sache dreimal
 * untereinander und keine Zahl wäre aussagekräftig.
 */
export function haeufigeHerausforderungen(rueckblicke = []) {
  const zaehler = new Map();
  rueckblicke.forEach((r) => {
    const gesehen = new Set();
    (r?.herausforderungen || []).forEach((h) => {
      const schluessel = String(h).toLowerCase().replace(/[.!?]+$/, "").trim();
      if (!schluessel || gesehen.has(schluessel)) return;
      gesehen.add(schluessel);
      const eintrag = zaehler.get(schluessel) || { text: String(h).trim(), anzahl: 0, personen: new Set() };
      eintrag.anzahl += 1;
      if (r.user_id) eintrag.personen.add(r.user_id);
      zaehler.set(schluessel, eintrag);
    });
  });
  return [...zaehler.values()]
    .map((e) => ({ text: e.text, anzahl: e.anzahl, personen: e.personen.size }))
    .sort((a, b) => b.anzahl - a.anzahl || a.text.localeCompare(b.text));
}

/** Die Stimmungen einer Woche zusammengezählt. */
export function stimmungsBild(rueckblicke = []) {
  const bild = { gut: 0, gemischt: 0, schwer: 0, ohne: 0 };
  rueckblicke.forEach((r) => {
    if (r?.stimmung && bild[r.stimmung] !== undefined) bild[r.stimmung] += 1;
    else bild.ohne += 1;
  });
  return bild;
}
