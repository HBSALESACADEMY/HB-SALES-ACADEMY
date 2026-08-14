import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import AdminTabs from "../../components/AdminTabs";
import { supabase } from "../../lib/supabaseClient";

export default function Suggestions() {
  const [isManager, setIsManager] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const [{ data: me }, { data: ownTeams }] = await Promise.all([
      supabase.from("profiles").select("role, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle(),
      supabase.from("teams").select("id").eq("created_by", session.user.id).limit(1),
    ]);
    // Teamleads dürfen Wissensdatenbank-Vorschläge genauso verwalten wie
    // Manager/Trainer/Admins — siehe is_team_lead() in der RLS-Policy (migration_52).
    const isTeamLead = (ownTeams || []).length > 0;
    if (!me || (me.role !== "manager" && me.role !== "trainer" && !me.is_admin && !me.is_platform_admin && !isTeamLead)) {
      setIsManager(false);
      setLoading(false);
      return;
    }
    const { data, error: err } = await supabase.from("kb_entries").select("*").eq("status", "pending").order("created_at", { ascending: false });
    if (err) setError(err.message);
    setPending(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function decide(id, status) {
    setBusyId(id);
    setError("");
    const { error: err } = await supabase.from("kb_entries").update({ status }).eq("id", id);
    if (err) setError(err.message);
    else await load();
    setBusyId(null);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Wissens-Vorschläge</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Manager, Trainer, Teamleads und Admins verfügbar.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Wissens-Vorschläge</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />
      <p className="text-textMuted text-sm mb-6">Die KI erkennt in Rollenspiel-Auswertungen gelegentlich bemerkenswerte Techniken oder Einwände und schlägt sie hier zur Aufnahme in die Wissensdatenbank vor. Genehmigte Einträge erscheinen sofort für alle unter "Wissensdatenbank".</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="flex flex-col gap-3">
        {pending.map((p) => (
          <div key={p.id} className="card">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-amber mb-1">{p.tag}</div>
            <div className="font-display font-semibold text-textMain mb-1.5">{p.title}</div>
            <p className="text-[13px] text-textMuted mb-3">{p.body}</p>
            <div className="flex items-center gap-2">
              <button disabled={busyId === p.id} onClick={() => decide(p.id, "approved")} className="btn-ghost text-xs text-teal border-teal/40 disabled:opacity-40">Genehmigen</button>
              <button disabled={busyId === p.id} onClick={() => decide(p.id, "rejected")} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ablehnen</button>
            </div>
          </div>
        ))}
        {pending.length === 0 && <p className="text-textMuted text-sm">Aktuell keine offenen Vorschläge.</p>}
      </div>
    </Layout>
  );
}
