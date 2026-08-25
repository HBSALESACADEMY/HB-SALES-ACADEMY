import { useEffect, useRef, useState } from "react";

// Ein Bereich, der sich weich öffnet und schliesst.
//
// Warum eigens: Höhe lässt sich in CSS nicht von "auto" aus animieren — ein
// einfaches Ein-/Ausblenden springt deshalb. Hier wird die tatsächliche Höhe
// des Inhalts gemessen und als Zahl gesetzt; danach wieder auf "auto", damit
// der Bereich mitwächst, wenn sich der Inhalt später ändert.
//
// Wer im Betriebssystem "Bewegung reduzieren" eingestellt hat, bekommt keine
// Animation. Das ist keine Kür: Bewegung kann bei Betroffenen Übelkeit und
// Schwindel auslösen.
export default function Aufklapper({ offen, children }) {
  const inhalt = useRef(null);
  const [hoehe, setHoehe] = useState(offen ? "auto" : 0);

  useEffect(() => {
    const el = inhalt.current;
    if (!el) return undefined;

    const wenigerBewegung = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (wenigerBewegung) { setHoehe(offen ? "auto" : 0); return undefined; }

    if (offen) {
      setHoehe(el.scrollHeight);
      // Nach der Bewegung auf "auto": sonst bliebe die Höhe eingefroren.
      const t = setTimeout(() => setHoehe("auto"), 260);
      return () => clearTimeout(t);
    }
    // Von "auto" aus lässt sich nicht animieren — erst die gemessene Höhe
    // setzen, dann im nächsten Bild auf 0.
    setHoehe(el.scrollHeight);
    const rahmen = requestAnimationFrame(() => setHoehe(0));
    return () => cancelAnimationFrame(rahmen);
  }, [offen, children]);

  return (
    <div
      style={{
        height: hoehe === "auto" ? "auto" : `${hoehe}px`,
        overflow: hoehe === "auto" ? "visible" : "hidden",
        transition: "height .25s ease, opacity .25s ease",
        opacity: offen ? 1 : 0,
      }}
      aria-hidden={!offen}
    >
      <div ref={inhalt}>{children}</div>
    </div>
  );
}
