import { WEGMARKEN, artVon, fortschritt, erreichteMarken, istVerloren } from "../lib/terminArt";

// Wie weit ein Interessent gekommen ist.
//
// Als Balken mit Wegmarken statt als blosse Zahl: "70 %" allein sagt
// niemandem, was als Nächstes kommt. Die Marken zeigen den Weg — und dass
// nach dem Abschluss noch etwas fehlt.
//
// Gespräche und Häkchen stehen in einer Kette, denn für den Vertriebler ist
// es eine: bestätigen, sprechen, bestätigen, abschliessen, liefern,
// nachfragen. Dass die einen Termine sind und die anderen Haken, ist eine
// Frage der Technik und nicht des Verkaufs.
export default function Fortschrittsbalken({ lead, kompakt = false }) {
  const wert = fortschritt(lead);
  const aktuell = artVon(lead);
  const erreicht = erreichteMarken(lead);
  const verloren = istVerloren(lead);

  // Bei einer Absage zeigt der Balken, WIE WEIT es kam, und sagt dazu, dass
  // es dort geendet hat. Vorher stand er auf null, während daneben zwei
  // geführte Gespräche als erreicht markiert waren — zwei Angaben, die
  // einander widersprachen.
  const farbe = verloren ? "#E5716A" : aktuell.farbe;   // coral aus tailwind.config.js

  return (
    <div className={kompakt ? "" : "mb-1"}>
      <div className="flex items-center gap-2 mb-1">
        <div className="flex-1 h-1.5 rounded-full bg-surfaceRaised overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${verloren ? "opacity-50" : ""}`}
            style={{ width: `${wert}%`, background: farbe }} />
        </div>
        <span className={`text-[11px] flex-shrink-0 font-mono ${verloren ? "text-coral" : "text-textMuted"}`}>
          {verloren ? `Absage bei ${wert} %` : `${wert} %`}
        </span>
      </div>

      {!kompakt && (
        <div className={`flex items-center justify-between gap-1 flex-wrap ${verloren ? "opacity-60" : ""}`}>
          {WEGMARKEN.map((m) => {
            // Erreicht ist, was tatsächlich passiert ist — nicht alles
            // unterhalb der Prozentzahl. Ein übersprungener Schritt bleibt
            // offen sichtbar, und genau das ist die Information: der Termin
            // wurde nie bestätigt.
            const getan = erreicht.has(m.key);
            return (
              <span key={m.key} title={m.hinweis}
                className={`text-[10px] whitespace-nowrap ${m.key === aktuell.key ? "text-textMain font-semibold" : getan ? "text-textMuted" : "text-textMuted opacity-40"}`}>
                <span style={getan && !verloren ? { color: m.farbe } : undefined}>{getan ? (m.haken ? "✓" : "●") : "○"}</span>
                {" "}{m.kurz}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
