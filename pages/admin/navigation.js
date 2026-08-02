import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import { supabase } from "../../lib/supabaseClient";

const ICONS = ["dashboard", "book", "chat", "library", "award", "lock", "download", "search", "flame", "users", "target", "calendar"];

function IconPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {ICONS.map((ic) => (
        <button
          key={ic} type="button" title={ic} onClick={() => onChange(ic)}
          className={`w-9 h-9 rounded-lg border flex items-center justify-center transition ${value === ic ? "border-amber bg-amber/10 text-amber" : "border-line text-textMuted hover:border-[var(--org-color-1,#4A3565)] hover:text-textMain"}`}
        >
          <Icon name={ic} size={16} />
        </button>
      ))}
    </div>
  );
}

export default function NavigationAdmin() {
  const [isManager, setIsManager] = useState(true);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState({}); // id -> { label, icon }
  const [newFolder, setNewFolder] = useState({ label: "", icon: "book" });
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
    if (!me || (me.role !== "manager" && me.role !== "trainer")) {
      setIsManager(false);
      setLoading(false);
      return;
    }
    const { data, error: err } = await supabase.from("nav_items").select("*").order("order_index");
    if (err) setError(err.message);
    setItems(data || []);
    setDrafts(Object.fromEntries((data || []).map((n) => [n.id, { label: n.label, icon: n.icon }])));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function setDraft(id, patch) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function saveItem(id) {
    setError("");
    const draft = drafts[id];
    const { error: err } = await supabase.from("nav_items").update({ label: draft.label, icon: draft.icon }).eq("id", id);
    if (err) setError(err.message);
    else await load();
  }

  async function toggleVisible(item) {
    setError("");
    const { error: err } = await supabase.from("nav_items").update({ visible: !item.visible }).eq("id", item.id);
    if (err) setError(err.message);
    else await load();
  }

  async function deleteItem(item) {
    setError("");
    const { error: err } = await supabase.from("nav_items").delete().eq("id", item.id);
    if (err) setError(err.message);
    else await load();
  }

  async function move(item, dir) {
    setError("");
    const idx = items.findIndex((i) => i.id === item.id);
    const swapWith = items[idx + dir];
    if (!swapWith) return;
    await Promise.all([
      supabase.from("nav_items").update({ order_index: swapWith.order_index }).eq("id", item.id),
      supabase.from("nav_items").update({ order_index: item.order_index }).eq("id", swapWith.id),
    ]);
    await load();
  }

  async function createFolder() {
    if (!newFolder.label.trim()) return;
    setCreating(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const key = "custom-" + Date.now();
    const maxOrder = items.reduce((m, i) => Math.max(m, i.order_index), 0);
    const { error: err } = await supabase.from("nav_items").insert({
      key, label: newFolder.label.trim(), icon: newFolder.icon, is_builtin: false,
      requires_manager: false, order_index: maxOrder + 1, created_by: session.user.id,
    });
    if (err) setError(err.message);
    else { setNewFolder({ label: "", icon: "book" }); await load(); }
    setCreating(false);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Navigation verwalten</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Konten mit der Rolle "manager" verfügbar.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Navigation verwalten</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Sidebar frei anpassen: Reiter umbenennen, Icon ändern, Reihenfolge ändern, ausblenden oder entfernen — auch die fest eingebauten. Entfernen löscht bei eigenen Ordnern auch deren Kurse; bei fest eingebauten Seiten verschwindet nur der Sidebar-Link, die Seite bleibt erreichbar.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3">Neuen Ordner/Reiter anlegen</div>
        <div className="flex items-center gap-2 mb-3">
          <input className="input flex-1" placeholder="Name (z. B. Produktschulungen)" value={newFolder.label} onChange={(e) => setNewFolder({ ...newFolder, label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && createFolder()} />
          <button disabled={creating || !newFolder.label.trim()} onClick={createFolder} className="btn disabled:opacity-40 flex-shrink-0">Anlegen</button>
        </div>
        <div className="text-xs text-textMuted mb-2">Icon wählen</div>
        <IconPicker value={newFolder.icon} onChange={(icon) => setNewFolder({ ...newFolder, icon })} />
      </div>

      <div className="flex flex-col gap-2.5">
        {items.map((item, idx) => {
          const draft = drafts[item.id] || { label: item.label, icon: item.icon };
          return (
            <div key={item.id} className={`card ${!item.visible ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3 flex-wrap mb-3">
                <Icon name={draft.icon} size={16} />
                <input className="input flex-1 min-w-[140px]" value={draft.label} onChange={(e) => setDraft(item.id, { label: e.target.value })} />
                <button onClick={() => saveItem(item.id)} className="btn-ghost text-xs">Speichern</button>
                <div className="flex items-center gap-1">
                  <button disabled={idx === 0} onClick={() => move(item, -1)} className="btn-ghost text-xs disabled:opacity-30">↑</button>
                  <button disabled={idx === items.length - 1} onClick={() => move(item, 1)} className="btn-ghost text-xs disabled:opacity-30">↓</button>
                </div>
                <button onClick={() => toggleVisible(item)} className="btn-ghost text-xs">{item.visible ? "Ausblenden" : "Einblenden"}</button>
                <button onClick={() => deleteItem(item)} className="btn-ghost text-xs text-coral">Entfernen</button>
              {item.is_builtin ? (
                <span className="text-[10px] uppercase tracking-wide text-textMuted border border-line rounded px-1.5 py-0.5">Fest</span>
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-teal border border-teal/40 rounded px-1.5 py-0.5">Ordner</span>
              )}
              {item.requires_manager && <span className="text-[10px] uppercase tracking-wide text-amber border border-amber/40 rounded px-1.5 py-0.5">Nur Manager</span>}
              </div>
              <IconPicker value={draft.icon} onChange={(icon) => setDraft(item.id, { icon })} />
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
