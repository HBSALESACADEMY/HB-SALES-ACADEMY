import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import AdminTabs from "../../components/AdminTabs";
import { supabase } from "../../lib/supabaseClient";
import { getActiveOrgId } from "../../lib/activeOrg";
import { resolveObjectionCategories } from "../../lib/objectionCategories";
import { fasseZusammen, schluesselFuer } from "../../lib/grundVorschlag";
import { loescheGeprueft } from "../../lib/loeschen";

const EMPTY_DRAFT = { cat: "", q_pro: "", a_pro: "", q_ent: "", a_ent: "", tip: "" };

export default function ObjectionsAdmin() {
  const [isManager, setIsManager] = useState(true);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState(null);
  const [newDraft, setNewDraft] = useState(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [error, setError] = useState("");
  // Gründe, die aus dem Team kommen (migration_135).
  const [vorschlaege, setVorschlaege] = useState([]);
  const [vorschlagBusy, setVorschlagBusy] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
    if (!me || (me.role !== "manager" && !me.is_admin && !me.is_platform_admin)) {
      setIsManager(false);
      setLoading(false);
      return;
    }
    const orgId = getActiveOrgId(me);
    setActiveOrgId(orgId);
    if (!orgId) { setLoading(false); return; }
    const [{ data: org }, { data: objections, error: err }, { data: offene }] = await Promise.all([
      supabase.from("organizations").select("objection_categories").eq("id", orgId).maybeSingle(),
      supabase.from("custom_objections").select("*").eq("organization_id", orgId).order("created_at"),
      // Die Zugriffsregeln entscheiden, wer das sieht — hier steht deshalb
      // kein zweiter Organisationsfilter (migration_135).
      supabase.from("grund_vorschlaege").select("id, text, user_id, created_at")
        .eq("status", "offen").order("created_at", { ascending: false }).limit(500),
    ]);
    setVorschlaege(fasseZusammen(offene || []));
    const cats = resolveObjectionCategories(org);
    setCategories(cats);
    setNewDraft((d) => (d.cat ? d : { ...d, cat: cats[0]?.key || "" }));
    if (err) setError(err.message);
    setRows(objections || []);
    setLoading(false);
  }

  // Einen Vorschlag zur Kategorie machen.
  //
  // Zwei Schritte, die zusammengehören: die Kategorie kommt zur Liste der
  // Organisation, und alle Meldungen desselben Grundes gelten als erledigt.
  // Beim Übernehmen wird die bisherige Liste ausdrücklich mitgeschrieben —
  // stand dort noch nichts, galten die Standardkategorien, und die dürfen
  // dabei nicht verlorengehen.
  async function uebernehmeVorschlag(gruppe) {
    setVorschlagBusy(gruppe.form);
    setError("");
    const neueKategorie = { key: schluesselFuer(gruppe.text, categories), label: gruppe.text };
    const neueListe = [...categories, neueKategorie];

    const { error: err } = await supabase.from("organizations")
      .update({ objection_categories: neueListe }).eq("id", activeOrgId);
    if (err) { setError(err.message); setVorschlagBusy(null); return; }

    await supabase.from("grund_vorschlaege")
      .update({ status: "uebernommen" }).in("id", gruppe.ids);
    setCategories(neueListe);
    setVorschlaege((prev) => prev.filter((g) => g.form !== gruppe.form));
    setVorschlagBusy(null);
  }

  async function lehneVorschlagAb(gruppe) {
    setVorschlagBusy(gruppe.form);
    // Abgelehnte werden nicht gelöscht — sonst taucht derselbe Vorschlag
    // nächste Woche wieder auf, und man entscheidet dieselbe Frage erneut.
    await supabase.from("grund_vorschlaege").update({ status: "abgelehnt" }).in("id", gruppe.ids);
    setVorschlaege((prev) => prev.filter((g) => g.form !== gruppe.form));
    setVorschlagBusy(null);
  }

  useEffect(() => { load(); }, []);

  async function createObjection() {
    if (!newDraft.cat || !newDraft.q_pro.trim() || !newDraft.a_pro.trim()) return;
    setCreating(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("custom_objections").insert({
      organization_id: activeOrgId,
      cat: newDraft.cat,
      q_pro: newDraft.q_pro.trim(),
      a_pro: newDraft.a_pro.trim(),
      q_ent: newDraft.q_ent.trim() || null,
      a_ent: newDraft.a_ent.trim() || null,
      tip: newDraft.tip.trim() || null,
      created_by: session.user.id,
    });
    if (err) setError(err.message);
    else { setNewDraft({ ...EMPTY_DRAFT, cat: categories[0]?.key || "" }); await load(); }
    setCreating(false);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setEditDraft({
      cat: row.cat, q_pro: row.q_pro, a_pro: row.a_pro,
      q_ent: row.q_ent || "", a_ent: row.a_ent || "", tip: row.tip || "",
    });
  }

  async function saveEdit(id) {
    if (!editDraft.q_pro.trim() || !editDraft.a_pro.trim()) return;
    const { error: err } = await supabase.from("custom_objections").update({
      cat: editDraft.cat,
      q_pro: editDraft.q_pro.trim(),
      a_pro: editDraft.a_pro.trim(),
      q_ent: editDraft.q_ent.trim() || null,
      a_ent: editDraft.a_ent.trim() || null,
      tip: editDraft.tip.trim() || null,
    }).eq("id", id);
    if (err) { setError(err.message); return; }
    setEditingId(null);
    setEditDraft(null);
    await load();
  }

  async function deleteObjection(id) {
    if (!confirm("Diesen Einwand wirklich löschen?")) return;
    const loeschFehler = await loescheGeprueft(supabase.from("custom_objections").delete().eq("id", id));
    const err = loeschFehler ? { message: loeschFehler } : null;
    if (err) { setError(err.message); return; }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function labelFor(cat) {
    return categories.find((c) => c.key === cat)?.label || cat;
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Eigene Einwände</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Manager/Admins verfügbar.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Eigene Einwände</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />
      <p className="text-textMuted text-sm mb-6">
        Zusätzlich zu den festen HB-Standard-Einwänden könnt ihr hier eigene Einwand-Szenarien für den Einwand-Trainer anlegen —
        eigene Fragen, Musterantworten (Sie/Du) und Tipps. Die Kategorien stammen aus „Verwaltung → Organisation".
      </p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      {/* Was am Telefon tatsächlich gesagt wurde. Steht bewusst GANZ OBEN:
          diese Vorschläge sind zeitkritisch, alles andere hier hat Zeit. */}
      {vorschlaege.length > 0 && (
        <div className="card mb-6 border-amber/40">
          <div className="font-semibold text-textMain text-sm mb-1">
            Gründe aus dem Team ({vorschlaege.length})
          </div>
          <p className="text-xs text-textMuted mb-3">
            Diese Gründe haben Vertriebler am Telefon eingetippt, weil keine Kategorie gepasst hat. Gezählt
            wurden sie unter „Sonstiges“. Machst du eine Kategorie daraus, wird sie ab sofort in der Auswertung
            eigens ausgewiesen — rückwirkend ändert sich nichts.
          </p>
          <div className="flex flex-col gap-2">
            {vorschlaege.map((g) => (
              <div key={g.form} className="flex items-center gap-2 flex-wrap rounded-xl border border-line px-3 py-2">
                <span className="text-sm text-textMain flex-1 min-w-[160px]">{g.text}</span>
                <span className="text-[11px] text-textMuted">
                  {g.anzahl}× {g.personen > 1 ? `· von ${g.personen} Personen` : ""}
                </span>
                <button onClick={() => uebernehmeVorschlag(g)} disabled={vorschlagBusy === g.form}
                  className="btn text-xs disabled:opacity-40">Als Kategorie übernehmen</button>
                <button onClick={() => lehneVorschlagAb(g)} disabled={vorschlagBusy === g.form}
                  className="btn-ghost text-xs text-textMuted disabled:opacity-40">Verwerfen</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3">Neuen Einwand anlegen</div>
        <select className="input text-xs mb-2" value={newDraft.cat} onChange={(e) => setNewDraft((d) => ({ ...d, cat: e.target.value }))}>
          {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <textarea className="input text-xs mb-2" rows={2} placeholder="Einwand des Kunden (Sie) *" value={newDraft.q_pro} onChange={(e) => setNewDraft((d) => ({ ...d, q_pro: e.target.value }))} />
        <textarea className="input text-xs mb-2" rows={3} placeholder="Musterantwort (Sie) *" value={newDraft.a_pro} onChange={(e) => setNewDraft((d) => ({ ...d, a_pro: e.target.value }))} />
        <textarea className="input text-xs mb-2" rows={2} placeholder="Einwand des Kunden (Du) — optional, sonst wird die Sie-Variante verwendet" value={newDraft.q_ent} onChange={(e) => setNewDraft((d) => ({ ...d, q_ent: e.target.value }))} />
        <textarea className="input text-xs mb-2" rows={3} placeholder="Musterantwort (Du) — optional" value={newDraft.a_ent} onChange={(e) => setNewDraft((d) => ({ ...d, a_ent: e.target.value }))} />
        <input className="input text-xs mb-3" placeholder="Tipp — optional" value={newDraft.tip} onChange={(e) => setNewDraft((d) => ({ ...d, tip: e.target.value }))} />
        <button disabled={creating || !newDraft.cat || !newDraft.q_pro.trim() || !newDraft.a_pro.trim()} onClick={createObjection} className="btn text-xs disabled:opacity-40">
          {creating ? "Speichert..." : "Einwand speichern"}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.id} className="card">
            {editingId === row.id ? (
              <>
                <select className="input text-xs mb-2" value={editDraft.cat} onChange={(e) => setEditDraft((d) => ({ ...d, cat: e.target.value }))}>
                  {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <textarea className="input text-xs mb-2" rows={2} placeholder="Einwand (Sie)" value={editDraft.q_pro} onChange={(e) => setEditDraft((d) => ({ ...d, q_pro: e.target.value }))} />
                <textarea className="input text-xs mb-2" rows={3} placeholder="Musterantwort (Sie)" value={editDraft.a_pro} onChange={(e) => setEditDraft((d) => ({ ...d, a_pro: e.target.value }))} />
                <textarea className="input text-xs mb-2" rows={2} placeholder="Einwand (Du)" value={editDraft.q_ent} onChange={(e) => setEditDraft((d) => ({ ...d, q_ent: e.target.value }))} />
                <textarea className="input text-xs mb-2" rows={3} placeholder="Musterantwort (Du)" value={editDraft.a_ent} onChange={(e) => setEditDraft((d) => ({ ...d, a_ent: e.target.value }))} />
                <input className="input text-xs mb-3" placeholder="Tipp" value={editDraft.tip} onChange={(e) => setEditDraft((d) => ({ ...d, tip: e.target.value }))} />
                <div className="flex items-center gap-2">
                  <button onClick={() => saveEdit(row.id)} className="btn-ghost text-xs">Speichern</button>
                  <button onClick={() => { setEditingId(null); setEditDraft(null); }} className="btn-ghost text-xs">Abbrechen</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-wide text-amber border border-amber/40 rounded px-1.5 py-0.5">{labelFor(row.cat)}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(row)} className="btn-ghost text-xs">Bearbeiten</button>
                    <button onClick={() => deleteObjection(row.id)} className="btn-ghost text-xs text-coral">Entfernen</button>
                  </div>
                </div>
                <div className="text-sm text-textMain mb-1">„{row.q_pro}"</div>
                <p className="text-xs text-textMuted">{row.a_pro}</p>
                {row.tip && <p className="text-[11px] text-amber mt-2">Tipp: {row.tip}</p>}
              </>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-textMuted text-sm">Noch keine eigenen Einwände angelegt.</p>}
      </div>
    </Layout>
  );
}
