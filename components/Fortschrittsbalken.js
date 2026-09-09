import { TERMIN_ARTEN, artVon, fortschritt } from "../lib/terminArt";

// Wie weit ein Interessent gekommen ist.
//
// Als Balken mit Wegmarken statt als blosse Zahl: "75 %" allein sagt
// niemandem, was als Nächstes kommt. Die Marken zeigen den Weg — und dass
// nach dem Abschluss noch etwas fehlt.
export default function Fortschrittsbalken({ lead, kompakt = false }) {
  const wert = fortschritt(lead);
  const aktuell = artVon(lead);

  return (
    <div className={kompakt ? "" : "mb-1"}>
      <div className="flex items-center gap-2 mb-1">
        <div className="flex-1 h-1.5 rounded-full bg-surfaceRaised overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${wert}%`, background: aktuell.farbe }} />
        </div>
        <span className="text-[11px] text-textMuted flex-shrink-0 font-mono">{wert} %</span>
      </div>

      {!kompakt && (
        <div className="flex items-center justify-between">
          {TERMIN_ARTEN.map((a) => {
            const erreicht = wert >= a.fortschritt;
            return (
              <span key={a.key} title={a.hinweis}
                className={`text-[10px] ${a.key === aktuell.key ? "text-textMain font-semibold" : erreicht ? "text-textMuted" : "text-textMuted opacity-50"}`}>
                {erreicht ? "●" : "○"} {a.kurz}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
