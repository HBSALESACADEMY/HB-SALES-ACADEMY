import { kreisSegmente, prozent } from "../lib/kreisdiagramm";

// Farben aus der Organisation, mit festen Rückfallwerten: ein Diagramm, das
// in einer Firma mit eigenem Farbschema plötzlich grau wäre, hilft niemandem.
// Erst die beiden Marken-Töne der Organisation, dann ein deutlich
// unterscheidbarer Reigen. Bewusst nicht drei Rot-Töne hintereinander wie
// vorher: nebeneinanderliegende Stücke, die sich nur in der Sättigung
// unterscheiden, kann man im Diagramm nicht auseinanderhalten. Kein Grau
// mehr — es sieht aus, als wäre der Wert deaktiviert.
const FARBEN = [
  "var(--org-accent, #CE3A5C)",   // Marke
  "var(--org-color-1, #4C5DC9)",  // Marke
  "#00C2A8",                       // Türkis
  "#F0B23E",                       // Bernstein
  "#9E8CF0",                       // Violett
  "#3FA7D6",                       // Himmelblau
  "#5FCF6B",                       // Grün
  "#F2795B",                       // Orange
  "#E0669B",                       // Pink
  "#C9A227",                       // Gold
];

// Ein Kreisdiagramm sagt "wie verteilt sich das", nicht "wie viel ist es".
// Deshalb steht neben jedem Stück auch die Zahl selbst — sonst muss man
// Prozente zurückrechnen, um eine Frage zu beantworten.
export default function Kreisdiagramm({ daten, leerText = "Noch nichts erfasst.", groesse = 150, mitteText = "gesamt" }) {
  const { summe, segmente, vollkreis } = kreisSegmente(daten, 100);
  if (!summe) return <p className="text-textMuted text-xs">{leerText}</p>;

  const farbe = (i) => FARBEN[i % FARBEN.length];
  const legende = vollkreis ? [vollkreis] : segmente;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 200 200" width={groesse} height={groesse} role="img"
        aria-label={legende.map((s, i) => `${s.label}: ${s.value}`).join(", ")}
        className="flex-shrink-0">
        {vollkreis
          ? <circle cx="100" cy="100" r="100" fill={farbe(0)} />
          : segmente.map((s, i) => (
            // Dünne Trennlinie in der Flächenfarbe: ohne sie verschwimmen
            // zwei benachbarte Stücke zu einem.
            <path key={s.label} d={s.pfad} fill={farbe(i)}
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
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: farbe(i) }} />
            <span className="text-textMain truncate">{s.label}</span>
            <span className="text-textMuted flex-shrink-0">{s.value} · {prozent(s.anteil)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
