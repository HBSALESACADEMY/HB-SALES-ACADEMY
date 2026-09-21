import { punkteFuer, weicherPfad, flaechenPfad } from "../lib/kurve";

// Der Verlauf als Kurve mit Fläche darunter — für Zahlen über die Zeit.
//
// Von Hand gezeichnet (siehe lib/kurve.js). Mehrere Reihen sind möglich,
// aber bewusst mit gemeinsamem Maßstab: Zwei Kurven mit je eigener Skala
// sehen aus wie ein Vergleich und sind keiner.
//
// "erklaerung" steht klein darunter, wie beim Kreisdiagramm: Ein Diagramm
// ohne Aussage wird schnell falsch verstanden.
export default function Kurve({
  reihen = [], hoehe = 96, leerText = "Noch keine Zahlen im Zeitraum.", erklaerung = null, achse = true,
}) {
  const mitWerten = reihen.filter((r) => (r.werte || []).length >= 2);
  const etwasDa = mitWerten.some((r) => r.werte.some((p) => (p.wert || 0) > 0));
  if (!mitWerten.length || !etwasDa) {
    return (
      <>
        <p className="text-textMuted text-xs">{leerText}</p>
        {erklaerung && <p className="text-[11px] text-textMuted mt-2 leading-snug">{erklaerung}</p>}
      </>
    );
  }

  const BREITE = 600;
  // Ein Maßstab für alle Reihen, sonst lügt der Vergleich.
  const alleWerte = mitWerten.flatMap((r) => r.werte.map((p) => p.wert || 0));
  const hoechster = Math.max(1, ...alleWerte);
  const gezeichnet = mitWerten.map((r) => {
    const { punkte } = punkteFuer(r.werte.map((p) => p.wert || 0), BREITE, hoehe);
    // Alle Reihen auf denselben Maßstab bringen: punkteFuer skaliert je
    // Reihe auf ihr eigenes Maximum.
    const eigenerHoechster = Math.max(1, ...r.werte.map((p) => p.wert || 0));
    const faktor = eigenerHoechster / hoechster;
    const skaliert = punkte.map((pt) => ({ ...pt, y: hoehe - (hoehe - pt.y) * faktor }));
    return { ...r, punkte: skaliert };
  });
  const tage = mitWerten[0].werte;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {gezeichnet.map((r) => (
            <span key={r.label} className="flex items-center gap-1.5 text-[11px] text-textMuted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.farbe }} />
              {r.label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-textMuted zahl">Höchstwert {hoechster}</span>
      </div>

      <svg viewBox={`0 0 ${BREITE} ${hoehe}`} className="w-full mt-2" style={{ height: hoehe }} preserveAspectRatio="none" role="img"
        aria-label={`Verlauf: ${gezeichnet.map((r) => r.label).join(", ")}`}>
        {gezeichnet.map((r) => (
          <g key={r.label}>
            <path d={flaechenPfad(r.punkte, hoehe)} fill={r.farbe} opacity=".14" />
            <path d={weicherPfad(r.punkte)} fill="none" stroke={r.farbe} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {/* Der letzte Punkt ist der, der zählt: "wo stehen wir jetzt". */}
            <circle cx={r.punkte[r.punkte.length - 1].x} cy={r.punkte[r.punkte.length - 1].y} r="3.5" fill={r.farbe} />
          </g>
        ))}
      </svg>

      {achse && tage.length > 1 && (
        <div className="flex justify-between text-[10px] text-textMuted mt-1">
          <span>{tagText(tage[0].tag)}</span>
          <span>{tagText(tage[tage.length - 1].tag)}</span>
        </div>
      )}
      {erklaerung && <p className="text-[11px] text-textMuted mt-2 leading-snug">{erklaerung}</p>}
    </div>
  );
}

function tagText(tag) {
  if (!tag) return "";
  const d = new Date(`${tag}T12:00:00Z`);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}
