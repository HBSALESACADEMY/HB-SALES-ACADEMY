import { useEffect, useMemo, useState } from "react";
import Layout, { getCachedOrg } from "../components/Layout";
import InfoCard from "../components/InfoCard";
import { supabase } from "../lib/supabaseClient";
import { getActiveOrgId } from "../lib/activeOrg";
import { resolveObjectionCategories } from "../lib/objectionCategories";
import { DEFAULT_OBJECTIONS } from "../lib/objections";
import { meldeFehler } from "../lib/errorBus";
import BereichsTabs, { TRAINING } from "../components/BereichsTabs";

// Lernfortschritt pro Gerät. Schlüssel bewusst unverändert aus der früheren
// HTML-Fassung übernommen, damit bereits Geübtes erhalten bleibt.
const STORAGE_KEY = "hb_et_objection_trainer_progress";

const MODES = [["professionell", "Professionell (Sie)"], ["entspannt", "Entspannt (Du)"]];

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) { return {}; }
}

// Gewichtete Zufallsauswahl: was man üben muss, kommt deutlich häufiger dran
// als was man schon sicher kann.
function weightOf(progress, item) {
  const status = progress[item.id];
  if (status === "practice") return 4;
  if (status === "learned") return 1;
  return 2;
}

export default function EinwandTrainer() {
  const [org, setOrg] = useState(getCachedOrg());
  const [customObjections, setCustomObjections] = useState([]);
  const [progress, setProgress] = useState({});
  const [mode, setMode] = useState("professionell");
  const [activeCat, setActiveCat] = useState("all");
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [ready, setReady] = useState(false);

  const categories = useMemo(() => resolveObjectionCategories(org), [org]);
  const catLabel = useMemo(() => Object.fromEntries(categories.map((c) => [c.key, c.label])), [categories]);
  const objections = useMemo(() => [...DEFAULT_OBJECTIONS, ...customObjections], [customObjections]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setProgress(loadProgress());
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (mounted) setReady(true); return; }

      let orgRow = getCachedOrg();
      const { data: me } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const activeOrgId = getActiveOrgId(me);
      if (!orgRow && activeOrgId) {
        const { data } = await supabase.from("organizations").select("*").eq("id", activeOrgId).maybeSingle();
        orgRow = data;
      }
      // Eigene Einwand-Szenarien der Organisation dazumischen (siehe
      // pages/admin/objections.js). Fehlt die Du-Variante, wird die
      // Sie-Variante verwendet, damit der Modus-Umschalter nie leer läuft.
      let custom = [];
      if (activeOrgId) {
        const { data: rows } = await supabase.from("custom_objections").select("*").eq("organization_id", activeOrgId).order("created_at");
        custom = (rows || []).map((r) => ({
          id: "c_" + r.id, cat: r.cat,
          q_pro: r.q_pro, a_pro: r.a_pro,
          q_ent: r.q_ent || r.q_pro, a_ent: r.a_ent || r.a_pro,
          tip: r.tip || "",
        }));
      }
      if (!mounted) return;
      if (orgRow) setOrg(orgRow);
      setCustomObjections(custom);
      setReady(true);
    })();
    return () => { mounted = false; };
  }, []);

  const pool = useMemo(
    () => objections.filter((o) => activeCat === "all" || o.cat === activeCat),
    [objections, activeCat]
  );

  function pickNext(fromPool = pool, prog = progress, avoid = current) {
    if (!fromPool.length) { setCurrent(null); setRevealed(false); return; }
    let candidates = fromPool;
    if (fromPool.length > 1 && avoid) {
      const without = fromPool.filter((i) => i.id !== avoid.id);
      if (without.length) candidates = without;
    }
    const weights = candidates.map((c) => weightOf(prog, c));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let chosen = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = candidates[i]; break; }
    }
    setCurrent(chosen);
    setRevealed(false);
  }

  // Erste Karte ziehen bzw. nach Kategoriewechsel neu ziehen.
  useEffect(() => {
    if (!ready) return;
    pickNext(pool, progress, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeCat, objections]);

  function rate(status) {
    const next = { ...progress, [current.id]: status };
    setProgress(next);
    // Früher stumm: der Lernfortschritt war beim nächsten Laden weg, ohne
    // dass irgendwo stand warum (z.B. privates Fenster, voller Speicher).
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      meldeFehler("Dein Lernfortschritt kann auf diesem Gerät nicht gespeichert werden — beim Neuladen beginnt er wieder von vorn.", e);
    }
    pickNext(pool, next, current);
  }

  function resetProgress() {
    if (!confirm("Lernfortschritt wirklich komplett zurücksetzen?")) return;
    setProgress({});
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* nichts zu tun */ }
    pickNext(pool, {}, current);
  }

  const stats = useMemo(() => {
    let learned = 0, practice = 0;
    objections.forEach((o) => {
      if (progress[o.id] === "learned") learned++;
      else if (progress[o.id] === "practice") practice++;
    });
    return { learned, practice, total: learned + practice };
  }, [objections, progress]);

  if (!ready) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  const question = current ? (mode === "professionell" ? current.q_pro : current.q_ent) : null;
  const answer = current ? (mode === "professionell" ? current.a_pro : current.a_ent) : null;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Einwand-Trainer</h1>
      <div className="brand-stripe w-16 mb-4" />
      <BereichsTabs tabs={TRAINING} />

      <InfoCard>
        Es erscheint ein Einwand, wie ihn Kund:innen im Gespräch bringen. Überlege dir erst deine eigene Antwort, decke dann die
        <strong> Musterantwort</strong> auf und bewerte dich ehrlich. Was du auf <strong>„Muss ich üben"</strong> setzt, kommt danach
        deutlich häufiger dran. Über den Umschalter oben wählst du zwischen <strong>Sie</strong> und <strong>Du</strong>.
        Eigene Einwände könnt ihr unter „Verwaltung → Eigene Einwände" ergänzen.
      </InfoCard>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {MODES.map(([key, label]) => (
          <button key={key} onClick={() => setMode(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${mode === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Geübt", value: stats.total, cls: "text-amber" },
          { label: "Sicher", value: stats.learned, cls: "text-teal" },
          { label: "Üben", value: stats.practice, cls: "text-coral" },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <div className={`text-2xl font-display font-semibold ${s.cls}`}>{s.value}</div>
            <div className="text-[10.5px] uppercase tracking-wide text-textMuted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {[["all", "Alle"], ...categories.map((c) => [c.key, c.label])].map(([key, label]) => (
          <button key={key} onClick={() => setActiveCat(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${activeCat === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {label}
          </button>
        ))}
      </div>

      {!current ? (
        <p className="text-textMuted text-sm">Keine Einwände in dieser Kategorie.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10.5px] uppercase tracking-wide text-textMuted">Kunde sagt</span>
            <span className="text-[10.5px] uppercase tracking-wide text-amber border border-amber/40 rounded-full px-2 py-0.5">
              {catLabel[current.cat] || current.cat}
            </span>
          </div>

          <div className="card mb-3 border-l-[3px] border-l-amber">
            <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-1.5">Einwand</div>
            <p className="text-lg font-display font-semibold text-textMain leading-snug">{question}</p>
          </div>

          {!revealed ? (
            <button onClick={() => setRevealed(true)}
              className="w-full py-4 rounded-xl border border-dashed border-amber/50 text-amber text-sm font-semibold hover:border-amber transition mb-3">
              Antwort aufdecken
            </button>
          ) : (
            <>
              <div className="card mb-3 border-l-[3px] border-l-teal">
                <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-1.5">Musterantwort</div>
                <p className="text-sm text-textMain leading-relaxed">{answer}</p>
                {current.tip && (
                  <p className="text-xs text-amber mt-3 pt-3 border-t border-line">
                    <strong>Tipp:</strong> {current.tip}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => rate("practice")} className="btn-ghost flex-1 justify-center py-3 border-coral/40 text-coral">😬 Muss ich üben</button>
                <button onClick={() => rate("learned")} className="btn-ghost flex-1 justify-center py-3 border-teal/40 text-teal">✅ Kannte ich</button>
              </div>
            </>
          )}

          <button disabled={!revealed} onClick={() => pickNext(pool, progress, current)}
            className="btn w-full justify-center disabled:opacity-40">
            Nächster Einwand
          </button>
        </>
      )}

      <div className="text-center mt-6">
        <button onClick={resetProgress} className="text-textMuted text-xs underline hover:text-textMain">Lernfortschritt zurücksetzen</button>
      </div>
    </Layout>
  );
}
