import { useState } from "react";
import Avatar from "./Avatar";
import { openProfile } from "../lib/profileModalBus";

// Klassisches Organigramm aus Personen (migration_100): ein Kasten je
// Person, angeordnet nach "berichtet an". Du legst die Hierarchie fest; die
// Teams, die jemand leitet oder in denen jemand steckt, erscheinen
// automatisch im Kasten — gepflegt wird also nur, wer unter wem hängt.
function PersonKasten({ person, alle, onChef, bearbeiten, busy }) {
  const kinder = alle.filter((p) => p.chefId === person.id);
  const [offen, setOffen] = useState(false);

  // Sich selbst und die eigenen Untergebenen darf man nicht als Vorgesetzte
  // wählen — das gäbe einen Kreis. Der Server lehnt das ohnehin ab, aber es
  // gar nicht erst anzubieten erspart die Fehlermeldung.
  const untergebene = (() => {
    const raus = new Set([person.id]);
    let gewachsen = true;
    while (gewachsen) {
      gewachsen = false;
      alle.forEach((p) => {
        if (p.chefId && raus.has(p.chefId) && !raus.has(p.id)) { raus.add(p.id); gewachsen = true; }
      });
    }
    return raus;
  })();

  return (
    <div className="org-knoten">
      <div className="org-kasten">
        <div className="flex flex-col items-center gap-1">
          <button onClick={() => openProfile(person.id)} className="flex-shrink-0">
            <Avatar name={person.name} src={person.avatar_url} size={32} />
          </button>
          <button onClick={() => openProfile(person.id)}
            className="font-display font-semibold text-textMain text-sm leading-tight break-words hover:underline">
            {person.name}
          </button>
          {person.rolle && <div className="text-[11px] text-textMuted leading-tight">{person.rolle}</div>}
        </div>

        {person.teams.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-0.5">
            {person.teams.map((t) => (
              <div key={t.id} className="text-[11px] text-textMuted leading-tight">
                {t.leitet ? "★" : "👥"} {t.name}
              </div>
            ))}
          </div>
        )}

        {bearbeiten && (
          <>
            <button onClick={() => setOffen((v) => !v)} className="text-[11px] text-textMuted hover:text-textMain mt-1.5">
              {offen ? "Schliessen" : "Zuordnen"}
            </button>
            {offen && (
              <select
                className="input !py-1 text-[11px] mt-1 w-full" disabled={busy}
                value={person.chefId || ""}
                onChange={(e) => { onChef(person.id, e.target.value || null); setOffen(false); }}>
                <option value="">Ganz oben (niemandem unterstellt)</option>
                {alle.filter((p) => !untergebene.has(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>berichtet an {p.name}</option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

      {kinder.length > 0 && (
        <div className="org-kinder">
          {kinder.map((k) => (
            <div key={k.id} className="org-kind">
              <PersonKasten person={k} alle={alle} onChef={onChef} bearbeiten={bearbeiten} busy={busy} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Personenbaum({ personen, onChef, bearbeiten = true, busy }) {
  const wurzeln = (personen || []).filter((p) => !p.chefId);
  if (!personen?.length) return <p className="text-textMuted text-sm">Noch niemand in dieser Organisation.</p>;

  return (
    <div>
      <div className="org-flaeche">
        <div className="org-baum">
          <div className="flex items-start justify-center gap-6 flex-wrap">
            {wurzeln.map((p) => (
              <PersonKasten key={p.id} person={p} alle={personen} onChef={onChef} bearbeiten={bearbeiten} busy={busy} />
            ))}
          </div>
        </div>
      </div>
      {bearbeiten && wurzeln.length > 1 && (
        <p className="text-[11px] text-textMuted mt-2">
          {wurzeln.length} Personen stehen noch ganz oben. Über „Zuordnen“ hängst du sie unter die richtige Person.
        </p>
      )}
    </div>
  );
}
