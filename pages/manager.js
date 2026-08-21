import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { openProfile } from "../lib/profileModalBus";
import { COURSES } from "../lib/curriculum";
import { getActiveOrgId } from "../lib/activeOrg";
import { goalMetricGroups, goalMetricLabel } from "../lib/goalMetrics";
import { wochenStartTag } from "../lib/woche";
import { ZEITRAEUME, zeitraumFuer, zeitraumLabel } from "../lib/zielzeitraum";
import ZielDeuter from "../components/ZielDeuter";

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
  const [goals, setGoals] = useState([]);
  const [goalZeitraum, setGoalZeitraum] = useState("woche");
  const [goalVon, setGoalVon] = useState("");
  const [goalBis, setGoalBis] = useState("");
  const [goalPerson, setGoalPerson] = useState("");
  const [goalFrei, setGoalFrei] = useState(false);
  const [goalEdit, setGoalEdit] = useState(null);
  const [goalPatch, setGoalPatch] = useState(null);
  const [rolleEdit, setRolleEdit] = useState(null);
  const [rolleWert, setRolleWert] = useState("");
  const [pairs, setPairs] = useState([]);
  const [pairMentorId, setPairMentorId] = useState("");
  const [pairMenteeId, setPairMenteeId] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [callStats, setCallStats] = useState([]);

  const [allProfiles, setAllProfiles] = useState([]);
  const [addQuery, setAddQuery] = useState("");
  const [addBusyId, setAddBusyId] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [migrationFehlt, setMigrationFehlt] = useState(false);

  async function loadTeams() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    setSelfId(session.user.id);
    const { data: me } = await supabase.from("profiles").select("role, organization_id, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle();
    // Admins der Organisation und Plattform-Admins gehören hierher, auch ohne
    // role='manager' — sie verwalten die Teams ihrer Organisation (siehe
    // migration_88). Vorher sperrte diese Prüfung genau die Personen aus, die
    // dafür zuständig sind.
    // Prüft, ob migration_88 eingespielt ist. Fehlt die Funktion, lehnt die
    // Datenbank jedes Hinzufügen/Entfernen ab — und zwar lautlos, weil eine
    // abgelehnte Löschung keinen Fehler meldet. Das gehört sichtbar gemacht,
    // statt dass man den Fehler in der Oberfläche sucht.
    const { error: rpcFehler } = await supabase.rpc("kann_team_verwalten", { tid: "00000000-0000-0000-0000-000000000000", uid: session.user.id });
    setMigrationFehlt(!!(rpcFehler && /(does not exist|not find|schema cache|404)/i.test(rpcFehler.message || "")));

    const darfVerwalten = !!(me && (me.role === "manager" || me.is_admin || me.is_platform_admin));
    if (!darfVerwalten) { setIsManager(false); setLoading(false); return null; }

    // ALLE Teams der Organisation — auch für einfache Manager. Vorher sahen
    // die nur ihre selbst angelegten; Teams von Kolleg:innen und die eines
    // ausgeschiedenen Leads waren für sie unsichtbar, samt Zielen,
    // Mitgliedern und Zahlen. Sehen und Verwalten sind zwei verschiedene
    // Dinge: verwalten darf weiterhin nur die Leitung des jeweiligen Teams
    // und Admins (migration_88), darauf weist die Ansicht unten hin.
    //
    // Auf die eigene Organisation begrenzen die Zugriffsregeln ohnehin.
    const { data: teams } = await supabase.from("teams").select("*").order("created_at");
    setMyTeams(teams || []);
    return { session, teams: teams || [] };
  }

  async function loadTeamData(teamId, session) {
    if (!teamId) { setLoading(false); return; }

    // "Mitglieder hinzufügen" darf nur Profile der EIGENEN Organisation
    // anbieten — ohne diesen Filter kamen hier Namen aus fremden Firmen
    // (RLS blockt das Hinzufügen dann zwar zu Recht, aber die Suche sollte
    // sie erst gar nicht als Option zeigen).
    const { data: me } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
    const activeOrgId = getActiveOrgId(me);
    // Name der aktiven Organisation, damit unten benannt werden kann, wessen
    // Personen die Liste überhaupt zeigt.
    if (activeOrgId) {
      const { data: o } = await supabase.from("organizations").select("name").eq("id", activeOrgId).maybeSingle();
      setOrgName(o?.name || "");
    }

    // Bereits gesetzte Ziele dieser Woche — ein Team kann mehrere haben.
    // Alle Ziele des Teams laden; laufende und vergangene trennt die
    // Anzeige (migration_96).
    const { data: gesetzteZiele } = await supabase.from("team_goals")
      .select("*").eq("team_id", teamId).order("starts_on", { ascending: false }).limit(100);
    setGoals(gesetzteZiele || []);

    const [{ data: memberRows }, { data: allApproved }] = await Promise.all([
      supabase.from("team_members").select("user_id, profiles:user_id(*)").eq("team_id", teamId),
      // Bewusst OHNE Filter auf status: wer noch auf Freigabe wartet, soll in
      // der Liste auftauchen (nur nicht hinzufügbar sein). Sonst fehlt die
      // Person kommentarlos und man sucht den Fehler an der falschen Stelle.
      activeOrgId
        ? supabase.from("profiles").select("id, full_name, avatar_url, status").eq("organization_id", activeOrgId).order("full_name")
        : Promise.resolve({ data: [] }),
    ]);
    setAllProfiles(allApproved || []);

    // Die eigene Person zählt mit (früher herausgefiltert): eine
    // Teamleitung, die selbst telefoniert und Kurse macht, gehört in die
    // Liste — sonst fehlt sie in Fortschritt, Anruf-Statistik und Ausdruck.
    const memberIds = (memberRows || []).map((r) => r.user_id);
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

    const memberProfiles = (memberRows || []).map((r) => r.profiles).filter(Boolean);
    // Drei gebündelte Anfragen für das ganze Team statt drei pro Mitglied —
    // bei größeren Teams sonst 3×N statt 3 Datenbank-Anfragen.
    const memberIdsForStats = memberProfiles.map((m) => m.id);
    const [{ data: allQr }, { data: allEr }, { data: allRp }] = memberIdsForStats.length
      ? await Promise.all([
          supabase.from("quiz_results").select("user_id, module_id, mc_score, mc_total").in("user_id", memberIdsForStats),
          supabase.from("exam_results").select("user_id, passed").in("user_id", memberIdsForStats),
          supabase.from("roleplay_sessions").select("user_id, detected_principles").in("user_id", memberIdsForStats),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
    const qrByUser = {}, erByUser = {}, rpByUser = {};
    (allQr || []).forEach((r) => { (qrByUser[r.user_id] = qrByUser[r.user_id] || []).push(r); });
    (allEr || []).forEach((r) => { (erByUser[r.user_id] = erByUser[r.user_id] || []).push(r); });
    (allRp || []).forEach((r) => { (rpByUser[r.user_id] = rpByUser[r.user_id] || []).push(r); });

    const enriched = memberProfiles.map((m) => {
      const qr = qrByUser[m.id] || [];
      const er = erByUser[m.id] || [];
      const rp = rpByUser[m.id] || [];
      const doneModules = new Set(qr.map((r) => r.module_id)).size;
      const avgMc = qr.length ? Math.round(qr.reduce((s, r) => s + (r.mc_total ? r.mc_score / r.mc_total : 0), 0) / qr.length * 100) : null;
      const certs = er.filter((r) => r.passed).length;
      rp.forEach((r) => {
        (r.detected_principles || []).forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
      });
      return { ...m, doneModules, totalModules, avgMc, certs, roleplayCount: rp.length };
    });
    setTeam(enriched);
    setPrincipleCounts(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6));

    // Nach den MITGLIEDERN des Teams filtern, nicht nach der zuweisenden
    // Person: sonst sieht ein Manager nur die Paare, die er selbst angelegt
    // hat, und ein fremdes Team wirkt so, als gäbe es dort kein Mentoring
    // (migration_103).
    const idsFuerPaare = memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"];
    const { data: existingPairs } = await supabase.from("mentor_pairs")
      .select("*, mentor:mentor_id(full_name), mentee:mentee_id(full_name)")
      .in("mentee_id", idsFuerPaare).eq("active", true);
    // Team-Lead selbst mit aufnehmen — sonst verschwindet ein Paar, in dem
    // man sich selbst als Mentor/Mentee eingetragen hat, aus der Anzeige.
    const teamMemberIdSet = new Set([...memberIds, session.user.id]);
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
    // Die Organisation gehört ans Team, nicht an die anlegende Person
    // (migration_93): ein Plattform-Admin, der per Firmencode für eine
    // Kundenorganisation arbeitet, gehört selbst zu einer anderen.
    const { data: profil } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
    const { data: newTeam, error } = await supabase.from("teams")
      .insert({ name: newTeamName.trim(), created_by: session.user.id, organization_id: getActiveOrgId(profil) })
      .select().single();
    if (error) alert(error.message);
    if (!error && newTeam) {
      const { error: memErr } = await supabase.from("team_members").insert({ team_id: newTeam.id, user_id: session.user.id });
      if (memErr) alert(memErr.message);
      setNewTeamName("");
      await load();
      await selectTeam(newTeam.id);
    } else if (error) {
      alert(error.message);
    }
    setCreatingTeam(false);
  }

  async function saveTeamName() {
    if (!editingName.trim() || !selectedTeamId) return;
    setSavingName(true);
    const { error } = await supabase.from("teams").update({ name: editingName.trim() }).eq("id", selectedTeamId);
    if (error) { alert(error.message); setSavingName(false); return; }
    setMyTeams((prev) => prev.map((t) => t.id === selectedTeamId ? { ...t, name: editingName.trim() } : t));
    setSavingName(false);
  }

  async function deleteTeam() {
    if (!selectedTeamId) return;
    const teamName = myTeams.find((t) => t.id === selectedTeamId)?.name;
    if (!confirm(`Team "${teamName}" wirklich löschen? Alle Zuordnungen, Ziele und Anfragen für dieses Team gehen dabei verloren.`)) return;
    // Wie bei removeMember: abgelehnte Löschungen melden keinen Fehler. Seit
    // die Seite auch fremde Teams der Organisation zeigt (migration_88), ist
    // das hier besonders leicht auszulösen.
    const { data: geloescht, error } = await supabase.from("teams").delete().eq("id", selectedTeamId).select();
    if (error) { alert(error.message); return; }
    if (!geloescht || geloescht.length === 0) {
      alert("Das Löschen wurde abgelehnt. Ein Team darf nur löschen, wer es angelegt hat.");
      return;
    }
    setSelectedTeamId(null);
    await load();
  }

  async function addMember(profileId) {
    if (!selectedTeamId) return;
    setAddBusyId(profileId);
    const { error } = await supabase.from("team_members").insert({ team_id: selectedTeamId, user_id: profileId });
    if (error) alert(error.message);
    const { data: { session } } = await supabase.auth.getSession();
    await loadTeamData(selectedTeamId, session);
    setAddBusyId(null);
  }

  async function removeMember(profileId) {
    if (!selectedTeamId) return;
    if (!confirm("Aus diesem Team entfernen?")) return;
    // .select() ist hier kein Beiwerk: eine von den Zugriffsregeln verbotene
    // Löschung meldet KEINEN Fehler — sie trifft null Zeilen und gilt als
    // erfolgreich. Ohne die zurückgelieferten Zeilen sah es so aus, als hätte
    // es geklappt, und die Person stand nach dem Neuladen wieder da.
    const { data: entfernt, error } = await supabase.from("team_members").delete()
      .eq("team_id", selectedTeamId).eq("user_id", profileId).select();
    if (error) { alert(error.message); return; }
    if (!entfernt || entfernt.length === 0) {
      alert("Das Entfernen wurde abgelehnt. Mitglieder darf nur verwalten, wer das Team angelegt hat, oder ein Admin der Organisation.");
      return;
    }
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

  async function saveGoal() {
    if (!goalTitle.trim() || !goalTarget || !selectedTeamId) return;
    setSavingGoal(true);
    const { data: { session } } = await supabase.auth.getSession();
    // Zeitraum: Vorgabe (Woche/Monat/Quartal) oder frei gewählte Daten.
    // Zeitzonen-fest gerechnet, siehe lib/woche.js — der Server nutzt
    // dieselben Funktionen, sonst sucht er einen anderen Zeitraum als hier
    // geschrieben wurde.
    const raum = goalZeitraum === "frei"
      ? { von: goalVon, bis: goalBis }
      : zeitraumFuer(goalZeitraum);
    if (!raum.von || !raum.bis || raum.bis < raum.von) {
      setSavingGoal(false);
      alert("Bitte einen gültigen Zeitraum wählen — das Ende darf nicht vor dem Beginn liegen.");
      return;
    }
    // Über den Server (pages/api/team-goal.js): dort wird jede Bedingung
    // einzeln geprüft und benannt. Direkt aus dem Browser kam bei jeder
    // Ablehnung nur "new row violates row-level security policy".
    let neu = null;
    try {
      const antwort = await apiPost("/api/team-goal", {
        teamId: selectedTeamId, title: goalTitle, metric: goalMetric, target: goalTarget,
        von: raum.von, bis: raum.bis, personId: goalPerson || null,
      });
      neu = antwort.ziel;
    } catch (e) {
      setSavingGoal(false);
      alert(e.message || "Das Ziel konnte nicht angelegt werden.");
      return;
    }
    setSavingGoal(false);
    // Statt einer Erfolgsmeldung: das Ziel erscheint direkt in der Liste
    // darunter — man sieht selbst, dass es steht.
    setGoals((prev) => [...prev, neu]);
    setGoalTitle("");
  }

  // Ändern statt löschen und neu anlegen: sonst wäre der bisher gezählte
  // Fortschritt weg, nur weil im Titel ein Tippfehler steckt.
  async function saveGoalEdit(id) {
    if (!goalPatch?.title?.trim() || !goalPatch.target_count) return;
    const patch = {
      title: goalPatch.title.trim(),
      target_count: Number(goalPatch.target_count),
      ends_on: goalPatch.ends_on || null,
    };
    const { data: geaendert, error } = await supabase.from("team_goals").update(patch).eq("id", id).select();
    if (error) { alert(error.message); return; }
    // Wie beim Löschen: eine von den Zugriffsregeln abgelehnte Änderung
    // meldet keinen Fehler, sie trifft null Zeilen.
    if (!geaendert || geaendert.length === 0) {
      alert("Die Änderung wurde abgelehnt. Ziele darf nur verwalten, wer das Team angelegt hat, oder ein Admin der Organisation.");
      return;
    }
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    setGoalEdit(null);
    setGoalPatch(null);
  }

  async function deleteGoal(id) {
    // Siehe removeMember: ohne .select() bliebe eine abgelehnte Löschung
    // unbemerkt und das Ziel käme beim nächsten Laden zurück.
    const { data: geloescht, error } = await supabase.from("team_goals").delete().eq("id", id).select();
    if (error) { alert(error.message); return; }
    if (!geloescht || geloescht.length === 0) {
      alert("Das Löschen wurde abgelehnt. Ziele darf nur verwalten, wer das Team angelegt hat, oder ein Admin der Organisation.");
      return;
    }
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  // Rollenbezeichnung (profiles.role_title) — dasselbe Feld wie im
  // Organigramm und im eigenen Profil. Läuft über die Route mit
  // Rechteprüfung, weil die Regeln auf profiles nur das eigene Profil zum
  // Ändern freigeben.
  async function speichereRolle(personId) {
    try {
      await apiPost("/api/org-role-title", { personId, rolle: rolleWert });
      setTeam((prev) => prev.map((m) => (m.id === personId ? { ...m, role_title: rolleWert.trim() || null } : m)));
      setRolleEdit(null);
    } catch (e) {
      alert(e.message || "Die Bezeichnung konnte nicht gespeichert werden.");
    }
  }

  async function toggleCallStatsAccess(memberId, allow) {
    try {
      await apiPost("/api/manager/set-call-stats-access", { memberId, allow });
      setTeam((prev) => prev.map((m) => m.id === memberId ? { ...m, can_view_call_stats: allow } : m));
    } catch (e) {
      alert(e.message || "Fehler beim Speichern.");
    }
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
    const { error } = await supabase.from("mentor_pairs").insert({ mentor_id: pairMentorId, mentee_id: pairMenteeId, manager_id: session.user.id, active: true });
    if (error) alert(error.message);
    else { setPairMentorId(""); setPairMenteeId(""); }
    await loadTeamData(selectedTeamId, session);
    setPairingBusy(false);
  }

  async function dissolvePair(pairId) {
    const { error } = await supabase.from("mentor_pairs").update({ active: false }).eq("id", pairId);
    if (error) { alert(error.message); return; }
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
    !memberIdsInTeam.has(p.id) &&
    (p.full_name || "").toLowerCase().includes(addQuery.toLowerCase())
  );
  // team enthält seit Neuestem auch die eigene Person — die frühere
  // Sonderbehandlung ("Ich" vorneweg) würde sie sonst doppelt anbieten.
  const mentorCandidates = team;
  // Für den Hinweis unten zählt nur, ob AUSSER der Leitung jemand da ist.
  const andereMitglieder = team.filter((m) => m.id !== selfId);

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Team-Übersicht</h1>
          <div className="brand-stripe w-16 mb-2" />
          <p className="text-textMuted text-sm">Deine Teams verwalten, Mitglieder zuordnen, Fortschritt einsehen.</p>
      {migrationFehlt && (
        <div className="card mt-4 border-coral/40">
          <div className="text-sm text-coral font-semibold mb-1">Datenbank-Erweiterung fehlt</div>
          <p className="text-xs text-textMuted">
            Die Funktion <code>kann_team_verwalten</code> ist in der Datenbank nicht vorhanden (migration_88).
            Solange sie fehlt, lehnt die Datenbank das Hinzufügen und Entfernen von Mitgliedern ab —
            auch für Admins. Bitte den SQL-Block einmal im Supabase-Editor ausführen.
          </p>
        </div>
      )}
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
            {/* Die Liste erschien früher erst nach einer Eingabe — ohne
                Tippen sah man ein leeres Feld und konnte nicht erkennen, ob
                es überhaupt jemanden zum Hinzufügen gibt. */}
            <input className="input mb-2" placeholder="Nach Namen suchen (leer = alle zeigen)" value={addQuery} onChange={(e) => setAddQuery(e.target.value)} />
            {/* Die Mandanten-Grenze sichtbar machen: fehlt jemand in der Liste,
                ist die häufigste Ursache eine andere Organisation — das war
                vorher an keiner Stelle zu erkennen. */}
            <p className="text-[11px] text-textMuted mb-2.5">
              Zeigt nur Personen aus <strong>{orgName || "dieser Organisation"}</strong> ({allProfiles.length} insgesamt).
              Wer sich mit einem anderen Firmencode registriert hat, erscheint hier nicht.
            </p>
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {addableProfiles.slice(0, 30).map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <Avatar name={p.full_name || "?"} src={p.avatar_url} size={26} />
                  <span className="text-sm text-textMain flex-1 min-w-0 truncate">{p.full_name || "Unbenannt"}</span>
                  {p.status === "approved" ? (
                    <button disabled={addBusyId === p.id} onClick={() => addMember(p.id)} className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0">Hinzufügen</button>
                  ) : (
                    // Nicht freigeschaltete Konten lassen sich nicht ins Team
                    // holen. Der Grund gehört hierhin, sonst fehlt die Person
                    // einfach und niemand weiss, warum.
                    <span className="text-xs text-amber flex-shrink-0">wartet auf Freigabe</span>
                  )}
                </div>
              ))}
              {addableProfiles.length === 0 && (
                <p className="text-textMuted text-xs">
                  {addQuery.trim()
                    ? "Keine Treffer."
                    : "Niemand mehr zum Hinzufügen — alle Personen dieser Organisation sind bereits im Team."}
                </p>
              )}
            </div>
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
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <div className="font-semibold text-textMain text-sm">🎯 Ziele für diese Woche</div>
              {/* Die Woche mit anzeigen: sonst lässt sich ein Ziel, das hier
                  steht und unter „Mein Team" fehlt, nicht einordnen. */}
              <div className="text-xs text-textMuted flex-shrink-0">ab {new Date(`${wochenStartTag()}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>
            </div>

            {(() => {
              const heute = wochenStartTag() && new Date().toISOString().slice(0, 10);
              const bisVon = (g) => g.ends_on || g.week_start;
              const laufend = goals.filter((g) => bisVon(g) >= heute);
              const vorbei = goals.filter((g) => bisVon(g) < heute);
              const nameVon = (id) => team.find((m) => m.id === id)?.full_name || "Unbenannt";
              const zeile = (g, grau) => (
                <div key={g.id} className={`py-1.5 border-b border-white/5 last:border-0 ${grau ? "opacity-60" : ""}`}>
                  {goalEdit === g.id ? (
                    <div className="flex flex-col gap-2">
                      <input className="input !py-1 text-sm" value={goalPatch?.title || ""}
                        onChange={(e) => setGoalPatch((p) => ({ ...p, title: e.target.value }))} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <input className="input !w-20 !py-1 text-sm" type="number" min="1" value={goalPatch?.target_count || ""}
                          onChange={(e) => setGoalPatch((p) => ({ ...p, target_count: e.target.value }))} />
                        <span className="text-xs text-textMuted">{goalMetricLabel(g.metric)} bis</span>
                        <input className="input !w-auto !py-1 text-sm" type="date" value={goalPatch?.ends_on || ""}
                          onChange={(e) => setGoalPatch((p) => ({ ...p, ends_on: e.target.value }))} />
                        <button onClick={() => saveGoalEdit(g.id)} className="btn text-xs">Speichern</button>
                        <button onClick={() => { setGoalEdit(null); setGoalPatch(null); }} className="btn-ghost text-xs text-textMuted">Abbrechen</button>
                      </div>
                      {/* Die Kennzahl bleibt: sie zu tauschen machte den
                          bisher gezählten Fortschritt bedeutungslos. */}
                      <p className="text-[11px] text-textMuted">Kennzahl lässt sich nicht ändern — dafür das Ziel entfernen und neu anlegen.</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-textMain truncate">
                          {g.title}
                          {g.user_id && <span className="text-amber text-xs"> · nur {nameVon(g.user_id)}</span>}
                        </div>
                        <div className="text-[11px] text-textMuted">
                          {g.starts_on ? zeitraumLabel(g.starts_on, g.ends_on || g.starts_on) : "Zeitraum offen"}
                        </div>
                      </div>
                      <span className="text-xs text-textMuted flex-shrink-0">{g.target_count} {goalMetricLabel(g.metric)}</span>
                      <button onClick={() => { setGoalEdit(g.id); setGoalPatch({ title: g.title, target_count: g.target_count, ends_on: g.ends_on || "" }); }}
                        className="btn-ghost text-xs flex-shrink-0">Bearbeiten</button>
                      <button onClick={() => deleteGoal(g.id)} className="btn-ghost text-xs text-coral flex-shrink-0">Entfernen</button>
                    </div>
                  )}
                </div>
              );
              return (
                <>
                  {laufend.length > 0 && <div className="mb-3">{laufend.map((g) => zeile(g, false))}</div>}
                  {vorbei.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[11px] uppercase tracking-wide text-textMuted mt-2 mb-1">Vergangene Ziele</div>
                      {vorbei.slice(0, 10).map((g) => zeile(g, true))}
                    </div>
                  )}
                </>
              );
            })()}

            <div className="flex items-center gap-2 flex-wrap">
              <input className="input flex-1 min-w-[160px]" placeholder="z.B. 200 Anwahlen im Team" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} />
              <select className="input !w-auto" value={goalFrei ? "__frei" : goalMetric}
                onChange={(e) => { if (e.target.value === "__frei") { setGoalFrei(true); } else { setGoalFrei(false); setGoalMetric(e.target.value); } }}>
                {/* Frei formulieren statt Kennzahl raten: die KI übersetzt
                    den Satz in Kennzahl und Zielwert. */}
                <option value="__frei">✨ Frei beschreiben …</option>
                {goalMetricGroups().map((gruppe) => (
                  <optgroup key={gruppe.name} label={gruppe.name}>
                    {gruppe.metriken.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <input className="input !w-20" type="number" min="1" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
            </div>

            {goalFrei && (
              <div className="mt-2">
                <ZielDeuter
                  onAbbrechen={() => setGoalFrei(false)}
                  onUebernehmen={(e) => { setGoalTitle(e.title); setGoalMetric(e.metric); setGoalTarget(e.target); setGoalFrei(false); }} />
              </div>
            )}

            {/* Zeitraum und Empfänger (migration_96): früher galt jedes Ziel
                fest für die laufende Woche und immer fürs ganze Team. */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <select className="input !w-auto" value={goalZeitraum} onChange={(e) => setGoalZeitraum(e.target.value)}>
                {ZEITRAEUME.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
              </select>
              {goalZeitraum === "frei" ? (
                <>
                  <input className="input !w-auto" type="date" value={goalVon} onChange={(e) => setGoalVon(e.target.value)} />
                  <span className="text-xs text-textMuted">bis</span>
                  <input className="input !w-auto" type="date" value={goalBis} onChange={(e) => setGoalBis(e.target.value)} />
                </>
              ) : (
                <span className="text-xs text-textMuted">
                  {(() => { const r = zeitraumFuer(goalZeitraum); return zeitraumLabel(r.von, r.bis); })()}
                </span>
              )}
              <select className="input !w-auto" value={goalPerson} onChange={(e) => setGoalPerson(e.target.value)}>
                <option value="">Für das ganze Team</option>
                {team.map((m) => <option key={m.id} value={m.id}>Nur für {m.full_name || "Unbenannt"}</option>)}
              </select>
              <button disabled={savingGoal} onClick={saveGoal} className="btn text-xs disabled:opacity-40">Hinzufügen</button>
            </div>
            <p className="text-[11px] text-textMuted mt-2">
              Mehrere Ziele gleichzeitig sind möglich — etwa 200 Anwahlen <em>und</em> 10 Termine.
              Der Fortschritt zählt alle Teammitglieder zusammen und startet jeden Montag neu.
            </p>
            {/* Ohne Mitglieder ist ein Ziel wirkungslos: niemand sieht es unter
                „Mein Team", und der Fortschritt bleibt zwangsläufig bei null.
                Das war sonst nirgends zu erkennen. */}
            {andereMitglieder.length === 0 && (
              <p className="text-[11px] text-amber mt-2">
                Dieses Team hat noch keine Mitglieder. Ein Ziel bleibt dann für alle unsichtbar und der
                Fortschritt steht dauerhaft auf 0 — füge zuerst unten Mitglieder hinzu.
              </p>
            )}
          </div>

          <div className="card mb-5">
            <div className="font-semibold text-textMain text-sm mb-3">🤝 Mentoring-Paare</div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <select className="input !w-auto flex-1 min-w-[140px]" value={pairMentorId} onChange={(e) => setPairMentorId(e.target.value)}>
                <option value="">Mentor wählen...</option>
                {mentorCandidates.map((m) => <option key={m.id} value={m.id}>{m.full_name || "Unbenannt"}</option>)}
              </select>
              <span className="text-textMuted text-xs">→</span>
              <select className="input !w-auto flex-1 min-w-[140px]" value={pairMenteeId} onChange={(e) => setPairMenteeId(e.target.value)}>
                <option value="">Mentee wählen...</option>
                {mentorCandidates.map((m) => <option key={m.id} value={m.id}>{m.full_name || "Unbenannt"}</option>)}
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
          {/* Nur noch ein Vermerk, keine Warnung: jede Führungsrolle darf die
              Teams ihrer Organisation verwalten (migration_103). Wer es
              aufgebaut hat, ist trotzdem gut zu wissen. */}
          {(() => {
            const team = myTeams.find((t) => t.id === selectedTeamId);
            if (!team || team.created_by === selfId) return null;
            const name = team.created_by === selfId ? "dir" : (allProfiles.find((p) => p.id === team.created_by)?.full_name || null);
            return name ? <p className="text-[11px] text-textMuted mb-2">Angelegt von {name}.</p> : null;
          })()}

          <p className="text-[11px] text-textMuted mb-2">
            📞 entscheidet, ob eine Person auf „Mein Team“ sieht, <strong>wer wie viel beigetragen hat</strong> —
            oder nur die Summen des Teams und die eigenen Zahlen. Die Teamleitung sieht die Aufschlüsselung immer.
          </p>
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
                    <button onClick={() => openProfile(m.id)} className="font-semibold text-textMain text-sm hover:underline">
                      {m.full_name || "Unbenannt"}{m.id === selfId && <span className="text-amber"> · du</span>}
                    </button>
                    {/* Wer ist was: frei beschriftbar, direkt in der Liste.
                        Vorher gab es das nur im Organigramm. */}
                    {rolleEdit === m.id ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input autoFocus className="input !py-1 text-xs" maxLength={60} value={rolleWert}
                          placeholder="z.B. Vertriebsleitung"
                          onChange={(e) => setRolleWert(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") speichereRolle(m.id); if (e.key === "Escape") setRolleEdit(null); }} />
                        <button onClick={() => speichereRolle(m.id)} className="btn-ghost text-xs flex-shrink-0">Speichern</button>
                        <button onClick={() => setRolleEdit(null)} className="btn-ghost text-xs text-textMuted flex-shrink-0">Abbrechen</button>
                      </div>
                    ) : (
                      <button onClick={() => { setRolleEdit(m.id); setRolleWert(m.role_title || ""); }}
                        className="text-[11px] text-textMuted hover:text-textMain mt-0.5 block text-left">
                        {m.role_title || "Bezeichnung hinzufügen"} ✎
                      </button>
                    )}
                    <div className="text-xs text-textMuted mt-1">
                      {m.doneModules}/{m.totalModules} Module · Ø MC {m.avgMc !== null ? m.avgMc + "%" : "–"} · {m.certs}/{COURSES.length} Zertifikate · {m.roleplayCount} Rollenspiele
                    </div>
                  </div>
                  <div className="w-32 h-1.5 bg-line rounded-full overflow-hidden flex-shrink-0">
                    <div className="h-full bg-teal" style={{ width: `${(m.doneModules / m.totalModules) * 100}%` }} />
                  </div>
                  <button onClick={() => toggleCallStatsAccess(m.id, !m.can_view_call_stats)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border flex-shrink-0 ${m.can_view_call_stats ? "border-teal/40 text-teal bg-teal/10" : "border-line text-textMuted hover:text-textMain"}`}>
                    {/* Früher "Auswertung sichtbar/verborgen" — das las sich,
                        als ginge es um die Auswertung DIESER Person. Gemeint
                        ist, ob sie die Zahlen der anderen sehen darf. */}
                    📞 {m.can_view_call_stats ? "sieht Zahlen der anderen" : "sieht nur Summen"}
                  </button>
                  {/* Sich selbst entfernt man nicht aus dem eigenen Team —
                      das Team bliebe führerlos zurück. */}
                  {m.id !== selfId && <button onClick={() => removeMember(m.id)} className="btn-ghost text-xs text-coral flex-shrink-0">Entfernen</button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
