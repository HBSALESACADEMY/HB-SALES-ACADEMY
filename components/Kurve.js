import { memo, useCallback, useMemo, useRef } from "react";
import {
  punkteFuer, weicherPfad, flaechenPfad, punktBeiAnteil, tagKurz, achsenMarken, balkenRechtecke,
} from "../lib/kurve";

// Der Verlauf über die Zeit: eine Kurve, Marken zum Ablesen, und Reihen
// mit ganz anderer Größenordnung als Balken darunter.
//
// Von Hand gezeichnet (siehe lib/kurve.js) — fremde Skripte lassen die
// Sicherheitsregeln nicht zu.
//
// Vier Entscheidungen, die man der Zeichnung nicht ansieht:
//
//   1. Der Maßstab beginnt bei null, und links stehen drei Marken mit
//      Zahlen. Ohne sie ist eine Kurve eine Form, aus der niemand einen
//      Wert ablesen kann.
//   2. Eine Reihe mit eigener Größenordnung — drei Termine neben siebzig
//      Anwahlen — bekommt `art: "balken"` und ihre eigene Achse rechts.
//      Auf dem gemeinsamen Maßstab war sie eine Linie am Boden.
//   3. Die Kurve ist nur leicht gerundet. Zwischen zwei Tagen gibt es
//      keine Messwerte; ein weicher Bogen dort behauptet einen Verlauf,
//      den niemand gemessen hat.
//   4. Beim Abfahren werden Hilfslinie, Punkte und Werte DIREKT am Bild
//      geändert, nicht über den Zustand. Ein Zeiger meldet bis zu 120
//      Bewegungen pro Sekunde — jede davon als Neuzeichnung ist das
//      Ruckeln, das man spürt.
const BREITE = 600;

function KurveInhalt({
  reihen = [], hoehe = 96, leerText = "Noch keine Zahlen im Zeitraum.", erklaerung = null, achse = true,
}) {
  const bildRef = useRef(null);
  // Alles, was beim Abfahren angefasst wird — ohne den Umweg über React.
  const linieRef = useRef(null);
  const punktRefs = useRef([]);
  const wertRefs = useRef([]);
  const tagRef = useRef(null);
  const aktivRef = useRef(null);

  const mitWerten = useMemo(() => reihen.filter((r) => (r.werte || []).length >= 2), [reihen]);
  const etwasDa = mitWerten.some((r) => r.werte.some((p) => (p.wert || 0) > 0));

  // Die Geometrie entsteht einmal je Datenstand. Beim Abfahren ändert sich
  // nur der Punkt unter dem Zeiger.
  const bild = useMemo(() => {
    if (!mitWerten.length) return null;
    const kurven = mitWerten.filter((r) => r.art !== "balken");
    const balkenReihen = mitWerten.filter((r) => r.art === "balken");

    // Ein Maßstab für alle KURVEN — sonst wäre ihr Vergleich gelogen.
    const hoechster = Math.max(1, ...kurven.flatMap((r) => r.werte.map((p) => p.wert || 0)));
    const gezeichnet = kurven.map((r) => {
      const { punkte } = punkteFuer(r.werte.map((p) => p.wert || 0), BREITE, hoehe);
      const eigenerHoechster = Math.max(1, ...r.werte.map((p) => p.wert || 0));
      const faktor = eigenerHoechster / hoechster;
      const skaliert = punkte.map((pt) => ({ ...pt, y: hoehe - (hoehe - pt.y) * faktor }));
      return { ...r, punkte: skaliert, linie: weicherPfad(skaliert), flaeche: flaechenPfad(skaliert, hoehe) };
    });

    const balken = balkenReihen.map((r) => ({ ...r, ...balkenRechtecke(r.werte, BREITE, hoehe) }));
    const tage = mitWerten[0].werte;
    return {
      gezeichnet,
      balken,
      hoechster,
      tage,
      anzahl: tage.length,
      marken: achsenMarken(hoechster, hoehe),
      // Wo die Hilfslinie stehen darf: an den Kurvenpunkten, sonst in der
      // Mitte der Balkenfelder.
      stellen: gezeichnet[0]?.punkte.map((p) => p.x)
        || tage.map((_, i) => (BREITE / tage.length) * i + BREITE / tage.length / 2),
    };
  }, [mitWerten, hoehe]);

  /**
   * Die Anzeige an einer Stelle setzen — direkt am Bild.
   *
   * Kein setState: Der Zustand würde React bei jeder Bewegung durch die
   * ganze Kurve schicken, obwohl sich drei Attribute ändern.
   */
  const zeige = useCallback((i) => {
    if (!bild) return;
    aktivRef.current = i;
    const sichtbar = i !== null && i >= 0;
    const x = sichtbar ? bild.stellen[i] : 0;

    if (linieRef.current) {
      linieRef.current.style.display = sichtbar ? "" : "none";
      if (sichtbar) {
        linieRef.current.setAttribute("x1", x);
        linieRef.current.setAttribute("x2", x);
      }
    }
    bild.gezeichnet.forEach((r, nr) => {
      const kreis = punktRefs.current[nr];
      if (!kreis) return;
      const punkt = sichtbar ? r.punkte[i] : null;
      kreis.style.display = punkt ? "" : "none";
      if (punkt) {
        kreis.setAttribute("cx", punkt.x);
        kreis.setAttribute("cy", punkt.y);
      }
    });
    [...bild.gezeichnet, ...bild.balken].forEach((r, nr) => {
      const feld = wertRefs.current[nr];
      if (!feld) return;
      feld.textContent = sichtbar ? String(r.werte[i]?.wert ?? 0) : "";
    });
    if (tagRef.current) {
      tagRef.current.textContent = sichtbar && bild.tage[i]?.tag
        ? tagKurz(bild.tage[i].tag)
        : `Höchstwert ${bild.hoechster}`;
    }
  }, [bild]);

  const beiBewegung = useCallback((e) => {
    if (!bild) return;
    const kasten = e.currentTarget.getBoundingClientRect();
    if (!kasten.width) return;
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - kasten.left;
    const anteil = x / kasten.width;
    // Eine Zeichnung je Bild genügt, und nur bei echtem Wechsel.
    if (bildRef.current) return;
    bildRef.current = requestAnimationFrame(() => {
      bildRef.current = null;
      const naechster = punktBeiAnteil(bild.anzahl, anteil);
      if (naechster !== aktivRef.current) zeige(naechster);
    });
  }, [bild, zeige]);

  const verlassen = useCallback(() => {
    if (bildRef.current) {
      cancelAnimationFrame(bildRef.current);
      bildRef.current = null;
    }
    zeige(null);
  }, [zeige]);

  const beiTaste = useCallback((e) => {
    if (!bild) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const start = aktivRef.current === null ? bild.anzahl - 1 : aktivRef.current;
    zeige(Math.min(bild.anzahl - 1, Math.max(0, start + (e.key === "ArrowRight" ? 1 : -1))));
  }, [bild, zeige]);

  if (!bild || !etwasDa) {
    return (
      <>
        <p className="text-textMuted text-xs">{leerText}</p>
        {erklaerung && <p className="text-[11px] text-textMuted mt-2 leading-snug">{erklaerung}</p>}
      </>
    );
  }

  const alleReihen = [...bild.gezeichnet, ...bild.balken];
  // Punkte je Tag nur bei wenigen Tagen: Bei sechzig Tagen wäre die Kurve
  // eine Perlenkette.
  const mitPunkten = bild.anzahl <= 14;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {alleReihen.map((r, nr) => (
            <span key={r.label} className="flex items-center gap-1.5 text-[11px] text-textMuted">
              {/* Die Form in der Legende ist die Form im Bild: Kreis für
                  die Kurve, Balken für die Balken. */}
              <span
                className={r.art === "balken" ? "w-1.5 h-3 rounded-sm" : "w-2.5 h-2.5 rounded-full"}
                style={{ background: r.farbe }}
              />
              {r.label}
              {/* Der Wert unter dem Zeiger steht an der Legende: dort sucht
                  man ihn, und er verdeckt die Kurve nicht. */}
              <strong ref={(el) => { wertRefs.current[nr] = el; }} className="text-textMain zahl" />
            </span>
          ))}
        </div>
        <span ref={tagRef} className="text-[11px] text-textMuted zahl">{`Höchstwert ${bild.hoechster}`}</span>
      </div>

      <div className="flex gap-2 mt-2">
        {/* Die Zahlen der Achse stehen NEBEN dem Bild, nicht darin: Das SVG
            wird in der Breite gestreckt, Schrift darin wäre verzerrt. */}
        <div className="relative flex-shrink-0 text-[10px] text-textMuted zahl" style={{ height: hoehe, width: 26 }}>
          {bild.marken.map((m) => (
            <span key={m.wert} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: m.y }}>
              {m.wert}
            </span>
          ))}
        </div>

        <div
          className="flex-1 min-w-0 cursor-crosshair outline-none"
          style={{ height: hoehe }}
          tabIndex={0}
          role="img"
          aria-label={`Verlauf: ${alleReihen.map((r) => `${r.label} bis ${Math.max(...r.werte.map((p) => p.wert || 0))}`).join(", ")}`}
          onMouseMove={beiBewegung}
          onMouseLeave={verlassen}
          onTouchStart={beiBewegung}
          onTouchMove={beiBewegung}
          onTouchEnd={verlassen}
          onKeyDown={beiTaste}
          onBlur={verlassen}
        >
          <svg viewBox={`0 0 ${BREITE} ${hoehe}`} className="w-full h-full" preserveAspectRatio="none">
            {/* Gitterlinien zu den Marken — waagerecht, deshalb verträgt
                sie die Streckung. */}
            {bild.marken.map((m) => (
              <line key={m.wert} x1="0" x2={BREITE} y1={m.y} y2={m.y}
                stroke="rgb(var(--org-line-rgb, var(--theme-line-rgb)))"
                strokeWidth="1" vectorEffect="non-scaling-stroke"
                opacity={m.wert === 0 ? ".9" : ".45"} />
            ))}

            {/* Balken zuerst: Sie stehen hinter der Kurve. */}
            {bild.balken.map((r) => (
              <g key={r.label}>
                {r.balken.map((b) => (b.hoehe > 0 ? (
                  <rect key={b.x} x={b.x} y={b.y} width={b.breite} height={b.hoehe} fill={r.farbe} opacity=".55" rx="1" />
                ) : null))}
              </g>
            ))}

            {bild.gezeichnet.map((r) => (
              <g key={r.label}>
                <path d={r.flaeche} fill={r.farbe} opacity=".12" />
                <path d={r.linie} fill="none" stroke={r.farbe} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {mitPunkten && r.punkte.map((p) => (
                  <circle key={p.x} cx={p.x} cy={p.y} r="2.5" fill={r.farbe} opacity=".85" />
                ))}
                {/* Der letzte Punkt ist der, der zählt: "wo stehen wir jetzt". */}
                <circle cx={r.punkte[r.punkte.length - 1].x} cy={r.punkte[r.punkte.length - 1].y} r="4" fill={r.farbe} />
              </g>
            ))}

            {/* Hilfslinie und Punkte fürs Abfahren — versteckt, bis der
                Zeiger kommt, danach direkt am Bild bewegt. */}
            <line ref={linieRef} x1="0" x2="0" y1="0" y2={hoehe} style={{ display: "none" }}
              stroke="rgb(var(--org-text-muted-rgb, var(--theme-text-muted-rgb)))"
              strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity=".8" />
            {bild.gezeichnet.map((r, nr) => (
              <circle key={r.label} ref={(el) => { punktRefs.current[nr] = el; }}
                cx="0" cy="0" r="4.5" style={{ display: "none" }}
                fill="rgb(var(--org-surface-raised-rgb, var(--theme-surface-raised-rgb)))"
                stroke={r.farbe} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        </div>

        {/* Die eigene Achse der Balken: nur ihr Höchstwert, mehr braucht
            eine Nebenreihe nicht. */}
        {bild.balken.length > 0 && (
          <div className="relative flex-shrink-0 text-[10px] zahl" style={{ height: hoehe, width: 20 }}>
            <span className="absolute left-0 bottom-0 leading-none" style={{ color: bild.balken[0].farbe }}>
              {bild.balken[0].hoechster}
            </span>
          </div>
        )}
      </div>

      {achse && bild.tage.length > 1 && (
        <div className="flex justify-between text-[10px] text-textMuted mt-1 pl-7">
          <span>{tagText(bild.tage[0].tag)}</span>
          <span>{tagText(bild.tage[Math.floor(bild.tage.length / 2)].tag)}</span>
          <span>{tagText(bild.tage[bild.tage.length - 1].tag)}</span>
        </div>
      )}
      {erklaerung && <p className="text-[11px] text-textMuted mt-2 leading-snug">{erklaerung}</p>}
    </div>
  );
}

function tagText(tag) {
  if (!tag) return "";
  const d = new Date(`${tag}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}

// memo: Die Seiten um die Kurve herum zeichnen sich aus vielen Gründen neu
// (Zähler, Aktualisierung, Eingaben). Solange dieselben Reihen hereinkommen,
// muss die Kurve dabei nicht mit.
const Kurve = memo(KurveInhalt);
export default Kurve;
