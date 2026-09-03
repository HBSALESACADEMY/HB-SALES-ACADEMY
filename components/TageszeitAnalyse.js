import { useState } from "react";
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
  // Welche Stunde gerade unter dem Zeiger liegt — dieselbe Idee wie im
  // Kreisdiagramm: das Stück tritt hervor, der Rest tritt zurück, und
  // daneben stehen die genauen Zahlen. Klick statt Zeiger genügt auch,
  // sonst wäre die Auswertung auf dem Handy nicht lesbar.
  const [aktiv, setAktiv] = useState(null);
  // Und derselbe Griff für die Einwände: einen anfassen, und man sieht
  // sofort, in welchen Stunden er auftritt — die Frage "wann kommt DIESER
  // Einwand" lässt sich sonst nur aus fünf Balken zusammensuchen.
  const [aktiverGrund, setAktiverGrund] = useState(null);
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
              <div key={z.stunde}
                onMouseEnter={() => setAktiv(z.stunde)}
                onMouseLeave={() => setAktiv(null)}
                onClick={() => setAktiv(aktiv === z.stunde ? null : z.stunde)}
                className="flex items-center gap-2 cursor-pointer rounded"
                style={{
                  opacity: aktiv === null || aktiv === z.stunde ? 1 : 0.4,
                  // Bei gewähltem Einwand bleibt jede Stunde lesbar — dort
                  // treten die Balkenstücke zurück, nicht die ganze Zeile.
                  transform: aktiv === z.stunde ? "scale(1.015)" : "scale(1)",
                  transformOrigin: "left center",
                  transition: "opacity .18s ease, transform .18s ease",
                }}>
                <span className={`text-[11px] w-[68px] flex-shrink-0 font-mono ${aktiv === z.stunde ? "text-textMain font-semibold" : "text-textMuted"}`}>
                  {stundenText(z.stunde)}
                </span>
                <div className="flex-1 h-4 rounded bg-surfaceRaised overflow-hidden flex"
                  style={{ width: `${Math.max(6, Math.round((z.gesamt / groesste) * 100))}%` }}>
                  {/* Jedes Stück im Balken ist anfassbar — genau wie ein
                      Segment im Kreisdiagramm. Wer auf eine Farbe zeigt,
                      fragt nach dieser Farbe, und dann soll sie antworten:
                      das getroffene Stück bleibt kräftig und bekommt einen
                      hellen Rand, alle anderen treten zurück. */}
                  {z.termin > 0 && (
                    <div
                      title={`${z.termin} Termine in dieser Stunde`}
                      onMouseEnter={() => setAktiverGrund("__termin")}
                      onMouseLeave={() => setAktiverGrund(null)}
                      onClick={(ev) => { ev.stopPropagation(); setAktiverGrund(aktiverGrund === "__termin" ? null : "__termin"); }}
                      style={{
                        width: `${(z.termin / z.gesamt) * 100}%`,
                        background: feldFarbe("termin"),
                        opacity: aktiverGrund === null || aktiverGrund === "__termin" ? 1 : 0.15,
                        boxShadow: aktiverGrund === "__termin" ? "inset 0 0 0 1.5px rgba(255,255,255,.85)" : "none",
                        transition: "opacity .18s ease, box-shadow .18s ease",
                        cursor: "pointer",
                      }} />
                  )}
                  {z.verteilung.filter((g) => g.wert > 0).map((g) => (
                    <div key={g.key}
                      title={`${g.label}: ${g.wert} in dieser Stunde`}
                      onMouseEnter={() => setAktiverGrund(g.key)}
                      onMouseLeave={() => setAktiverGrund(null)}
                      onClick={(ev) => { ev.stopPropagation(); setAktiverGrund(aktiverGrund === g.key ? null : g.key); }}
                      style={{
                        width: `${(g.wert / z.gesamt) * 100}%`,
                        background: grundFarbe(gruende, g.key),
                        opacity: aktiverGrund === null || aktiverGrund === g.key ? 1 : 0.15,
                        boxShadow: aktiverGrund === g.key ? "inset 0 0 0 1.5px rgba(255,255,255,.85)" : "none",
                        transition: "opacity .18s ease, box-shadow .18s ease",
                        cursor: "pointer",
                      }} />
                  ))}
                </div>
                <span className="text-[11px] text-textMuted w-[92px] flex-shrink-0 text-right">
                  {z.termin} Termine{z.erfolgsquote !== null ? ` · ${z.erfolgsquote} %` : ""}
                </span>
              </div>
            ))}
          </div>

          {/* Die Zahlen der Stunde unter dem Zeiger. Fester Platz, damit
              die Seite beim Darüberfahren nicht springt. */}
          <div className="mt-3 min-h-[42px]">
            {(() => {
              // Ein gewählter Einwand hat Vorrang: dann ist die Frage nicht
              // "was war in dieser Stunde", sondern "wann kommt dieser
              // Einwand" — und darauf antwortet die Verteilung über den Tag.
              if (aktiverGrund === "__termin") {
                const proStunde = raster.filter((z) => z.termin > 0);
                const summe = proStunde.reduce((sum, z) => sum + z.termin, 0);
                return (
                  <div className="rounded-xl border border-line px-3 py-2">
                    <div className="text-xs text-textMain font-semibold mb-1">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: feldFarbe("termin") }} />
                      Termine: {summe}× am Tag
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {proStunde.map((z) => (
                        <span key={z.stunde} className="text-[11px] text-textMuted">
                          {stundenText(z.stunde)}: <span className="text-textMain">{z.termin}</span>
                          {z.erfolgsquote !== null ? ` (${z.erfolgsquote} %)` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              }

              if (aktiverGrund) {
                const label = gruende.find((g) => g.key === aktiverGrund)?.label || aktiverGrund;
                const proStunde = raster
                  .map((z) => ({ stunde: z.stunde, wert: z.gruende[aktiverGrund] || 0, negativ: z.negativ }))
                  .filter((z) => z.wert > 0);
                const summe = proStunde.reduce((sum, z) => sum + z.wert, 0);
                return (
                  <div className="rounded-xl border border-line px-3 py-2">
                    <div className="text-xs text-textMain font-semibold mb-1">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: grundFarbe(gruende, aktiverGrund) }} />
                      {label}: {summe}× am Tag
                    </div>
                    {proStunde.length === 0 ? (
                      <span className="text-[11px] text-textMuted">Dieser Einwand kam im Zeitraum nicht vor.</span>
                    ) : (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {proStunde.map((z) => (
                          <span key={z.stunde} className="text-[11px] text-textMuted">
                            {stundenText(z.stunde)}: <span className="text-textMain">{z.wert}</span>
                            {z.negativ > 0 ? ` (${Math.round((z.wert / z.negativ) * 100)} %)` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const z = raster.find((x) => x.stunde === aktiv);
              if (!z) {
                return (
                  <p className="text-[11px] text-textMuted">
                    Auf eine Stunde oder direkt auf ein farbiges Stück im Balken gehen — alles lässt sich auch antippen.
                  </p>
                );
              }
              return (
                <div className="rounded-xl border border-line px-3 py-2">
                  <div className="text-xs text-textMain font-semibold mb-1">
                    {stundenText(z.stunde)} · {z.termin} Termine, {z.negativ} Absagen
                    {z.erfolgsquote !== null ? ` · ${z.erfolgsquote} % Erfolg` : ""}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {/* Auch hier anfassbar: von "was war in dieser Stunde"
                        führt der Weg direkt weiter zu "wann kommt dieser
                        Einwand" — die zweite Frage stellt sich immer, sobald
                        man die erste beantwortet hat. */}
                    {z.verteilung.filter((g) => g.wert > 0).map((g) => (
                      <button key={g.key}
                        onMouseEnter={() => setAktiverGrund(g.key)}
                        onMouseLeave={() => setAktiverGrund(null)}
                        onClick={(ev) => { ev.stopPropagation(); setAktiverGrund(aktiverGrund === g.key ? null : g.key); }}
                        className="flex items-center gap-1.5 text-[11px] text-textMuted hover:text-textMain rounded px-1 -mx-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: grundFarbe(gruende, g.key) }} />
                        {g.label}: {g.wert}
                      </button>
                    ))}
                    {z.negativ === 0 && <span className="text-[11px] text-textMuted">Keine Absagen in dieser Stunde.</span>}
                  </div>
                </div>
              );
            })()}
          </div>

          <p className="text-[11px] text-textMuted mt-3 leading-snug">
            Zeigt, wann sich Anrufen lohnt und welche Absage zu welcher Tageszeit droht. Lange Zeilen heissen
            nur, dass zu dieser Stunde viel entschieden wurde — aussagekräftig ist der Grünanteil rechts.
          </p>

          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
            <button
              onMouseEnter={() => setAktiverGrund("__termin")}
              onMouseLeave={() => setAktiverGrund(null)}
              onClick={() => setAktiverGrund(aktiverGrund === "__termin" ? null : "__termin")}
              className={`flex items-center gap-1.5 text-[11px] rounded px-1 -mx-1 ${aktiverGrund === "__termin" ? "text-textMain font-semibold" : "text-textMuted"}`}
              style={{ opacity: aktiverGrund === null || aktiverGrund === "__termin" ? 1 : 0.4, transition: "opacity .18s ease" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: feldFarbe("termin") }} /> Termin
            </button>
            {gruende.map((g) => (
              <button key={g.key}
                onMouseEnter={() => setAktiverGrund(g.key)}
                onMouseLeave={() => setAktiverGrund(null)}
                onClick={() => setAktiverGrund(aktiverGrund === g.key ? null : g.key)}
                className={`flex items-center gap-1.5 text-[11px] rounded px-1 -mx-1 ${aktiverGrund === g.key ? "text-textMain font-semibold" : "text-textMuted"}`}
                style={{ opacity: aktiverGrund === null || aktiverGrund === g.key ? 1 : 0.4, transition: "opacity .18s ease" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: grundFarbe(gruende, g.key) }} /> {g.label}
              </button>
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
                      <tr key={s.key} className="border-t border-line cursor-pointer"
                        onMouseEnter={() => setAktiverGrund(s.key)}
                        onMouseLeave={() => setAktiverGrund(null)}
                        onClick={() => setAktiverGrund(aktiverGrund === s.key ? null : s.key)}
                        style={{
                          opacity: aktiverGrund === null || aktiverGrund === s.key ? 1 : 0.4,
                          transition: "opacity .18s ease",
                        }}>
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
