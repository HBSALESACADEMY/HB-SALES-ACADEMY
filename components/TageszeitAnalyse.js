import { stundenRaster, besteStunde, schlechtesteStunde, spitzeJeGrund, stundenText, MINDESTENS_JE_STUNDE } from "../lib/tageszeit";
import { grundFarbe, feldFarbe } from "../lib/diagrammFarben";

// Welcher Einwand zu welcher Uhrzeit — und wann es klappt.
//
// Ein Raster statt eines Diagramms: gefragt ist nicht "wie viel insgesamt",
// sondern "wann genau". Jede Zeile ist eine Stunde, die Balken darin sind
// die Einwände. Die Terminquote steht rechts daneben, damit man beides in
// einer Zeile liest.
//
// Dieselbe Darstellung in den Statistiken und in der Auswertung — eine
// Kennzahl, die zwei Ansichten unterschiedlich zeichnen, wird zweimal
// erklärt und einmal falsch verstanden.
export default function TageszeitAnalyse({ ereignisse = [], gruende = [], titel = "Einwände nach Uhrzeit", hinweis = null }) {
  const raster = stundenRaster(ereignisse, gruende);
  const beste = besteStunde(raster);
  const schlechteste = schlechtesteStunde(raster);
  const spitzen = spitzeJeGrund(raster, gruende).filter((s) => s.gesamt > 0);
  const groesste = Math.max(1, ...raster.map((z) => z.gesamt));

  return (
    <div className="card mb-4">
      <div className="font-semibold text-textMain text-sm mb-1">{titel}</div>
      <p className="text-xs text-textMuted mb-3">
        {hinweis || "Jede Zeile eine Stunde in deutscher Zeit. Farben wie überall: der Einwand behält seine Farbe."}
      </p>

      {raster.length === 0 ? (
        <p className="text-textMuted text-xs">
          Für diesen Zeitraum liegen noch keine Anrufe mit Uhrzeit vor. Erfasst wird ab dem Tag, an dem diese
          Auswertung eingebaut wurde — rückwirkend gab es die Uhrzeit nicht.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {raster.map((z) => (
              <div key={z.stunde} className="flex items-center gap-2">
                <span className="text-[11px] text-textMuted w-[68px] flex-shrink-0 font-mono">{stundenText(z.stunde)}</span>
                <div className="flex-1 h-4 rounded bg-surfaceRaised overflow-hidden flex"
                  style={{ width: `${Math.max(6, Math.round((z.gesamt / groesste) * 100))}%` }}
                  title={`${z.negativ} Absagen, ${z.termin} Termine`}>
                  {z.termin > 0 && (
                    <div style={{ width: `${(z.termin / z.gesamt) * 100}%`, background: feldFarbe("termin") }} />
                  )}
                  {z.verteilung.filter((g) => g.wert > 0).map((g) => (
                    <div key={g.key} style={{ width: `${(g.wert / z.gesamt) * 100}%`, background: grundFarbe(gruende, g.key) }} />
                  ))}
                </div>
                <span className="text-[11px] text-textMuted w-[92px] flex-shrink-0 text-right">
                  {z.termin} Termine{z.erfolgsquote !== null ? ` · ${z.erfolgsquote} %` : ""}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
            <span className="flex items-center gap-1.5 text-[11px] text-textMuted">
              <span className="w-2 h-2 rounded-full" style={{ background: feldFarbe("termin") }} /> Termin
            </span>
            {gruende.map((g) => (
              <span key={g.key} className="flex items-center gap-1.5 text-[11px] text-textMuted">
                <span className="w-2 h-2 rounded-full" style={{ background: grundFarbe(gruende, g.key) }} /> {g.label}
              </span>
            ))}
          </div>

          {(beste || schlechteste) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              {beste && (
                <div className="rounded-xl border border-line px-3 py-2.5">
                  <div className="text-sm font-display font-semibold" style={{ color: feldFarbe("termin") }}>
                    {stundenText(beste.stunde)}
                  </div>
                  <div className="text-[11px] text-textMain">Beste Stunde · {beste.erfolgsquote} % Termine</div>
                  <div className="text-[10px] text-textMuted">{beste.gesamt} entschiedene Gespräche</div>
                </div>
              )}
              {schlechteste && schlechteste.stunde !== beste?.stunde && (
                <div className="rounded-xl border border-line px-3 py-2.5">
                  <div className="text-sm font-display font-semibold" style={{ color: feldFarbe("negativ") }}>
                    {stundenText(schlechteste.stunde)}
                  </div>
                  <div className="text-[11px] text-textMain">Schwächste Stunde · {schlechteste.erfolgsquote} % Termine</div>
                  <div className="text-[10px] text-textMuted">{schlechteste.gesamt} entschiedene Gespräche</div>
                </div>
              )}
            </div>
          )}

          {spitzen.some((s) => s.stunde !== null) && (
            <div className="mt-4">
              <div className="text-xs text-textMain font-semibold mb-2">Wann welcher Einwand kommt</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-textMuted text-left">
                      <th className="font-normal pb-2 pr-3">Einwand</th>
                      <th className="font-normal pb-2 px-2 text-right">Gesamt</th>
                      <th className="font-normal pb-2 px-2 text-right">Spitze</th>
                      <th className="font-normal pb-2 px-2 text-right">Anteil dort</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spitzen.map((s) => (
                      <tr key={s.key} className="border-t border-line">
                        <td className="py-1.5 pr-3 text-textMain whitespace-nowrap">
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: grundFarbe(gruende, s.key) }} />
                          {s.label}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono">{s.gesamt}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{s.stunde === null ? "—" : stundenText(s.stunde)}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{s.anteil === null ? "—" : `${s.anteil} %`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-textMuted mt-2">
                Die Spitze ist der höchste ANTEIL innerhalb einer Stunde, nicht die grösste Zahl — sonst läge sie
                bei jedem Einwand dann, wenn am meisten telefoniert wird. Stunden mit weniger als
                {" "}{MINDESTENS_JE_STUNDE} entschiedenen Gesprächen bleiben bei „beste/schwächste Stunde“ aussen vor.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
