import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";

const emptyForm = { name: "", phone: "", email: "", company: "", website: "", notes: "" };

const TABS = [
  ["kunde", "Kunden"],
  ["absage", "Absagen"],
];

export default function Kunden() {
  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState(null);
  const [canDeleteTeam, setCanDeleteTeam] = useState(false);
  const [canSeeTeam, setCanSeeTeam] = useState(false);
  const [viewMode, setViewMode] = useState("own"); // 'own' | 'team'
  const [outcomeTab, setOutcomeTab] = useState("kunde"); // 'kunde' | 'absage'
  const [customers, setCustomers] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function load(silent) {
    if (!silent) setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle();
    const canManage = !!(me?.role === "manager" || me?.role === "backend" || me?.is_admin || me?.is_platform_admin);
    setCanSeeTeam(canManage);
    setSelfId(session.user.id);
    // "backend" darf Leads laut RLS zwar einsehen/bearbeiten, aber nicht
    // löschen (leads_delete) — der Löschen-Button darf für fremde Einträge
    // deshalb nur bei Manager/Admin/Plattform-Admin erscheinen.
    setCanDeleteTeam(!!(me?.role === "manager" || me?.is_admin || me?.is_platform_admin));
    if (me?.role === "backend" && viewMode === "own") { setViewMode("team"); return; }

    let query = supabase.from("leads").select("*").eq("outcome", outcomeTab).order("created_at", { ascending: false });
    if (!(canManage && viewMode === "team")) query = query.eq("created_by", session.user.id);
    const { data: rows, error: err } = await query;
    if (err) setError(err.message);
    setCustomers(rows || []);

    if (canManage && viewMode === "team") {
      const creatorIds = [...new Set((rows || []).map((l) => l.created_by))];
      if (creatorIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", creatorIds);
        const map = {};
        (profiles || []).forEach((p) => { map[p.id] = p; });
        setProfileMap(map);
      }
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 20000);
    return () => clearInterval(interval);
  }, [viewMode, outcomeTab]);

  async function addCustomer() {
    if (!form.name.trim()) { setError("Name ist erforderlich."); return; }
    setSaving(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("leads").insert({
      created_by: session.user.id,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      website: form.website.trim() || null,
      notes: form.notes.trim() || null,
      outcome: "kunde",
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setForm(emptyForm);
    setShowAddForm(false);
    setSaving(false);
    await load();
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      company: c.company || "",
      website: c.website || "",
      notes: c.notes || "",
    });
  }

  async function saveEdit(id) {
    if (!editForm.name.trim()) { setError("Name ist erforderlich."); return; }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("leads").update({
      name: editForm.name.trim(),
      phone: editForm.phone.trim() || null,
      email: editForm.email.trim() || null,
      company: editForm.company.trim() || null,
      website: editForm.website.trim() || null,
      notes: editForm.notes.trim() || null,
    }).eq("id", id);
    if (err) { setError(err.message); setSaving(false); return; }
    setEditingId(null);
    setSaving(false);
    await load();
  }

  async function deleteCustomer(id) {
    setSaving(true);
    const { error: err } = await supabase.from("leads").delete().eq("id", id);
    if (err) { setError(err.message); setSaving(false); return; }
    setConfirmDelete(null);
    setSaving(false);
    await load();
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-semibold brand-text-gradient mb-1">Erfolge und Abschlüsse</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">Kunden, die aus einem Termin geworden sind — oder direkt manuell eingetragen. Absagen findest du im entsprechenden Reiter.</p>

      <div className="flex items-center gap-2 mb-3">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => { setOutcomeTab(key); setShowAddForm(false); setEditingId(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${outcomeTab === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
        {canSeeTeam ? (
          <div className="flex items-center gap-2">
            {[["own", "Meine"], ["team", "Alle im Team"]].map(([key, label]) => (
              <button key={key} onClick={() => setViewMode(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${viewMode === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                {label}
              </button>
            ))}
          </div>
        ) : <div />}
        {outcomeTab === "kunde" && (
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn text-xs">
            {showAddForm ? "Abbrechen" : "+ Erfolg hinzufügen"}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="card mb-5">
          <div className="font-semibold text-textMain text-sm mb-3">Neuen Kunden/Abschluss eintragen</div>
          <div className="flex flex-col gap-2.5">
            <input className="input" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2.5">
              <input className="input" placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className="input" placeholder="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="input" placeholder="Unternehmen" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              <input className="input" placeholder="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <textarea className="input" placeholder="Notiz (optional)" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button disabled={saving} onClick={addCustomer} className="btn text-xs w-fit disabled:opacity-40">
              {saving ? "Speichert..." : "Speichern"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="flex flex-col gap-3">
        {customers.map((c) => {
          const owner = profileMap[c.created_by];
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} className="card">
              {isEditing ? (
                <div className="flex flex-col gap-2.5">
                  <input className="input" placeholder="Name *" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2.5">
                    <input className="input" placeholder="Telefon" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                    <input className="input" placeholder="E-Mail" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                    <input className="input" placeholder="Unternehmen" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
                    <input className="input" placeholder="Website" value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} />
                  </div>
                  <textarea className="input" placeholder="Notiz (optional)" rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <button disabled={saving} onClick={() => saveEdit(c.id)} className="btn text-xs disabled:opacity-40">
                      {saving ? "Speichert..." : "Speichern"}
                    </button>
                    <button disabled={saving} onClick={() => setEditingId(null)} className="btn-ghost text-xs">Abbrechen</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-display font-semibold text-textMain">{c.name}</div>
                      <div className="text-xs text-textMuted mt-0.5">{c.company || "Kein Unternehmen angegeben"}</div>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 flex-shrink-0 border ${outcomeTab === "kunde" ? "text-teal border-teal/40" : "text-coral border-coral/40"}`}>
                      {outcomeTab === "kunde" ? "Kunde" : "Absage"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-textMuted">
                    {c.phone && <span>📞 {c.phone}</span>}
                    {c.email && <span>✉️ {c.email}</span>}
                    {c.website && <span>🌐 {c.website}</span>}
                    {viewMode === "team" && owner && (
                      <button onClick={() => openProfile(owner.id)} className="flex items-center gap-1.5 hover:text-textMain">
                        <Avatar name={owner.full_name || "?"} src={owner.avatar_url} size={16} /> {owner.full_name || "Unbenannt"}
                      </button>
                    )}
                  </div>
                  {c.notes && <p className="text-sm text-textMain mt-2">{c.notes}</p>}

                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-line">
                    <button onClick={() => startEdit(c)} className="btn-ghost text-xs">Bearbeiten</button>
                    {(c.created_by === selfId || canDeleteTeam) && (
                      confirmDelete === c.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-coral">Wirklich löschen?</span>
                          <button disabled={saving} onClick={() => deleteCustomer(c.id)} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ja, löschen</button>
                          <button disabled={saving} onClick={() => setConfirmDelete(null)} className="btn-ghost text-xs">Abbrechen</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDelete(c.id)} className="btn-ghost text-xs text-coral">Löschen</button>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {customers.length === 0 && (
          <p className="text-textMuted text-sm">
            {outcomeTab === "kunde"
              ? 'Noch keine Kunden — markiere einen Termin unter "Termine" als "Kunde geworden" oder trage einen Erfolg oben direkt manuell ein.'
              : 'Noch keine Absagen — markiere einen Termin unter "Termine" als "Absage".'}
          </p>
        )}
      </div>
    </Layout>
  );
}
