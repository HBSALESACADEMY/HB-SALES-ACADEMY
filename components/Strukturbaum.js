import { useState } from "react";

// Die selbst gebaute Organisationsstruktur (migration_98), gezeichnet als
// Organigramm: Kästen von oben nach unten, Untereinheiten nebeneinander,
// verbunden durch Linien (siehe .org-* in styles/globals.css).
//
// Vorher war es ein eingerückter Baum — der liest sich als Liste, nicht als
// Aufbau. Wer eine Struktur bauen will, muss sie sehen können.
//
// Anders als das automatische Organigramm leitet sich hier nichts ab: Du
// legst die Einheiten an und hängst die Teams ein. Entsteht später ein neues
// Team, erscheint es unter "Noch nicht zugeordnet".
function Kasten({ einheit, alle, teamsOhneEinheit, onAktion, busy, bearbeiten }) {
  const kinder = alle.filter((e) => e.elternId === einheit.id);
  const [neu, setNeu] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);
  const [umbenennen, setUmbenennen] = useState(null);

  const anlegen = () => {
    if (!neu.trim()) return;
    onAktion({ aktion: "anlegen", name: neu, parentId: einheit.id });
    setNeu(""); setNeuOffen(false);
  };

  return (
    <div className="org-knoten">
      <div className="org-kasten">
        {umbenennen !== null ? (
          <input
            autoFocus className="input !py-1 text-sm w-full" value={umbenennen} maxLength={80}
            onChange={(e) => setUmbenennen(e.target.value)}
            onBlur={() => setUmbenennen(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && umbenennen.trim()) { onAktion({ aktion: "umbenennen", id: einheit.id, name: umbenennen }); setUmbenennen(null); }
              if (e.key === "Escape") setUmbenennen(null);
            }} />
        ) : (
          <div className="font-display font-semibold text-textMain text-sm leading-tight break-words">{einheit.name}</div>
        )}

        {einheit.teams.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-1.5">
            {einheit.teams.map((t) => (
              <div key={t.id} className="text-[11px] text-textMuted leading-tight">
                👥 {t.name} · {t.anzahl}
                {bearbeiten && (
                  <button onClick={() => onAktion({ aktion: "team-zuordnen", teamId: t.id, einheitId: null })}
                    className="ml-1 text-coral hover:underline">✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        {bearbeiten && (
          <>
            <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
              <button onClick={() => setNeuOffen((v) => !v)} title="Untereinheit anlegen" className="text-[11px] text-textMuted hover:text-textMain">+ Einheit</button>
              <button onClick={() => setUmbenennen(einheit.name)} title="Umbenennen" className="text-[11px] text-textMuted hover:text-textMain">✎</button>
              <button
                onClick={() => { if (confirm(`„${einheit.name}“ entfernen? Untereinheiten verschwinden mit; zugeordnete Teams bleiben bestehen.`)) onAktion({ aktion: "loeschen", id: einheit.id }); }}
                title="Entfernen" className="text-[11px] text-coral hover:underline">✕</button>
            </div>

            {neuOffen && (
              <div className="flex items-center gap-1 mt-1.5">
                <input autoFocus className="input !py-1 text-xs flex-1" placeholder="Name" value={neu} maxLength={80}
                  onChange={(e) => setNeu(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") anlegen(); if (e.key === "Escape") setNeuOffen(false); }} />
                <button disabled={!neu.trim() || busy} onClick={anlegen} className="btn-ghost text-xs disabled:opacity-40">OK</button>
              </div>
            )}

            {teamsOhneEinheit.length > 0 && (
              <select className="input !py-1 text-[11px] mt-1.5 w-full" value=""
                onChange={(e) => e.target.value && onAktion({ aktion: "team-zuordnen", teamId: e.target.value, einheitId: einheit.id })}>
                <option value="">Team einhängen …</option>
                {teamsOhneEinheit.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </>
        )}
      </div>

      {kinder.length > 0 && (
        <div className="org-kinder">
          {kinder.map((k) => (
            <div key={k.id} className="org-kind">
              <Kasten einheit={k} alle={alle} teamsOhneEinheit={teamsOhneEinheit} onAktion={onAktion} busy={busy} bearbeiten={bearbeiten} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Strukturbaum({ struktur, teamsOhneEinheit, onAktion, busy, bearbeiten = true }) {
  const [neu, setNeu] = useState("");
  const wurzeln = (struktur || []).filter((e) => !e.elternId);

  return (
    <div>
      {wurzeln.length === 0 ? (
        <p className="text-textMuted text-sm mb-3">
          Noch keine Struktur angelegt. Fang mit der obersten Ebene an — etwa „Geschäftsführung“ oder „Vertrieb“.
        </p>
      ) : (
        <div className="org-flaeche">
          {/* Mehrere oberste Einheiten stehen nebeneinander, ohne Linie
              darüber — es gibt keinen gemeinsamen Kopf. */}
          <div className="org-baum">
            <div className="flex items-start justify-center gap-6 flex-wrap">
              {wurzeln.map((e) => (
                <Kasten key={e.id} einheit={e} alle={struktur} teamsOhneEinheit={teamsOhneEinheit}
                  onAktion={onAktion} busy={busy} bearbeiten={bearbeiten} />
              ))}
            </div>
          </div>
        </div>
      )}

      {bearbeiten && (
        <div className="flex items-center gap-2 mt-3">
          <input className="input !py-1 text-sm flex-1" placeholder="Neue Einheit auf oberster Ebene" value={neu} maxLength={80}
            onChange={(e) => setNeu(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && neu.trim()) { onAktion({ aktion: "anlegen", name: neu, parentId: null }); setNeu(""); } }} />
          <button disabled={!neu.trim() || busy} onClick={() => { onAktion({ aktion: "anlegen", name: neu, parentId: null }); setNeu(""); }}
            className="btn text-xs disabled:opacity-40 flex-shrink-0">Anlegen</button>
        </div>
      )}

      {bearbeiten && teamsOhneEinheit.length > 0 && (
        <div className="card mt-4">
          <div className="font-semibold text-textMain text-sm mb-1.5">Noch nicht zugeordnet</div>
          <p className="text-[11px] text-textMuted mb-2">
            Diese Teams gibt es in der Academy, hängen aber an keiner Einheit. Häng sie oben über „Team einhängen …“ ein.
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
