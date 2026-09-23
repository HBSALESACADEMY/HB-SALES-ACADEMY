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
  // Ob zuletzt offen oder zu war. Gemessen wird nur beim WECHSEL.
  const warOffen = useRef(offen);

  useEffect(() => {
    const el = inhalt.current;
    if (!el) return undefined;
    const wechsel = warOffen.current !== offen;
    warOffen.current = offen;

    const wenigerBewegung = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (wenigerBewegung) { setHoehe(offen ? "auto" : 0); return undefined; }

    if (offen) {
      // Schon offen und der Inhalt hat sich nur geändert: nichts tun.
      //
      // Hier steckte ein Zucken, das wie ein Fehler aussah — und in einer
      // Endlosschleife endete. Der Effekt hing an "children", und die sind
      // bei jedem Rendern ein neues Element: messen → Höhe setzen → neu
      // rendern → messen. Im Call Tracker lief das sichtbar, sobald sich
      // eine Zahl in der offenen Liste ändert: die Höhe sprang im
      // Viertelsekundentakt zwischen Pixelwert und "auto", der Inhalt
      // wurde dabei abwechselnd abgeschnitten und freigegeben.
      //
      // Offen ist die Höhe ohnehin "auto" — wächst der Inhalt, wächst der
      // Bereich von selbst. Gemessen werden muss nur der Weg von zu nach
      // offen, weil sich von "auto" aus nicht animieren lässt.
      if (!wechsel) return undefined;
      setHoehe(el.scrollHeight);
      // Nach der Bewegung auf "auto": sonst bliebe die Höhe eingefroren.
      const t = setTimeout(() => setHoehe("auto"), 260);
      return () => clearTimeout(t);
    }
    if (!wechsel && hoehe === 0) return undefined;
    // Von "auto" aus lässt sich nicht animieren — erst die gemessene Höhe
    // setzen, dann im nächsten Bild auf 0.
    setHoehe(el.scrollHeight);
    const rahmen = requestAnimationFrame(() => setHoehe(0));
    return () => cancelAnimationFrame(rahmen);
    // "hoehe" steht bewusst NICHT in der Liste: Sie wird hier gesetzt, und
    // ein Lauf wegen der eigenen Änderung wäre genau die Schleife von oben.
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
