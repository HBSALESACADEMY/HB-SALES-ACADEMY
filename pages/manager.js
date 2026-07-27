import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { openProfile } from "../lib/profileModalBus";
import { COURSES } from "../lib/curriculum";

export default function Manager() {
  const [team, setTeam] = useState([]);
  const [principleCounts, setPrincipleCounts] = useState([]);
  const [teamRequests, setTeamRequests] = useState([]);
  const [requestProfiles, setRequestProfiles] = useState({});
  const [busyReqId, setBusyReqId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(true);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalMetric, setGoalMetric] = useState("roleplay");
  const [goalTarget, setGoalTarget] = useState(20);
  const [savingGoal, setSavingGoal] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairs, setPairs] = useState([]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (!me || me.role !== "manager") { setIsManager(false); setLoading(false); return; }

    const { data: members } = await supabase.from("profiles").select("*").eq("manager_id", session.user.id);
    const totalModules = COURSES.reduce((s, c) => s + c.modules.length, 0);
    const counts = {};

    const { data: reqs } = await supabase.from("team_requests").select("*").eq("manager_id", session.user.id).eq("status", "pending");
    setTeamRequests(reqs || []);
    if (reqs && reqs.length) {
      const { data: reqProfiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", reqs.map((r) => r.requester_id));
      const map = {};
      (reqProfiles || []).forEach((p) => { map[p.id] = p; });
      setRequestProfiles(map);
    }

    const enriched = await Promise.all((members || []).map(async (m) => {
      const [{ data: qr }, { data: er }, { data: rp }] = await Promise.all([
        supabase.from("quiz_results").select("*").eq("user_id", m.id),
        supabase.from("exam_results").select("*").eq("user_id", m.id),
        supabase.from("roleplay_sessions").select("*").eq("user_id", m.id),
      ]);
      const doneModules = new Set((qr || []).map((r) => r.module_id)).size;
      const avgMc = qr && qr.length ? Math.round(qr.reduce((s, r) => s + (r.mc_total ? r.mc_score / r.mc_total : 0), 0) / qr.length * 100) : null;
      const certs = (er || []).filter((r) => r.passed).length;
      (rp || []).forEach((r) => {
        (r.detected_principles || []).forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
      });
      return { ...m, doneModules, totalModules, avgMc, certs, roleplayCount: (rp || []).length };
    }));
    setTeam(enriched);
    setPrincipleCounts(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6));

    const { data: existingPairs } = await supabase.from("mentor_pairs").select("*, mentor:mentor_id(full_name), mentee:mentee_id(full_name)").eq("manager_id", session.user.id).eq("active", true);
    setPairs(existingPairs || []);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function respondToTeamRequest(requestId, action) {
    setBusyReqId(requestId);
    try {
      await apiPost("/api/admin/respond-team-request", { requestId, action });
      await load();
    } catch (e) {
      alert(e.message);
    }
    setBusyReqId(null);
  }

  function mondayOfWeek(d) {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  async function saveGoal() {
    if (!goalTitle.trim() || !goalTarget) return;
    setSavingGoal(true);
    const { data: { session } } = await supabase.auth.getSession();
    const week_start = mondayOfWeek(new Date()).toISOString().slice(0, 10);
    await supabase.from("team_goals").insert({
      manager_id: session.user.id, title: goalTitle.trim(), metric: goalMetric, target_count: Number(goalTarget), week_start,
    });
    setGoalTitle("");
    setSavingGoal(false);
    alert("Team-Ziel für diese Woche gesetzt!");
  }

  async function autoPairMentors() {
    setPairingBusy(true);
    // Erfahren = höhere XP, Neu = niedrigere XP. Obere Hälfte wird oberer Hälfte zugeteilt (1:1).
    const sorted = [...team].sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const half = Math.floor(sorted.length / 2);
    const mentorsPool = sorted.slice(0, half);
    const menteesPool = sorted.slice(half);
    const { data: { session } } = await supabase.auth.getSession();

    const newPairs = menteesPool.map((mentee, i) => {
      const mentor = mentorsPool[i % mentorsPool.length];
      return mentor ? { mentor_id: mentor.id, mentee_id: mentee.id, manager_id: session.user.id, active: true } : null;
    }).filter(Boolean);

    if (newPairs.length > 0) {
      await supabase.from("mentor_pairs").update({ active: false }).eq("manager_id", session.user.id).eq("active", true);
      await supabase.from("mentor_pairs").insert(newPairs);
    }
    setPairingBusy(false);
    await load();
  }

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

      {teamRequests.length > 0 && (
        <div className="card mb-5">
          <div className="font-semibold text-white text-sm mb-3">Offene Team-Anfragen</div>
          <div className="flex flex-col gap-2.5">
            {teamRequests.map((r) => {
              const p = requestProfiles[r.requester_id];
              const busy = busyReqId === r.id;
              return (
                <div key={r.id} className="flex items-center gap-3">
                  <button onClick={() => openProfile(r.requester_id)} className="flex-shrink-0">
                    <Avatar name={p?.full_name || "?"} src={p?.avatar_url} size={30} />
                  </button>
                  <span className="text-sm text-white flex-1">{p?.full_name || "Unbenannt"}</span>
                  <button disabled={busy} onClick={() => respondToTeamRequest(r.id, "accept")} className="btn-ghost text-xs text-teal border-teal/40 disabled:opacity-40">Annehmen</button>
                  <button disabled={busy} onClick={() => respondToTeamRequest(r.id, "decline")} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ablehnen</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card mb-5">
        <div className="font-semibold text-white text-sm mb-3">🎯 Team-Ziel für diese Woche setzen</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input className="input flex-1 min-w-[160px]" placeholder="z.B. 50 Rollenspiele im Team" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} />
          <select className="input !w-auto" value={goalMetric} onChange={(e) => setGoalMetric(e.target.value)}>
            <option value="roleplay">Rollenspiele</option>
            <option value="quiz">Quiz</option>
            <option value="daily_challenge">Tages-Challenges</option>
          </select>
          <input className="input !w-20" type="number" min="1" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
          <button disabled={savingGoal} onClick={saveGoal} className="btn text-xs disabled:opacity-40">Setzen</button>
        </div>
      </div>

      <div className="card mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-white text-sm">🤝 Mentoring-Paare</div>
          <button disabled={pairingBusy || team.length < 2} onClick={autoPairMentors} className="btn-ghost text-xs disabled:opacity-40">
            {pairingBusy ? "Bildet Paare..." : "Automatisch zuordnen"}
          </button>
        </div>
        {pairs.length === 0 ? (
          <p className="text-textMuted text-sm">Noch keine Paare gebildet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {pairs.map((p) => (
              <div key={p.id} className="text-sm text-textMuted">
                <span className="text-white">{p.mentor?.full_name}</span> → <span className="text-white">{p.mentee?.full_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {principleCounts.length > 0 && (
        <div className="card mb-5">
          <div className="font-semibold text-white text-sm mb-3">Team-Insights: meistgenutzte Prinzipien im Rollenspiel</div>
          <div className="flex flex-col gap-2">
            {principleCounts.map(([name, count]) => {
              const max = principleCounts[0][1];
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs w-40 flex-shrink-0 truncate">{name}</span>
                  <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-teal" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                  <span className="font-mono text-xs text-textMuted w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {team.length === 0 ? (
        <p className="text-textMuted text-sm">Noch keine Team-Mitglieder zugeordnet. Siehe README, um Reps über <code>manager_id</code> zuzuordnen.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {team.map((m) => (
            <div key={m.id} className="card flex items-center gap-5">
              <button onClick={() => openProfile(m.id)} className="flex-shrink-0">
                <Avatar name={m.full_name || "?"} src={m.avatar_url} size={36} />
              </button>
              <div className="flex-1">
                <button onClick={() => openProfile(m.id)} className="font-semibold text-white text-sm hover:underline">{m.full_name || "Unbenannt"}</button>
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
