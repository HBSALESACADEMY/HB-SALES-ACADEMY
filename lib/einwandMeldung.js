import { saeubere, vergleichsForm } from "./grundVorschlag.js";

// Meldung an die Leitung, wenn im Call Tracker ein neuer Einwandgrund
// auftaucht.
//
// Wer am Telefon etwas hört, das in keine Kategorie passt, tippt es ein
// (migration_135). Gezählt wird es als "Sonstiges", der Wortlaut geht als
// Vorschlag an die Leitung — und lag bis jetzt dort, bis jemand von sich
// aus in Verwaltung → Einwände geschaut hat. Genau darum geht es hier:
// Der Grund ist das Frühwarnzeichen. Wenn drei Leute in einer Woche
// dasselbe hören, gehört es in den Einwand-Trainer, und zwar diese Woche.
//
// Gemeldet wird nur NEUES.
//
// Jeden eingetippten Grund zu melden, hiesse: dreissig Nachrichten am Tag,
// die meisten davon "Kein Interesse" zum vierzigsten Mal. Nach drei Tagen
// schaltet die Leitung das ab, und dann kommt auch die eine Meldung nicht
// mehr an, auf die es angekommen wäre. Deshalb: derselbe Wortlaut nur beim
// ersten Mal, und was schon eine Kategorie ist, gar nicht.

// Mehr als so viele eigene Gründe an einem Tag von EINER Person: Dann
// stimmt etwas anderes nicht (jemand probiert das Feld aus, oder es wird
// als Notizzettel benutzt). Gespeichert wird weiter alles, gemeldet nicht
// mehr — eine Meldungslawine würde den Kanal unbrauchbar machen.
export const TAGES_GRENZE = 10;

/**
 * Ist dieser Wortlaut neu?
 *
 * @param text        Der eingetippte Grund.
 * @param vorhandene  Die Texte der Vorschläge, die es in dieser Organisation
 *                    schon gibt — INKLUSIVE des gerade eingetragenen.
 *                    Deshalb ist "einmal vorhanden" noch neu.
 * @param kategorien  Die Einwand-Kategorien der Organisation. Was schon eine
 *                    Kategorie ist, ist keine Neuigkeit.
 */
export function istNeuerGrund(text, vorhandene = [], kategorien = []) {
  const form = vergleichsForm(text);
  if (!form) return false;
  const schonKategorie = (kategorien || []).some((k) => {
    const label = typeof k === "string" ? k : (k?.label || k?.key || "");
    return vergleichsForm(label) === form;
  });
  if (schonKategorie) return false;
  const gleiche = (vorhandene || []).filter((v) => vergleichsForm(typeof v === "string" ? v : v?.text) === form);
  return gleiche.length <= 1;
}

/**
 * Die Nachricht.
 *
 * Der Wortlaut in Anführungszeichen, wer ihn eingetragen hat, und was man
 * damit tun kann. Keine Zahl, die die Academy nicht kennt, und keine
 * Behauptung, es sei schon etwas passiert: Gezählt ist der Anruf, die
 * Kategorie muss die Leitung selbst anlegen.
 */
export function meldungText({ text = "", von = "", offen = 0, appUrl = "" } = {}) {
  const grund = saeubere(text);
  if (!grund) return null;
  const person = String(von || "").trim();
  const zeilen = [
    "🗣 Neuer Einwandgrund aus dem Call Tracker",
    "",
    `„${grund}“`,
    person ? `Eingetragen von ${person}.` : "Eingetragen von einer Person aus deinem Team.",
    "",
    "Gezählt ist der Anruf als „Sonstiges“. Eine eigene Kategorie daraus machen kannst du in der Academy:"
    + " Verwaltung → Einwände.",
  ];
  if (offen > 1) {
    zeilen.push("", `Dort warten gerade ${offen} Vorschläge auf dich.`);
  }
  if (appUrl) zeilen.push("", `${appUrl.replace(/\/+$/, "")}/admin/objections`);
  return zeilen.join("\n");
}
