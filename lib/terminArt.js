// Auf welcher Stufe ein Termin steht.
//
// Ein Closing Call ist etwas anderes als ein Folgetermin: "der Kunde
// überlegt noch" und "jetzt wird abgeschlossen" sehen in der Liste gleich
// aus, sind aber verschiedene Stufen. Für die Frage, wo im Verkauf es hakt,
// ist genau dieser Unterschied die Antwort.

// Kürzel und Farbe je Stufe. Beides gehört zusammen an eine Stelle: im
// Kalender steht das Kürzel vor dem Namen, die Farbe hinter dem Eintrag,
// und in der Liste dasselbe. Zwei Quellen dafür liefen unweigerlich
// auseinander.
export const TERMIN_ARTEN = [
  { key: "erstgespraech", label: "Setting-Termin", kurz: "ST", farbe: "#E0A458" },
  { key: "folgetermin", label: "Folgetermin", kurz: "FU", farbe: "#9E8CF0" },
  { key: "closing", label: "Closing Call", kurz: "CC", farbe: "#3FA7D6" },
];

/** Ohne Angabe ist es ein Erstgespräch — das ist es in aller Regel. */
export function artVon(lead) {
  const key = lead?.termin_art;
  return TERMIN_ARTEN.find((a) => a.key === key) || TERMIN_ARTEN[0];
}

/**
 * Der Trichter über die Stufen: wie viele Erstgespräche führen zu einem
 * Closing, und wie viele davon zum Kunden.
 *
 * Gezählt wird je Stufe, nicht je Kette: ein Termin kann nur auf einer
 * Stufe stehen, und eine Kette mit zwei Closings gäbe es sonst doppelt.
 */
export function stufenAuswertung(leads = []) {
  const proStufe = TERMIN_ARTEN.map((a) => {
    const drin = leads.filter((l) => artVon(l).key === a.key);
    const wahrgenommen = drin.filter((l) => l.status === "wahrgenommen");
    return {
      ...a,
      gesamt: drin.length,
      wahrgenommen: wahrgenommen.length,
      kunden: drin.filter((l) => l.outcome === "kunde").length,
      // Ohne wahrgenommene Termine keine Quote — und nicht etwa null Prozent.
      abschlussquote: wahrgenommen.length
        ? Math.round((drin.filter((l) => l.outcome === "kunde").length / wahrgenommen.length) * 100)
        : null,
    };
  });
  return proStufe;
}

/**
 * Wie ein Termin im Kalender heisst.
 *
 * "CC: Max Muster – Ernestine": Kürzel, damit man die Stufe sieht, ohne den
 * Eintrag anzutippen. Und der Name der Person, die den ERSTEN Termin gelegt
 * hat — nicht der, die gerade das Gespräch führt.
 *
 * Das ist der Punkt: Führt Lion das Erstgespräch von Ernestines Interessent
 * und vereinbart einen Closing Call, bleibt es Ernestines Kontakt. Der
 * neue Termin erbt beim Anlegen ihren Namen, und der gehört auch in den
 * Kalender — sonst sieht es dort aus, als wäre es Lions Kunde.
 */
export function kalenderTitel(lead, vertrieblerName = "") {
  const art = artVon(lead);
  const kuerzel = `${art.kurz}: `;
  const name = lead?.name || "Termin";
  return `${kuerzel}${name}${vertrieblerName ? ` – ${vertrieblerName}` : ""}`;
}

/** Die Farbe der Stufe — für Kalenderkacheln und Punkte. */
export function terminFarbe(lead) {
  return artVon(lead).farbe;
}
