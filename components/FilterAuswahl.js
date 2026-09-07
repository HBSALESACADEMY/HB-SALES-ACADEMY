import { useEffect, useRef, useState } from "react";

// Ein Klappmenü für die Auswahl EINES Werts.
//
// Das Gegenstück zu MehrfachAuswahl. Vorher standen Zeiträume und Status als
// Knopfreihen nebeneinander — bei drei Möglichkeiten geht das, bei sechs
// füllen sie eine Zeile und man sucht die gewählte zwischen den anderen.
//
// Bewusst kein <select>: das trägt in jedem Browser ein anderes Aussehen und
// lässt sich nicht in die Gestaltung der Academy einfügen. Hier ist es
// derselbe Knopf wie überall, nur mit einer Liste darunter.
export default function FilterAuswahl({ optionen = [], wert, onChange, etikett = null, breite = "w-56" }) {
  const [offen, setOffen] = useState(false);
  const huelle = useRef(null);

  useEffect(() => {
    if (!offen) return;
    const beiKlick = (e) => { if (huelle.current && !huelle.current.contains(e.target)) setOffen(false); };
    const beiTaste = (e) => { if (e.key === "Escape") setOffen(false); };
    document.addEventListener("mousedown", beiKlick);
    document.addEventListener("keydown", beiTaste);
    return () => {
      document.removeEventListener("mousedown", beiKlick);
      document.removeEventListener("keydown", beiTaste);
    };
  }, [offen]);

  const gewaehlt = optionen.find((o) => o.wert === wert);

  return (
    <div className="relative" ref={huelle}>
      <button type="button" onClick={() => setOffen((v) => !v)} aria-expanded={offen}
        className="px-3 py-1.5 rounded-full text-xs font-semibold border border-line text-textMain hover:border-amber flex items-center gap-1.5">
        {etikett && <span className="text-textMuted font-normal">{etikett}</span>}
        {gewaehlt?.label || "Wählen"}
        {/* Die Anzahl gehört auf den Knopf, nicht nur in die Liste: sonst
            muss man aufklappen, um zu sehen, ob überhaupt etwas drin ist. */}
        {gewaehlt?.anzahl !== undefined && <span className="text-textMuted font-normal">({gewaehlt.anzahl})</span>}
        <span className={`transition-transform ${offen ? "rotate-90" : ""}`}>›</span>
      </button>

      {offen && (
        <div className={`absolute z-30 mt-1 ${breite} max-w-[80vw] rounded-xl border border-line bg-surface shadow-lg p-1.5`}>
          {optionen.map((o) => (
            <button key={String(o.wert)} type="button"
              onClick={() => { onChange(o.wert); setOffen(false); }}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 ${o.wert === wert ? "text-textMain font-semibold bg-surfaceRaised" : "text-textMuted hover:text-textMain"}`}>
              <span className="flex-1">{o.label}</span>
              {o.anzahl !== undefined && <span className="text-textMuted">{o.anzahl}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
