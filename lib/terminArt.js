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
// Der Fortschritt sagt, wie weit ein Interessent gekommen ist. Die Werte
// sind bewusst keine Wahrscheinlichkeiten, sondern Wegmarken: 90 % beim
// Abschluss und nicht 100, weil mit dem Geld nicht Schluss ist. Die letzten
// zehn Punkte sind der Anruf einen Monat später — die einzige Stufe nach
// dem Verkauf, und deshalb die, die ohne festen Platz immer vergessen wird.
export const TERMIN_ARTEN = [
  { key: "erstgespraech", label: "Setting-Termin", kurz: "ST", farbe: "#E0A458", fortschritt: 25,
    hinweis: "Termin steht" },
  // Ausdrücklich KEIN Zwischenschritt zum Abschluss: ein Folgetermin heisst,
  // dass der Kunde zögert. Wer das mit "läuft gut" verwechselt, plant mit
  // Umsatz, den es noch nicht gibt.
  { key: "folgetermin", label: "Folgetermin", kurz: "FU", farbe: "#9E8CF0", fortschritt: 50,
    hinweis: "Der Kunde überlegt noch" },
  { key: "closing", label: "Closing Call", kurz: "CC", farbe: "#3FA7D6", fortschritt: 75,
    hinweis: "Abschlussgespräch" },
  { key: "checkin", label: "Check-in", kurz: "CI", farbe: "#5FCF6B", fortschritt: 100,
    hinweis: "Ein Monat nach Abschluss: läuft alles?" },
];

// Nach so vielen Tagen ist der Check-in fällig. Ein Monat ist lang genug,
// dass der Kunde etwas erlebt hat, und kurz genug, dass ein Problem noch
// zu retten ist.
export const CHECKIN_NACH_TAGEN = 30;

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
  // Jede Stufe zählt einmal — die aktuelle UND jede abgeschlossene aus dem
  // Verlauf.
  //
  // Ohne den Verlauf hätte ein Kontakt, der bis zum Closing Call
  // vorgerückt ist, nie ein Erstgespräch gehabt: der Eintrag trägt ja nur
  // noch die letzte Stufe. Die Tabelle zeigte dann lauter Closings und
  // keine Erstgespräche — und wäre wertlos für die Frage, wo es hakt.
  const zaehler = {};
  TERMIN_ARTEN.forEach((a) => {
    zaehler[a.key] = { ...a, gesamt: 0, wahrgenommen: 0, kunden: 0 };
  });

  leads.forEach((l) => {
    // Die abgeschlossenen Stufen: sie sind per Definition stattgefunden.
    (Array.isArray(l.stufen_verlauf) ? l.stufen_verlauf : []).forEach((v) => {
      const z = zaehler[v.art] || zaehler.erstgespraech;
      z.gesamt += 1;
      z.wahrgenommen += 1;
      if (v.ergebnis === "kunde") z.kunden += 1;
    });

    // Und die Stufe, auf der er gerade steht.
    const z = zaehler[artVon(l).key];
    z.gesamt += 1;
    if (l.status === "wahrgenommen") z.wahrgenommen += 1;
    if (l.outcome === "kunde") z.kunden += 1;
  });

  return TERMIN_ARTEN.map((a) => {
    const z = zaehler[a.key];
    return {
      ...z,
      // Ohne wahrgenommene Termine keine Quote — und nicht etwa null Prozent.
      abschlussquote: z.wahrgenommen ? Math.round((z.kunden / z.wahrgenommen) * 100) : null,
    };
  });
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

/**
 * Einen Termin auf die nächste Stufe setzen — mit Eintrag im Verlauf.
 *
 * Der Termin rückt weiter, statt dass ein zweiter entsteht: ein Kontakt ist
 * ein Eintrag. Damit dabei nicht die Geschichte verlorengeht (genau daran
 * scheiterte die frühere Fassung), wird die bisherige Stufe mit ihrem Datum
 * festgehalten, bevor das neue eingetragen wird.
 *
 * @returns die Felder, die geschrieben werden müssen
 */
export function rueckeVor(lead, neueArt, neuerZeitpunkt, wer = null) {
  const bisher = Array.isArray(lead?.stufen_verlauf) ? lead.stufen_verlauf : [];
  const aktuelle = artVon(lead).key;

  // Die abgeschlossene Stufe festhalten — mit dem Datum, an dem sie
  // stattfand, nicht mit dem von heute.
  const verlauf = [
    ...bisher,
    {
      art: aktuelle,
      am: lead?.appointment_at || null,
      ergebnis: lead?.outcome || null,
      von: wer,
    },
  ];

  return {
    termin_art: neueArt,
    appointment_at: neuerZeitpunkt,
    // Die neue Stufe steht noch aus: der alte Status und das alte Ergebnis
    // gehören zur abgeschlossenen Stufe und stünden hier falsch.
    status: "geplant",
    outcome: null,
    stufen_verlauf: verlauf,
  };
}

/** Der Verlauf zum Anzeigen — älteste Stufe zuerst, mit Bezeichnungen. */
export function verlaufVon(lead) {
  const roh = Array.isArray(lead?.stufen_verlauf) ? lead.stufen_verlauf : [];
  return roh.map((e) => ({
    ...e,
    label: TERMIN_ARTEN.find((a) => a.key === e.art)?.label || e.art,
    kurz: TERMIN_ARTEN.find((a) => a.key === e.art)?.kurz || "?",
  }));
}

/**
 * Wie weit dieser Kontakt gekommen ist, in Prozent.
 *
 * Der Abschluss steht bei 90 und nicht bei 100: Mit dem Geld ist es nicht
 * fertig. Die letzten zehn Punkte gibt es erst, wenn jemand einen Monat
 * später nachgefragt hat, ob alles läuft.
 */
export function fortschritt(lead) {
  const art = artVon(lead);
  if (art.key === "checkin") {
    // Der Check-in zählt erst als erledigt, wenn er stattgefunden hat —
    // ein geplanter Anruf ist kein geführter.
    return lead?.status === "wahrgenommen" ? 100 : 90;
  }
  if (lead?.outcome === "kunde") return 90;
  if (lead?.outcome === "absage") return 0;
  return art.fortschritt;
}

/** Ist der Check-in fällig? Für die Follow-up-Liste. */
export function checkinFaellig(lead, jetzt = new Date()) {
  if (lead?.outcome !== "kunde") return false;
  if (artVon(lead).key === "checkin") return false;   // läuft schon
  const bezug = lead?.appointment_at;
  if (!bezug) return false;
  const tage = (jetzt.getTime() - new Date(bezug).getTime()) / 86400000;
  return tage >= CHECKIN_NACH_TAGEN;
}
