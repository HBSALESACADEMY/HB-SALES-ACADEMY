// Vorlagen für die Marketing-Mails und die Frage, wann nachzufassen ist.
//
// Beides gehört zusammen an einen Ort, weil beides die gleiche Sorte
// Entscheidung ist: Was steht in der Mail, und wann erinnert die Academy
// daran, dass keine kam.

// Was in einer Vorlage ersetzt wird. Bewusst wenige und offensichtliche
// Platzhalter — je mehr es gibt, desto eher steht am Ende "Hallo {{vorname}}"
// in einer echten Mail beim Kunden.
export const PLATZHALTER = [
  { schluessel: "name", label: "Name des Kontakts" },
  { schluessel: "firma", label: "Firma" },
  { schluessel: "notiz", label: "Gesprächsnotiz" },
  { schluessel: "vertriebler", label: "Name des Vertrieblers" },
  { schluessel: "organisation", label: "Name der Organisation" },
];

/**
 * Platzhalter ersetzen.
 *
 * Fehlt ein Wert, verschwindet der Platzhalter samt der Zeile, in der er
 * allein steht: "Firma: {{firma}}" ohne Firma ergibt sonst eine Zeile
 * "Firma:", und genau daran erkennt ein Kunde eine Serienmail.
 */
export function fuelleVorlage(text, werte = {}) {
  const zeilen = String(text || "").split("\n");
  const gefuellt = zeilen.map((zeile) => {
    const benutzt = [...zeile.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const leer = benutzt.filter((k) => !String(werte[k] || "").trim());
    // Die Zeile hängt an einem Platzhalter, für den es keinen Wert gibt.
    if (benutzt.length && leer.length === benutzt.length) {
      const ohne = zeile.replace(/\{\{\w+\}\}/g, "").trim();
      // Steht ausser dem Platzhalter nur noch ein Etikett da, fällt die
      // ganze Zeile weg.
      if (!ohne || /^[\wäöüÄÖÜß ]{0,20}:$/.test(ohne)) return null;
    }
    return zeile.replace(/\{\{(\w+)\}\}/g, (_, k) => String(werte[k] || "").trim());
  });
  return gefuellt.filter((z) => z !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Welche Platzhalter in einem Text vorkommen — für die Vorschau. */
export function benutztePlatzhalter(text) {
  const gefunden = [...String(text || "").matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return [...new Set(gefunden)];
}

/** Unbekannte Platzhalter — Tippfehler, die sonst in der Mail landen. */
export function unbekanntePlatzhalter(text) {
  const erlaubt = new Set(PLATZHALTER.map((p) => p.schluessel));
  return benutztePlatzhalter(text).filter((p) => !erlaubt.has(p));
}

// Nach so vielen Tagen ohne Ergebnis gilt ein verschickter Kontakt als
// überfällig. Fünf Werktage sind lang genug, dass niemand nach zwei Tagen
// nervös nachfasst, und kurz genug, dass der Kontakt sich noch an das
// Gespräch erinnert.
export const NACHFASSEN_AB_TAGEN = 5;

/**
 * Braucht dieser Kontakt Nachfassen?
 *
 * Nur verschickte: bei einem offenen Kontakt ist noch gar nichts passiert,
 * das ist keine Wiedervorlage, sondern schlicht unerledigt.
 */
export function brauchtNachfassen(kontakt, jetzt = new Date()) {
  if (!kontakt || kontakt.status !== "verschickt" || !kontakt.verschickt_am) return false;
  const tage = (jetzt.getTime() - new Date(kontakt.verschickt_am).getTime()) / 86400000;
  return tage >= NACHFASSEN_AB_TAGEN;
}

/** Wie lange etwas schon liegt — für die Anzeige. */
export function liegtSeitTagen(iso, jetzt = new Date()) {
  if (!iso) return null;
  const tage = Math.floor((jetzt.getTime() - new Date(iso).getTime()) / 86400000);
  return Number.isFinite(tage) ? Math.max(0, tage) : null;
}
