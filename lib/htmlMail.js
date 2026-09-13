// HTML-Vorlagen für Marketing-Mails.
//
// Bis hierhin kannte die Academy nur Text: jedes Zeichen wurde maskiert,
// aus Zeilenumbrüchen wurden Absätze. Eine gestaltete HTML-Mail kam beim
// Kunden deshalb als sichtbarer Quelltext an, mit allen spitzen Klammern.
//
// Zwei Regeln tragen diesen Modus, und beide sind nicht verhandelbar:
//
//   1. Die VORLAGE ist vertraut — sie stammt von der Leitung. Die WERTE sind
//      es nicht: ein Kontakt namens "<b>Müller</b> & Co" steht so in der
//      Datenbank, weil ihn jemand am Telefon so notiert hat. Werte werden
//      deshalb maskiert, bevor sie ins HTML kommen. Sonst schreibt ein
//      Kontaktname Markup in eine Mail, die im Namen der Firma rausgeht.
//
//   2. Der Server nimmt das HTML aus der GESPEICHERTEN Vorlage, nie aus der
//      Anfrage (pages/api/marketing-mail.js). Sonst liesse sich über die
//      Absenderadresse der Firma beliebiges HTML verschicken.

import { alsHtml, fuelleVorlage } from "./marketingVorlage.js";

// Ab etwa dieser Grösse kürzt Gmail eine Mail und zeigt nur noch
// "Nachricht gekürzt". Der Rest — meist die Signatur mit Anschrift und
// Abmeldehinweis — ist dann nur noch über einen Link erreichbar.
export const GMAIL_GRENZE_BYTES = 102 * 1024;

export function istHtmlVorlage(vorlage) {
  return vorlage?.format === "html";
}

export function maskiere(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Platzhalter im HTML füllen — mit MASKIERTEN Werten.
 *
 * Anders als beim Text fällt hier keine Zeile weg: HTML ist nicht
 * zeilenweise aufgebaut, und eine "leere Zeile" zu entfernen, zerschnitte
 * im Zweifel eine Tabelle. Ein leerer Wert ergibt schlicht nichts.
 */
export function fuelleHtml(html, werte = {}) {
  return String(html || "")
    .replace(/\{\{(\w+)\}\}/g, (_, k) => maskiere(String(werte[k] || "").trim()));
}

/**
 * Was in einer Mail nichts zu suchen hat, entfernen — und sagen, was.
 *
 * Mailprogramme werfen Skripte, Formulare und eingebettete Rahmen ohnehin
 * hinaus. Sie trotzdem mitzuschicken, hilft niemandem und erhöht die
 * Wahrscheinlichkeit, dass die Mail als Spam gilt.
 */
export function bereinigeHtml(html) {
  const entfernt = new Set();
  let s = String(html || "");

  const bloecke = [
    ["script", "Skripte"],
    ["iframe", "eingebettete Rahmen"],
    ["object", "eingebettete Objekte"],
    ["embed", "eingebettete Objekte"],
    ["form", "Formulare"],
  ];
  bloecke.forEach(([tag, name]) => {
    const paar = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    const einzeln = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    if (paar.test(s) || einzeln.test(s)) entfernt.add(name);
    s = s.replace(paar, "").replace(einzeln, "");
  });

  // Ereignis-Attribute wie onclick="…" und onload='…'.
  if (/\son[a-z]+\s*=/i.test(s)) entfernt.add("Ereignis-Attribute (onclick …)");
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // javascript:-Adressen in Links und Bildern.
  if (/(href|src)\s*=\s*["']?\s*javascript:/i.test(s)) entfernt.add("javascript:-Links");
  s = s.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');

  return { html: s, entfernt: [...entfernt] };
}

/**
 * Den Standardschluss unter die HTML-Mail setzen.
 *
 * Der Schluss bleibt Text und wird hier umgewandelt: er gilt für alle
 * Vorlagen, Text wie HTML, und soll nur an einer Stelle gepflegt werden.
 * Steht er schon im HTML — jemand hat die Signatur in die Datei kopiert —,
 * kommt er nicht ein zweites Mal.
 */
export function htmlMitSchluss(html, signatur, werte = {}) {
  const schluss = fuelleVorlage(signatur || "", werte);
  if (!schluss) return html;

  const nurZeichen = (t) => String(t).toLowerCase().replace(/\s+/g, "");
  if (nurZeichen(htmlZuText(html)).includes(nurZeichen(schluss))) return html;

  // Werte im Schluss sind bereits eingesetzt; alsHtml maskiert den ganzen
  // Text. Das ist dieselbe Umwandlung wie bei Text-Mails.
  const block = `<div style="margin-top:24px">${alsHtml(schluss)}</div>`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${block}</body>`)
    : `${html}${block}`;
}

/**
 * Die reine Textfassung derselben Mail.
 *
 * Wird zusätzlich mitgeschickt. Mailprogramme ohne HTML zeigen sie an, und
 * eine HTML-Mail ohne Textfassung wirkt auf Spamfilter wie Werbung von
 * jemandem, der sich keine Mühe gibt.
 */
export function htmlZuText(html) {
  return String(html || "")
    .replace(/<(head|style|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)\s*>/gi, "\n\n")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, inhalt) => {
      const text = inhalt.replace(/<[^>]+>/g, "").trim();
      // Sprungmarken und entschärfte Links ("#") sind für einen Leser der
      // Textfassung wertlos — dort steht dann nur der Linktext.
      if (/^#/.test(url)) return text;
      return text && text !== url ? `${text} (${url})` : url;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Die Grösse in Bytes, wie sie beim Postfach ankommt. Von Hand gezählt:
// TextEncoder gibt es nicht in jeder Umgebung, in der diese Datei läuft,
// und die Zeichenzahl allein unterschätzt jeden Umlaut.
function utf8Laenge(text) {
  let n = 0;
  for (const zeichen of String(text)) {
    const c = zeichen.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/**
 * Was an einer HTML-Vorlage auffällt, bevor sie beim Kunden liegt.
 *
 * Hinweise, keine Sperren: Die Vorlage gehört der Leitung, und manche
 * Punkte sind bewusste Entscheidungen. Aber sie sollen VOR dem ersten
 * Versand dastehen und nicht erst in der Beschwerde.
 */
export function htmlPruefung(html) {
  const hinweise = [];
  const text = String(html || "");
  const bytes = utf8Laenge(text);

  if (bytes > GMAIL_GRENZE_BYTES) {
    hinweise.push(`Die Vorlage ist ${Math.round(bytes / 1024)} KB gross. Gmail kürzt ab etwa 102 KB — der Schluss mit Anschrift und Abmeldehinweis wäre dann versteckt.`);
  }

  const bilder = [...text.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const nichtOeffentlich = bilder.filter((src) => !/^https:\/\//i.test(src));
  if (nichtOeffentlich.length) {
    hinweise.push(`${nichtOeffentlich.length} ${nichtOeffentlich.length === 1 ? "Bild hat" : "Bilder haben"} keine öffentliche https-Adresse (etwa „${nichtOeffentlich[0].slice(0, 40)}“). Lokale Pfade und eingebettete Bilder kommen in den meisten Postfächern nicht an.`);
  }

  if (/<style\b/i.test(text)) {
    hinweise.push("Die Vorlage nutzt einen <style>-Block. Einige Mailprogramme ignorieren ihn — Gestaltung, die zählen soll, gehört direkt an die Elemente (style=\"…\").");
  }

  if (!/abmeld|abbestell|unsubscribe/i.test(htmlZuText(text))) {
    hinweise.push("Kein Abmeldehinweis gefunden. Bei Werbemails an Geschäftskontakte gehört einer hinein — am einfachsten in den Standardschluss, dann steht er unter jeder Vorlage.");
  }

  return hinweise;
}

/**
 * Die fertige HTML-Mail für einen Kontakt: bereinigt, gefüllt, mit Schluss.
 *
 * Eine Funktion für Vorschau UND Versand. Liefen beide über getrennte Wege,
 * zeigte die Vorschau irgendwann etwas anderes als das, was rausgeht.
 */
export function fertigeHtmlMail(vorlage, werte = {}, signatur = "") {
  const { html: sauber } = bereinigeHtml(vorlage?.html || "");
  const html = htmlMitSchluss(fuelleHtml(sauber, werte), signatur, werte);
  return {
    betreff: fuelleVorlage(vorlage?.betreff || "", werte),
    html,
    text: htmlZuText(html),
  };
}
