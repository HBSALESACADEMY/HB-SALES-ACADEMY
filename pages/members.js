import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { apiGet } from "../lib/apiClient";

export default function Members() {
  const router = useRouter();
  const [selfId, setSelfId] = useState(null);
  const [orgMembers, setOrgMembers] = useState([]); // Mitglieder der eigenen Organisation — direkt chatbar, keine Anfrage nötig
  const [friendships, setFriendships] = useState([]); // nur für organisationsübergreifende Kontakte relevant
  const [teams, setTeams] = useState([]);
  const [myTeamIds, setMyTeamIds] = useState(new Set());
  const [teamRequests, setTeamRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // Globale Namenssuche (unternehmensübergreifend) — für Personen AUSSERHALB
  // der eigenen Organisation gilt hier bewusst der Freundschaftsanfrage-Weg:
  // erst nach Annahme kann geschrieben werden. Mitglieder der eigenen
  // Organisation (Sektion oben) brauchen dafür keine Anfrage.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const { results } = await apiGet(`/api/search-members?q=${encodeURIComponent(q)}`);
        setSearchResults(results || []);
      } catch (e) {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const { data: me } = await supabase.from("profiles").select("organization_id").eq("id", session.user.id).maybeSingle();

    const [{ data: profiles }, { data: fr }, { data: allTeams }, { data: allMemberships }, { data: myMemberships }, { data: tr }] = await Promise.all([
      me?.organization_id
        ? supabase.from("profiles").select("id, full_name, avatar_url, bio, company_name, role_title, website, instagram, linkedin, role")
            .eq("organization_id", me.organization_id).eq("status", "approved").neq("id", session.user.id).order("full_name")
        : Promise.resolve({ data: [] }),
      supabase.from("friendships").select("*").or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`),
      supabase.from("teams").select("id, name, created_by"),
      supabase.from("team_members").select("team_id, user_id"),
      supabase.from("team_members").select("team_id").eq("user_id", session.user.id),
      supabase.from("team_requests").select("*").eq("requester_id", session.user.id),
    ]);
    setOrgMembers(profiles || []);
    setFriendships(fr || []);
    setTeamRequests(tr || []);
    setMyTeamIds(new Set((myMemberships || []).map((m) => m.team_id)));

    const memberCountByTeam = {};
    (allMemberships || []).forEach((m) => { memberCountByTeam[m.team_id] = (memberCountByTeam[m.team_id] || 0) + 1; });
    const leadIds = Array.from(new Set((allTeams || []).map((t) => t.created_by)));
    const { data: leadProfiles } = leadIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", leadIds)
      : { data: [] };
    const leadNameById = {};
    (leadProfiles || []).forEach((p) => { leadNameById[p.id] = p.full_name || "Unbenannt"; });
    setTeams((allTeams || []).map((t) => ({ ...t, memberCount: memberCountByTeam[t.id] || 0, leadName: leadNameById[t.created_by] })));

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function relationTo(memberId) {
    return friendships.find((f) =>
      (f.requester_id === selfId && f.addressee_id === memberId) ||
      (f.requester_id === memberId && f.addressee_id === selfId)
    );
  }

  async function sendRequest(memberId) {
    setBusyId(memberId);
    await supabase.from("friendships").insert({ requester_id: selfId, addressee_id: memberId });
    await load();
    setBusyId(null);
  }

  async function respond(friendship, status) {
    setBusyId(friendship.id);
    await supabase.from("friendships").update({ status }).eq("id", friendship.id);
    await load();
    setBusyId(null);
  }

  async function sendTeamRequest(team) {
    setBusyId("team-" + team.id);
    await supabase.from("team_requests").insert({ requester_id: selfId, manager_id: team.created_by, team_id: team.id });
    await load();
    setBusyId(null);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Mitglieder</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Mitglieder deiner Organisation kannst du direkt anschreiben. Für alle anderen erst eine Anfrage senden und auf Annahme warten.</p>

      <div className="card mb-6">
        <div className="font-semibold text-white text-sm mb-3">Person finden (organisationsübergreifend)</div>
        <input className="input" placeholder="Namen eingeben..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        {searching && <p className="text-textMuted text-xs mt-2">Suche...</p>}
        {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
          <p className="text-textMuted text-xs mt-2">Keine Treffer.</p>
        )}
        {searchResults.length > 0 && (
          <div className="flex flex-col gap-2.5 mt-3">
            {searchResults.map((m) => {
              const rel = relationTo(m.id);
              const isBusy = busyId === m.id || busyId === rel?.id;
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar name={m.full_name || "?"} src={m.avatar_url} size={32} />
                  <span className="text-sm text-white flex-1 truncate">{m.full_name || "Unbenannt"}</span>
                  {!rel && (
                    <button disabled={isBusy} onClick={() => sendRequest(m.id)} className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0">
                      Anfrage senden
                    </button>
                  )}
                  {rel?.status === "pending" && rel.requester_id === selfId && (
                    <span className="text-xs text-textMuted flex-shrink-0">Angefragt...</span>
                  )}
                  {rel?.status === "pending" && rel.addressee_id === selfId && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button disabled={isBusy} onClick={() => respond(rel, "accepted")} className="btn-ghost text-xs text-teal border-teal/40 disabled:opacity-40">Annehmen</button>
                      <button disabled={isBusy} onClick={() => respond(rel, "declined")} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ablehnen</button>
                    </div>
                  )}
                  {rel?.status === "declined" && (
                    <button disabled={isBusy} onClick={() => sendRequest(m.id)} className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0">
                      Erneut anfragen
                    </button>
                  )}
                  {rel?.status === "accepted" && (
                    <button onClick={() => router.push(`/messages?to=${m.id}`)} className="btn text-xs flex-shrink-0">
                      Schreiben
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {teams.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-white mb-2.5">Teams</h2>
          <div className="flex flex-col gap-2.5">
            {teams.map((t) => {
              const inTeam = myTeamIds.has(t.id);
              const tReq = teamRequests.find((r) => r.team_id === t.id);
              const busy = busyId === "team-" + t.id;
              return (
                <div key={t.id} className="card flex items-center gap-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white text-sm">{t.name}</div>
                    <div className="text-xs text-textMuted mt-0.5">Lead: {t.leadName} · {t.memberCount} Mitglieder</div>
                  </div>
                  {inTeam ? (
                    <span className="text-[11px] text-teal flex-shrink-0">In diesem Team</span>
                  ) : !tReq ? (
                    <button disabled={busy} onClick={() => sendTeamRequest(t)} className="btn-ghost text-xs text-violet border-violet/40 disabled:opacity-40 flex-shrink-0">
                      Beitreten
                    </button>
                  ) : tReq.status === "pending" ? (
                    <span className="text-[11px] text-textMuted flex-shrink-0">Anfrage läuft...</span>
                  ) : tReq.status === "declined" ? (
                    <button disabled={busy} onClick={() => sendTeamRequest(t)} className="btn-ghost text-xs text-violet border-violet/40 disabled:opacity-40 flex-shrink-0">
                      Erneut anfragen
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-white mb-2.5">Mitglieder meiner Organisation</h2>
      <div className="flex flex-col gap-2.5">
        {orgMembers.map((m) => (
          <div key={m.id} className="card flex items-center gap-3.5">
            <Avatar name={m.full_name || "?"} src={m.avatar_url} size={44} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white text-sm">{m.full_name || "Unbenannt"}</div>
              {(m.role_title || m.company_name) && (
                <div className="text-xs text-textMuted truncate">
                  {[m.role_title, m.company_name].filter(Boolean).join(" · ")}
                </div>
              )}
              {m.bio && <div className="text-xs text-textMuted truncate">{m.bio}</div>}
              {(m.website || m.instagram || m.linkedin) && (
                <div className="flex items-center gap-2.5 mt-1">
                  {m.website && <a href={m.website.startsWith("http") ? m.website : `https://${m.website}`} target="_blank" rel="noreferrer" className="text-[11px] text-amber hover:underline">Webseite</a>}
                  {m.instagram && <a href={`https://instagram.com/${m.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="text-[11px] text-amber hover:underline">Instagram</a>}
                  {m.linkedin && <a href={m.linkedin.startsWith("http") ? m.linkedin : `https://${m.linkedin}`} target="_blank" rel="noreferrer" className="text-[11px] text-amber hover:underline">LinkedIn</a>}
                </div>
              )}
            </div>
            <button onClick={() => router.push(`/messages?to=${m.id}`)} className="btn text-xs flex-shrink-0">
              Schreiben
            </button>
          </div>
        ))}
        {orgMembers.length === 0 && <p className="text-textMuted text-sm">Noch keine anderen Mitglieder in deiner Organisation.</p>}
      </div>
    </Layout>
  );
}
