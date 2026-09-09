// Auf welcher Stufe ein Termin steht.
//
// Ein Closing Call ist etwas anderes als ein Folgetermin: "der Kunde
// überlegt noch" und "jetzt wird abgeschlossen" sehen in der Liste gleich
// aus, sind aber verschiedene Stufen. Für die Frage, wo im Verkauf es hakt,
// ist genau dieser Unterschied die Antwort.

export const TERMIN_ARTEN = [
  { key: "erstgespraech", label: "Erstgespräch", kurz: "Erst" },
  { key: "folgetermin", label: "Folgetermin", kurz: "Folge" },
  { key: "closing", label: "Closing Call", kurz: "Closing" },
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
