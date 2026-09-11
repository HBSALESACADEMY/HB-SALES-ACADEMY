import { wochentagsRaster, wochentagsBefund, MINDESTENS_JE_TAG } from "../lib/wochentage";
import { feldFarbe } from "../lib/diagrammFarben";

// An welchen Wochentagen die Entscheider zu erreichen sind.
//
// Wer montags anruft und dreimal das Vorzimmer bekommt, während
// donnerstags jeder zweite Anruf beim Chef landet, telefoniert am falschen
// Tag. Einer Wochensumme sieht man das nicht an — dort stehen beide Tage
// im selben Topf.
//
// Ein Raster statt eines Diagramms, wie bei den Tageszeiten: gefragt ist
// nicht "wie viel insgesamt", sondern "an welchem Tag".
export default function WochentagAnalyse({ zeilen = [], titel = "Wochentage: wann ist die Entscheidung erreichbar?" }) {
  const raster = wochentagsRaster(zeilen);
  const befund = wochentagsBefund(raster);
  const groesste = Math.max(1, ...raster.map((z) => z.anwahlen));
  // Tage ohne einen einzigen Anruf verschweigen: eine leere Zeile "Sonntag"
  // in jeder Auswertung ist Ballast, und dass sonntags nicht telefoniert
  // wird, ist keine Erkenntnis.
  const sichtbar = raster.filter((z) => z.anwahlen > 0);

  if (!sichtbar.length) {
    return (
      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">{titel}</div>
        <p className="text-xs text-textMuted">In diesem Zeitraum wurde nicht telefoniert.</p>
      </div>
    );
  }

  return (
    <div className="card mb-4">
      <div className="font-semibold text-textMain text-sm mb-1">{titel}</div>
      <p className="text-[11px] text-textMuted mb-3">
        „Bei der Entscheidung“ heisst: direkt den Entscheider erreicht oder dorthin durchgestellt worden.
        Ein Wochentag mit weniger als {MINDESTENS_JE_TAG} Anwahlen bekommt keine Quote — eine Zahl, die auf
        drei Anrufen steht, ist keine Erkenntnis.
      </p>

      {befund && (
        <p className="text-xs text-textMain bg-surfaceRaised rounded-lg px-3 py-2 mb-3">
          {befund.text} Das sind {befund.abstand} Punkte Unterschied.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {sichtbar.map((z) => (
          <div key={z.index} className="flex items-center gap-2 text-xs">
            <span className="w-8 flex-shrink-0 text-textMuted font-mono">{z.kurz}</span>
            <div className="flex-1 h-4 rounded bg-surfaceRaised overflow-hidden flex">
              {/* Der Balken zeigt die Anwahlen, der gefüllte Teil davon,
                  wie viele bei der Entscheidung landeten. Zwei Balken
                  untereinander müsste man im Kopf ins Verhältnis setzen. */}
              <div className="h-full" title={`${z.anwahlen} Anwahlen`}
                style={{ width: `${(z.anwahlen / groesste) * 100}%`, background: "color-mix(in srgb, currentColor 12%, transparent)" }} />
              <div className="h-full -ml-[100%]" style={{ width: `${(z.beiEntscheidung / groesste) * 100}%`, background: feldFarbe("entscheider") }}
                title={`${z.beiEntscheidung} bei der Entscheidung`} />
            </div>
            <span className="w-16 text-right font-mono text-textMuted flex-shrink-0">{z.anwahlen} Anw.</span>
            <span className={`w-14 text-right font-mono flex-shrink-0 ${z.entscheiderQuote === null ? "text-textMuted" : "text-textMain"}`}>
              {z.entscheiderQuote === null ? "—" : `${z.entscheiderQuote} %`}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-textMuted mt-2">
        Rechts: Anteil der Anwahlen, die bei der Entscheidung landeten. Ein Strich heisst zu wenige Anrufe
        an diesem Wochentag.
      </p>
    </div>
  );
}
