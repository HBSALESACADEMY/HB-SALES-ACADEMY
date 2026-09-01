// Die Management-Auswertung: Kennzahlen, Engpässe, Impact, Empfehlungen.
//
// Bewusst ohne React und ohne Datenbank — reine Rechnungen auf fertig
// eingesammelten Zahlen. So lässt sich jede Aussage, die später vor der
// Vertriebsleitung steht, hier einzeln prüfen.
//
// Grundsatz durchgehend: fehlt die Grundlage, kommt `null` und nicht 0.
// Eine Terminquote von "0 %" für jemanden, der gar nicht telefoniert hat,
// wäre eine Aussage über etwas, das nicht stattgefunden hat — und in einer
// Führungsauswertung ist das kein Schönheitsfehler, sondern eine falsche
// Grundlage für eine Entscheidung über einen Menschen.

import { berechneQuoten } from "./quoten.js";

/** Zähler mehrerer Tageszeilen aufsummieren. */
export function summiere(zeilen = []) {
  const summe = {};
  zeilen.forEach((z) => {
    Object.entries(z.counts || {}).forEach(([k, v]) => { summe[k] = (summe[k] || 0) + (Number(v) || 0); });
  });
  return summe;
}

/** Ablehnungsgründe mehrerer Tageszeilen aufsummieren. */
export function summiereGruende(zeilen = []) {
  const summe = {};
  zeilen.forEach((z) => {
    Object.entries(z.reasons || {}).forEach(([k, v]) => { summe[k] = (summe[k] || 0) + (Number(v) || 0); });
  });
  return summe;
}

// Der Weg vom Anruf zum Termin, Stufe für Stufe. "beiEntscheidung" ist
// abgeleitet (direkt erreicht + durchgestellt) und keine eigene Buchung.
export const TRICHTER_STUFEN = [
  { key: "anwahlen", label: "Anwahlen" },
  { key: "erreicht", label: "Erstgespräche (erreicht)" },
  { key: "beiEntscheidung", label: "Qualifiziert (Entscheider am Telefon)" },
  { key: "termin", label: "Termine" },
];

/**
 * Der Trichter mit dem Übergang von Stufe zu Stufe.
 * `uebergang` ist der Anteil, der von der VORIGEN Stufe hier ankommt.
 */
export function trichter(counts = {}) {
  const werte = {
    anwahlen: counts.anwahlen || 0,
    erreicht: counts.erreicht || 0,
    beiEntscheidung: (counts.entscheider || 0) + (counts.weitergeleitet || 0),
    termin: counts.termin || 0,
  };
  return TRICHTER_STUFEN.map((stufe, i) => {
    const vorher = i === 0 ? null : werte[TRICHTER_STUFEN[i - 1].key];
    return {
      ...stufe,
      wert: werte[stufe.key],
      uebergang: vorher ? Math.round((werte[stufe.key] / vorher) * 100) : null,
      verlust: vorher === null ? null : Math.max(0, vorher - werte[stufe.key]),
    };
  });
}

/**
 * Wo im Trichter am meisten verlorengeht — gemessen am Übergang, nicht an
 * der absoluten Zahl. Absolut fällt immer die erste Stufe am stärksten ab;
 * die Frage ist, welcher Schritt schlechter läuft als er sollte.
 */
export function engpass(stufen = []) {
  const mitUebergang = stufen.filter((s) => s.uebergang !== null && s.verlust > 0);
  if (!mitUebergang.length) return null;
  return mitUebergang.reduce((a, b) => (b.uebergang < a.uebergang ? b : a));
}

/**
 * Benchmark über mehrere Gruppen: der gewichtete Gesamtwert, nicht der
 * Mittelwert der Quoten. Ein Team mit zehn Anrufen darf den Vergleichswert
 * nicht genauso stark bewegen wie eines mit tausend.
 */
export function benchmark(gruppen = []) {
  const gesamt = {};
  gruppen.forEach((g) => {
    Object.entries(g.counts || {}).forEach(([k, v]) => { gesamt[k] = (gesamt[k] || 0) + (Number(v) || 0); });
  });
  return { counts: gesamt, quoten: berechneQuoten(gesamt) };
}

/**
 * Impact-Analyse: bringt Training messbar Termine?
 *
 * Verglichen werden die aktivste und die am wenigsten aktive Hälfte der
 * Trainierenden. Wer im Zeitraum gar nicht telefoniert hat, bleibt aussen
 * vor — sonst misst man Abwesenheit statt Wirkung.
 */
export function impactAnalyse(personen = []) {
  const brauchbar = personen.filter((p) => (p.counts?.anwahlen || 0) >= 20);
  if (brauchbar.length < 4) {
    return { belastbar: false, grund: "Zu wenige Personen mit mindestens 20 Anwahlen im Zeitraum.", anzahl: brauchbar.length };
  }
  const sortiert = [...brauchbar].sort((a, b) => (b.training || 0) - (a.training || 0));
  const haelfte = Math.floor(sortiert.length / 2);
  const gruppe = (liste) => {
    const counts = summiere(liste.map((p) => ({ counts: p.counts })));
    return {
      anzahl: liste.length,
      training: liste.reduce((s, p) => s + (p.training || 0), 0),
      counts,
      quoten: berechneQuoten(counts),
    };
  };
  const aktiv = gruppe(sortiert.slice(0, haelfte));
  const wenig = gruppe(sortiert.slice(-haelfte));
  const a = aktiv.quoten.terminJeGespraech;
  const w = wenig.quoten.terminJeGespraech;
  return {
    belastbar: true,
    aktiv,
    wenig,
    // Der Unterschied in Prozentpunkten — nicht in Prozent vom Prozent, das
    // liest sonst jede Person anders.
    unterschied: a !== null && w !== null ? a - w : null,
  };
}

// Schwellen der Handlungsempfehlungen. Als Werte an einer Stelle, damit
// sichtbar ist, wovon eine Empfehlung abhängt — und damit sie sich ändern
// lässt, ohne den Text zu suchen.
export const SCHWELLEN = {
  abstandProzent: 15,   // wie weit unter dem Benchmark, bevor es auffällt
  mindestAnwahlen: 50,  // darunter ist eine Quote Zufall
  dominanterGrund: 35,  // Anteil eines Ablehnungsgrunds in Prozent
  durchstellSchwach: 40, // Durchstell-Quote in Prozent
};

/**
 * Drei bis vier Empfehlungen, jede an eine Zahl gebunden.
 *
 * Sortiert nach Gewicht: was den meisten Umsatz kostet, steht oben. Ohne
 * Zahl keine Empfehlung — ein Ratschlag ohne Beleg ist in einer
 * Führungsauswertung schlimmer als gar keiner.
 */
export function empfehlungen({ teams = [], personen = [], gesamt = {}, gruende = [] } = {}) {
  const liste = [];
  const ref = berechneQuoten(gesamt);
  const stufen = trichter(gesamt);
  const eng = engpass(stufen);

  if (eng && eng.uebergang !== null) {
    liste.push({
      titel: `Engpass: ${eng.label}`,
      text: `Nur ${eng.uebergang} % kommen von der vorigen Stufe hier an — ${eng.verlust} Kontakte gehen an dieser Stelle verloren. Coaching gezielt auf diesen Schritt legen, nicht auf die Schlagzahl.`,
      gewicht: 100 - eng.uebergang,
    });
  }

  // Teams unter dem Benchmark — gemessen an der Terminquote je Gespräch,
  // weil die von der Schlagzahl unabhängig ist.
  teams.forEach((t) => {
    const q = berechneQuoten(t.counts || {});
    if ((t.counts?.anwahlen || 0) < SCHWELLEN.mindestAnwahlen) return;
    if (q.terminJeGespraech === null || ref.terminJeGespraech === null) return;
    const abstand = ref.terminJeGespraech - q.terminJeGespraech;
    if (abstand <= 0) return;
    const relativ = ref.terminJeGespraech > 0 ? (abstand / ref.terminJeGespraech) * 100 : 0;
    if (relativ < SCHWELLEN.abstandProzent) return;
    liste.push({
      titel: `Qualität statt Schlagzahl bei ${t.name}`,
      text: `${q.terminJeGespraech} % Termine je Gespräch gegen ${ref.terminJeGespraech} % im Schnitt, bei ${t.counts.anwahlen} Anwahlen. Der Rückstand liegt am Gespräch, nicht am Fleiss.`,
      gewicht: relativ,
    });
  });

  // Ein Ablehnungsgrund, der alles dominiert, ist ein Trainingsthema.
  const grundSumme = gruende.reduce((s, g) => s + (g.wert || 0), 0);
  const groesster = gruende.slice().sort((a, b) => (b.wert || 0) - (a.wert || 0))[0];
  if (groesster && grundSumme > 0) {
    const anteil = Math.round((groesster.wert / grundSumme) * 100);
    if (anteil >= SCHWELLEN.dominanterGrund) {
      liste.push({
        titel: `Einwandtraining: „${groesster.label}“`,
        text: `${anteil} % aller Absagen laufen über diesen einen Einwand (${groesster.wert} von ${grundSumme}). Ein Skript-Baustein dafür wirkt breiter als jede allgemeine Schulung.`,
        gewicht: anteil,
      });
    }
  }

  // Kommt man am Vorzimmer nicht vorbei, nützt mehr Schlagzahl nichts.
  if (ref.durchstellQuote !== null && ref.durchstellQuote < SCHWELLEN.durchstellSchwach && (gesamt.gatekeeper || 0) >= 30) {
    liste.push({
      titel: "Gatekeeper-Passage trainieren",
      text: `Nur ${ref.durchstellQuote} % der Vorzimmer-Gespräche werden durchgestellt (${gesamt.weitergeleitet || 0} von ${gesamt.gatekeeper}). Mehr Anrufe erhöhen hier nur den Aufwand, nicht die Termine.`,
      gewicht: SCHWELLEN.durchstellSchwach - ref.durchstellQuote + 20,
    });
  }

  // Wer deutlich unter dem Mittel der Schlagzahl liegt, ist ein anderes
  // Gespräch als wer schlecht abschliesst — deshalb getrennt.
  const mitAnwahlen = personen.filter((p) => (p.counts?.anwahlen || 0) > 0);
  if (mitAnwahlen.length >= 3) {
    const schnitt = mitAnwahlen.reduce((s, p) => s + p.counts.anwahlen, 0) / mitAnwahlen.length;
    const schwach = mitAnwahlen.filter((p) => p.counts.anwahlen < schnitt * 0.5);
    if (schwach.length) {
      liste.push({
        titel: "Schlagzahl anheben",
        text: `${schwach.map((p) => p.name).join(", ")} ${schwach.length === 1 ? "liegt" : "liegen"} unter der Hälfte des Schnitts von ${Math.round(schnitt)} Anwahlen. Hier geht es um Aktivität, nicht um Gesprächsqualität.`,
        gewicht: 40,
      });
    }
  }

  return liste.sort((a, b) => b.gewicht - a.gewicht).slice(0, 4);
}
