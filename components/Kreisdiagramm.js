import { useState } from "react";
import { kreisSegmente, prozent } from "../lib/kreisdiagramm";
import { paletteFarbe } from "../lib/diagrammFarben";

// Ein Kreisdiagramm sagt "wie verteilt sich das", nicht "wie viel ist es".
// Deshalb steht neben jedem Stück auch die Zahl selbst — sonst muss man
// Prozente zurückrechnen, um eine Frage zu beantworten.
// "erklaerung" ist Pflicht und steht klein unter dem Diagramm: WAS es
// aussagt, nicht was darin steht. Ein Ring mit vier Farben ist schnell
// gezeichnet und ebenso schnell falsch verstanden — und eine falsch
// verstandene Zahl ist schlimmer als keine. Ein Test hält fest, dass kein
// Diagramm ohne diese Zeile ausgeliefert wird.
export default function Kreisdiagramm({ daten, leerText = "Noch nichts erfasst.", groesse = 150, mitteText = "gesamt", erklaerung = null }) {
  const [aktiv, setAktiv] = useState(null);
  const { summe, segmente, vollkreis } = kreisSegmente(daten, 100);
  if (!summe) {
    return (
      <>
        <p className="text-textMuted text-xs">{leerText}</p>
        {erklaerung && <p className="text-[11px] text-textMuted mt-2 leading-snug">{erklaerung}</p>}
      </>
    );
  }

  // Trägt ein Wert seine eigene Farbe, gilt sie: dieselbe Sache soll in
  // jedem Diagramm gleich aussehen (siehe lib/diagrammFarben.js).
  const farbe = (s, i) => s.color || paletteFarbe(i);
  const legende = vollkreis ? [vollkreis] : segmente;

  // Das Stück unter dem Finger bzw. dem Mauszeiger wächst leicht heraus, die
  // übrigen treten zurück, und in der Mitte steht statt der Gesamtzahl der
  // Wert dieses Stücks. So beantwortet das Diagramm die Frage "und was ist
  // das da?" ohne Umweg über die Legende.
  const hervor = (i) => (aktiv === null ? 1 : aktiv === i ? 1 : 0.45);
  const gewaehlt = aktiv !== null ? legende[aktiv] : null;

  return (
    <>
      <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 200 200" width={groesse} height={groesse} role="img"
        aria-label={legende.map((s, i) => `${s.label}: ${s.value}`).join(", ")}
        className="flex-shrink-0">
        {vollkreis
          ? <circle cx="100" cy="100" r="100" fill={farbe(vollkreis, 0)} />
          : segmente.map((s, i) => (
            // Dünne Trennlinie in der Flächenfarbe: ohne sie verschwimmen
            // zwei benachbarte Stücke zu einem.
            <path key={s.label} className="diagramm-stueck" d={s.pfad} fill={farbe(s, i)}
              stroke="rgb(var(--org-surface-rgb, var(--theme-surface-rgb, 26 29 41)))" strokeWidth="2"
              onMouseEnter={() => setAktiv(i)}
              onMouseLeave={() => setAktiv(null)}
              onClick={() => setAktiv(aktiv === i ? null : i)}
              style={{
                opacity: hervor(i),
                transformOrigin: "100px 100px",
                transform: aktiv === i ? "scale(1.06)" : "scale(1)",
                transition: "transform .18s ease, opacity .18s ease",
                cursor: "pointer",
              }} />
          ))}
        {/* Loch in der Mitte: aus dem Kreis wird ein Ring, der sich in
            kleinen Grössen deutlich besser lesen lässt. */}
        <circle cx="100" cy="100" r="52" fill="rgb(var(--org-surface-rgb, var(--theme-surface-rgb, 26 29 41)))" />
        <text x="100" y="96" textAnchor="middle" className="fill-textMain" style={{ fontSize: 26, fontWeight: 600 }}>
          {gewaehlt ? gewaehlt.value : summe}
        </text>
        <text x="100" y="118" textAnchor="middle" className="fill-textMuted" style={{ fontSize: 14 }}>
          {gewaehlt ? prozent(gewaehlt.anteil) : mitteText}
        </text>
      </svg>
      <div className="flex flex-col gap-1 min-w-0">
        {legende.map((s, i) => (
          <div key={s.label}
            onMouseEnter={() => setAktiv(i)}
            onMouseLeave={() => setAktiv(null)}
            className="flex items-center gap-2 text-xs cursor-default"
            style={{ opacity: hervor(i), transition: "opacity .18s ease" }}>
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: farbe(s, i) }} />
            <span className="text-textMain truncate">{s.label}</span>
            <span className="text-textMuted flex-shrink-0">{s.value} · {prozent(s.anteil)}</span>
          </div>
        ))}
      </div>
      </div>
      {erklaerung && <p className="text-[11px] text-textMuted mt-3 leading-snug">{erklaerung}</p>}
    </>
  );
}
