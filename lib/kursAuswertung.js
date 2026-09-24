// Die ausführliche Kursauswertung — für die Person selbst und für die Leitung.
//
// Bisher stand da eine Prozentzahl: "Ø MC-Ergebnis 78 %". Daraus folgt keine
// Handlung. Die Fragen, die wirklich gestellt werden, sind andere:
//
//   Vertriebsperson: Woran hakt es bei MIR? Werde ich besser? Was mache ich
//   als Nächstes?
//   Leitung: Welches Modul fällt dem TEAM schwer? Wer steckt fest? Ist die
//   Prüfung zu schwer oder war die Lektion zu dünn?
//
// Die Daten dafür liegen längst in quiz_results und exam_results: JEDER
// Versuch mit Zeitstempel, und getrennt nach Multiple Choice und offenen
// Fragen. Genutzt wurde davon fast nichts.
//
// Die wichtigste Trennung hier ist die zwischen Multiple Choice und offener
// Antwort. Sie klingt technisch, ist aber der Unterschied zwischen zwei ganz
// verschiedenen Problemen: Wer im Multiple Choice die richtige Antwort
// ERKENNT, aber sie selbst nicht FORMULIEREN kann, hat kein Wissensproblem —
// der muss sprechen üben, nicht nachlesen. Und umgekehrt.
//
// Reine Logik, ohne Datenbank: Jede dieser Rechnungen lässt sich prüfen,
// ohne einen Kurs zu absolvieren.

import { COURSES } from "./curriculum.js";

function prozent(erreicht, moeglich) {
  return moeglich > 0 ? Math.round((erreicht / moeglich) * 100) : null;
}

/** Punkte eines Versuchs, Multiple Choice und offene Fragen zusammen. */
function punkteVon(versuch) {
  return {
    erreicht: (versuch.mc_score || 0) + (versuch.open_score || 0),
    moeglich: (versuch.mc_total || 0) + (versuch.open_total || 0),
  };
}

const TAG = 86400000;

function tageZwischen(vonIso, bisIso) {
  const von = new Date(vonIso).getTime();
  const bis = new Date(bisIso).getTime();
  if (Number.isNaN(von) || Number.isNaN(bis)) return null;
  return Math.floor((bis - von) / TAG);
}

/** Tagesschlüssel eines Zeitstempels ("2026-09-24") — für "an wie vielen Tagen". */
function tagVon(iso) {
  return typeof iso === "string" ? iso.slice(0, 10) : null;
}

/**
 * Nur der jüngste Versuch je Modul.
 *
 * Wer ein Quiz wiederholt, soll am zuletzt Gekonnten gemessen werden und
 * nicht am ersten Anlauf. Ohne diese Reduktion zählt jeder Versuch als
 * eigenes Modul — genau dieser Fehler stand auf dem Startbildschirm: Drei
 * Wiederholungen eines guten Moduls zogen den eigenen Schnitt nach unten,
 * weil die schwachen Anläufe mitgerechnet wurden.
 *
 * Sortiert wird hier selbst, statt sich auf die Reihenfolge aus der
 * Datenbank zu verlassen: Wer die Abfrage ohne "order" schreibt, bekommt
 * eine beliebige Reihenfolge — und dann gewinnt ein zufälliger Versuch.
 */
export function letzteVersuche(quiz = []) {
  const jeModul = new Map();
  [...quiz]
    .filter((q) => q && q.module_id)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
    .forEach((q) => { jeModul.set(`${q.course_id || ""}|${q.module_id}`, q); });
  return [...jeModul.values()];
}

/**
 * Je Modul: wie oft versucht, wie es ausging, und ob es besser wurde.
 *
 * Die Verbesserung ist der Kern: Ein Modul beim zweiten Anlauf von 55 auf
 * 90 zu bringen, ist eine andere Leistung als 90 im ersten Versuch — und
 * beide verdienen eine andere Reaktion.
 */
export function modulVerlauf(quiz = [], kurse = COURSES) {
  const titelVon = new Map();
  kurse.forEach((k) => (k.modules || []).forEach((m) => {
    titelVon.set(`${k.id}|${m.id}`, { modul: m.title || m.id, kurs: k.title || k.id });
  }));

  const jeModul = new Map();
  [...quiz]
    .filter((q) => q && q.module_id)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
    .forEach((q) => {
      const schluessel = `${q.course_id || ""}|${q.module_id}`;
      if (!jeModul.has(schluessel)) jeModul.set(schluessel, []);
      jeModul.get(schluessel).push(q);
    });

  return [...jeModul.entries()].map(([schluessel, versuche]) => {
    const erster = versuche[0];
    const letzter = versuche[versuche.length - 1];
    const e = punkteVon(erster);
    const l = punkteVon(letzter);
    const erstesErgebnis = prozent(e.erreicht, e.moeglich);
    const letztesErgebnis = prozent(l.erreicht, l.moeglich);
    const namen = titelVon.get(schluessel) || {};
    return {
      courseId: letzter.course_id || null,
      moduleId: letzter.module_id,
      // Der Titel aus dem Lehrplan, ersatzweise die Kennung: Eigene Kurse
      // einer Organisation stehen nicht in curriculum.js, und "modul-3" ist
      // immer noch besser als eine leere Zeile.
      titel: namen.modul || letzter.module_id,
      kurs: namen.kurs || letzter.course_id || null,
      versuche: versuche.length,
      erstesErgebnis,
      letztesErgebnis,
      verbesserung: erstesErgebnis !== null && letztesErgebnis !== null && versuche.length > 1
        ? letztesErgebnis - erstesErgebnis
        : null,
      mcQuote: prozent(letzter.mc_score || 0, letzter.mc_total || 0),
      offenQuote: prozent(letzter.open_score || 0, letzter.open_total || 0),
      zuletzt: letzter.created_at || null,
      erstmals: erster.created_at || null,
    };
  }).sort((a, b) => String(b.zuletzt || "").localeCompare(String(a.zuletzt || "")));
}

/**
 * Wissen oder Formulierung — woran es liegt.
 *
 * Gerechnet auf den jüngsten Versuch je Modul, sonst verzerren
 * Wiederholungen das Bild.
 */
export const ABSTAND_DEUTLICH = 12;

export function wissenGegenFormulierung(quiz = []) {
  const letzte = letzteVersuche(quiz);
  const mc = letzte.reduce((s, q) => ({
    erreicht: s.erreicht + (q.mc_score || 0), moeglich: s.moeglich + (q.mc_total || 0),
  }), { erreicht: 0, moeglich: 0 });
  const offen = letzte.reduce((s, q) => ({
    erreicht: s.erreicht + (q.open_score || 0), moeglich: s.moeglich + (q.open_total || 0),
  }), { erreicht: 0, moeglich: 0 });

  const mcQuote = prozent(mc.erreicht, mc.moeglich);
  const offenQuote = prozent(offen.erreicht, offen.moeglich);
  if (mcQuote === null || offenQuote === null) {
    return { mcQuote, offenQuote, abstand: null, deutung: null, rat: null };
  }

  const abstand = mcQuote - offenQuote;
  if (abstand >= ABSTAND_DEUTLICH) {
    return {
      mcQuote, offenQuote, abstand,
      deutung: "Du erkennst die richtige Antwort, aber selbst formulieren fällt schwerer.",
      rat: "Das übt sich nicht durch Lesen. Nimm ein Rollenspiel oder sprich die Antwort laut aus, bevor du sie eintippst.",
    };
  }
  if (abstand <= -ABSTAND_DEUTLICH) {
    return {
      mcQuote, offenQuote, abstand,
      deutung: "Du formulierst frei besser als du die Feinheiten triffst.",
      rat: "Die Punkte liegen in den Details der Lektionen — die Multiple-Choice-Fragen prüfen genau die.",
    };
  }
  return {
    mcQuote, offenQuote, abstand,
    deutung: "Wissen und Formulierung liegen gleich auf.",
    rat: null,
  };
}

/**
 * Die Module, an denen es hakt.
 *
 * Bewusst keine Bestenliste: Was gut lief, braucht keine Handlung. Und
 * bewusst mit der Zahl der Versuche — ein Modul, das beim dritten Anlauf
 * bei 65 steht, ist ein anderer Fall als eines, das beim ersten 65 erreicht
 * hat.
 */
export const SCHWACH_UNTER = 70;

export function schwachstellen(verlauf = [], grenze = SCHWACH_UNTER, hoechstens = 5) {
  return verlauf
    .filter((m) => m.letztesErgebnis !== null && m.letztesErgebnis < grenze)
    .sort((a, b) => a.letztesErgebnis - b.letztesErgebnis)
    .slice(0, hoechstens);
}

/**
 * Wie stetig gelernt wird.
 *
 * "An wie vielen Tagen" statt "wie viele Module": Zwölf Module an einem
 * Nachmittag sind durchgeklickt, zwölf über sechs Wochen sind gelernt.
 */
export function lernTempo(quiz = [], jetzt = new Date()) {
  const mitDatum = quiz.filter((q) => q?.created_at);
  if (!mitDatum.length) {
    return { aktiveTage: 0, erstesAm: null, letztesAm: null, tageSeitLetztem: null, spanne: null, proWoche: null };
  }
  const tage = new Set(mitDatum.map((q) => tagVon(q.created_at)).filter(Boolean));
  const sortiert = [...mitDatum].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const erstesAm = sortiert[0].created_at;
  const letztesAm = sortiert[sortiert.length - 1].created_at;
  const spanne = tageZwischen(erstesAm, letztesAm);
  const module = letzteVersuche(quiz).length;
  return {
    aktiveTage: tage.size,
    erstesAm,
    letztesAm,
    tageSeitLetztem: tageZwischen(letztesAm, jetzt.toISOString()),
    spanne,
    // Erst ab einer Woche Spanne: Bei drei Tagen Verlauf wäre "14 Module pro
    // Woche" eine Hochrechnung aus einem Nachmittag.
    proWoche: spanne !== null && spanne >= 7 ? Math.round((module / (spanne / 7)) * 10) / 10 : null,
  };
}

/**
 * Je Kurs die Prüfungslage: Versuche, bestanden, bestes Ergebnis.
 *
 * Eine bestandene Prüfung bleibt bestanden, auch wenn danach ein
 * Übungsversuch schlechter ausfiel.
 */
export function pruefungsBild(pruefungen = [], kurse = COURSES) {
  const jeKurs = new Map();
  pruefungen.filter((p) => p?.course_id).forEach((p) => {
    if (!jeKurs.has(p.course_id)) jeKurs.set(p.course_id, []);
    jeKurs.get(p.course_id).push(p);
  });

  return kurse.map((kurs) => {
    const versuche = (jeKurs.get(kurs.id) || [])
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    if (!versuche.length) {
      return { courseId: kurs.id, titel: kurs.title || kurs.id, versuche: 0, bestanden: false, bestes: null, letztes: null, bestandenAm: null, versucheBisBestanden: null };
    }
    const quoten = versuche.map((p) => prozent(p.score, p.total)).filter((q) => q !== null);
    const ersteBestandene = versuche.findIndex((p) => p.passed);
    return {
      courseId: kurs.id,
      titel: kurs.title || kurs.id,
      versuche: versuche.length,
      bestanden: versuche.some((p) => p.passed),
      bestes: quoten.length ? Math.max(...quoten) : null,
      letztes: prozent(versuche[versuche.length - 1].score, versuche[versuche.length - 1].total),
      bestandenAm: ersteBestandene > -1 ? versuche[ersteBestandene].created_at : null,
      // Wie viele Anläufe es gebraucht hat. Nicht zum Vorhalten, sondern
      // weil eine Prüfung, die alle erst im dritten Versuch schaffen, ein
      // Problem der Prüfung sein kann.
      versucheBisBestanden: ersteBestandene > -1 ? ersteBestandene + 1 : null,
    };
  });
}

/**
 * Das nächste sinnvolle Modul.
 *
 * Erst das Angefangene beenden, dann Schwaches wiederholen, dann Neues:
 * Eine Empfehlung, die immer "mach weiter" sagt, hilft niemandem.
 */
export function naechsterSchritt({ quiz = [], pruefungen = [], kurse = COURSES } = {}) {
  const gemacht = new Set(letzteVersuche(quiz).map((q) => `${q.course_id || ""}|${q.module_id}`));
  const verlauf = modulVerlauf(quiz, kurse);
  const schwach = schwachstellen(verlauf, SCHWACH_UNTER, 1)[0];

  for (const kurs of kurse) {
    const module = kurs.modules || [];
    const offen = module.filter((m) => !gemacht.has(`${kurs.id}|${m.id}`));
    const angefangen = module.length > offen.length && offen.length > 0;
    if (angefangen) {
      return {
        art: "weiter", courseId: kurs.id, moduleId: offen[0].id,
        titel: offen[0].title || offen[0].id, kurs: kurs.title || kurs.id,
        grund: `Noch ${offen.length} ${offen.length === 1 ? "Modul" : "Module"} bis zur Prüfung.`,
      };
    }
  }

  // Alles durch, aber ein Modul sitzt nicht: Wiederholen bringt mehr als
  // ein neuer Kurs.
  if (schwach) {
    return {
      art: "wiederholen", courseId: schwach.courseId, moduleId: schwach.moduleId,
      titel: schwach.titel, kurs: schwach.kurs,
      grund: `Zuletzt ${schwach.letztesErgebnis} % — das Modul lohnt einen zweiten Durchgang.`,
    };
  }

  // Ein Kurs, in dem die Module stehen, aber die Prüfung fehlt.
  const bild = pruefungsBild(pruefungen, kurse);
  for (const kurs of kurse) {
    const module = kurs.modules || [];
    const alleDa = module.length > 0 && module.every((m) => gemacht.has(`${kurs.id}|${m.id}`));
    const pruefung = bild.find((b) => b.courseId === kurs.id);
    if (alleDa && pruefung && !pruefung.bestanden) {
      return {
        art: "pruefung", courseId: kurs.id, moduleId: null,
        titel: `Prüfung ${kurs.title || kurs.id}`, kurs: kurs.title || kurs.id,
        grund: "Alle Module stehen — die Prüfung bringt das Zertifikat.",
      };
    }
  }

  const naechsterKurs = kurse.find((k) => (k.modules || []).some((m) => !gemacht.has(`${k.id}|${m.id}`)));
  if (naechsterKurs) {
    const modul = (naechsterKurs.modules || []).find((m) => !gemacht.has(`${naechsterKurs.id}|${m.id}`));
    return {
      art: "neu", courseId: naechsterKurs.id, moduleId: modul.id,
      titel: modul.title || modul.id, kurs: naechsterKurs.title || naechsterKurs.id,
      grund: "Neuer Kurs.",
    };
  }
  return null;
}
