import { kreisSegmente, prozent } from "../lib/kreisdiagramm";
import { paletteFarbe } from "../lib/diagrammFarben";

// Ein Kreisdiagramm sagt "wie verteilt sich das", nicht "wie viel ist es".
// Deshalb steht neben jedem Stück auch die Zahl selbst — sonst muss man
// Prozente zurückrechnen, um eine Frage zu beantworten.
export default function Kreisdiagramm({ daten, leerText = "Noch nichts erfasst.", groesse = 150, mitteText = "gesamt" }) {
  const { summe, segmente, vollkreis } = kreisSegmente(daten, 100);
  if (!summe) return <p className="text-textMuted text-xs">{leerText}</p>;

  // Trägt ein Wert seine eigene Farbe, gilt sie: dieselbe Sache soll in
  // jedem Diagramm gleich aussehen (siehe lib/diagrammFarben.js).
  const farbe = (s, i) => s.color || paletteFarbe(i);
  const legende = vollkreis ? [vollkreis] : segmente;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 200 200" width={groesse} height={groesse} role="img"
        aria-label={legende.map((s, i) => `${s.label}: ${s.value}`).join(", ")}
        className="flex-shrink-0">
        {vollkreis
          ? <circle cx="100" cy="100" r="100" fill={farbe(vollkreis, 0)} />
          : segmente.map((s, i) => (
            // Dünne Trennlinie in der Flächenfarbe: ohne sie verschwimmen
            // zwei benachbarte Stücke zu einem.
            <path key={s.label} d={s.pfad} fill={farbe(s, i)}
              stroke="rgb(var(--org-surface-rgb, var(--theme-surface-rgb, 26 29 41)))" strokeWidth="2" />
          ))}
        {/* Loch in der Mitte: aus dem Kreis wird ein Ring, der sich in
            kleinen Grössen deutlich besser lesen lässt. */}
        <circle cx="100" cy="100" r="52" fill="rgb(var(--org-surface-rgb, var(--theme-surface-rgb, 26 29 41)))" />
        <text x="100" y="96" textAnchor="middle" className="fill-textMain" style={{ fontSize: 26, fontWeight: 600 }}>{summe}</text>
        <text x="100" y="118" textAnchor="middle" className="fill-textMuted" style={{ fontSize: 14 }}>{mitteText}</text>
      </svg>
      <div className="flex flex-col gap-1 min-w-0">
        {legende.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: farbe(s, i) }} />
            <span className="text-textMain truncate">{s.label}</span>
            <span className="text-textMuted flex-shrink-0">{s.value} · {prozent(s.anteil)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
