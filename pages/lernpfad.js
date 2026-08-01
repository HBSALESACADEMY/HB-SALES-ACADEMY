import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { COURSES } from "../lib/curriculum";

export default function Lernpfad() {
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [modules, setModules] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;

    const [{ data: me }, { data: er }, { data: pm }] = await Promise.all([
      supabase.from("profiles").select("is_admin, is_platform_admin").eq("id", uid).maybeSingle(),
      supabase.from("exam_results").select("course_id, passed").eq("user_id", uid),
      supabase.from("personal_modules").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
    ]);

    const isAdmin = !!me?.is_admin || !!me?.is_platform_admin;
    const allPassed = COURSES.every((c) => (er || []).some((r) => r.course_id === c.id && r.passed));
    setUnlocked(isAdmin || allPassed);
    setModules(pm || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      await apiPost("/api/personal-module-generate", {});
      await load();
    } catch (e) {
      setError(e.message || "Fehler bei der Generierung.");
    }
    setGenerating(false);
  }

  async function markDone(id) {
    await supabase.from("personal_modules").update({ completed_at: new Date().toISOString() }).eq("id", id);
    await load();
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!unlocked) {
    return (
      <Layout>
        <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Mein Lernpfad</h1>
        <div className="brand-stripe w-16 mb-4" />
        <div className="card text-center py-10">
          <p className="text-textMain font-semibold mb-1">Noch nicht freigeschaltet.</p>
          <p className="text-textMuted text-sm">Schließe zuerst alle 7 Grundkurse ab — danach schaltet sich dein persönlicher, auf dich zugeschnittener Lernpfad frei.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Mein Lernpfad</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Individuell auf dich zugeschnittene Zusatzmodule, erkannt aus deinen bisherigen Ergebnissen — es gibt hier immer wieder Neues.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <button disabled={generating} onClick={generate} className="btn mb-6 disabled:opacity-40">
        {generating ? "Generiert..." : "Neues Modul generieren"}
      </button>

      {modules.length === 0 ? (
        <p className="text-textMuted text-sm">Noch kein persönliches Modul erstellt — klicke oben, um dein erstes zu generieren.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {modules.map((m) => (
            <div key={m.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-amber mb-1">{m.focus_area}</div>
                  <div className="font-display text-base font-semibold text-textMain">{m.title}</div>
                </div>
                {m.completed_at ? (
                  <span className="text-teal text-xs flex items-center gap-1 flex-shrink-0"><Icon name="check" size={13} /> Erledigt</span>
                ) : (
                  <button onClick={() => markDone(m.id)} className="btn-ghost text-xs flex-shrink-0">Als erledigt markieren</button>
                )}
              </div>
              <p className="text-textMuted text-sm whitespace-pre-line mb-3">{m.theory}</p>
              <div className="border-t border-line pt-3">
                <div className="text-xs text-textMuted mb-1">Zum Üben:</div>
                <p className="text-sm text-textMain">{m.question}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
