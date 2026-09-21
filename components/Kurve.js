import { useState } from "react";
import { punkteFuer, weicherPfad, flaechenPfad, punktBeiAnteil, tagKurz } from "../lib/kurve";

// Der Verlauf als Kurve mit Fläche darunter — für Zahlen über die Zeit.
//
// Von Hand gezeichnet (siehe lib/kurve.js). Mehrere Reihen sind möglich,
// aber bewusst mit gemeinsamem Maßstab: Zwei Kurven mit je eigener Skala
// sehen aus wie ein Vergleich und sind keiner.
//
// Man kann die Kurve ABFAHREN: Unter dem Zeiger steht eine Hilfslinie, auf
// jeder Reihe ein Punkt, und darüber der Tag mit seinen Zahlen. Ohne das
// ist eine Kurve eine Form, aus der man keine einzige Zahl ablesen kann —
// und dann beantwortet sie die Frage "wie viele waren es am Dienstag?"
// eben nicht. Mit Tastatur geht es über die Pfeiltasten, auf dem Handy mit
// dem Finger.
//
// "erklaerung" steht klein darunter, wie beim Kreisdiagramm: Ein Diagramm
// ohne Aussage wird schnell falsch verstanden.
export default function Kurve({
  reihen = [], hoehe = 96, leerText = "Noch keine Zahlen im Zeitraum.", erklaerung = null, achse = true,
}) {
  const [aktiv, setAktiv] = useState(null);

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
  const anzahl = Math.max(...gezeichnet.map((r) => r.punkte.length));

  // Aus der Position im Kasten wird der Anteil der Breite — gerechnet wird
  // nicht in Pixeln, weil die Kurve in der Breite gestreckt wird.
  function beiBewegung(e) {
    const kasten = e.currentTarget.getBoundingClientRect();
    if (!kasten.width) return;
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - kasten.left;
    setAktiv(punktBeiAnteil(anzahl, x / kasten.width));
  }

  function beiTaste(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const start = aktiv === null ? anzahl - 1 : aktiv;
    setAktiv(Math.min(anzahl - 1, Math.max(0, start + (e.key === "ArrowRight" ? 1 : -1))));
  }

  const gewaehlt = aktiv === null ? null : aktiv;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {gezeichnet.map((r) => (
            <span key={r.label} className="flex items-center gap-1.5 text-[11px] text-textMuted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.farbe }} />
              {r.label}
              {/* Der Wert unter dem Zeiger steht an der Legende: dort sucht
                  man ihn, und er verdeckt die Kurve nicht. */}
              {gewaehlt !== null && (
                <strong className="text-textMain zahl">{r.werte[gewaehlt]?.wert ?? 0}</strong>
              )}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-textMuted zahl">
          {gewaehlt !== null && tage[gewaehlt]?.tag
            ? tagKurz(tage[gewaehlt].tag)
            : `Höchstwert ${hoechster}`}
        </span>
      </div>

      {/* Der Kasten nimmt die Bewegung auf, nicht das SVG: So gilt sie auch
          für die Fläche zwischen den Punkten. */}
      <div
        className="mt-2 cursor-crosshair outline-none"
        style={{ height: hoehe }}
        tabIndex={0}
        role="img"
        aria-label={`Verlauf: ${gezeichnet.map((r) => r.label).join(", ")}`}
        onMouseMove={beiBewegung}
        onMouseLeave={() => setAktiv(null)}
        onTouchStart={beiBewegung}
        onTouchMove={beiBewegung}
        onTouchEnd={() => setAktiv(null)}
        onKeyDown={beiTaste}
        onBlur={() => setAktiv(null)}
      >
        <svg viewBox={`0 0 ${BREITE} ${hoehe}`} className="w-full h-full" preserveAspectRatio="none">
          {gezeichnet.map((r) => (
            <g key={r.label}>
              <path d={flaechenPfad(r.punkte, hoehe)} fill={r.farbe} opacity=".14" />
              <path d={weicherPfad(r.punkte)} fill="none" stroke={r.farbe} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {/* Der letzte Punkt ist der, der zählt: "wo stehen wir jetzt". */}
              <circle cx={r.punkte[r.punkte.length - 1].x} cy={r.punkte[r.punkte.length - 1].y} r="3.5" fill={r.farbe} />
            </g>
          ))}

          {gewaehlt !== null && gezeichnet[0]?.punkte[gewaehlt] && (
            <g>
              <line
                x1={gezeichnet[0].punkte[gewaehlt].x} x2={gezeichnet[0].punkte[gewaehlt].x}
                y1="0" y2={hoehe}
                stroke="rgb(var(--org-text-muted-rgb, var(--theme-text-muted-rgb)))"
                strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity=".7"
              />
              {gezeichnet.map((r) => (r.punkte[gewaehlt] ? (
                <circle key={r.label} cx={r.punkte[gewaehlt].x} cy={r.punkte[gewaehlt].y} r="4"
                  fill="rgb(var(--org-surface-raised-rgb, var(--theme-surface-raised-rgb)))"
                  stroke={r.farbe} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              ) : null))}
            </g>
          )}
        </svg>
      </div>

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
