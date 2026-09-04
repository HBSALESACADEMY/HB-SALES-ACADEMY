// Wie weit jemand mit den Kursen ist — und wie gut.
//
// Zwei Zahlen, die gern verwechselt werden: WIE VIEL jemand geschafft hat
// (Fortschritt) und WIE GUT er dabei war (Ergebnis). Ein Vertriebler mit
// zwei perfekt bestandenen Modulen steht anders da als einer mit zwölf
// mittelmässigen — beide Zahlen gehören nebeneinander, sonst zieht man aus
// einer allein den falschen Schluss.
//
// Gerechnet wird in Prozent der erreichbaren Punkte, nicht in Punkten:
// Module sind unterschiedlich lang, und 8 von 10 ist etwas anderes als
// 8 von 20.

import { COURSES } from "./curriculum.js";

/** Anzahl aller Module über alle Kurse — die Bezugsgrösse für "wie weit". */
export function moduleGesamt(kurse = COURSES) {
  return kurse.reduce((s, k) => s + (k.modules?.length || 0), 0);
}

function prozent(erreicht, moeglich) {
  return moeglich > 0 ? Math.round((erreicht / moeglich) * 100) : null;
}

/**
 * Der Stand einer Person.
 *
 * @param {Array} quiz       jüngster Versuch je Modul
 * @param {Array} pruefungen bestes Ergebnis je Kurs
 */
export function kursStand(quiz = [], pruefungen = [], kurse = COURSES) {
  const erreichbar = moduleGesamt(kurse);

  const punkte = quiz.reduce((s, q) => s + (q.mc_score || 0) + (q.open_score || 0), 0);
  const moeglich = quiz.reduce((s, q) => s + (q.mc_total || 0) + (q.open_total || 0), 0);

  const bestanden = pruefungen.filter((p) => p.passed);
  const zuletzt = [...quiz, ...pruefungen]
    .map((e) => e.created_at)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  return {
    module: quiz.length,
    moduleGesamt: erreichbar,
    fortschritt: prozent(Math.min(quiz.length, erreichbar), erreichbar),
    // Der Notenschnitt über alle absolvierten Module. Ohne ein einziges
    // Modul gibt es keinen Schnitt — und nicht etwa null Prozent.
    schnitt: prozent(punkte, moeglich),
    pruefungenBestanden: bestanden.length,
    pruefungenVersucht: pruefungen.length,
    zuletzt,
  };
}

/** Je Kurs: welche Module gemacht wurden und wie sie ausfielen. */
export function kursDetails(quiz = [], pruefungen = [], kurse = COURSES) {
  return kurse.map((kurs) => {
    const module = (kurs.modules || []).map((m) => {
      const treffer = quiz.find((q) => q.course_id === kurs.id && q.module_id === m.id);
      if (!treffer) return { id: m.id, titel: m.title || m.id, gemacht: false, ergebnis: null };
      const erreicht = (treffer.mc_score || 0) + (treffer.open_score || 0);
      const moeglich = (treffer.mc_total || 0) + (treffer.open_total || 0);
      return {
        id: m.id,
        titel: m.title || m.id,
        gemacht: true,
        ergebnis: prozent(erreicht, moeglich),
        am: treffer.created_at,
      };
    });
    const pruefung = pruefungen.find((p) => p.course_id === kurs.id) || null;
    return {
      id: kurs.id,
      titel: kurs.title || kurs.id,
      module,
      gemacht: module.filter((m) => m.gemacht).length,
      gesamt: module.length,
      pruefung: pruefung
        ? { bestanden: pruefung.passed, ergebnis: prozent(pruefung.score, pruefung.total), am: pruefung.created_at }
        : null,
    };
  });
}
