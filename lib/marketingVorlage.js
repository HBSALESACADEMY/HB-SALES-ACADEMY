// Vorlagen für die Marketing-Mails und die Frage, wann nachzufassen ist.
//
// Beides gehört zusammen an einen Ort, weil beides die gleiche Sorte
// Entscheidung ist: Was steht in der Mail, und wann erinnert die Academy
// daran, dass keine kam.

// Was in einer Vorlage ersetzt wird. Bewusst wenige und offensichtliche
// Platzhalter — je mehr es gibt, desto eher steht am Ende "Hallo {{vorname}}"
// in einer echten Mail beim Kunden.
export const PLATZHALTER = [
  { schluessel: "anrede", label: "Herr / Frau" },
  { schluessel: "nachname", label: "Nachname allein" },
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
    const gefuellt = zeile.replace(/\{\{(\w+)\}\}/g, (_, k) => String(werte[k] || "").trim());
    // Ein leerer Platzhalter mitten in der Zeile hinterlässt zwei
    // Leerzeichen: "Hallo  Schmidt," wenn keine Anrede hinterlegt ist.
    // Führende Leerzeichen bleiben — die können Absicht sein.
    return gefuellt.replace(/(\S) {2,}/g, "$1 ").replace(/ +$/, "");
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

/**
 * Der fertige Text, wie er beim Kunden ankommt — Vorlage plus Signatur.
 *
 * An einer Stelle zusammengesetzt, damit Vorschau, Probemail und der echte
 * Versand nie auseinanderlaufen. Genau dort entstehen sonst die Fehler, die
 * erst beim Empfänger auffallen.
 */
export function fertigeMail(vorlage, werte = {}, signatur = "") {
  return {
    betreff: fuelleVorlage(vorlage?.betreff || "", werte),
    text: mitSchluss(fuelleVorlage(vorlage?.text || "", werte), signatur, werte),
  };
}

/**
 * Den Standardschluss anhängen — aber nur, wenn er nicht schon dasteht.
 *
 * Wer die Signatur in seiner Vorlage stehen hat und zusätzlich einen
 * Standardschluss pflegt, bekam sie zweimal in der Mail. Die Warnung beim
 * Bearbeiten hilft nur dem, der sie liest; hier wird es verhindert.
 *
 * Verglichen wird ohne Leerzeichen und Gross-/Kleinschreibung, weil sonst
 * ein einzelner Zeilenumbruch mehr die Erkennung aushebelt.
 */
export function mitSchluss(text, signatur, werte = {}) {
  const schluss = fuelleVorlage(signatur || "", werte);
  if (!schluss) return text;

  const nurZeichen = (s) => String(s).toLowerCase().replace(/\s+/g, "");
  if (nurZeichen(text).endsWith(nurZeichen(schluss))) return text;

  return `${text}\n\n${schluss}`;
}

// Ein erfundener Kontakt für die Vorschau. Bewusst offensichtlich erfunden:
// Wer hier einen echten Namen sieht, hält die Vorschau womöglich für eine
// echte Mail.
export const BEISPIEL_KONTAKT = {
  name: "Beispiel Ansprechpartner",
  firma: "Musterfirma GmbH",
  notiz: "hat um Unterlagen zum Angebot gebeten",
};

/**
 * Welche Vorlage zu Terminen führt.
 *
 * Gezählt werden nur bearbeitete Kontakte: ein gerade verschickter zählt
 * noch nicht gegen die Vorlage, er hatte ja noch keine Gelegenheit.
 */
export function vorlagenErfolg(kontakte = []) {
  const proVorlage = new Map();
  kontakte.forEach((k) => {
    if (!k.vorlage) return;
    if (!proVorlage.has(k.vorlage)) proVorlage.set(k.vorlage, { name: k.vorlage, verschickt: 0, termine: 0, offen: 0 });
    const e = proVorlage.get(k.vorlage);
    e.verschickt += 1;
    if (k.status === "termin") e.termine += 1;
    if (k.status === "verschickt") e.offen += 1;
  });

  return [...proVorlage.values()].map((e) => {
    const bewertet = e.verschickt - e.offen;
    return {
      ...e,
      // Ohne abgeschlossene Fälle keine Quote — und nicht etwa null Prozent.
      quote: bewertet > 0 ? Math.round((e.termine / bewertet) * 100) : null,
      bewertet,
    };
  }).sort((a, b) => (b.quote ?? -1) - (a.quote ?? -1));
}

/**
 * Der Text als HTML für den Versand.
 *
 * Die Reihenfolge ist der ganze Punkt: erst maskieren, DANN die Umbrüche
 * einsetzen. Andersherum wird das eben eingefügte "<br/>" von der
 * Maskierung gleich wieder unschädlich gemacht, und beim Empfänger steht
 * wörtlich "<br/>" im Text — ein Fehler, den man erst in der Mail beim
 * Kunden sieht.
 */
export function alsHtml(text) {
  const sicher = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return sicher.split(/\n{2,}/)
    .map((absatz) => `<p>${absatz.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/**
 * Was in Vorlage UND Signatur steht, erscheint doppelt.
 *
 * Der häufigste Fehler beim Einrichten: Die Vorlage endet mit "Mit
 * freundlichen Grüßen {{vertriebler}}", die Signatur fängt genauso an — und
 * beim Kunden steht der Name zweimal. Auffallen würde es erst dort.
 */
export function doppelt(vorlagenText, signatur) {
  const inVorlage = new Set(benutztePlatzhalter(vorlagenText));
  const beide = benutztePlatzhalter(signatur).filter((p) => inVorlage.has(p));

  // Grussformeln sind keine Platzhalter, tauchen aber genauso doppelt auf.
  const gruss = /(mit freundlichen gr|viele gr|beste gr|herzliche gr|liebe gr)/i;
  const grussDoppelt = gruss.test(String(vorlagenText || "")) && gruss.test(String(signatur || ""));

  return { platzhalter: beide, gruss: grussDoppelt, hatDoppeltes: beide.length > 0 || grussDoppelt };
}

/** "Herr" oder "Frau" — leer, wenn nichts hinterlegt ist. */
export function anredeText(anrede) {
  if (anrede === "herr") return "Herr";
  if (anrede === "frau") return "Frau";
  return "";
}

/**
 * Der Nachname aus einem vollen Namen.
 *
 * Das letzte Wort, weil im Geschäftsverkehr "Vorname Nachname" die Regel
 * ist. Bei einem einzelnen Wort bleibt es dabei — dann ist es entweder der
 * Nachname oder das Einzige, was man hat.
 */
export function nachnameAus(name) {
  const teile = String(name || "").trim().split(/\s+/).filter(Boolean);
  return teile.length ? teile[teile.length - 1] : "";
}

/** Die Werte, mit denen eine Vorlage für einen Kontakt gefüllt wird. */
export function werteFuerKontakt(kontakt = {}, { vertriebler = "", organisation = "" } = {}) {
  return {
    anrede: anredeText(kontakt.anrede),
    nachname: nachnameAus(kontakt.name),
    name: kontakt.name || "",
    firma: kontakt.firma || "",
    notiz: kontakt.notiz || "",
    vertriebler,
    organisation,
  };
}
