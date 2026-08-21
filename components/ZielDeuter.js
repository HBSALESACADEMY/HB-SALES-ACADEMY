import { useState } from "react";
import { apiPost } from "../lib/apiClient";

// Frei formuliertes Ziel eintippen, die KI übersetzt es in Kennzahl und
// Zielwert (siehe pages/api/goal-interpret.js).
//
// Das Ergebnis wird VORGESCHLAGEN, nicht gesetzt: man sieht, was die KI
// verstanden hat, und bestätigt es. Ein Ziel, das heimlich etwas anderes
// misst als gemeint, wäre schlimmer als gar keins.
export default function ZielDeuter({ onUebernehmen, onAbbrechen }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);

  async function deuten() {
    if (!text.trim()) return;
    setBusy(true);
    setErgebnis(null);
    try {
      setErgebnis(await apiPost("/api/goal-interpret", { text }));
    } catch (e) {
      setErgebnis({ ok: false, grund: e.message || "Die Deutung ist fehlgeschlagen." });
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="input" rows={2} maxLength={300}
        placeholder="Beschreib dein Ziel in eigenen Worten — z.B. „diesen Monat 3 neue Kunden gewinnen“"
        value={text}
        onChange={(e) => { setText(e.target.value); setErgebnis(null); }} />

      <div className="flex items-center gap-2">
        <button disabled={busy || !text.trim()} onClick={deuten} className="btn text-xs disabled:opacity-40">
          {busy ? "Liest…" : "✨ Ziel erkennen"}
        </button>
        {onAbbrechen && <button onClick={onAbbrechen} className="btn-ghost text-xs text-textMuted">Abbrechen</button>}
      </div>

      {ergebnis?.ok && (
        <div className="card !py-3 border-teal/40">
          <div className="text-xs text-textMuted mb-1">So habe ich das verstanden:</div>
          <div className="text-sm text-textMain mb-2">
            <strong>{ergebnis.title}</strong> — {ergebnis.target} {ergebnis.metricLabel}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onUebernehmen(ergebnis)} className="btn text-xs">Passt, übernehmen</button>
            <button onClick={() => setErgebnis(null)} className="btn-ghost text-xs text-textMuted">Anders formulieren</button>
          </div>
        </div>
      )}

      {ergebnis && ergebnis.ok === false && (
        <div className="card !py-3 border-coral/40">
          <div className="text-sm text-coral mb-1">Das kann ich so nicht messen.</div>
          <p className="text-xs text-textMuted">{ergebnis.grund}</p>
          {ergebnis.vorschlaege?.length > 0 && (
            <p className="text-xs text-textMuted mt-1.5">
              Zählen könnte ich stattdessen: <strong>{ergebnis.vorschlaege.join(", ")}</strong>.
              Formulier das Ziel damit — oder wähl die Kennzahl von Hand aus der Liste.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
