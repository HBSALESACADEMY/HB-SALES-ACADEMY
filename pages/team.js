import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";
import { apiGet } from "../lib/apiClient";
import { goalMetricLabel } from "../lib/goalMetrics";
import { getActiveOrgId } from "../lib/activeOrg";

const RANG_LABEL = (key) => (key === "xp" ? "XP" : goalMetricLabel(key));

export default function Team() {
  const [selfId, setSelfId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState("");
  const [rangliste, setRangliste] = useState([]);
  const [rangMetrik, setRangMetrik] = useState("xp");
  const [myTeams, setMyTeams] = useState([]);
  const [darfDetails, setDarfDetails] = useState(false);
  const [offenesTeam, setOffenesTeam] = useState(null);
  const [leavingId, setLeavingId] = useState(null);
  const [mentor, setMentor] = useState(null);
  const [mentees, setMentees] = useState([]);

  async function leaveTeam(teamId) {
    if (!confirm("Team wirklich verlassen? Du kannst später jederzeit eine neue Team-Anfrage stellen.")) return;
    setLeavingId(teamId);
    const { error } = await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", selfId);
    setLeavingId(null);
    if (error) { alert(error.message); return; }
    await load();
  }

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    // Sämtliche Zahlen kommen gesammelt vom Server (pages/api/team-goals.js):
    // die Anruf-Zahlen der anderen darf der Browser gar nicht lesen, jede
    // Summe käme hier zu niedrig heraus. Nebenbei ersetzt der eine Aufruf die
    // frühere Abfrage je Team.
    try {
      const { data: profil } = await supabase.from("profiles")
        .select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const orgId = getActiveOrgId(profil);
      const daten = await apiGet("/api/team-goals" + (orgId ? `?activeOrgId=${orgId}` : ""));
      setMyTeams(daten.teams || []);
      setRangliste(daten.rangliste || []);
      setRangMetrik(daten.ranglisteMetrik || "xp");
      setDarfDetails(!!daten.darfDetails);
      setFehler("");
    } catch (e) {
      // Früher blieb die Seite bei einem Fehler einfach leer — dann sieht es
      // aus, als gäbe es keine Teams.
      setFehler(e.message || "Die Team-Zahlen konnten nicht geladen werden.");
    }

    const [{ data: pair }, { data: myMentees }] = await Promise.all([
      supabase.from("mentor_pairs").select("*, mentor:mentor_id(full_name, avatar_url)").eq("mentee_id", session.user.id).eq("active", true).maybeSingle(),
      supabase.from("mentor_pairs").select("*, mentee:mentee_id(full_name, avatar_url)").eq("mentor_id", session.user.id).eq("active", true),
    ]);
    setMentor(pair);
    setMentees(myMentees || []);

    // Ab hier gelten die Ziele als gesehen — der Zähler in der Navigation
    // verschwindet damit (gleiches Muster wie bei der Community).
    await supabase.from("profiles").update({ last_seen_team_goals_at: new Date().toISOString() }).eq("id", session.user.id);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  const myTeamIdSet = new Set(myTeams.map((t) => t.id));

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Mein Team</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Wettbewerb, Ziele und Mentoring für deine Teams.</p>

      {fehler && <div className="card mb-5 border-coral/40 text-sm text-coral">{fehler}</div>}

      {!fehler && myTeams.length === 0 && (
        <div className="card mb-5">
          <p className="text-textMuted text-sm">
            Du bist noch in keinem Team. Deine Teamleitung kann dich hinzufügen — danach siehst du hier
            die Wochenziele, wer sonst im Team ist und wie ihr im Wettbewerb steht.
          </p>
        </div>
      )}

      {myTeams.length > 0 && (
        <div className="flex flex-col gap-3 mb-5">
          {myTeams.map((t) => (
            <div key={t.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-textMain text-sm">{t.name}{t.isLead && <span className="text-amber"> (du leitest dieses Team)</span>}</div>
                {!t.isLead && (
                  <button disabled={leavingId === t.id} onClick={() => leaveTeam(t.id)} className="btn-ghost text-xs text-coral border-coral/40 disabled:opacity-40 flex-shrink-0">
                    {leavingId === t.id ? "..." : "Team verlassen"}
                  </button>
                )}
              </div>
              {!t.isLead && t.leadName && <div className="text-xs text-textMuted mb-2">Lead: {t.leadName}</div>}
              {t.ziele.length === 0 && (
                <div className="text-xs text-textMuted mb-2">Für diese Woche ist noch kein Ziel gesetzt.</div>
              )}
              {t.ziele.map((z) => (
                <div key={z.id} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs text-textMuted min-w-0 truncate">🎯 {z.title}</span>
                    <span className="text-xs text-textMuted flex-shrink-0">{z.fortschritt}/{z.target_count} {goalMetricLabel(z.metric)}</span>
                  </div>
                  <div className="h-2 bg-line rounded-full overflow-hidden">
                    <div className="h-full brand-gradient transition-all" style={{ width: `${Math.min(100, (z.fortschritt / z.target_count) * 100)}%` }} />
                  </div>
                </div>
              ))}

              <button
                onClick={() => setOffenesTeam(offenesTeam === t.id ? null : t.id)}
                className="btn-ghost text-xs mt-3">
                {offenesTeam === t.id ? "Mitglieder ausblenden" : `Mitglieder ansehen (${t.mitglieder.length})`}
              </button>

              {offenesTeam === t.id && (
                <div className="mt-3 pt-3 border-t border-line">
                  {t.mitglieder.length === 0 && <p className="text-xs text-textMuted">Noch keine Mitglieder eingetragen.</p>}
                  {t.mitglieder.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-1.5">
                      <div className="cursor-pointer flex-shrink-0" onClick={() => openProfile(m.id)}>
                        <Avatar name={m.name} src={m.avatar_url} size={28} />
                      </div>
                      <span className="text-sm text-textMain flex-1 min-w-0 truncate cursor-pointer" onClick={() => openProfile(m.id)}>
                        {m.name}
                        {m.id === selfId && <span className="text-textMuted"> (du)</span>}
                        {m.istLeitung && <span className="text-amber text-xs"> · Lead</span>}
                      </span>
                      {/* Der Beitrag je Person ist bewusst nicht für alle sichtbar —
                          er zeigt die Leistung einzelner Kolleg:innen. */}
                      {t.ziele.map((z) => z.beitraege && (
                        <span key={z.id} className="text-xs text-textMuted font-mono flex-shrink-0" title={z.title}>
                          {z.beitraege[m.id] || 0} {goalMetricLabel(z.metric)}
                        </span>
                      ))}
                    </div>
                  ))}
                  {!darfDetails && t.ziele.length > 0 && (
                    <p className="text-[11px] text-textMuted mt-2">
                      Wie viel einzelne Mitglieder beigetragen haben, sieht nur die Teamleitung.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card mb-5">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <div className="font-semibold text-textMain text-sm">🏆 Team-Wettbewerb dieser Woche</div>
          <div className="text-xs text-textMuted flex-shrink-0">gemessen an {RANG_LABEL(rangMetrik)}</div>
        </div>
        <div className="flex flex-col gap-2">
          {rangliste.map((t, i) => {
            const isMyTeam = myTeamIdSet.has(t.teamId);
            return (
              <div key={t.teamId} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isMyTeam ? "bg-surfaceRaised border border-amber/30" : ""}`}>
                <span className="w-6 text-center text-sm text-textMuted font-mono">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                <span className="flex-1 text-sm text-textMain min-w-0">{t.name}{isMyTeam && <span className="text-amber"> (dein Team)</span>} <span className="text-textMuted text-xs">· {t.mitglieder} Mitglieder</span></span>
                <span className="font-mono text-sm text-textMain flex-shrink-0">{t.wert}</span>
              </div>
            );
          })}
          {rangliste.length === 0 && <p className="text-textMuted text-sm">Noch keine Teams vorhanden.</p>}
        </div>
      </div>

      {(mentor || mentees.length > 0) && (
        <div className="card">
          <div className="font-semibold text-textMain text-sm mb-3">🤝 Mentoring</div>
          {mentor && (
            <div className="flex items-center gap-3 mb-2 cursor-pointer" onClick={() => openProfile(mentor.mentor_id)}>
              <Avatar name={mentor.mentor?.full_name || "?"} src={mentor.mentor?.avatar_url} size={32} />
              <div className="text-sm"><span className="text-textMuted">Dein Mentor: </span><span className="text-textMain font-medium">{mentor.mentor?.full_name}</span></div>
            </div>
          )}
          {mentees.map((m) => (
            <div key={m.id} className="flex items-center gap-3 cursor-pointer" onClick={() => openProfile(m.mentee_id)}>
              <Avatar name={m.mentee?.full_name || "?"} src={m.mentee?.avatar_url} size={32} />
              <div className="text-sm"><span className="text-textMuted">Du bist Mentor für: </span><span className="text-textMain font-medium">{m.mentee?.full_name}</span></div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
