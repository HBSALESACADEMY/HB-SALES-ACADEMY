import { useState } from "react";
import Avatar from "./Avatar";
import { openProfile } from "../lib/profileModalBus";
import { apiPost } from "../lib/apiClient";

// Zeigt die Aufstellung der Organisation als Baum: Teams untereinander,
// verschachtelt nach der Frage "in wessen Team sitzt die Leitung dieses
// Teams". Gründet jemand aus einem Team ein eigenes, erscheint es dadurch
// automatisch eine Ebene tiefer — es gibt keine zweite Hierarchie zu pflegen.
function Person({ person, zusatz, onRolle }) {
  const [bearbeite, setBearbeite] = useState(false);
  const [wert, setWert] = useState(person.rolle || "");
  const [busy, setBusy] = useState(false);

  async function speichern() {
    setBusy(true);
    await onRolle(person.id, wert);
    setBusy(false);
    setBearbeite(false);
  }

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="cursor-pointer flex-shrink-0" onClick={() => openProfile(person.id)}>
        <Avatar name={person.name} src={person.avatar_url} size={28} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-textMain truncate">
          {person.name}{zusatz && <span className="text-amber text-xs"> · {zusatz}</span>}
        </div>
        {bearbeite ? (
          <div className="flex items-center gap-1.5 mt-1">
            <input autoFocus className="input !py-1 text-xs" maxLength={60} value={wert}
              placeholder="z.B. Vertriebsleitung"
              onChange={(e) => setWert(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") speichern(); if (e.key === "Escape") setBearbeite(false); }} />
            <button disabled={busy} onClick={speichern} className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0">Speichern</button>
            <button onClick={() => { setWert(person.rolle || ""); setBearbeite(false); }} className="btn-ghost text-xs text-textMuted flex-shrink-0">Abbrechen</button>
          </div>
        ) : (
          <button onClick={() => setBearbeite(true)}
            className="text-[11px] text-textMuted hover:text-textMain text-left">
            {person.rolle || "Rollenbezeichnung hinzufügen"} ✎
          </button>
        )}
      </div>
    </div>
  );
}

function Knoten({ team, alle, onRolle }) {
  const kinder = alle.filter((t) => t.elternId === team.id);
  const anzahl = team.mitglieder.length + (team.leitung ? 1 : 0);
  const [offen, setOffen] = useState(false);

  return (
    <div className="org-knoten">
      <div className="org-kasten">
        <div className="font-display font-semibold text-textMain text-sm leading-tight break-words">{team.name}</div>
        <div className="text-[11px] text-textMuted">{anzahl} {anzahl === 1 ? "Person" : "Personen"}</div>
        {team.leitung && (
          <div className="text-[11px] text-textMain mt-1 truncate">
            {team.leitung.name}
            {team.leitung.rolle && <span className="text-textMuted"> · {team.leitung.rolle}</span>}
          </div>
        )}
        {/* Die Namensliste erst auf Klick: sonst wird jeder Kasten so hoch,
            dass das Diagramm nicht mehr als Aufbau lesbar ist. */}
        {anzahl > 0 && (
          <button onClick={() => setOffen((v) => !v)} className="text-[11px] text-textMuted hover:text-textMain mt-1">
            {offen ? "Namen ausblenden" : "Namen zeigen"}
          </button>
        )}
        {offen && (
          <div className="mt-1.5 text-left">
            {team.leitung && <Person person={team.leitung} zusatz="Leitung" onRolle={onRolle} />}
            {team.mitglieder.map((m) => (
              <Person key={m.id} person={m} zusatz={m.fuehrtTeamId ? "leitet eigenes Team" : null} onRolle={onRolle} />
            ))}
          </div>
        )}
      </div>

      {kinder.length > 0 && (
        <div className="org-kinder">
          {kinder.map((k) => (
            <div key={k.id} className="org-kind">
              <Knoten team={k} alle={alle} onRolle={onRolle} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Organigramm({ daten, onRolle }) {
  if (!daten) return null;
  const wurzeln = daten.teams.filter((t) => !t.elternId);
  return (
    <div>
      {daten.teams.length === 0 && <p className="text-textMuted text-sm">Noch keine Teams angelegt.</p>}
      {wurzeln.length > 0 && (
        <div className="org-flaeche">
          <div className="org-baum">
            <div className="flex items-start justify-center gap-6 flex-wrap">
              {wurzeln.map((t) => <Knoten key={t.id} team={t} alle={daten.teams} onRolle={onRolle} />)}
            </div>
          </div>
        </div>
      )}
      {daten.ohneTeam.length > 0 && (
        <div className="card mt-3">
          <div className="font-semibold text-textMain text-sm mb-1.5">Ohne Team</div>
          {daten.ohneTeam.map((p) => <Person key={p.id} person={p} onRolle={onRolle} />)}
        </div>
      )}
    </div>
  );
}
