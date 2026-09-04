import { tempoAuswertung, dauerText, PAUSE_AB_MINUTEN } from "../lib/tempo";

// Wie zügig telefoniert wird — aus den Zeitpunkten der einzelnen Anwahlen
// (migration_136). Dieselbe Darstellung in der Auswertung und in den
// Statistiken: eine Kennzahl, die zwei Ansichten unterschiedlich zeichnen,
// wird zweimal erklärt und einmal falsch verstanden.
//
// Ohne "personen" bleibt die Tabelle weg — im Call Tracker schaut man auf
// sich selbst, und eine Tabelle mit einer Zeile ist keine Tabelle.
export default function TempoKarte({ ereignisse = [], personen = [] }) {
  const gesamt = tempoAuswertung(ereignisse).gesamt;

  // Je Person, damit sichtbar wird, wer dicht arbeitet und wer nicht —
  // getrennt von der Frage, wer viel schafft. Das sind zwei verschiedene
  // Gespräche: Tempo lässt sich üben, Arbeitszeit ist eine Absprache.
  const jePerson = personen.map((p) => ({
    id: p.id,
    name: p.name,
    tempo: tempoAuswertung(ereignisse.filter((e) => e.user_id === p.id)).gesamt,
  })).filter((p) => p.tempo.anrufe > 0)
    .sort((a, b) => (b.tempo.proStunde || 0) - (a.tempo.proStunde || 0));

  return (
    <div className="card mb-4">
      <div className="font-semibold text-textMain text-sm mb-1">Tempo am Telefon</div>
      <p className="text-xs text-textMuted mb-3">
        Aus den Zeitpunkten der einzelnen Anwahlen. Eine Lücke von mehr als {PAUSE_AB_MINUTEN} Minuten gilt als
        Pause und zählt nicht als Telefonzeit — sonst wäre ein Mittagessen Arbeit am Hörer.
      </p>

      {gesamt.anrufe === 0 ? (
        <p className="text-textMuted text-xs">
          Für diesen Zeitraum liegen noch keine Anwahlen mit Uhrzeit vor. Erfasst wird ab dem Tag, an dem diese
          Auswertung eingebaut wurde — rückwirkend gab es die Uhrzeit nicht.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            {[
              { label: "Anwahlen je Stunde", wert: gesamt.proStunde === null ? "—" : String(gesamt.proStunde).replace(".", ","), hinweis: "am Hörer, ohne Pausen" },
              { label: "Zeit am Hörer", wert: dauerText(gesamt.aktiveMinuten), hinweis: `über ${gesamt.tageMitDaten} Tage` },
              { label: "Abstand je Anruf", wert: gesamt.medianAbstand === null ? "—" : `${gesamt.medianAbstand} min`, hinweis: "mittlerer Wert, kein Schnitt" },
              { label: "Von … bis", wert: gesamt.fruehesterStart ? `${gesamt.fruehesterStart}–${gesamt.spaetestesEnde}` : "—", hinweis: "frühester Start, spätestes Ende" },
              // Kein Pausenknopf, sondern gerechnet: eine Lücke über der
              // Grenze IST eine Unterbrechung. Ein Knopf, den man vergisst,
              // verfälscht die Daten immer in die schmeichelhafte Richtung.
              { label: "Unterbrechungen", wert: gesamt.pausen === 0 ? "keine" : String(gesamt.pausen), hinweis: gesamt.pausenJeTag !== null && gesamt.pausen > 0 ? `${String(gesamt.pausenJeTag).replace(".", ",")} je Tag · ${dauerText(gesamt.pausenMinuten)} gesamt` : "Lücken über der Pausengrenze" },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-line px-3 py-2.5">
                <div className="text-lg font-display font-semibold text-textMain">{k.wert}</div>
                <div className="text-[11px] text-textMain leading-tight">{k.label}</div>
                <div className="text-[10px] text-textMuted leading-tight mt-0.5">{k.hinweis}</div>
              </div>
            ))}
          </div>

          {jePerson.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-textMuted text-left">
                    <th className="font-normal pb-2 pr-3">Person</th>
                    <th className="font-normal pb-2 px-2 text-right">Anwahlen</th>
                    <th className="font-normal pb-2 px-2 text-right">Je Stunde</th>
                    <th className="font-normal pb-2 px-2 text-right">Am Hörer</th>
                    <th className="font-normal pb-2 px-2 text-right">Abstand</th>
                    <th className="font-normal pb-2 px-2 text-right">Unterbrechungen</th>
                    <th className="font-normal pb-2 px-2 text-right">Von–bis</th>
                  </tr>
                </thead>
                <tbody>
                  {jePerson.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-1.5 pr-3 text-textMain whitespace-nowrap">{p.name}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{p.tempo.anrufe}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-textMain">
                        {p.tempo.proStunde === null ? "—" : String(p.tempo.proStunde).replace(".", ",")}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">{dauerText(p.tempo.aktiveMinuten)}</td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {p.tempo.medianAbstand === null ? "—" : `${p.tempo.medianAbstand} min`}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {p.tempo.pausen === 0 ? "—" : `${p.tempo.pausen} · ${dauerText(p.tempo.pausenMinuten)}`}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-textMuted">
                        {p.tempo.fruehesterStart ? `${p.tempo.fruehesterStart}–${p.tempo.spaetestesEnde}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-textMuted mt-3 leading-snug">
            „Unterbrechungen“ sind Lücken über {PAUSE_AB_MINUTEN} Minuten, automatisch erkannt — es gibt keinen
            Pausenknopf, den man drücken oder vergessen könnte. Vier Stunden am Stück sind etwas anderes als acht
            Stunden mit ständigem Abreissen, auch wenn die Anrufe je Stunde gleich sind.
            {" "}Zeigt, wie dicht gearbeitet wird — nicht, wie viel. Ein niedriges Tempo bei hoher Stückzahl heisst
            lange Gespräche, ein hohes Tempo bei wenig Stückzahl heisst kurze Arbeitszeit. Das sind zwei
            verschiedene Gespräche, und ein Strich steht überall dort, wo die Grundlage für eine Aussage fehlt.
          </p>
        </>
      )}
    </div>
  );
}
