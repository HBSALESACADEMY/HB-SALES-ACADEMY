import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { apiGet } from "../lib/apiClient";
import { getActiveOrgId } from "../lib/activeOrg";
import { openProfile } from "../lib/profileModalBus";
import { monatsRaster, istGleicherTag } from "../lib/dateRange";
import { tagesSchluessel } from "../lib/dateRange";

// Firmenkalender: was die ganze Organisation angeht — Schulungen, Messen,
// Feiertage, Betriebsausflug. Dazu Geburtstage und Abwesenheiten, die sich
// aus den Profilen ergeben und niemand eigens eintragen muss.
//
// Bewusst getrennt von den Vertriebsterminen: dort steht, was eine einzelne
// Person mit einer Kundin vorhat. Hier steht, was für alle gilt.
const ARTEN = [
  { key: "meeting", label: "Besprechung", symbol: "🗓️" },
  { key: "schulung", label: "Schulung", symbol: "🎓" },
  { key: "messe", label: "Messe", symbol: "🏢" },
  { key: "feiertag", label: "Feiertag", symbol: "🎉" },
  { key: "urlaub", label: "Urlaub", symbol: "🌴" },
  { key: "sonstiges", label: "Sonstiges", symbol: "📌" },
];
const symbolFuer = (art) => ARTEN.find((a) => a.key === art)?.symbol || "📌";

export default function Kalender() {
  const [daten, setDaten] = useState(null);
  const [monat, setMonat] = useState(() => new Date());
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [formularOffen, setFormularOffen] = useState(false);
  const [entwurf, setEntwurf] = useState({ titel: "", art: "meeting", von: "", bis: "", uhrzeit: "", beschreibung: "" });
  const [busy, setBusy] = useState(false);
  const [gewaehlterTag, setGewaehlterTag] = useState(null);

  const monatsSchluessel = `${monat.getFullYear()}-${String(monat.getMonth() + 1).padStart(2, "0")}`;

  async function laden() {
    setLaedt(true);
    try {
      setDaten(await apiGet(`/api/org-kalender?monat=${monatsSchluessel}`));
      setFehler("");
    } catch (e) {
      setFehler(e.message || "Der Kalender konnte nicht geladen werden.");
    }
    setLaedt(false);
  }

  useEffect(() => { laden(); }, [monatsSchluessel]);

  async function speichern() {
    if (!entwurf.titel.trim() || !entwurf.von) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: profil } = await supabase.from("profiles")
        .select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const { error } = await supabase.from("org_events").insert({
        organization_id: getActiveOrgId(profil),
        created_by: session.user.id,
        titel: entwurf.titel.trim(),
        beschreibung: entwurf.beschreibung.trim() || null,
        von: entwurf.von,
        bis: entwurf.bis || null,
        uhrzeit: entwurf.uhrzeit || null,
        art: entwurf.art,
      });
      if (error) throw error;
      setFormularOffen(false);
      setEntwurf({ titel: "", art: "meeting", von: "", bis: "", uhrzeit: "", beschreibung: "" });
      await laden();
    } catch (e) {
      alert(e.message || "Der Eintrag konnte nicht gespeichert werden.");
    }
    setBusy(false);
  }

  async function loeschen(id, titel) {
    if (!confirm(`„${titel}“ wirklich entfernen?`)) return;
    // .select(): eine abgelehnte Löschung meldet keinen Fehler, sie trifft
    // null Zeilen (siehe lib/loeschen.js).
    const { data, error } = await supabase.from("org_events").delete().eq("id", id).select();
    if (error) { alert(error.message); return; }
    if (!data?.length) { alert("Das Entfernen wurde abgelehnt — eigene Einträge darf jede Person löschen, fremde nur eine Führungsrolle."); return; }
    await laden();
  }

  const tage = monatsRaster(monat);
  const heute = tagesSchluessel();

  function eintraegeAm(datum) {
    if (!daten || !datum) return { termine: [], geburtstage: [], abwesend: [] };
    const schluessel = tagesSchluessel(datum);
    return {
      termine: daten.eintraege.filter((e) => schluessel >= e.von && schluessel <= (e.bis || e.von)),
      geburtstage: daten.geburtstage.filter((g) => g.tag === schluessel),
      abwesend: daten.abwesenheiten.filter((a) => schluessel >= a.von && schluessel <= a.bis),
    };
  }

  const tagesDetail = gewaehlterTag ? eintraegeAm(gewaehlterTag) : null;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Kalender</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">
        Was die ganze Firma angeht — Besprechungen, Schulungen, Messen, Feiertage. Geburtstage und
        eingetragene Abwesenheiten stehen automatisch mit drin.
      </p>

      {fehler && <div className="card mb-4 border-coral/40 text-sm text-coral">{fehler}</div>}

      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() - 1, 1))} className="btn-ghost text-xs">‹ Zurück</button>
          <span className="font-display font-semibold text-textMain text-sm">
            {monat.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() + 1, 1))} className="btn-ghost text-xs">Weiter ›</button>
          <button onClick={() => { setMonat(new Date()); setGewaehlterTag(null); }} className="btn-ghost text-xs text-textMuted">Heute</button>
        </div>
        <button onClick={() => { setFormularOffen((v) => !v); setEntwurf((e) => ({ ...e, von: e.von || heute })); }} className="btn text-xs">
          {formularOffen ? "Abbrechen" : "+ Eintrag"}
        </button>
      </div>

      {formularOffen && (
        <div className="card mb-4 flex flex-col gap-2">
          <input className="input" placeholder="Worum geht es?" value={entwurf.titel} maxLength={120}
            onChange={(e) => setEntwurf((z) => ({ ...z, titel: e.target.value }))} />
          <div className="flex items-center gap-2 flex-wrap">
            <select className="input !w-auto" value={entwurf.art} onChange={(e) => setEntwurf((z) => ({ ...z, art: e.target.value }))}>
              {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.symbol} {a.label}</option>)}
            </select>
            <input type="date" className="input !w-auto" value={entwurf.von} onChange={(e) => setEntwurf((z) => ({ ...z, von: e.target.value }))} />
            <span className="text-xs text-textMuted">bis</span>
            <input type="date" className="input !w-auto" value={entwurf.bis} onChange={(e) => setEntwurf((z) => ({ ...z, bis: e.target.value }))} />
            <input className="input !w-24" placeholder="14:00" maxLength={5} value={entwurf.uhrzeit}
              onChange={(e) => setEntwurf((z) => ({ ...z, uhrzeit: e.target.value }))} />
          </div>
          <textarea className="input" rows={2} placeholder="Ergänzung (optional)" value={entwurf.beschreibung} maxLength={500}
            onChange={(e) => setEntwurf((z) => ({ ...z, beschreibung: e.target.value }))} />
          <div className="flex items-center gap-2">
            <button disabled={busy || !entwurf.titel.trim() || !entwurf.von} onClick={speichern} className="btn text-xs disabled:opacity-40">
              {busy ? "Speichert…" : "Eintragen"}
            </button>
            <span className="text-[11px] text-textMuted">Sichtbar für alle in deiner Organisation. „bis“ nur bei mehrtägigen Terminen.</span>
          </div>
        </div>
      )}

      {laedt ? (
        <p className="text-textMuted text-sm">Lädt…</p>
      ) : (
        <>
          {/* Das Logo der eigenen Organisation liegt hinter dem Raster —
              blass genug, dass die Tage lesbar bleiben, und ohne Klickfläche,
              damit es die Tages-Knöpfe nicht abfängt. */}
          <div className="card mb-4 relative overflow-hidden">
            {daten?.organisation?.logo_url && (
              <img
                src={daten.organisation.logo_url}
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none absolute inset-0 m-auto w-2/3 max-h-[70%] object-contain opacity-[0.07]"
              />
            )}
            <div className="relative grid grid-cols-7 gap-1 mb-1">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((t) => (
                <div key={t} className="text-[10px] uppercase tracking-wide text-textMuted text-center">{t}</div>
              ))}
            </div>
            <div className="relative grid grid-cols-7 gap-1">
              {tage.map((tag, i) => {
                if (!tag) return <div key={`leer-${i}`} />;
                const inhalt = eintraegeAm(tag);
                const anzahl = inhalt.termine.length + inhalt.geburtstage.length;
                const istHeute = tagesSchluessel(tag) === heute;
                const gewaehlt = gewaehlterTag && istGleicherTag(tag, gewaehlterTag);
                return (
                  <button key={tag.toISOString()}
                    onClick={() => setGewaehlterTag(gewaehlt ? null : tag)}
                    className={`aspect-square rounded-lg border p-1 flex flex-col items-center justify-start text-xs
                      ${gewaehlt ? "border-amber bg-amber/10" : istHeute ? "border-amber/40" : "border-line"}
                      ${anzahl ? "text-textMain" : "text-textMuted"} hover:border-amber/60`}>
                    <span className={istHeute ? "font-bold" : ""}>{tag.getDate()}</span>
                    <span className="flex flex-wrap justify-center gap-0.5 mt-0.5 leading-none">
                      {inhalt.geburtstage.length > 0 && <span title="Geburtstag">🎂</span>}
                      {inhalt.termine.slice(0, 3).map((e) => <span key={e.id} title={e.titel}>{symbolFuer(e.art)}</span>)}
                      {inhalt.abwesend.length > 0 && <span title="jemand abwesend" className="opacity-60">🌴</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {tagesDetail && (
            <div className="card mb-4">
              <div className="font-semibold text-textMain text-sm mb-2">
                {gewaehlterTag.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
              </div>
              {tagesDetail.geburtstage.map((g) => (
                <div key={`geb-${g.id}`} className="flex items-center gap-2.5 py-1.5 cursor-pointer" onClick={() => openProfile(g.id)}>
                  <span>🎂</span>
                  <Avatar name={g.name} src={g.avatar_url} size={24} />
                  <span className="text-sm text-textMain">{g.name} hat Geburtstag</span>
                </div>
              ))}
              {tagesDetail.termine.map((e) => (
                <div key={e.id} className="flex items-start gap-2.5 py-1.5">
                  <span>{symbolFuer(e.art)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-textMain">{e.titel}{e.uhrzeit && <span className="text-textMuted"> · {e.uhrzeit}</span>}</div>
                    {e.beschreibung && <div className="text-[11px] text-textMuted">{e.beschreibung}</div>}
                    <div className="text-[11px] text-textMuted">von {e.autor}</div>
                  </div>
                  <button onClick={() => loeschen(e.id, e.titel)} className="btn-ghost text-xs text-coral flex-shrink-0">Entfernen</button>
                </div>
              ))}
              {tagesDetail.abwesend.map((a) => (
                <div key={`abw-${a.id}`} className="text-[11px] text-textMuted py-1">🌴 {a.name} ist abwesend</div>
              ))}
              {tagesDetail.termine.length === 0 && tagesDetail.geburtstage.length === 0 && tagesDetail.abwesend.length === 0 && (
                <p className="text-textMuted text-xs">Für diesen Tag ist nichts eingetragen.</p>
              )}
            </div>
          )}

          <div className="text-[11px] uppercase tracking-wide text-textMuted mb-2">Dieser Monat</div>
          {daten?.eintraege.length === 0 && daten?.geburtstage.length === 0 ? (
            <p className="text-textMuted text-sm">Noch nichts eingetragen.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {daten?.geburtstage.map((g) => (
                <div key={`l-geb-${g.id}`} className="flex items-center gap-2.5 text-sm">
                  <span className="font-mono text-xs text-textMuted w-12">{g.tag.slice(8)}.{g.tag.slice(5, 7)}.</span>
                  <span>🎂</span>
                  <span className="text-textMain">{g.name}</span>
                </div>
              ))}
              {daten?.eintraege.map((e) => (
                <div key={`l-${e.id}`} className="flex items-center gap-2.5 text-sm">
                  <span className="font-mono text-xs text-textMuted w-12">{e.von.slice(8)}.{e.von.slice(5, 7)}.</span>
                  <span>{symbolFuer(e.art)}</span>
                  <span className="text-textMain min-w-0 truncate">{e.titel}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
