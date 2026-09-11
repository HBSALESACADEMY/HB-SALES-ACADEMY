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
// Ein Symbol trägt nur der Closing Call. Genau darin liegt sein Sinn: in
// einer Liste aus zwanzig Terminen ist der eine, in dem es ums Geld geht,
// sofort zu finden. Bekäme jede Stufe eines, wäre wieder keins auffällig.
export const TERMIN_ARTEN = [
  { key: "erstgespraech", label: "Setting Call", kurz: "ST", symbol: "", farbe: "#E0A458", fortschritt: 25,
    hinweis: "Das erste Gespräch — es hat stattgefunden" },
  // Ausdrücklich KEIN halber Weg zum Abschluss: ein Folgetermin heisst,
  // dass der Kunde zögert. Deshalb zählt er nur wenig mehr als der blosse
  // Termin — der Kontakt lebt noch, mehr sagt er nicht.
  //
  // Er stand hier zwischenzeitlich bei 50 und damit auf halber Strecke.
  // Das ist die Zahl, die aus einem Zögern einen Fortschritt macht, und wer
  // danach plant, plant mit Umsatz, den es nicht gibt.
  { key: "folgetermin", label: "Folgetermin", kurz: "FU", symbol: "", farbe: "#9E8CF0", fortschritt: 35,
    hinweis: "Der Kunde überlegt noch — kein halber Abschluss" },
  { key: "closing", label: "Closing Call", kurz: "CC", symbol: "💵", farbe: "#3FA7D6", fortschritt: 70,
    hinweis: "Abschlussgespräch" },
  { key: "checkin", label: "Check-in", kurz: "CI", symbol: "", farbe: "#5FCF6B", fortschritt: 100,
    hinweis: "Ein Monat nach Abschluss: ist der Kunde zufrieden?" },
];

// Was zwischen den Gesprächen passiert — und abgehakt werden muss.
//
// Diese drei sind KEINE Termine. Vor dem Setting Call und vor dem Closing
// Call steht die Bestätigung: der Anruf oder die Mail, die dafür sorgt,
// dass der Termin auch stattfindet. Sie ist der billigste Schritt im ganzen
// Verkauf und der, der am häufigsten unterbleibt — ein nicht bestätigter
// Termin platzt, und niemand weiss hinterher, ob jemand nachgehakt hat.
//
// Die Projektumsetzung steht nach dem Abschluss. Sie hakt die Leitung ab,
// nicht der Vertrieb: wer verkauft hat, ist nicht die Person, die beurteilt,
// ob geliefert wurde. Diese Grenze steht nicht nur in der Maske, sondern in
// der Datenbank (migration_157) — sonst hielte sie genau so lange, bis
// jemand den Weg daran vorbei findet.
export const SCHRITTE = [
  { key: "setting_bestaetigt", label: "Setting Call bestätigt", kurz: "SB", wert: 10, rolle: "vertrieb",
    farbe: "#E0A458", vorStufe: "erstgespraech", meldet: true,
    hinweis: "Vor dem Setting Call bestätigen, damit er auch stattfindet" },
  { key: "closing_bestaetigt", label: "Closing Call bestätigt", kurz: "CB", wert: 50, rolle: "vertrieb",
    farbe: "#3FA7D6", vorStufe: "closing", meldet: true,
    hinweis: "Vor dem Closing Call bestätigen, damit er auch stattfindet" },
  // Ohne "meldet": Die Leitung hakt sie selbst ab und weiss es damit
  // bereits. Eine Meldung an die Gruppe wäre eine Nachricht an denjenigen,
  // der sie ausgelöst hat.
  { key: "projektumsetzung", label: "Projektumsetzung", kurz: "PU", wert: 95, rolle: "leitung",
    farbe: "#5FCF6B", vorStufe: null,
    hinweis: "Hakt die Vertriebsleitung ab, wenn das Projekt umgesetzt ist" },
  // Der letzte Schritt gehört wieder dem Vertrieb. Wer verkauft hat, ruft
  // an und fragt, ob alles läuft — das ist der Anruf, der aus einem Kunden
  // eine Empfehlung macht, und der ohne festen Platz immer ausfällt.
  { key: "checkin_erledigt", label: "Check-in erledigt", kurz: "CI", wert: 100, rolle: "vertrieb",
    farbe: "#5FCF6B", vorStufe: null, meldet: true,
    hinweis: "Der Anruf einen Monat nach dem Abschluss: ist der Kunde zufrieden?" },
];

// Wer welchen Schritt abhakt, in Worten — für die Beschriftung.
export const ROLLEN_NAMEN = { vertrieb: "Vertrieb", leitung: "Vertriebsleitung" };

// Der Abschluss selbst. Bewusst nicht 100: mit dem Geld ist es nicht fertig.
export const KUNDE_WERT = 85;

/**
 * Alle Wegmarken in der Reihenfolge, in der sie kommen — Gespräche und
 * Haken gemischt.
 *
 * Der Balken zeigt sie als eine Kette, denn für den Vertriebler ist es
 * eine: bestätigen, sprechen, bestätigen, abschliessen, liefern, nachfragen.
 * Dass die einen Termine sind und die anderen Häkchen, ist eine Frage der
 * Technik und nicht des Verkaufs.
 */
export const WEGMARKEN = [
  ...SCHRITTE.map((s) => ({ key: s.key, label: s.label, kurz: s.kurz, wert: s.wert, farbe: s.farbe, haken: true, hinweis: s.hinweis })),
  // Der Check-in erscheint als HAKEN, nicht als Stufe: der Termin steht im
  // Kalender, aber im Balken zählt, dass jemand angerufen hat. Zwei Marken
  // mit demselben Wert wären dieselbe Sache zweimal.
  ...TERMIN_ARTEN.filter((a) => a.key !== "checkin")
    .map((a) => ({ key: a.key, label: a.label, kurz: a.kurz, wert: a.fortschritt, farbe: a.farbe, haken: false, hinweis: a.hinweis })),
  { key: "kunde", label: "Kunde geworden", kurz: "KD", wert: KUNDE_WERT, farbe: "#5FCF6B", haken: false,
    hinweis: "Der Abschluss — noch nicht das Ende" },
].sort((a, b) => a.wert - b.wert);

/** Ist dieser Schritt abgehakt? */
export function schrittErledigt(lead, key) {
  return !!lead?.schritte?.[key]?.am;
}

/**
 * Darf diese Person diesen Schritt abhaken?
 *
 * Die Projektumsetzung ist der Leitung vorbehalten. Alles andere hakt ab,
 * wer den Termin ohnehin bearbeiten darf.
 */
export function darfSchritt(schritt, istLeitung) {
  return schritt?.rolle !== "leitung" || !!istLeitung;
}

/** Den Haken setzen oder wieder entfernen — als Feld für die Datenbank. */
export function schrittPatch(lead, key, erledigt, wer = null) {
  const bisher = (lead?.schritte && typeof lead.schritte === "object") ? lead.schritte : {};
  const neu = { ...bisher };
  if (erledigt) neu[key] = { am: new Date().toISOString(), von: wer };
  else delete neu[key];
  return { schritte: neu };
}

// Nach so vielen Tagen ist der Check-in fällig. Ein Monat ist lang genug,
// dass der Kunde etwas erlebt hat, und kurz genug, dass ein Problem noch
// zu retten ist.
export const CHECKIN_NACH_TAGEN = 30;

/**
 * Das Kürzel, wie es angezeigt wird — mit Symbol, wo die Stufe eins hat.
 *
 * An einer Stelle, damit Kalender, Liste, Balken und Verlauf nicht drei
 * verschiedene Schreibweisen desselben Termins zeigen.
 */
export function kuerzelVon(art) {
  if (!art) return "";
  return art.symbol ? `${art.symbol} ${art.kurz}` : art.kurz;
}

/**
 * Termine, bei denen niemand eine Stufe gewählt hat.
 *
 * Früher galten sie als Setting Call — "das ist es in aller Regel". Das war
 * geraten und wurde als Tatsache angezeigt: In der Liste stand "ST:" vor
 * einem Termin, der gar kein Erstgespräch war, und in der Auswertung
 * zählte er als eines. Eine Zahl, die aus Vermutungen besteht, ist
 * schlimmer als eine fehlende.
 *
 * Deshalb eine eigene, stumme Stufe: kein Kürzel, keine Farbe, kein
 * Fortschritt. Neu angelegte Termine bekommen ihre Stufe beim Anlegen
 * (pages/api/lead-created.js), hier landen nur die alten.
 */
export const OHNE_STUFE = {
  key: "unbestimmt", label: "Ohne Stufe", kurz: "", symbol: "", farbe: "#8A8FA3", fortschritt: 0,
  hinweis: "Für diesen Termin wurde keine Stufe gewählt",
};

/**
 * Ist das überhaupt ein Kundentermin?
 *
 * Ein persönlicher Eintrag — eine Erinnerung, ein Arzttermin, ein
 * Rückruf an sich selbst — hat keinen Verkaufsvorgang. Ihm die Maske
 * eines Interessenten zu geben ist nicht nur unnütz: die Auswertung
 * zählte dann einen Vorgang, den es nie gab, und die Quoten des Teams
 * werden dadurch schlechter (migration_159).
 */
export function istKundentermin(lead) {
  return !lead?.kein_kundentermin;
}

/** Die Stufe eines Termins — oder die stumme, wenn keine hinterlegt ist. */
export function artVon(lead) {
  const key = lead?.termin_art;
  return TERMIN_ARTEN.find((a) => a.key === key) || OHNE_STUFE;
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
  [...TERMIN_ARTEN, OHNE_STUFE].forEach((a) => {
    zaehler[a.key] = { ...a, gesamt: 0, wahrgenommen: 0, kunden: 0 };
  });

  leads.filter(istKundentermin).forEach((l) => {
    // Die abgeschlossenen Stufen: sie sind per Definition stattgefunden.
    (Array.isArray(l.stufen_verlauf) ? l.stufen_verlauf : []).forEach((v) => {
      const z = zaehler[v.art] || zaehler.unbestimmt;
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

  // Die stumme Stufe erscheint nur, wenn es sie wirklich gibt. Eine Zeile
  // "Ohne Stufe: 0" in jeder Auswertung wäre Ballast; steht dort aber eine
  // Zahl, ist das die Auskunft, dass jemand die Stufen nicht pflegt.
  const stufen = zaehler.unbestimmt.gesamt > 0 ? [...TERMIN_ARTEN, OHNE_STUFE] : TERMIN_ARTEN;
  return stufen.map((a) => {
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
  // Ohne Stufe kein Kürzel — ein ": " vor dem Namen sähe nach einem Fehler
  // aus, und ein erfundenes "ST" wäre einer.
  const kuerzel = kuerzelVon(art) ? `${kuerzelVon(art)}: ` : "";
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
    kurz: kuerzelVon(TERMIN_ARTEN.find((a) => a.key === e.art)) || "?",
  }));
}

/**
 * Welche Wegmarken dieser Kontakt erreicht hat — als Menge von Schlüsseln.
 *
 * Gesammelt statt gerechnet: der Balken zeigt dieselben Marken, die Liste
 * hakt sie ab, und die Zahl unten ist nur die höchste davon. Aus einer
 * Quelle, sonst zeigt der Balken eine Marke als erreicht, die der
 * Prozentwert nicht kennt.
 */
export function erreichteMarken(lead) {
  const erreicht = new Set();
  if (!lead) return erreicht;

  // Jede Stufe, die STATTGEFUNDEN hat — die abgeschlossenen aus dem Verlauf
  // und die aktuelle, aber diese nur, wenn sie wahrgenommen wurde.
  //
  // Das ist der Punkt, an dem der Balken vorher falsch war: Ein bloss
  // eingetragener Termin zählte als erreichtes Gespräch und gab 25 %. Damit
  // stand die Kette schon auf einem Viertel, bevor irgendjemand irgendetwas
  // getan hatte — und die Bestätigung davor (10 %) bewegte den Balken
  // nicht mehr, weil 25 grösser ist als 10.
  //
  // Jetzt füllt sich der Balken in der Reihenfolge, in der gearbeitet wird:
  // bestätigen, sprechen, bestätigen, abschliessen, liefern, nachfragen.
  // Ein Termin im Kalender ist noch keine Leistung — er ist ein Vorhaben.
  (Array.isArray(lead.stufen_verlauf) ? lead.stufen_verlauf : []).forEach((v) => {
    if (v?.art) erreicht.add(v.art);
  });
  if (lead.status === "wahrgenommen") erreicht.add(artVon(lead).key);

  // Der Check-in ist ein Haken, keine Stufe im Balken. Hat der Termin dazu
  // stattgefunden, gilt der Haken als gesetzt — zweimal dasselbe
  // bestätigen muss niemand.
  erreicht.delete("checkin");
  if (artVon(lead).key === "checkin" && lead.status === "wahrgenommen") erreicht.add("checkin_erledigt");

  SCHRITTE.forEach((s) => { if (schrittErledigt(lead, s.key)) erreicht.add(s.key); });
  if (lead.outcome === "kunde") erreicht.add("kunde");

  return erreicht;
}

/**
 * Wie weit dieser Kontakt gekommen ist, in Prozent.
 *
 * Die höchste erreichte Wegmarke zählt, nicht die letzte. Das ist der
 * Unterschied, sobald es Häkchen gibt: Wer den Closing Call bestätigt hat
 * (50 %), aber noch im Setting Call steht, ist weiter als 25 % — und ein
 * Balken, der bei einem abgehakten Schritt zurückspringt, wird nicht mehr
 * abgehakt.
 *
 * Der Abschluss steht bei 85 und nicht bei 100: mit dem Geld ist es nicht
 * fertig. Was fehlt, ist die Umsetzung und der Anruf einen Monat später.
 */
export function fortschritt(lead) {
  // Ein persönlicher Termin hat keinen Weg zum Abschluss.
  if (!istKundentermin(lead)) return 0;
  const erreicht = erreichteMarken(lead);
  return WEGMARKEN.reduce((hoechste, m) => (erreicht.has(m.key) && m.wert > hoechste ? m.wert : hoechste), 0);
}

/**
 * Ist dieser Kontakt verloren?
 *
 * Getrennt von der Zahl, und das ist der Punkt. Früher gab der Fortschritt
 * bei einer Absage 0 zurück — der Balken war leer, während daneben die
 * Marken für Setting Call und Closing Call als erreicht dastanden. Zwei
 * Angaben, die einander widersprachen: die eine sagte "nichts passiert",
 * die andere "zwei Gespräche geführt".
 *
 * Beides stimmt für sich: Die Gespräche HABEN stattgefunden, und am Ende
 * kam kein Kunde heraus. Deshalb zeigt der Balken jetzt, wie weit es kam,
 * und sagt dazu, dass es dort geendet hat.
 */
export function istVerloren(lead) {
  return lead?.outcome === "absage";
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
