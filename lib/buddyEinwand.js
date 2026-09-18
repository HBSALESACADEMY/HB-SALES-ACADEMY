import { DEFAULT_OBJECTIONS } from "./objections.js";

// Die Einwand-Hilfe des Vertriebsbuddys.
//
// Wer schreibt "Kunde sagt, zu teuer", bekommt die Antwort, die seine
// Organisation dafür hinterlegt hat — nicht irgendeine. Die eigenen
// Einwände (Verwaltung → Einwände) kommen dazu, die Standard-Einwände der
// Academy bleiben als Grundstock.
//
// Welche Einwände passen, entscheidet ein einfacher Wortvergleich, nicht
// die KI. Die KI formuliert nur, und sie bekommt dafür ausschliesslich die
// gefundenen Einträge — damit sie nicht eine eigene Einwandbehandlung
// erfindet, die mit dem Leitfaden der Firma nichts zu tun hat.

// Stichworte je Kategorie: Menschen schreiben "zu teuer", nicht "Preis".
const KATEGORIE_WORTE = {
  preis: ["teuer", "preis", "kosten", "kostet", "budget", "geld", "billiger", "günstiger", "ausgelastet", "voll", "rabatt"],
  skepsis: ["haken", "vertrauen", "seriös", "skeptisch", "misstrau", "erfahrung", "schlecht", "betrug", "funktioniert", "referenz"],
  vorhanden: ["schon", "bereits", "haben", "agentur", "anbieter", "dienstleister", "zufrieden", "vertrag", "partner"],
  zeit: ["zeit", "später", "melden", "unterlagen", "schicken", "mail", "moment", "gerade", "stress", "nächstes", "jahr", "monat"],
  entscheidung: ["überlegen", "nachdenken", "chef", "partner", "entscheid", "abstimmen", "rücksprache", "frau", "mann", "gesellschafter"],
};

const STOPPWORTE = new Set(("der die das und oder aber ich du er sie es wir ihr sie mir mich dir dich uns ein eine einen einem " +
  "nicht kein keine ist sind war hat habe haben hab mal nur noch sehr so wie was wer wo dann denn auch mit von zu " +
  "für auf aus bei im in am an den dem des ja nein kunde kundin sagt sagte meint meinte immer gerade heute").split(" "));

function worte(text) {
  return String(text || "").toLowerCase()
    .replace(/[„“"'.,;:!?()«»–—-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPPWORTE.has(w));
}

/**
 * Die passendsten Einwände zu einem Satz — höchstens n, und nur, wo
 * wirklich etwas übereinstimmt.
 */
export function passendeEinwaende(liste = [], text = "", n = 3) {
  const eingabe = worte(text);
  if (!eingabe.length) return [];
  const bewertet = liste.map((e) => {
    const eigene = new Set(worte(`${e.q_pro} ${e.q_ent || ""} ${e.tip || ""}`));
    let punkte = 0;
    eingabe.forEach((w) => {
      // Auch Wortanfänge zählen: "teuer" trifft "teurer" nicht, "teu" schon.
      if (eigene.has(w)) punkte += 3;
      else if ([...eigene].some((x) => x.length > 4 && w.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))) punkte += 2;
      if ((KATEGORIE_WORTE[e.cat] || []).some((k) => w.startsWith(k) || k.startsWith(w))) punkte += 1;
    });
    // Eigene Einwände der Organisation gewinnen bei Gleichstand.
    return { e, punkte: punkte + (e.eigen && punkte ? 0.5 : 0) };
  });
  return bewertet.filter((b) => b.punkte >= 2).sort((a, b) => b.punkte - a.punkte).slice(0, n).map((b) => b.e);
}

/** Klingt die Nachricht nach einem Einwand, bei dem jemand Hilfe will? */
export function klingtNachEinwand(text) {
  const t = String(text || "").toLowerCase();
  return /\beinwand|\beinwände/.test(t)
    || /\b(kunde|kundin|interessent\w*|er|sie|der chef|die chefin)\s+(sagt|sagte|meint|meinte|kommt immer mit|blockt)\b/.test(t)
    || /\bwas (sag|antwort)\w* ich,? wenn\b/.test(t);
}

/** Alle Einwände für eine Organisation: die eigenen zuerst, dann die Standards. */
export async function ladeEinwaende(admin, orgId) {
  let eigene = [];
  if (orgId) {
    const { data } = await admin.from("custom_objections").select("cat, q_pro, a_pro, q_ent, a_ent, tip").eq("organization_id", orgId);
    eigene = (data || []).map((e) => ({ ...e, eigen: true }));
  }
  return [...eigene, ...DEFAULT_OBJECTIONS];
}

const ohneZeichen = (t) => String(t || "").replace(/^[„“"]+|[„“"]+$/g, "").trim();

/** Die gefundenen Einträge als Stoff für die KI. */
export function einwandZeilen(treffer = []) {
  return treffer.map((e, i) => [
    `Einwand ${i + 1}${e.eigen ? " (eigene Vorlage der Firma)" : ""}: ${ohneZeichen(e.q_pro)}`,
    `Antwort laut Leitfaden: ${e.a_pro}`,
    e.tip ? `Tipp: ${e.tip}` : null,
  ].filter(Boolean).join("\n"));
}

export function einwandAnweisung({ name = "", organisation = "" } = {}) {
  return [
    `Du bist der Vertriebsbuddy der HB Sales Academy und hilfst ${name || "einem Vertriebler"}${organisation ? ` von ${organisation}` : ""} bei einem Einwand, auf Deutsch und per Du.`,
    "Du bekommst die Beschreibung der Situation und die passenden Einwandbehandlungen aus dem Leitfaden der Firma.",
    "Regeln:",
    "- Nimm die Antwort aus dem Leitfaden als Grundlage. Erfinde keine eigene Methode und keine Fakten über das Produkt.",
    "- Passe sie an die geschilderte Situation an und gib einen Satz, den man am Telefon wörtlich sagen kann (in der Sie-Form an den Kunden).",
    "- Danach in einem Satz, worauf es dabei ankommt.",
    "- Passt keiner der Einträge, sag das offen und gib einen kurzen, allgemeinen Rat: erst verstehen, dann antworten, dann den nächsten Schritt vorschlagen.",
    "- Höchstens 120 Wörter. Keine Überschriften, kein Markdown.",
  ].join("\n");
}

/** Die Antwort ohne KI: der beste Eintrag, so wie er im Leitfaden steht. */
export function einwandOhneKI(treffer = []) {
  const e = treffer[0];
  if (!e) {
    return "Dazu habe ich im Leitfaden nichts gefunden. Grundregel: erst nachfragen, was genau dahintersteckt, dann darauf antworten und den nächsten Schritt vorschlagen. Im Einwand-Trainer der Academy kannst du üben.";
  }
  return [
    `🗣 „${ohneZeichen(e.q_pro)}“`,
    "",
    `So antwortest du: ${e.a_pro}`,
    e.tip ? `\n💡 ${e.tip}` : null,
  ].filter((z) => z !== null).join("\n");
}
