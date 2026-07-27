import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";

export default function Members() {
  const router = useRouter();
  const [selfId, setSelfId] = useState(null);
  const [members, setMembers] = useState([]);
  const [friendships, setFriendships] = useState([]); // alle, die mich betreffen
  const [teamRequests, setTeamRequests] = useState([]);
  const [myManagerId, setMyManagerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const [{ data: profiles }, { data: fr }, { data: tr }, { data: me }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url, bio, company_name, role_title, website, instagram, linkedin, role, manager_id").eq("status", "approved").neq("id", session.user.id).order("full_name"),
      supabase.from("friendships").select("*").or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`),
      supabase.from("team_requests").select("*").eq("requester_id", session.user.id),
      supabase.from("profiles").select("manager_id").eq("id", session.user.id).maybeSingle(),
    ]);
    setMembers(profiles || []);
    setFriendships(fr || []);
    setTeamRequests(tr || []);
    setMyManagerId(me?.manager_id || null);
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

  async function sendTeamRequest(managerId) {
    setBusyId("team-" + managerId);
    await supabase.from("team_requests").insert({ requester_id: selfId, manager_id: managerId });
    await load();
    setBusyId(null);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Mitglieder</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Alle im Team — schick eine Anfrage, um schreiben zu können.</p>

      <div className="flex flex-col gap-2.5">
        {members.map((m) => {
          const rel = relationTo(m.id);
          const isBusy = busyId === m.id || busyId === rel?.id;
          return (
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

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {!rel && (
                  <button disabled={isBusy} onClick={() => sendRequest(m.id)} className="btn-ghost text-xs disabled:opacity-40">
                    Anfrage senden
                  </button>
                )}
                {rel?.status === "pending" && rel.requester_id === selfId && (
                  <span className="text-xs text-textMuted">Angefragt...</span>
                )}
                {rel?.status === "pending" && rel.addressee_id === selfId && (
                  <div className="flex items-center gap-2">
                    <button disabled={isBusy} onClick={() => respond(rel, "accepted")} className="btn-ghost text-xs text-teal border-teal/40 disabled:opacity-40">Annehmen</button>
                    <button disabled={isBusy} onClick={() => respond(rel, "declined")} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40">Ablehnen</button>
                  </div>
                )}
                {rel?.status === "declined" && (
                  <button disabled={isBusy} onClick={() => sendRequest(m.id)} className="btn-ghost text-xs disabled:opacity-40">
                    Erneut anfragen
                  </button>
                )}
                {rel?.status === "accepted" && (
                  <button onClick={() => router.push(`/messages?to=${m.id}`)} className="btn text-xs">
                    Schreiben
                  </button>
                )}

                {m.role === "manager" && (() => {
                  const tReq = teamRequests.find((t) => t.manager_id === m.id);
                  if (myManagerId === m.id) return <span className="text-[11px] text-teal">In deinem Team</span>;
                  if (!tReq) return (
                    <button disabled={busyId === "team-" + m.id} onClick={() => sendTeamRequest(m.id)} className="btn-ghost text-xs text-violet border-violet/40 disabled:opacity-40">
                      Team beitreten
                    </button>
                  );
                  if (tReq.status === "pending") return <span className="text-[11px] text-textMuted">Team-Anfrage läuft...</span>;
                  if (tReq.status === "declined") return (
                    <button disabled={busyId === "team-" + m.id} onClick={() => sendTeamRequest(m.id)} className="btn-ghost text-xs text-violet border-violet/40 disabled:opacity-40">
                      Erneut anfragen
                    </button>
                  );
                  return null;
                })()}
              </div>
            </div>
          );
        })}
        {members.length === 0 && <p className="text-textMuted text-sm">Noch keine anderen Mitglieder.</p>}
      </div>
    </Layout>
  );
}
