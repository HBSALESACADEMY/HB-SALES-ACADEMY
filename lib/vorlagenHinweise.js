// Was an einer Vorlage auffällt — gesammelt an einer Stelle.
//
// Die Hinweise standen vorher verstreut untereinander in der Bearbeitungs-
// maske: unbekannte Platzhalter, fremde Platzhalter, die HTML-Prüfung, die
// Warnung vor doppeltem Gruss, der Hinweis auf leere Vorlagen. Bei drei
// Vorlagen war die Maske eine Wand aus gelben Sätzen, und welche Vorlage
// ein Problem hatte, sah man erst beim Aufklappen jeder einzelnen.
//
// Jetzt liefert diese Funktion eine Liste mit Schweregrad. Die Übersicht
// zeigt nur die Anzahl, der Reiter "Hinweise" den Wortlaut.

import { istHtmlVorlage, fremdePlatzhalter, htmlPruefung } from "./htmlMail.js";
import { unbekanntePlatzhalter, doppelt } from "./marketingVorlage.js";

/**
 * @returns [{ art: "fehler" | "warnung" | "info", text, fremde? }]
 *   "fehler": landet sichtbar falsch beim Kunden.
 *   "warnung": sollte man sich ansehen.
 *   "info": kein Problem, aber gut zu wissen.
 */
export function vorlagenHinweise(vorlage = {}, signatur = "") {
  const v = vorlage || {};
  const html = istHtmlVorlage(v);
  const inhalt = html ? (v.html || "") : (v.text || "");
  const hinweise = [];

  // Ein Tippfehler im Platzhalter landet wörtlich in der Mail beim Kunden:
  // "Hallo {{vorname}}".
  const unbekannt = [...new Set([...unbekanntePlatzhalter(v.betreff || ""), ...unbekanntePlatzhalter(inhalt)])];
  if (unbekannt.length) {
    hinweise.push({
      art: "fehler",
      text: `Unbekannte Platzhalter: ${unbekannt.map((p) => `{{${p}}}`).join(", ")} — die stehen später wörtlich in der Mail beim Kunden.`,
    });
  }

  if (html) {
    const fremde = fremdePlatzhalter(inhalt);
    if (fremde.length) {
      hinweise.push({
        art: "fehler",
        text: "Diese Platzhalter stammen aus einem anderen Programm und werden nicht ersetzt.",
        fremde,
      });
    }
    if (v.entfernt?.length) {
      hinweise.push({
        art: "info",
        text: `Beim Versand entfernt: ${v.entfernt.join(", ")}. Mailprogramme werfen das ohnehin hinaus.`,
      });
    }
    htmlPruefung(inhalt).forEach((text) => hinweise.push({ art: "warnung", text }));
  } else {
    const zweimal = doppelt(inhalt, signatur);
    if (zweimal.hatDoppeltes) {
      const was = [
        zweimal.gruss ? "die Grussformel" : "",
        zweimal.platzhalter.map((p) => `{{${p}}}`).join(", "),
      ].filter(Boolean).join(" und ");
      hinweise.push({
        art: "warnung",
        text: `Steht doppelt: ${was} — das steht auch im Standardschluss und erscheint deshalb zweimal in der Mail.`,
      });
    }
  }

  if (!String(v.name || "").trim() || !inhalt.trim()) {
    hinweise.push({
      art: "info",
      text: "Ohne Name und Inhalt wird diese Vorlage beim Speichern verworfen.",
    });
  }

  return hinweise;
}

/** Wie viele Hinweise wirklich Aufmerksamkeit brauchen — für die Übersicht. */
export function ernsteHinweise(hinweise = []) {
  return hinweise.filter((h) => h.art === "fehler" || h.art === "warnung").length;
}
