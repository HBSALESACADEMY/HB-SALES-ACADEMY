import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { openProfile } from "../lib/profileModalBus";
import { COURSES } from "../lib/curriculum";

export default function Manager() {
  const [selfId, setSelfId] = useState(null);
  const [isManager, setIsManager] = useState(true);
  const [loading, setLoading] = useState(true);

  const [myTeams, setMyTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [team, setTeam] = useState([]);
  const [principleCounts, setPrincipleCounts] = useState([]);
  const [teamRequests, setTeamRequests] = useState([]);
  const [requestProfiles, setRequestProfiles] = useState({});
  const [busyReqId, setBusyReqId] = useState(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalMetric, setGoalMetric] = useState("roleplay");
  const [goalTarget, setGoalTarget] = useState(20);
  const [savingGoal, setSavingGoal] = useState(false);
  const [pairs, setPairs] = useState([]);
  const [pairMentorId, setPairMentorId] = useState("");
  const [pairMenteeId, setPairMenteeId] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [callStats, setCallStats] = useState([]);

  const [allProfiles, setAllProfiles] = useState([]);
  const [addQuery, setAddQuery] = useState("");
  const [addBusyId, setAddBusyId] = useState(null);

  async function loadTeams() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    setSelfId(session.user.id);
    const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
    if (!me || me.role !== "manager") { setIsManager(false); setLoading(false); return null; }

    const { data: teams } = await supabase.from("teams").select("*").eq("created_by", session.user.id).order("created_at");
    setMyTeams(teams || []);
    return { session, teams: teams || [] };
  }

  async function loadTeamData(teamId, session) {
    if (!teamId) { setLoading(false); return; }

    const [{ data: memberRows }, { data: allApproved }] = await Promise.all([
      supabase.from("team_members").select("user_id, profiles:user_id(*)").eq("team_id", teamId),
      supabase.from("profiles").select("id, full_name, avatar_url").eq("status", "approved"),
    ]);
    setAllProfiles(allApproved || []);

    const memberIds = (memberRows || []).map((r) => r.user_id).filter((id) => id !== session.user.id);
    const totalModules = COURSES.reduce((s, c) => s + c.modules.length, 0);
    const counts = {};

    const { data: reqs } = await supabase.from("team_requests").select("*").eq("team_id", teamId).eq("status", "pending");
    setTeamRequests(reqs || []);
    if (reqs && reqs.length) {
      const { data: reqProfiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", reqs.map((r) => r.requester_id));
      const map = {};
      (reqProfiles || []).forEach((p) => { map[p.id] = p; });
      setRequestProfiles(map);
    } else {
      setRequestProfiles({});
    }

    const memberProfiles = (memberRows || []).map((r) => r.profiles).filter((p) => p && p.id !== session.user.id);
    const enriched = await Promise.all(memberProfiles.map(async (m) => {
      const [{ data: qr }, { data: er }, { data: rp }] = await Promise.all([
        supabase.from("quiz_results").select("module_id, mc_score, mc_total").eq("user_id", m.id),
        supabase.from("exam_results").select("passed").eq("user_id", m.id),
        supabase.from("roleplay_sessions").select("detected_principles").eq("user_id", m.id),
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
    const teamMemberIdSet = new Set(memberIds);
    setPairs((existingPairs || []).filter((p) => teamMemberIdSet.has(p.mentor_id) && teamMemberIdSet.has(p.mentee_id)));

    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: calls } = await supabase.from("call_log_days").select("*").in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]).eq("log_date", todayStr);
    const nameById = {};
    memberProfiles.forEach((m) => { nameById[m.id] = m.full_name || "Unbenannt"; });
    setCallStats((calls || []).map((c) => ({ ...c, name: nameById[c.user_id] })));

    setLoading(false);
  }

  async function load() {
    setLoading(true);
    const ctx = await loadTeams();
    if (!ctx) return;
    const { session, teams } = ctx;
    const tid = selectedTeamId && teams.some((t) => t.id === selectedTeamId) ? selectedTeamId : (teams[0]?.id || null);
    setSelectedTeamId(tid);
    const activeTeam = teams.find((t) => t.id === tid);
    setEditingName(activeTeam?.name || "");
    await loadTeamData(tid, session);
  }

  useEffect(() => { load(); }, []);

  async function selectTeam(teamId) {
    setSelectedTeamId(teamId);
    setEditingName(myTeams.find((t) => t.id === teamId)?.name || "");
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    await loadTeamData(teamId, session);
  }

  async function createTeam() {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data: newTeam, error } = await supabase.from("teams").insert({ name: newTeamName.trim(), created_by: session.user.id }).select().single();
    if (!error && newTeam) {
      await supabase.from("team_members").insert({ team_id: newTeam.id, user_id: session.user.id });
      setNewTeamName("");
      await load();
      await selectTeam(newTeam.id);
    }
    setCreatingTeam(false);
  }

  async function saveTeamName() {
    if (!editingName.trim() || !selectedTeamId) return;
    setSavingName(true);
    await supabase.from("teams").update({ name: editingName.trim() }).eq("id", selectedTeamId);
    setMyTeams((prev) => prev.map((t) => t.id === selectedTeamId ? { ...t, name: editingName.trim() } : t));
    setSavingName(false);
  }

  async function deleteTeam() {
    if (!selectedTeamId) return;
    const teamName = myTeams.find((t) => t.id === selectedTeamId)?.name;
    if (!confirm(`Team "${teamName}" wirklich löschen? Alle Zuordnungen, Ziele und Anfragen für dieses Team gehen dabei verloren.`)) return;
    await supabase.from("teams").delete().eq("id", selectedTeamId);
    setSelectedTeamId(null);
    await load();
  }

  async function addMember(profileId) {
    if (!selectedTeamId) return;
    setAddBusyId(profileId);
    await supabase.from("team_members").insert({ team_id: selectedTeamId, user_id: profileId });
    const { data: { session } } = await supabase.auth.getSession();
    await loadTeamData(selectedTeamId, session);
    setAddBusyId(null);
  }

  async function removeMember(profileId) {
    if (!selectedTeamId) return;
    if (!confirm("Aus diesem Team entfernen?")) return;
    await supabase.from("team_members").delete().eq("team_id", selectedTeamId).eq("user_id", profileId);
    const { data: { session } } = await supabase.auth.getSession();
    await loadTeamData(selectedTeamId, session);
  }

  async function respondToTeamRequest(requestId, action) {
    setBusyReqId(requestId);
    try {
      await apiPost("/api/admin/respond-team-request", { requestId, action });
      const { data: { session } } = await supabase.auth.getSession();
      await loadTeamData(selectedTeamId, session);
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
    if (!goalTitle.trim() || !goalTarget || !selectedTeamId) return;
    setSavingGoal(true);
    const { data: { session } } = await supabase.auth.getSession();
    const week_start = mondayOfWeek(new Date()).toISOString().slice(0, 10);
    await supabase.from("team_goals").insert({
      manager_id: session.user.id, team_id: selectedTeamId, title: goalTitle.trim(), metric: goalMetric, target_count: Number(goalTarget), week_start,
    });
    setGoalTitle("");
    setSavingGoal(false);
    alert("Team-Ziel für diese Woche gesetzt!");
  }

  async function toggleCallStatsAccess(memberId, allow) {
    await supabase.from("profiles").update({ can_view_call_stats: allow }).eq("id", memberId);
    setTeam((prev) => prev.map((m) => m.id === memberId ? { ...m, can_view_call_stats: allow } : m));
  }

  function exportTeamCsv() {
    const header = ["Name", "Module abgeschlossen", "Von Modulen gesamt", "Ø Quiz-Score (%)", "Zertifikate", "Rollenspiele"];
    const rows = team.map((m) => [
      m.full_name || "Unbenannt", m.doneModules, m.totalModules, m.avgMc ?? "", m.certs, m.roleplayCount,
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Team-Fortschritt-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function formPair() {
    if (!pairMentorId || !pairMenteeId || pairMentorId === pairMenteeId) return;
    setPairingBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("mentor_pairs").insert({ mentor_id: pairMentorId, mentee_id: pairMenteeId, manager_id: session.user.id, active: true });
    setPairMentorId(""); setPairMenteeId("");
    await loadTeamData(selectedTeamId, session);
    setPairingBusy(false);
  }

  async function dissolvePair(pairId) {
    await supabase.from("mentor_pairs").update({ active: false }).eq("id", pairId);
    const { data: { session } } = await supabase.auth.getSession();
    await loadTeamData(selectedTeamId, session);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Team</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Konten mit der Rolle "manager" verfügbar. Ein Admin kann die Rolle direkt in Supabase setzen (siehe README).</p>
      </Layout>
    );
  }

  const memberIdsInTeam = new Set(team.map((m) => m.id));
  const addableProfiles = allProfiles.filter((p) =>
    p.id !== selfId && !memberIdsInTeam.has(p.id) &&
    (p.full_name || "").toLowerCase().includes(addQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Team-Übersicht</h1>
          <div className="brand-stripe w-16 mb-2" />
          <p className="text-textMuted text-sm">Deine Teams verwalten, Mitglieder zuordnen, Fortschritt einsehen.</p>
        </div>
        {team.length > 0 && (
          <button onClick={exportTeamCsv} className="btn-ghost text-xs flex-shrink-0">
            <Icon name="download" size={13} /> CSV exportieren
          </button>
        )}
      </div>

      <div className="card mb-5">
        <div className="font-semibold text-textMain text-sm mb-3">Meine Teams</div>
        {myTeams.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {myTeams.map((t) => (
              <button key={t.id} onClick={() => selectTeam(t.id)}
                className={`px-3 py-1.5 rounded-full text-xs border ${selectedTeamId === t.id ? "bg-amber text-[var(--org-button-text,#fff)] border-amber font-semibold" : "border-line text-textMuted hover:text-textMain"}`}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input className="input flex-1 min-w-[160px]" placeholder="Neues Team erstellen (Name)" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
          <button disabled={creatingTeam} onClick={createTeam} className="btn text-xs disabled:opacity-40 flex-shrink-0">
            {creatingTeam ? "Erstellt..." : "Team erstellen"}
          </button>
        </div>

        {selectedTeamId && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-line flex-wrap">
            <span className="text-xs text-textMuted flex-shrink-0">Name des gewählten Teams:</span>
            <input className="input flex-1 min-w-[160px]" value={editingName} onChange={(e) => setEditingName(e.target.value)} />
            <button disabled={savingName} onClick={saveTeamName} className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0">
              {savingName ? "Speichert..." : "Speichern"}
            </button>
            <button onClick={deleteTeam} className="btn-ghost text-xs text-coral border-coral/40 flex-shrink-0">Team löschen</button>
          </div>
        )}
      </div>

      {!selectedTeamId ? (
        <p className="text-textMuted text-sm">Erstelle oben dein erstes Team, um loszulegen.</p>
      ) : (
        <>
          <div className="card mb-5">
            <div className="font-semibold text-textMain text-sm mb-3">Mitglieder hinzufügen</div>
            <input className="input mb-2.5" placeholder="Nach Namen suchen..." value={addQuery} onChange={(e) => setAddQuery(e.target.value)} />
            {addQuery.trim() && (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {addableProfiles.slice(0, 20).map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5">
                    <Avatar name={p.full_name || "?"} src={p.avatar_url} size={26} />
                    <span className="text-sm text-textMain flex-1">{p.full_name || "Unbenannt"}</span>
                    <button disabled={addBusyId === p.id} onClick={() => addMember(p.id)} className="btn-ghost text-xs disabled:opacity-40">Hinzufügen</button>
                  </div>
                ))}
                {addableProfiles.length === 0 && <p className="text-textMuted text-xs">Keine Treffer.</p>}
              </div>
            )}
          </div>

          {teamRequests.length > 0 && (
            <div className="card mb-5">
              <div className="font-semibold text-textMain text-sm mb-3">Offene Team-Anfragen</div>
              <div className="flex flex-col gap-2.5">
                {teamRequests.map((r) => {
                  const p = requestProfiles[r.requester_id];
                  const busy = busyReqId === r.id;
                  return (
                    <div key={r.id} className="flex items-center gap-3">
                      <button onClick={() => openProfile(r.requester_id)} className="flex-shrink-0">
                        <Avatar name={p?.full_name || "?"} src={p?.avatar_url} size={30} />
                      </button>
                      <span className="text-sm text-textMain flex-1">{p?.full_name || "Unbenannt"}</span>
                      <button disabled={busy} onClick={() => respondToTeamRequest(r.id, "accept")} className="btn-ghost text-xs text-teal border-teal/40 disabled:opacity-40">Annehmen</button>
                      <button disabled={busy} onClick={() => respondToTeamRequest(r.id, "decline")} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ablehnen</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card mb-5">
            <div className="font-semibold text-textMain text-sm mb-3">🎯 Team-Ziel für diese Woche setzen</div>
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
            <div className="font-semibold text-textMain text-sm mb-3">🤝 Mentoring-Paare</div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <select className="input !w-auto flex-1 min-w-[140px]" value={pairMentorId} onChange={(e) => setPairMentorId(e.target.value)}>
                <option value="">Mentor wählen...</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.full_name || "Unbenannt"}</option>)}
              </select>
              <span className="text-textMuted text-xs">→</span>
              <select className="input !w-auto flex-1 min-w-[140px]" value={pairMenteeId} onChange={(e) => setPairMenteeId(e.target.value)}>
                <option value="">Mentee wählen...</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.full_name || "Unbenannt"}</option>)}
              </select>
              <button disabled={pairingBusy || !pairMentorId || !pairMenteeId || pairMentorId === pairMenteeId} onClick={formPair} className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0">
                {pairingBusy ? "..." : "Paar bilden"}
              </button>
            </div>
            {pairs.length === 0 ? (
              <p className="text-textMuted text-sm">Noch keine Paare gebildet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {pairs.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm text-textMuted">
                    <span className="flex-1"><span className="text-textMain">{p.mentor?.full_name}</span> → <span className="text-textMain">{p.mentee?.full_name}</span></span>
                    <button onClick={() => dissolvePair(p.id)} className="btn-ghost text-xs text-coral">Auflösen</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {callStats.length > 0 && (
            <div className="card mb-5">
              <div className="font-semibold text-textMain text-sm mb-3">📞 Anruf-Aktivität heute</div>
              <div className="flex flex-col gap-2">
                {callStats.map((c) => (
                  <div key={c.user_id} className="flex items-center gap-3 text-sm">
                    <span className="text-textMain flex-1">{c.name}</span>
                    <span className="text-textMuted text-xs">{c.counts?.anwahlen || 0} Anwahlen · {c.counts?.termin || 0} Termine · {c.counts?.positiv || 0} positiv</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {principleCounts.length > 0 && (
            <div className="card mb-5">
              <div className="font-semibold text-textMain text-sm mb-3">Team-Insights: meistgenutzte Prinzipien im Rollenspiel</div>
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
            <p className="text-textMuted text-sm">Noch keine Mitglieder in diesem Team. Füge oben welche hinzu.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {team.map((m) => (
                <div key={m.id} className="card flex items-center gap-5">
                  <button onClick={() => openProfile(m.id)} className="flex-shrink-0">
                    <Avatar name={m.full_name || "?"} src={m.avatar_url} size={36} />
                  </button>
                  <div className="flex-1">
                    <button onClick={() => openProfile(m.id)} className="font-semibold text-textMain text-sm hover:underline">{m.full_name || "Unbenannt"}</button>
                    <div className="text-xs text-textMuted mt-1">
                      {m.doneModules}/{m.totalModules} Module · Ø MC {m.avgMc !== null ? m.avgMc + "%" : "–"} · {m.certs}/{COURSES.length} Zertifikate · {m.roleplayCount} Rollenspiele
                    </div>
                  </div>
                  <div className="w-32 h-1.5 bg-line rounded-full overflow-hidden flex-shrink-0">
                    <div className="h-full bg-teal" style={{ width: `${(m.doneModules / m.totalModules) * 100}%` }} />
                  </div>
                  <button onClick={() => toggleCallStatsAccess(m.id, !m.can_view_call_stats)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border flex-shrink-0 ${m.can_view_call_stats ? "border-teal/40 text-teal bg-teal/10" : "border-line text-textMuted hover:text-textMain"}`}>
                    📞 {m.can_view_call_stats ? "Auswertung sichtbar" : "Auswertung verborgen"}
                  </button>
                  <button onClick={() => removeMember(m.id)} className="btn-ghost text-xs text-coral flex-shrink-0">Entfernen</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
