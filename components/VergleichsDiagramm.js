import { differenz } from "../lib/vergleich";

// Zwei Zeiträume nebeneinander, als Balkenpaare.
//
// Eine Zahl mit "+18 %" daneben liest man einzeln und vergisst sie. Zwei
// Balken übereinander beantworten dieselbe Frage ohne Rechnen: der obere
// ist jetzt, der untere war davor, und wie viel länger der eine ist, sieht
// man, ohne die Prozentzahl zu lesen.
//
// Von Hand gezeichnet, nicht mit einer Diagramm-Bibliothek: die
// Sicherheitsregeln dieser Anwendung lassen keine fremden Skripte zu
// (siehe die Prüfung in npm run pruefe).
export default function VergleichsDiagramm({
  felder = [], jetzt = {}, davor = {}, farbe = () => "#E0A458",
  titel = "Vergleich", name = "dem Zeitraum davor", hinweis = null,
}) {
  // Ein gemeinsamer Maßstab über ALLE Balken. Je Zeile zu skalieren wäre
  // bequemer und würde genau das zerstören, worum es geht: dass man die
  // Längen miteinander vergleichen kann.
  const groesste = Math.max(1, ...felder.flatMap((f) => [jetzt[f.key] || 0, davor[f.key] || 0]));
  const etwasDa = felder.some((f) => (jetzt[f.key] || 0) > 0 || (davor[f.key] || 0) > 0);

  if (!etwasDa) {
    return (
      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">{titel}</div>
        <p className="text-xs text-textMuted">In beiden Zeiträumen wurde nichts erfasst.</p>
      </div>
    );
  }

  return (
    <div className="card mb-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <span className="font-semibold text-textMain text-sm">{titel}</span>
        <span className="text-[11px] text-textMuted">gegenüber {name}</span>
      </div>
      {hinweis && <p className="text-[11px] text-textMuted mb-3">{hinweis}</p>}

      <div className="flex items-center gap-3 flex-wrap text-[11px] text-textMuted mb-3">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-textMain" /> Dieser Zeitraum
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm border border-line" /> Davor
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {felder.map((f) => {
          const d = differenz(jetzt[f.key] || 0, davor[f.key] || 0);
          // Bei manchen Kennzahlen ist mehr schlechter: mehr nicht
          // erreichte Anrufe und mehr negativ verlaufene Gespräche sind
          // kein Fortschritt.
          const gut = f.wenigerIstBesser ? d.delta < 0 : d.delta > 0;
          return (
            <div key={f.key}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs text-textMain flex-1 truncate">{f.label}</span>
                <span className="text-xs font-mono text-textMain">{d.wert}</span>
                <span className={`text-[11px] font-mono w-24 text-right ${d.richtung === "gleich" ? "text-textMuted" : gut ? "text-teal" : "text-coral"}`}>
                  {d.richtung === "gleich" ? "±0"
                    : d.davor === 0 ? "neu"
                    : `${d.delta > 0 ? "+" : "−"}${Math.abs(d.delta)}${d.prozent === null ? "" : ` · ${d.delta > 0 ? "+" : "−"}${Math.abs(d.prozent)} %`}`}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="h-3 rounded-sm" title={`Jetzt: ${d.wert}`}
                  style={{ width: `${Math.max(1, (d.wert / groesste) * 100)}%`, background: farbe(f.key) }} />
                {/* Der Vorzeitraum als Umriss statt als zweite Farbe: eine
                    zweite Vollfläche sieht aus wie eine zweite Kennzahl. */}
                <div className="h-3 rounded-sm border" title={`Davor: ${d.davor}`}
                  style={{
                    width: `${Math.max(1, (d.davor / groesste) * 100)}%`,
                    borderColor: farbe(f.key),
                    background: `color-mix(in srgb, ${farbe(f.key)} 12%, transparent)`,
                  }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
