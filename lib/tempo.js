// Wie zügig telefoniert wird.
//
// Aus den Zeitpunkten der einzelnen Anwahlen (call_events, art "anwahl",
// migration_136). Tagessummen sagen nur, DASS es 120 waren — nicht, ob
// verteilt über acht Stunden oder gedrängt in zwei.
//
// Die eine Entscheidung, an der hier alles hängt: Ab wann ist eine Lücke
// eine PAUSE und keine Telefonzeit mehr? Ohne diese Grenze wäre "aktive
// Zeit" schlicht die Spanne vom ersten bis zum letzten Anruf, und ein
// Mittagessen zählte als Arbeit am Hörer. Zwanzig Minuten sind lang genug
// für ein ausführliches Gespräch mit Nachbereitung und kurz genug, dass
// eine echte Pause nicht mehr durchgeht.

import { DEUTSCHE_ZONE } from "./terminzeit.js";

export const PAUSE_AB_MINUTEN = 20;

// Darunter ist ein Tempo Zufall: drei Anrufe ergeben zwei Abstände, und
// einer davon kann alles sein.
export const MINDESTENS_ANRUFE = 5;

function berlinTeile(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: DEUTSCHE_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).reduce((acc, t) => ({ ...acc, [t.type]: t.value }), {});
  return {
    tag: `${teile.year}-${teile.month}-${teile.day}`,
    uhrzeit: `${teile.hour === "24" ? "00" : teile.hour}:${teile.minute}`,
    zeit: d.getTime(),
  };
}

function median(werte) {
  if (!werte.length) return null;
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 ? sortiert[mitte] : Math.round((sortiert[mitte - 1] + sortiert[mitte]) / 2);
}

/**
 * Das Tempo je Tag und in Summe.
 *
 * @param {Array} ereignisse Zeilen aus call_events (nur art "anwahl" zählt)
 */
export function tempoAuswertung(ereignisse = []) {
  const proTag = new Map();
  ereignisse
    .filter((e) => e.art === "anwahl")
    .map((e) => berlinTeile(e.erfasst_at))
    .filter(Boolean)
    .forEach((t) => {
      if (!proTag.has(t.tag)) proTag.set(t.tag, []);
      proTag.get(t.tag).push(t);
    });

  const tage = [...proTag.entries()].map(([tag, liste]) => {
    const sortiert = liste.sort((a, b) => a.zeit - b.zeit);
    const abstaende = [];
    for (let i = 1; i < sortiert.length; i++) {
      abstaende.push(Math.round((sortiert[i].zeit - sortiert[i - 1].zeit) / 60000));
    }
    // Nur was innerhalb der Pausengrenze liegt, zählt als Telefonzeit.
    const amHoerer = abstaende.filter((m) => m <= PAUSE_AB_MINUTEN);
    const aktiveMinuten = amHoerer.reduce((s, m) => s + m, 0);
    const pausen = abstaende.filter((m) => m > PAUSE_AB_MINUTEN);

    return {
      tag,
      anzahl: sortiert.length,
      ersterAnruf: sortiert[0].uhrzeit,
      letzterAnruf: sortiert[sortiert.length - 1].uhrzeit,
      aktiveMinuten,
      // Anrufe je Stunde AM HÖRER — nicht je Anwesenheitsstunde. Wer vier
      // Stunden da ist und zwei telefoniert, hat ein Tempo-Problem oder ein
      // Zeitproblem, und das sind zwei verschiedene Gespräche.
      proStunde: aktiveMinuten >= 15 ? Math.round((sortiert.length / (aktiveMinuten / 60)) * 10) / 10 : null,
      // Median statt Durchschnitt: ein Mittagessen zerlegt den Schnitt.
      medianAbstand: median(amHoerer),
      pausen: pausen.length,
      pausenMinuten: pausen.reduce((s, m) => s + m, 0),
      belastbar: sortiert.length >= MINDESTENS_ANRUFE,
    };
  }).sort((a, b) => a.tag.localeCompare(b.tag));

  const belastbare = tage.filter((t) => t.belastbar);
  const gesamtAnrufe = tage.reduce((s, t) => s + t.anzahl, 0);
  const gesamtAktiv = tage.reduce((s, t) => s + t.aktiveMinuten, 0);

  return {
    tage,
    gesamt: {
      anrufe: gesamtAnrufe,
      aktiveMinuten: gesamtAktiv,
      proStunde: gesamtAktiv >= 30 ? Math.round((gesamtAnrufe / (gesamtAktiv / 60)) * 10) / 10 : null,
      medianAbstand: median(belastbare.map((t) => t.medianAbstand).filter((m) => m !== null)),
      // Die Unterbrechungen: gibt dem Tempo den fehlenden Zusammenhang.
      // Vier Stunden am Stück sind etwas anderes als acht Stunden mit
      // ständigem Abreissen, auch wenn die Anrufe je Stunde gleich sind.
      pausen: tage.reduce((s, t) => s + t.pausen, 0),
      pausenMinuten: tage.reduce((s, t) => s + t.pausenMinuten, 0),
      // Je Tag mit Daten, sonst vergleicht man eine Woche mit einem Tag.
      pausenJeTag: belastbare.length
        ? Math.round((belastbare.reduce((s, t) => s + t.pausen, 0) / belastbare.length) * 10) / 10
        : null,
      // Der früheste Start und das späteste Ende über alle Tage: sagt mehr
      // als ein Mittelwert, der zwischen Frühaufstehern und Langschläfern
      // eine Uhrzeit erfindet, zu der niemand telefoniert.
      fruehesterStart: belastbare.length ? belastbare.map((t) => t.ersterAnruf).sort()[0] : null,
      spaetestesEnde: belastbare.length ? belastbare.map((t) => t.letzterAnruf).sort().slice(-1)[0] : null,
      tageMitDaten: belastbare.length,
    },
  };
}

/** Minuten als "1 h 45 min" — Stunden erst ab 60. */
export function dauerText(minuten) {
  if (minuten === null || minuten === undefined) return "—";
  if (minuten < 60) return `${Math.round(minuten)} min`;
  const stunden = Math.floor(minuten / 60);
  const rest = Math.round(minuten % 60);
  return rest ? `${stunden} h ${rest} min` : `${stunden} h`;
}
