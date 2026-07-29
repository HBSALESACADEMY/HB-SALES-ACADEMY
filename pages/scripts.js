import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";

export default function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [isManager, setIsManager] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "", title: "", body: "" });

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      setIsManager(me?.role === "manager");
    }
    const { data } = await supabase.from("scripts").select("*").order("category").order("title");
    setScripts(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function copy(s) {
    navigator.clipboard.writeText(s.body);
    setCopiedId(s.id);
    setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 1500);
  }

  async function saveScript() {
    if (!form.title.trim() || !form.body.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("scripts").insert({
      category: form.category.trim() || "Allgemein", title: form.title.trim(), body: form.body.trim(), created_by: session.user.id,
    });
    setForm({ category: "", title: "", body: "" });
    setShowForm(false);
    await load();
  }

  async function deleteScript(id) {
    if (!confirm("Skript wirklich löschen?")) return;
    await supabase.from("scripts").delete().eq("id", id);
    await load();
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  const filtered = scripts.filter((s) =>
    s.title.toLowerCase().includes(query.toLowerCase()) ||
    s.category.toLowerCase().includes(query.toLowerCase()) ||
    s.body.toLowerCase().includes(query.toLowerCase())
  );
  const byCategory = {};
  filtered.forEach((s) => { byCategory[s.category] = byCategory[s.category] || []; byCategory[s.category].push(s); });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-display font-bold brand-text-gradient">Skript-Bibliothek</h1>
        {isManager && <button onClick={() => setShowForm(true)} className="btn text-xs flex-shrink-0">+ Neues Skript</button>}
      </div>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Bewährte Gesprächsbausteine — suchen, ansehen, mit einem Klick kopieren.</p>

      <div className="card flex items-center gap-2 mb-5">
        <Icon name="search" size={15} />
        <input className="bg-transparent border-none outline-none text-sm flex-1 text-textMain" placeholder="Skripte durchsuchen..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {showForm && (
        <div className="card mb-5">
          <input className="input mb-2" placeholder="Kategorie (z.B. Begrüßung, Abschluss)" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          <input className="input mb-2" placeholder="Titel" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <textarea className="input mb-2" rows={4} placeholder="Skript-Text..." value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          <div className="flex items-center gap-2">
            <button onClick={() => setShowForm(false)} className="btn-ghost text-xs flex-1">Abbrechen</button>
            <button onClick={saveScript} className="btn text-xs flex-1 justify-center">Speichern</button>
          </div>
        </div>
      )}

      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category} className="mb-6">
          <div className="text-xs text-textMuted uppercase tracking-wide mb-2.5">{category}</div>
          <div className="flex flex-col gap-3">
            {items.map((s) => (
              <div key={s.id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-display font-semibold text-textMain text-sm">{s.title}</div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => copy(s)} className="btn-ghost text-xs">
                      {copiedId === s.id ? "Kopiert!" : <><Icon name="copy" size={12} /> Kopieren</>}
                    </button>
                    {isManager && <button onClick={() => deleteScript(s.id)} className="btn-ghost text-xs text-coral">Löschen</button>}
                  </div>
                </div>
                <p className="text-sm text-textMuted whitespace-pre-wrap">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <p className="text-textMuted text-sm">Keine Treffer.</p>}
    </Layout>
  );
}
