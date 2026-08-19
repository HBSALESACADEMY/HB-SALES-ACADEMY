import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { loescheGeprueft } from "../lib/loeschen";

export default function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [isManager, setIsManager] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "", title: "", body: "", file: null, visibility: "org" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const [{ data: me }, { data: ownTeams }] = await Promise.all([
        supabase.from("profiles").select("role, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle(),
        supabase.from("teams").select("id").eq("created_by", session.user.id).limit(1),
      ]);
      // Teamleads dürfen Skripte genauso verwalten wie Manager/Admins — siehe
      // is_team_lead() in der RLS-Policy (migration_52).
      setIsManager(me?.role === "manager" || !!me?.is_admin || !!me?.is_platform_admin || (ownTeams || []).length > 0);
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
    setFormError("");
    if (!form.title.trim() || !form.body.trim()) {
      setFormError("Bitte Titel und Skript-Text ausfüllen.");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      let fileUrl = null, fileName = null;
      if (form.file) {
        const ext = form.file.name.split(".").pop();
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("script-files").upload(path, form.file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("script-files").getPublicUrl(path);
        fileUrl = pub.publicUrl;
        fileName = form.file.name;
      }

      const { error } = await supabase.from("scripts").insert({
        category: form.category.trim() || "Allgemein", title: form.title.trim(), body: form.body.trim(),
        file_url: fileUrl, file_name: fileName, visibility: form.visibility, created_by: session.user.id,
      });
      if (error) throw error;

      setForm({ category: "", title: "", body: "", file: null, visibility: "org" });
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError("Speichern fehlgeschlagen: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteScript(id) {
    if (!confirm("Skript wirklich löschen?")) return;
    const loeschFehler = await loescheGeprueft(supabase.from("scripts").delete().eq("id", id));
    const error = loeschFehler ? { message: loeschFehler } : null;
    if (error) { alert(error.message); return; }
    await load();
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditError("");
    setEditForm({
      category: s.category, title: s.title, body: s.body, visibility: s.visibility,
      file: null, existingFileUrl: s.file_url, existingFileName: s.file_name,
    });
  }

  async function saveEdit(id) {
    setEditError("");
    if (!editForm.title.trim() || !editForm.body.trim()) {
      setEditError("Bitte Titel und Skript-Text ausfüllen.");
      return;
    }
    setEditSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      let fileUrl = editForm.existingFileUrl, fileName = editForm.existingFileName;
      if (editForm.file) {
        const ext = editForm.file.name.split(".").pop();
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("script-files").upload(path, editForm.file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("script-files").getPublicUrl(path);
        fileUrl = pub.publicUrl;
        fileName = editForm.file.name;
      }

      const { error } = await supabase.from("scripts").update({
        category: editForm.category.trim() || "Allgemein", title: editForm.title.trim(), body: editForm.body.trim(),
        file_url: fileUrl, file_name: fileName, visibility: editForm.visibility,
      }).eq("id", id);
      if (error) throw error;

      setEditingId(null);
      setEditForm(null);
      await load();
    } catch (e) {
      setEditError("Speichern fehlgeschlagen: " + e.message);
    } finally {
      setEditSaving(false);
    }
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
        <h1 className="text-2xl font-display font-medium brand-text-gradient">Skript-Bibliothek</h1>
        {isManager && <button onClick={() => { setFormError(""); setShowForm(true); }} className="btn text-xs flex-shrink-0">+ Neues Skript</button>}
      </div>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Bewährte Gesprächsbausteine — suchen, ansehen, mit einem Klick kopieren.</p>

      <div className="card flex items-center gap-2 mb-5">
        <Icon name="search" size={15} />
        <input className="bg-transparent border-none outline-none text-sm flex-1 text-textMain" placeholder="Skripte durchsuchen..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {showForm && (
        <div className="card mb-5">
          {formError && <p className="text-coral text-xs mb-2">{formError}</p>}
          <input className="input mb-2" placeholder="Kategorie (z.B. Begrüßung, Abschluss)" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          <input className="input mb-2" placeholder="Titel" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <textarea className="input mb-2" rows={4} placeholder="Skript-Text..." value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          <label className="btn-ghost text-xs cursor-pointer inline-flex items-center gap-1.5 mb-2 w-fit">
            <Icon name="download" size={12} /> {form.file ? form.file.name : "Datei anhängen (optional)"}
            <input type="file" className="hidden" onChange={(e) => setForm((f) => ({ ...f, file: e.target.files[0] || null }))} />
          </label>
          <div className="flex items-center gap-2 mb-3">
            {[["org", "Ganzes Unternehmen"], ["private", "Nur für mich"]].map(([key, label]) => (
              <button key={key} onClick={() => setForm((f) => ({ ...f, visibility: key }))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${form.visibility === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button disabled={saving} onClick={() => setShowForm(false)} className="btn-ghost text-xs flex-1 disabled:opacity-40">Abbrechen</button>
            <button disabled={saving} onClick={saveScript} className="btn text-xs flex-1 justify-center disabled:opacity-40">{saving ? "Speichert..." : "Speichern"}</button>
          </div>
        </div>
      )}

      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category} className="mb-6">
          <div className="text-xs text-textMuted uppercase tracking-wide mb-2.5">{category}</div>
          <div className="flex flex-col gap-3">
            {items.map((s) => {
              if (editingId === s.id) {
                return (
                  <div key={s.id} className="card">
                    {editError && <p className="text-coral text-xs mb-2">{editError}</p>}
                    <input className="input mb-2" placeholder="Kategorie (z.B. Begrüßung, Abschluss)" value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} />
                    <input className="input mb-2" placeholder="Titel" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} />
                    <textarea className="input mb-2" rows={4} placeholder="Skript-Text..." value={editForm.body} onChange={(e) => setEditForm((f) => ({ ...f, body: e.target.value }))} />
                    <label className="btn-ghost text-xs cursor-pointer inline-flex items-center gap-1.5 mb-2 w-fit">
                      <Icon name="download" size={12} /> {editForm.file ? editForm.file.name : (editForm.existingFileUrl ? editForm.existingFileName || "Anhang ersetzen" : "Datei anhängen (optional)")}
                      <input type="file" className="hidden" onChange={(e) => setEditForm((f) => ({ ...f, file: e.target.files[0] || null }))} />
                    </label>
                    <div className="flex items-center gap-2 mb-3">
                      {[["org", "Ganzes Unternehmen"], ["private", "Nur für mich"]].map(([key, label]) => (
                        <button key={key} onClick={() => setEditForm((f) => ({ ...f, visibility: key }))}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${editForm.visibility === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button disabled={editSaving} onClick={() => { setEditingId(null); setEditForm(null); }} className="btn-ghost text-xs flex-1 disabled:opacity-40">Abbrechen</button>
                      <button disabled={editSaving} onClick={() => saveEdit(s.id)} className="btn text-xs flex-1 justify-center disabled:opacity-40">{editSaving ? "Speichert..." : "Speichern"}</button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={s.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-display font-semibold text-textMain text-sm flex items-center gap-2">
                      {s.title}
                      {s.visibility === "private" && <span className="text-[10px] uppercase tracking-wide text-violet border border-violet/40 rounded px-1.5 py-0.5">Nur für dich</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => copy(s)} className="btn-ghost text-xs">
                        {copiedId === s.id ? "Kopiert!" : <><Icon name="copy" size={12} /> Kopieren</>}
                      </button>
                      {isManager && <button onClick={() => startEdit(s)} className="btn-ghost text-xs">Bearbeiten</button>}
                      {isManager && <button onClick={() => deleteScript(s.id)} className="btn-ghost text-xs text-coral">Löschen</button>}
                    </div>
                  </div>
                  <p className="text-sm text-textMuted whitespace-pre-wrap">{s.body}</p>
                  {s.file_url && (
                    <a href={s.file_url} target="_blank" rel="noreferrer" className="btn-ghost text-xs mt-2.5 inline-flex items-center gap-1.5 w-fit">
                      <Icon name="download" size={12} /> {s.file_name || "Anhang"}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <p className="text-textMuted text-sm">Keine Treffer.</p>}
    </Layout>
  );
}
