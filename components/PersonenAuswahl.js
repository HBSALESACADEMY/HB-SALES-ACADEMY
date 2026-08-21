import { useState } from "react";
import Avatar from "./Avatar";

// Wen man einlädt, sucht man sich aus — Namen abzutippen heisst, sie vorher
// auswendig zu wissen, und ein Tippfehler fällt erst auf, wenn niemand kommt.
//
// Mehrfachauswahl, weil zu einem Termin selten genau eine Person gehört.
export default function PersonenAuswahl({
  personen,
  ausgewaehlt,
  onChange,
  platzhalter = "Name suchen…",
  leerText = "Niemand zum Einladen vorhanden.",
}) {
  const [suche, setSuche] = useState("");
  const gewaehlt = new Set(ausgewaehlt || []);
  const begriff = suche.trim().toLowerCase();
  const gefiltert = (personen || []).filter((p) => !begriff || (p.name || "").toLowerCase().includes(begriff));

  function umschalten(id) {
    const naechste = new Set(gewaehlt);
    if (naechste.has(id)) naechste.delete(id);
    else naechste.add(id);
    onChange([...naechste]);
  }

  if (!personen || personen.length === 0) return <p className="text-[11px] text-textMuted">{leerText}</p>;

  return (
    <div className="flex flex-col gap-1.5">
      {gewaehlt.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(personen || []).filter((p) => gewaehlt.has(p.id)).map((p) => (
            <button key={p.id} onClick={() => umschalten(p.id)}
              title="Wieder abwählen"
              className="flex items-center gap-1.5 text-[11px] rounded-full border border-amber/50 bg-amber/10 pl-1 pr-2 py-0.5 text-textMain">
              <Avatar name={p.name} src={p.avatar_url} size={16} />
              {p.name}
              <span className="text-textMuted">×</span>
            </button>
          ))}
        </div>
      )}
      <input className="input !py-1.5 text-xs" placeholder={platzhalter} value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className="max-h-40 overflow-y-auto flex flex-col border border-line rounded-lg">
        {gefiltert.map((p) => (
          <button key={p.id} onClick={() => umschalten(p.id)}
            className={`flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-amber/10 ${gewaehlt.has(p.id) ? "text-textMain" : "text-textMuted"}`}>
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] flex-shrink-0 ${gewaehlt.has(p.id) ? "border-amber bg-amber text-[var(--org-button-text,#fff)]" : "border-line"}`}>
              {gewaehlt.has(p.id) ? "✓" : ""}
            </span>
            <Avatar name={p.name} src={p.avatar_url} size={18} />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        {gefiltert.length === 0 && <p className="text-[11px] text-textMuted px-2 py-1.5">Niemand gefunden.</p>}
      </div>
    </div>
  );
}
