import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { apiGet, apiPost } from "../lib/apiClient";
import { AUTO_SIGNALE, WER, signalVon, datumKurz, onboardingUebersicht } from "../lib/onboarding";
import { OnboardingBalken, schrittInfo } from "../components/OnboardingSchritt";
import { berlinHeute } from "../lib/woche";

// Der Onboarding-Bereich für die Leitung — mit eigenen Reitern.
//
// Bewusst NICHT in der Verwaltung: Das Onboarding ist keine Einstellung, die
// man einmal setzt, sondern tägliche Arbeit mit Menschen. Es steht deshalb
// für sich, mit eigener Übersicht, eigener Personenliste und eigenem Plan.

const LEER = { titel: "", beschreibung: "", wer: "vertrieb", automatisch: "", ziel_anzahl: "", faellig_tag: "" };

const REITER = [
  { key: "uebersicht", label: "Übersicht" },
  { key: "personen", label: "Personen" },
  { key: "plan", label: "Plan" },
];

function Kennzahl({ label, wert, hinweis, warnung = false }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <div className={`text-xl font-semibold ${warnung ? "text-coral" : "text-textMain"}`}>{wert}</div>
      <div className="text-[11px] text-textMuted">{label}</div>
      {hinweis && <div className="text-[10px] text-textMuted mt-0.5">{hinweis}</div>}
    </div>
  );
}

export default function OnboardingSeite() {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);
  const [reiter, setReiter] = useState("uebersicht");
  const [offen, setOffen] = useState(null);
  const [entwurf, setEntwurf] = useState(null);
  const [neuePerson, setNeuePerson] = useState("");
  const [startTag, setStartTag] = useState(berlinHeute());
  const [zeigeFertige, setZeigeFertige] = useState(false);

  async function laden() {
    try {
      setDaten(await apiGet("/api/onboarding"));
    } catch (e) {
      setFehler(e.message);
      setDaten((d) => d || { rolle: "fehler" });
    }
  }
  useEffect(() => { laden(); }, []);

  // Jede Änderung mit sichtbarer Antwort — ein Klick, der still nichts tut,
  // sieht aus wie ein kaputter Knopf.
  async function aktion(name, werte = {}, danach) {
    setBusy(true);
    setFehler("");
    try {
      await apiPost("/api/onboarding", { aktion: name, ...werte });
      if (danach) danach();
      await laden();
    } catch (e) {
      setFehler(e.message);
    }
    setBusy(false);
  }

  if (!daten) return <Layout><p className="text-textMuted text-sm">Lädt…</p></Layout>;
  if (daten.rolle !== "leitung") {
    return (
      <Layout>
        <h1 className="text-2xl font-display font-medium brand-text-gradient mb-3">Onboarding</h1>
        <div className="card max-w-lg text-sm text-textMuted">
          {fehler || "Das Onboarding verwaltet die Leitung. Deinen eigenen Plan siehst du auf dem Startbildschirm."}
        </div>
      </Layout>
    );
  }

  const schritte = daten.schritte || [];
  const zuweisungen = daten.zuweisungen || [];
  const laufend = zuweisungen.filter((z) => !z.stand.fertig);
  const fertige = zuweisungen.filter((z) => z.stand.fertig);
  const schonDabei = new Set(zuweisungen.map((z) => z.user_id));
  const verfuegbar = (daten.mitglieder || []).filter((m) => !schonDabei.has(m.id));
  const signalEntwurf = signalVon(entwurf?.automatisch);
  const uebersicht = onboardingUebersicht(zuweisungen);

  function verschiebe(index, richtung) {
    const ids = schritte.map((s) => s.id);
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= ids.length) return;
    [ids[index], ids[ziel]] = [ids[ziel], ids[index]];
    aktion("reihenfolge", { ids });
  }

  function speichereSchritt() {
    aktion("schritt_speichern", { schritt: entwurf }, () => setEntwurf(null));
  }

  function personKarte(z) {
    const s = z.stand;
    const aufgeklappt = offen === z.id;
    return (
      <div key={z.id} className="border border-line rounded-xl">
        <button type="button" onClick={() => setOffen(aufgeklappt ? null : z.id)} className="w-full text-left px-3 py-2.5">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-sm font-semibold text-textMain flex-1 min-w-0 truncate">{z.person.full_name}</span>
            {s.ueberfaellig > 0 && (
              <span className="text-[10px] uppercase tracking-wide text-coral border border-coral/40 rounded px-1.5 py-0.5">
                {s.ueberfaellig} überfällig
              </span>
            )}
            <span className="text-[11px] text-textMuted">seit {datumKurz(z.gestartet_am)}</span>
          </div>
          <div className="flex items-center gap-2">
            <OnboardingBalken prozent={s.prozent} warnung={s.ueberfaellig > 0} />
            <span className="text-[11px] font-mono text-textMuted flex-shrink-0">{s.erledigt} von {s.gesamt} · {s.prozent} %</span>
          </div>
          {s.naechster && <div className="text-[11px] text-textMuted mt-1">Als Nächstes: {s.naechster.titel}</div>}
        </button>

        {aufgeklappt && (
          <div className="px-3 pb-3 border-t border-line">
            {s.liste.map((x) => (
              <div key={x.schritt.id} className="flex items-start gap-2.5 py-2 border-b border-line last:border-b-0">
                <button type="button" disabled={busy || x.automatisch}
                  onClick={() => aktion("haken", { zuweisungId: z.id, schrittId: x.schritt.id, erledigt: !x.erledigt })}
                  title={x.automatisch ? "Hakt sich automatisch ab" : x.erledigt ? "Haken entfernen" : "Als erledigt abhaken"}
                  className={`w-5 h-5 mt-0.5 rounded-full border flex-shrink-0 flex items-center justify-center text-[10px] ${
                    x.erledigt ? "bg-teal border-teal text-[#14151C]" : x.ueberfaellig ? "border-coral text-coral" : "border-line"
                  } ${x.automatisch ? "cursor-default" : ""}`}>
                  {x.erledigt ? "✓" : x.ueberfaellig ? "!" : ""}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${x.erledigt ? "text-textMuted line-through" : "text-textMain"}`}>{x.schritt.titel}</div>
                  {x.schritt.beschreibung && <div className="text-[11px] text-textMuted">{x.schritt.beschreibung}</div>}
                  <div className={`text-[11px] ${x.ueberfaellig ? "text-coral" : "text-textMuted"}`}>{schrittInfo(x)}</div>
                </div>
              </div>
            ))}
            {!s.liste.length && <p className="text-xs text-textMuted py-2">Der Plan hat noch keine Schritte.</p>}
            <div className="flex items-center gap-2 flex-wrap pt-3">
              <label className="text-[11px] text-textMuted">Start</label>
              <input type="date" className="input !py-1 !text-xs w-auto" defaultValue={z.gestartet_am} disabled={busy}
                onChange={(e) => e.target.value && aktion("startdatum", { id: z.id, gestartetAm: e.target.value })} />
              {z.zugewiesen_von_name && <span className="text-[11px] text-textMuted">verbunden von {z.zugewiesen_von_name}</span>}
              <button type="button" disabled={busy} className="btn-ghost text-xs ml-auto disabled:opacity-40"
                onClick={() => {
                  if (window.confirm(`${z.person.full_name} aus dem Onboarding nehmen? Die Haken gehen dabei verloren.`)) {
                    aktion("zuweisung_entfernen", { id: z.id }, () => setOffen(null));
                  }
                }}>
                Aus dem Onboarding nehmen
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Onboarding</h1>
      <p className="text-sm text-textMuted mb-3">Neue Leute verbinden, Schritte festlegen und sehen, wo jede Person steht.</p>

      {/* Eigene Reiter — das Onboarding ist ein Bereich für sich, keine
          Unterseite der Verwaltung. */}
      <div className="flex items-center gap-1.5 flex-wrap mb-5">
        {REITER.map((r) => {
          const an = r.key === reiter;
          return (
            <button key={r.key} type="button" onClick={() => setReiter(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${an ? "border-amber text-textMain" : "border-transparent text-textMuted hover:text-textMain"}`}
              style={an ? { background: "color-mix(in srgb, var(--org-accent, #E9B44C) 14%, transparent)" } : undefined}>
              {r.label}
              {r.key === "personen" && laufend.length > 0 && <span className="ml-1.5 text-[10px] font-mono text-textMuted">{laufend.length}</span>}
              {r.key === "plan" && <span className="ml-1.5 text-[10px] font-mono text-textMuted">{schritte.length}</span>}
            </button>
          );
        })}
      </div>

      {fehler && <div className="card border-coral/40 text-coral text-sm mb-4">{fehler}</div>}

      {reiter === "uebersicht" && (
        <div className="flex flex-col gap-5 max-w-3xl">
          <div className="card">
            <div className="font-semibold text-textMain text-sm mb-3">Wie es läuft</div>
            <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4">
              <Kennzahl label="im Onboarding" wert={uebersicht.laufend} />
              <Kennzahl label="Fortschritt im Schnitt" wert={`${uebersicht.prozent} %`} />
              <Kennzahl label="überfällige Schritte" wert={uebersicht.ueberfaellig} warnung={uebersicht.ueberfaellig > 0}
                hinweis={uebersicht.mitRueckstand ? `bei ${uebersicht.mitRueckstand} Person${uebersicht.mitRueckstand === 1 ? "" : "en"}` : null} />
              <Kennzahl label="abgeschlossen" wert={uebersicht.fertig}
                hinweis={uebersicht.dauerSchnitt !== null ? `im Schnitt in ${uebersicht.dauerSchnitt} Tagen` : null} />
            </div>
          </div>

          <div className="card">
            <div className="font-semibold text-textMain text-sm mb-1">Woran es hängt</div>
            <p className="text-xs text-textMuted mb-3">
              Die Schritte, die gerade bei den meisten offen sind. Steht hier immer derselbe, liegt es selten an den
              Leuten — dann ist der Schritt unklar, zu früh angesetzt oder zu gross.
            </p>
            {uebersicht.engpaesse.length ? (
              <div className="flex flex-col">
                {uebersicht.engpaesse.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-line last:border-b-0">
                    <span className="text-sm text-textMain flex-1 min-w-0 truncate">{e.titel}</span>
                    <span className="text-[11px] font-mono text-textMuted">{e.offen} offen</span>
                    {e.ueberfaellig > 0 && <span className="text-[11px] font-mono text-coral">{e.ueberfaellig} überfällig</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-textMuted">Gerade hängt nichts — entweder ist niemand im Onboarding, oder alle sind durch.</p>
            )}
          </div>

          <div className="card">
            <div className="font-semibold text-textMain text-sm mb-3">Wer gerade wo steht</div>
            {laufend.length ? (
              <div className="flex flex-col gap-2.5">
                {[...laufend].sort((a, b) => b.stand.ueberfaellig - a.stand.ueberfaellig || a.stand.prozent - b.stand.prozent).map((z) => (
                  <button key={z.id} type="button" className="flex items-center gap-2 text-left"
                    onClick={() => { setReiter("personen"); setOffen(z.id); }}>
                    <span className="text-sm text-textMain w-36 flex-shrink-0 truncate">{z.person.full_name}</span>
                    <OnboardingBalken prozent={z.stand.prozent} warnung={z.stand.ueberfaellig > 0} />
                    <span className="text-[11px] font-mono text-textMuted w-12 text-right flex-shrink-0">{z.stand.prozent} %</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-textMuted">Gerade ist niemand im Onboarding.</p>
            )}
          </div>
        </div>
      )}

      {reiter === "personen" && (
        <div className="flex flex-col gap-5 max-w-3xl">
          <div className="card">
            <div className="font-semibold text-textMain text-sm mb-1">Person verbinden</div>
            <p className="text-xs text-textMuted mb-3">
              Der Plan gilt ab dem Starttag. Die Fristen der Schritte zählen von dort, und die Person sieht ihren
              Fortschritt auf ihrem Startbildschirm.
            </p>
            {!schritte.length ? (
              <p className="text-xs text-amber">Lege zuerst mindestens einen Schritt im Reiter „Plan“ an.</p>
            ) : !verfuegbar.length ? (
              <p className="text-xs text-textMuted">Alle freigeschalteten Personen sind schon im Onboarding.</p>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <select className="input flex-1 min-w-[10rem]" value={neuePerson} onChange={(e) => setNeuePerson(e.target.value)}>
                  <option value="">Person wählen…</option>
                  {verfuegbar.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name || "Unbenannt"}{m.role_title ? ` · ${m.role_title}` : ""}</option>
                  ))}
                </select>
                <input type="date" className="input w-auto" value={startTag} onChange={(e) => setStartTag(e.target.value)} />
                <button type="button" disabled={busy || !neuePerson} className="btn text-xs disabled:opacity-40"
                  onClick={() => aktion("zuweisen", { userId: neuePerson, gestartetAm: startTag }, () => setNeuePerson(""))}>
                  Onboarding starten
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-semibold text-textMain text-sm flex-1">Im Onboarding</span>
              <span className="text-xs text-textMuted">{laufend.length}</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {laufend.map(personKarte)}
              {!laufend.length && <p className="text-xs text-textMuted">Gerade ist niemand im Onboarding.</p>}
            </div>
            {fertige.length > 0 && (
              <div className="mt-4">
                <button type="button" className="text-xs text-textMuted hover:text-textMain" onClick={() => setZeigeFertige((v) => !v)}>
                  {zeigeFertige ? "▾" : "▸"} Abgeschlossen ({fertige.length})
                </button>
                {zeigeFertige && <div className="flex flex-col gap-2.5 mt-2.5">{fertige.map(personKarte)}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {reiter === "plan" && (
        <div className="card max-w-3xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-textMain text-sm flex-1">Onboarding-Plan</span>
            {!entwurf && (
              <button type="button" className="btn-ghost text-xs" onClick={() => setEntwurf({ ...LEER })}>+ Schritt</button>
            )}
          </div>
          <p className="text-xs text-textMuted mb-3">
            Gilt für alle in eurer Organisation. Automatische Schritte hakt die Academy selbst ab, sobald die Daten
            es zeigen. Zählbare Ziele wie „50 Anwahlen“ zählen ab dem Starttag.
          </p>

          {entwurf && (
            <div className="border border-line rounded-xl p-3 mb-3 flex flex-col gap-2.5">
              <input className="input" placeholder="Titel, z. B. „Probetelefonat mit der Leitung“" value={entwurf.titel}
                onChange={(e) => setEntwurf({ ...entwurf, titel: e.target.value })} />
              <textarea className="input min-h-[3.5rem]" placeholder="Beschreibung (optional)" value={entwurf.beschreibung || ""}
                onChange={(e) => setEntwurf({ ...entwurf, beschreibung: e.target.value })} />
              <label className="text-[11px] text-textMuted">
                Wie wird er erledigt?
                <select className="input mt-1" value={entwurf.automatisch || ""}
                  onChange={(e) => setEntwurf({ ...entwurf, automatisch: e.target.value })}>
                  <option value="">Von Hand abhaken</option>
                  {AUTO_SIGNALE.map((s) => <option key={s.key} value={s.key}>Automatisch: {s.label}</option>)}
                </select>
              </label>
              {!signalEntwurf && (
                <label className="text-[11px] text-textMuted">
                  Wer hakt ab?
                  <select className="input mt-1" value={entwurf.wer} onChange={(e) => setEntwurf({ ...entwurf, wer: e.target.value })}>
                    <option value="vertrieb">Der Vertriebler selbst</option>
                    <option value="leitung">Nur die Leitung</option>
                  </select>
                </label>
              )}
              {signalEntwurf?.zaehlbar && (
                <label className="text-[11px] text-textMuted">
                  Wie viele {signalEntwurf.einheit} ab Start?
                  <input type="number" min="1" className="input mt-1" value={entwurf.ziel_anzahl ?? ""}
                    onChange={(e) => setEntwurf({ ...entwurf, ziel_anzahl: e.target.value })} />
                </label>
              )}
              <label className="text-[11px] text-textMuted">
                Fällig bis Tag (0 = Starttag, leer = ohne Frist)
                <input type="number" min="0" max="365" className="input mt-1" value={entwurf.faellig_tag ?? ""}
                  onChange={(e) => setEntwurf({ ...entwurf, faellig_tag: e.target.value })} />
              </label>
              <div className="flex items-center gap-2 justify-end">
                <button type="button" className="btn-ghost text-xs" onClick={() => setEntwurf(null)}>Abbrechen</button>
                <button type="button" disabled={busy || !entwurf.titel.trim()} className="btn text-xs disabled:opacity-40" onClick={speichereSchritt}>
                  Speichern
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col">
            {schritte.map((s, i) => {
              const signal = signalVon(s.automatisch);
              return (
                <div key={s.id} className="flex items-start gap-2 py-2 border-b border-line last:border-b-0">
                  <span className="text-[11px] font-mono text-textMuted w-5 pt-0.5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-textMain">{s.titel}</div>
                    <div className="text-[11px] text-textMuted">
                      {signal
                        ? `Automatisch: ${signal.label}${signal.zaehlbar ? ` (${s.ziel_anzahl})` : ""}`
                        : `Hakt ab: ${WER[s.wer]}`}
                      {Number.isInteger(s.faellig_tag) ? ` · bis Tag ${s.faellig_tag}` : " · ohne Frist"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" disabled={busy || i === 0} className="btn-ghost text-xs !px-2 disabled:opacity-30" onClick={() => verschiebe(i, -1)} title="Nach oben">↑</button>
                    <button type="button" disabled={busy || i === schritte.length - 1} className="btn-ghost text-xs !px-2 disabled:opacity-30" onClick={() => verschiebe(i, 1)} title="Nach unten">↓</button>
                    <button type="button" disabled={busy} className="btn-ghost text-xs"
                      onClick={() => setEntwurf({ ...s, automatisch: s.automatisch || "", ziel_anzahl: s.ziel_anzahl ?? "", faellig_tag: s.faellig_tag ?? "" })}>
                      Bearbeiten
                    </button>
                    <button type="button" disabled={busy} className="btn-ghost text-xs !px-2" title="Schritt löschen"
                      onClick={() => {
                        if (window.confirm(`„${s.titel}“ löschen? Die Haken dazu gehen bei allen Personen verloren.`)) aktion("schritt_loeschen", { id: s.id });
                      }}>
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
            {!schritte.length && !entwurf && (
              <p className="text-xs text-textMuted">Noch keine Schritte. Lege mit „+ Schritt“ den ersten an.</p>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
