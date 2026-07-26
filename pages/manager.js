import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { COURSES } from "../lib/curriculum";

export default function Manager() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: me } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (!me || me.role !== "manager") { setIsManager(false); setLoading(false); return; }

      const { data: members } = await supabase.from("profiles").select("*").eq("manager_id", session.user.id);
      const totalModules = COURSES.reduce((s, c) => s + c.modules.length, 0);

      const enriched = await Promise.all((members || []).map(async (m) => {
        const [{ data: qr }, { data: er }, { data: rp }] = await Promise.all([
          supabase.from("quiz_results").select("*").eq("user_id", m.id),
          supabase.from("exam_results").select("*").eq("user_id", m.id),
          supabase.from("roleplay_sessions").select("*").eq("user_id", m.id),
        ]);
        const doneModules = new Set((qr || []).map((r) => r.module_id)).size;
        const avgMc = qr && qr.length ? Math.round(qr.reduce((s, r) => s + (r.mc_total ? r.mc_score / r.mc_total : 0), 0) / qr.length * 100) : null;
        const certs = (er || []).filter((r) => r.passed).length;
        return { ...m, doneModules, totalModules, avgMc, certs, roleplayCount: (rp || []).length };
      }));
      setTeam(enriched);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-white mb-1">Team</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Konten mit der Rolle "manager" verfügbar. Ein Admin kann die Rolle direkt in Supabase setzen (siehe README).</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display text-white mb-1">Team-Übersicht</h1>
      <p className="text-textMuted text-sm mb-6">Fortschritt deiner zugeordneten Team-Mitglieder.</p>
      {team.length === 0 ? (
        <p className="text-textMuted text-sm">Noch keine Team-Mitglieder zugeordnet. Siehe README, um Reps über <code>manager_id</code> zuzuordnen.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {team.map((m) => (
            <div key={m.id} className="card flex items-center gap-5">
              <div className="w-9 h-9 rounded-full bg-surfaceRaised flex items-center justify-center text-amber flex-shrink-0"><Icon name="users" size={16} /></div>
              <div className="flex-1">
                <div className="font-semibold text-white text-sm">{m.full_name || "Unbenannt"}</div>
                <div className="text-xs text-textMuted mt-1">
                  {m.doneModules}/{m.totalModules} Module · Ø MC {m.avgMc !== null ? m.avgMc + "%" : "–"} · {m.certs}/{COURSES.length} Zertifikate · {m.roleplayCount} Rollenspiele
                </div>
              </div>
              <div className="w-32 h-1.5 bg-line rounded-full overflow-hidden">
                <div className="h-full bg-teal" style={{ width: `${(m.doneModules / m.totalModules) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
