import { useEffect, useRef, useState } from "react";

// Ein Klappmenü für die Auswahl mehrerer Einträge.
//
// Die Filterknöpfe standen bisher alle nebeneinander. Bei fünf Personen geht
// das; bei zwanzig füllen sie den halben Bildschirm, und die Zahlen, um die
// es eigentlich geht, rutschen nach unten aus dem Bild.
//
// Bewusst kein <select multiple>: das verlangt Strg oder Cmd beim Klicken,
// funktioniert auf dem Handy praktisch gar nicht, und niemand sieht ihm an,
// dass mehrere Einträge möglich sind. Ein Menü mit Häkchen erklärt sich
// selbst.
export default function MehrfachAuswahl({
  eintraege = [],
  ausgewaehlt = [],
  onChange,
  alleText = "Alle",
  platzhalter = "Suchen…",
  farbe = null,
}) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const huelle = useRef(null);

  // Klick daneben schliesst das Menü. Ohne das bleibt es offen und verdeckt
  // genau die Zahlen, für die man es geöffnet hat.
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

  const gewaehlt = new Set(ausgewaehlt);
  const begriff = suche.trim().toLowerCase();
  const gefiltert = eintraege.filter((e) => !begriff || (e.name || "").toLowerCase().includes(begriff));

  // Was auf dem Knopf steht: bei einer Auswahl der Name, bei mehreren die
  // Anzahl. "3 ausgewählt" ist ehrlicher als drei abgeschnittene Namen.
  const beschriftung = gewaehlt.size === 0
    ? `${alleText} (${eintraege.length})`
    : gewaehlt.size === 1
      ? eintraege.find((e) => gewaehlt.has(e.id))?.name || "1 ausgewählt"
      : `${gewaehlt.size} ausgewählt`;

  function umschalten(id) {
    const naechste = new Set(gewaehlt);
    if (naechste.has(id)) naechste.delete(id);
    else naechste.add(id);
    onChange([...naechste]);
  }

  return (
    <div className="relative" ref={huelle}>
      <button type="button" onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${gewaehlt.size ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
        {beschriftung}
        <span className={`transition-transform ${offen ? "rotate-90" : ""}`}>›</span>
      </button>

      {offen && (
        <div className="absolute z-30 mt-1 w-64 max-w-[80vw] rounded-xl border border-line bg-surface shadow-lg p-2">
          {eintraege.length > 8 && (
            <input autoFocus className="input !py-1.5 text-xs mb-2" placeholder={platzhalter}
              value={suche} onChange={(e) => setSuche(e.target.value)} />
          )}

          <button type="button" onClick={() => { onChange([]); setSuche(""); }}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs ${gewaehlt.size === 0 ? "text-textMain font-semibold" : "text-textMuted hover:text-textMain"}`}>
            {alleText} ({eintraege.length})
          </button>

          <div className="max-h-56 overflow-y-auto flex flex-col">
            {gefiltert.map((e, i) => {
              const an = gewaehlt.has(e.id);
              return (
                <button key={e.id} type="button" onClick={() => umschalten(e.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left ${an ? "text-textMain" : "text-textMuted hover:text-textMain"}`}>
                  <span className="w-3.5 h-3.5 rounded border border-line flex items-center justify-center flex-shrink-0 text-[9px]"
                    style={an ? { background: farbe ? farbe(e, i) : "var(--theme-amber, #E0A458)", borderColor: "transparent", color: "#fff" } : undefined}>
                    {an ? "✓" : ""}
                  </span>
                  {farbe && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: farbe(e, i) }} />}
                  <span className="truncate">{e.name}</span>
                </button>
              );
            })}
            {gefiltert.length === 0 && <span className="px-2 py-1.5 text-[11px] text-textMuted">Nichts gefunden.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
