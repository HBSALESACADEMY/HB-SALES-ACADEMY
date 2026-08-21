import { useState } from "react";

// Die selbst gebaute Organisationsstruktur (migration_98).
//
// Anders als das automatische Organigramm leitet sich hier nichts ab: Du
// legst die Einheiten an — Abteilungen, Standorte, Bereiche — und hängst die
// Teams ein. Entsteht später ein neues Team, erscheint es unten unter "Noch
// nicht zugeordnet" und wird mit einem Klick eingehängt.
function Einheit({ einheit, alle, teamsOhneEinheit, onAktion, tiefe, busy }) {
  const kinder = alle.filter((e) => e.elternId === einheit.id);
  const [neu, setNeu] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);
  const [umbenennen, setUmbenennen] = useState(null);

  return (
    <div className={tiefe > 0 ? "relative pl-6 border-l-2 border-line ml-4" : ""}>
      {tiefe > 0 && <span aria-hidden="true" className="absolute left-0 top-7 w-6 border-t-2 border-line" />}
      <div className="card mb-3">
        <div className="flex items-center gap-2 mb-2">
          {umbenennen !== null ? (
            <>
              <input autoFocus className="input !py-1 text-sm flex-1" value={umbenennen} maxLength={80}
                onChange={(e) => setUmbenennen(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && umbenennen.trim()) { onAktion({ aktion: "umbenennen", id: einheit.id, name: umbenennen }); setUmbenennen(null); }
                  if (e.key === "Escape") setUmbenennen(null);
                }} />
              <button onClick={() => { if (umbenennen.trim()) onAktion({ aktion: "umbenennen", id: einheit.id, name: umbenennen }); setUmbenennen(null); }}
                className="btn-ghost text-xs flex-shrink-0">Speichern</button>
              <button onClick={() => setUmbenennen(null)} className="btn-ghost text-xs text-textMuted flex-shrink-0">Abbrechen</button>
            </>
          ) : (
            <>
              <span className="font-display font-semibold text-textMain text-sm flex-1 min-w-0 truncate">{einheit.name}</span>
              <button onClick={() => setUmbenennen(einheit.name)} className="btn-ghost text-xs flex-shrink-0">Umbenennen</button>
              <button onClick={() => setNeuOffen((v) => !v)} className="btn-ghost text-xs flex-shrink-0">+ Untereinheit</button>
              <button
                onClick={() => { if (confirm(`„${einheit.name}" entfernen? Untereinheiten verschwinden mit; zugeordnete Teams bleiben bestehen.`)) onAktion({ aktion: "loeschen", id: einheit.id }); }}
                className="btn-ghost text-xs text-coral flex-shrink-0">Entfernen</button>
            </>
          )}
        </div>

        {neuOffen && (
          <div className="flex items-center gap-2 mb-2">
            <input autoFocus className="input !py-1 text-sm flex-1" placeholder="Name der Untereinheit" value={neu} maxLength={80}
              onChange={(e) => setNeu(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && neu.trim()) { onAktion({ aktion: "anlegen", name: neu, parentId: einheit.id }); setNeu(""); setNeuOffen(false); } }} />
            <button disabled={!neu.trim() || busy} onClick={() => { onAktion({ aktion: "anlegen", name: neu, parentId: einheit.id }); setNeu(""); setNeuOffen(false); }}
              className="btn text-xs disabled:opacity-40 flex-shrink-0">Anlegen</button>
          </div>
        )}

        {einheit.teams.length === 0 ? (
          <p className="text-[11px] text-textMuted">Kein Team zugeordnet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {einheit.teams.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="text-textMain flex-1 min-w-0 truncate">
                  👥 {t.name}
                  <span className="text-textMuted"> · {t.anzahl} {t.anzahl === 1 ? "Person" : "Personen"}{t.leitung ? ` · ${t.leitung}` : ""}</span>
                </span>
                <button onClick={() => onAktion({ aktion: "team-zuordnen", teamId: t.id, einheitId: null })}
                  className="btn-ghost text-xs text-textMuted flex-shrink-0">Lösen</button>
              </div>
            ))}
          </div>
        )}

        {teamsOhneEinheit.length > 0 && (
          <select
            className="input !py-1 text-xs mt-2"
            value=""
            onChange={(e) => e.target.value && onAktion({ aktion: "team-zuordnen", teamId: e.target.value, einheitId: einheit.id })}>
            <option value="">Team hier einhängen …</option>
            {teamsOhneEinheit.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {kinder.map((k) => (
        <Einheit key={k.id} einheit={k} alle={alle} teamsOhneEinheit={teamsOhneEinheit} onAktion={onAktion} tiefe={tiefe + 1} busy={busy} />
      ))}
    </div>
  );
}

export default function Strukturbaum({ struktur, teamsOhneEinheit, onAktion, busy }) {
  const [neu, setNeu] = useState("");
  const wurzeln = (struktur || []).filter((e) => !e.elternId);

  return (
    <div>
      {wurzeln.length === 0 && (
        <p className="text-textMuted text-sm mb-3">
          Noch keine Struktur angelegt. Fang mit der obersten Ebene an — etwa „Geschäftsführung" oder „Vertrieb".
        </p>
      )}

      {wurzeln.map((e) => (
        <Einheit key={e.id} einheit={e} alle={struktur} teamsOhneEinheit={teamsOhneEinheit} onAktion={onAktion} tiefe={0} busy={busy} />
      ))}

      <div className="flex items-center gap-2 mt-2">
        <input className="input !py-1 text-sm flex-1" placeholder="Neue Einheit auf oberster Ebene" value={neu} maxLength={80}
          onChange={(e) => setNeu(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && neu.trim()) { onAktion({ aktion: "anlegen", name: neu, parentId: null }); setNeu(""); } }} />
        <button disabled={!neu.trim() || busy} onClick={() => { onAktion({ aktion: "anlegen", name: neu, parentId: null }); setNeu(""); }}
          className="btn text-xs disabled:opacity-40 flex-shrink-0">Anlegen</button>
      </div>

      {teamsOhneEinheit.length > 0 && (
        <div className="card mt-4">
          <div className="font-semibold text-textMain text-sm mb-1.5">Noch nicht zugeordnet</div>
          <p className="text-[11px] text-textMuted mb-2">
            Diese Teams gibt es in der Academy, sie hängen aber noch an keiner Einheit. Häng sie oben ein.
          </p>
          {teamsOhneEinheit.map((t) => (
            <div key={t.id} className="text-xs text-textMain py-0.5 truncate">
              👥 {t.name}<span className="text-textMuted"> · {t.anzahl} {t.anzahl === 1 ? "Person" : "Personen"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
