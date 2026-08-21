import { useLayoutEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { openProfile } from "../lib/profileModalBus";

// Klassisches Organigramm aus Personen (migration_100/101).
//
// Gezeichnet wird nach der HAUPTzuordnung (profiles.vorgesetzter_id) — ein
// Kasten kann im Diagramm nur an einer Stelle stehen. Zusätzliche
// Zuordnungen (org_zusatz_chefs) kommen als eigene Linie darüber, gestrichelt
// und in der Akzentfarbe, damit sie nicht mit der Hauptlinie verwechselt wird.
//
// Ganz oben stehen alle, die niemandem unterstellt sind, gemeinsam in einem
// Kasten: zwei Geschäftsführer sind eine Ebene, nicht zwei Stränge.
function PersonInhalt({ person, alle, zusatz, onChef, onZusatz, bearbeiten, busy, klein }) {
  const [offen, setOffen] = useState(false);

  // Sich selbst und die eigenen Untergebenen darf man nicht als Vorgesetzte
  // wählen — das gäbe einen Kreis.
  const gesperrt = (() => {
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

  const meineZusatz = zusatz.filter((z) => z.person_id === person.id);

  return (
    <div className="flex flex-col items-center gap-1">
      <button onClick={() => openProfile(person.id)} className="flex-shrink-0">
        <Avatar name={person.name} src={person.avatar_url} size={klein ? 26 : 32} />
      </button>
      <button onClick={() => openProfile(person.id)}
        className="font-display font-semibold text-textMain text-sm leading-tight break-words hover:underline">
        {person.name}
      </button>
      {person.rolle && <div className="text-[11px] text-textMuted leading-tight">{person.rolle}</div>}

      {person.teams.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {person.teams.map((t) => (
            <span key={t.id}
              className="text-[10.5px] text-textMuted leading-tight border border-line rounded-full px-1.5 py-0.5 whitespace-nowrap">
              {t.leitet ? "★" : "👥"} {t.name}
            </span>
          ))}
        </div>
      )}

      {meineZusatz.length > 0 && (
        <div className="text-[10.5px] text-amber leading-tight">
          auch: {meineZusatz.map((z) => alle.find((p) => p.id === z.chef_id)?.name || "?").join(", ")}
        </div>
      )}

      {bearbeiten && (
        <>
          <button onClick={() => setOffen((v) => !v)} className="text-[11px] text-textMuted hover:text-textMain">
            {offen ? "Schliessen" : "Zuordnen"}
          </button>
          {offen && (
            <div className="flex flex-col gap-1 w-full mt-1">
              <select className="input !py-1 text-[11px] w-full" disabled={busy} value={person.chefId || ""}
                onChange={(e) => { onChef(person.id, e.target.value || null); setOffen(false); }}>
                <option value="">Ganz oben (niemandem unterstellt)</option>
                {alle.filter((p) => !gesperrt.has(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>berichtet an {p.name}</option>
                ))}
              </select>
              <select className="input !py-1 text-[11px] w-full" disabled={busy} value=""
                onChange={(e) => { if (e.target.value) { onZusatz("zusatz-hinzufuegen", person.id, e.target.value); setOffen(false); } }}>
                <option value="">zusätzlich zuordnen …</option>
                {alle.filter((p) => p.id !== person.id && p.id !== person.chefId && !meineZusatz.some((z) => z.chef_id === p.id))
                  .map((p) => <option key={p.id} value={p.id}>auch an {p.name}</option>)}
              </select>
              {meineZusatz.map((z) => (
                <button key={z.chef_id} onClick={() => onZusatz("zusatz-entfernen", person.id, z.chef_id)}
                  className="text-[10.5px] text-coral hover:underline text-left">
                  Zweitzuordnung zu {alle.find((p) => p.id === z.chef_id)?.name || "?"} lösen
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PersonKasten({ person, alle, zusatz, onChef, onZusatz, bearbeiten, busy, kastenRefs }) {
  const kinder = alle.filter((p) => p.chefId === person.id);
  return (
    <div className="org-knoten">
      <div className="org-kasten" ref={(el) => { if (el) kastenRefs.current[person.id] = el; }}>
        <PersonInhalt person={person} alle={alle} zusatz={zusatz} onChef={onChef} onZusatz={onZusatz} bearbeiten={bearbeiten} busy={busy} />
      </div>
      {kinder.length > 0 && (
        <div className="org-kinder">
          {kinder.map((k) => (
            <div key={k.id} className="org-kind">
              <PersonKasten person={k} alle={alle} zusatz={zusatz} onChef={onChef} onZusatz={onZusatz}
                bearbeiten={bearbeiten} busy={busy} kastenRefs={kastenRefs} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Personenbaum({ personen, zusatz = [], onChef, onZusatz, bearbeiten = true, busy }) {
  const flaeche = useRef(null);
  const kastenRefs = useRef({});
  const [linien, setLinien] = useState([]);
  const [masse, setMasse] = useState({ w: 0, h: 0 });

  const wurzeln = (personen || []).filter((p) => !p.chefId);
  const untere = (personen || []).filter((p) => p.chefId);
  // Kinder der obersten Ebene hängen unter dem gemeinsamen Kasten.
  const ersteEbene = untere.filter((p) => wurzeln.some((w) => w.id === p.chefId));

  // Zusatz-Linien erst NACH dem Zeichnen berechnen: vorher stehen die
  // Positionen der Kästen nicht fest.
  useLayoutEffect(() => {
    function messen() {
      const f = flaeche.current;
      if (!f) return;
      const fb = f.getBoundingClientRect();
      setMasse({ w: f.scrollWidth, h: f.scrollHeight });
      const neu = [];
      zusatz.forEach((z) => {
        const von = kastenRefs.current[z.chef_id];
        const nach = kastenRefs.current[z.person_id];
        if (!von || !nach) return;
        const a = von.getBoundingClientRect(), b = nach.getBoundingClientRect();
        neu.push({
          key: `${z.chef_id}-${z.person_id}`,
          x1: a.left - fb.left + a.width / 2 + f.scrollLeft,
          y1: a.bottom - fb.top + f.scrollTop,
          x2: b.left - fb.left + b.width / 2 + f.scrollLeft,
          y2: b.top - fb.top + f.scrollTop,
        });
      });
      setLinien(neu);
    }
    messen();
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, [personen, zusatz]);

  if (!personen?.length) return <p className="text-textMuted text-sm">Noch niemand in dieser Organisation.</p>;

  return (
    <div>
      <div className="org-flaeche relative" ref={flaeche}>
        {/* Die Zusatz-Linien liegen als eigene Ebene über dem Diagramm —
            im Kästchen-Raster liessen sie sich nicht unterbringen, weil sie
            quer verlaufen. */}
        {linien.length > 0 && (
          <svg className="absolute inset-0 pointer-events-none" width={masse.w} height={masse.h} aria-hidden="true">
            {linien.map((l) => (
              <path key={l.key}
                d={`M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2}, ${l.x2} ${(l.y1 + l.y2) / 2}, ${l.x2} ${l.y2}`}
                fill="none" stroke="var(--org-accent, #CE3A5C)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.75" />
            ))}
          </svg>
        )}

        <div className="org-baum">
          {wurzeln.length > 0 && (
            <div className="org-knoten">
              {/* Alle ohne Vorgesetzte gemeinsam in EINEM Kasten: zwei
                  Geschäftsführer sind eine Ebene, nicht zwei Stränge. */}
              <div className="org-kasten" style={{ maxWidth: "none" }}>
                <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-2">Geschäftsführung</div>
                <div className="flex items-start justify-center gap-5 flex-wrap">
                  {wurzeln.map((p) => (
                    <div key={p.id} style={{ maxWidth: 200 }} ref={(el) => { if (el) kastenRefs.current[p.id] = el; }}>
                      <PersonInhalt person={p} alle={personen} zusatz={zusatz} onChef={onChef} onZusatz={onZusatz}
                        bearbeiten={bearbeiten} busy={busy} klein />
                    </div>
                  ))}
                </div>
              </div>

              {ersteEbene.length > 0 && (
                <div className="org-kinder">
                  {ersteEbene.map((k) => (
                    <div key={k.id} className="org-kind">
                      <PersonKasten person={k} alle={personen} zusatz={zusatz} onChef={onChef} onZusatz={onZusatz}
                        bearbeiten={bearbeiten} busy={busy} kastenRefs={kastenRefs} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {bearbeiten && zusatz.length > 0 && (
        <p className="text-[11px] text-textMuted mt-2">
          Gestrichelte Linien sind Zweitzuordnungen — die Person hängt zusätzlich unter der anderen.
        </p>
      )}
    </div>
  );
}
