import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";
import { apiGet } from "../lib/apiClient";
import { goalMetricLabel } from "../lib/goalMetrics";
import { zeitraumLabel } from "../lib/zielzeitraum";
import { getActiveOrgId } from "../lib/activeOrg";
import { apiPost } from "../lib/apiClient";
import Organigramm from "../components/Organigramm";

const RANG_LABEL = (key) => (key === "xp" ? "XP" : goalMetricLabel(key));

export default function Team() {
  const router = useRouter();
  const [selfId, setSelfId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState("");
  const [rangliste, setRangliste] = useState([]);
  const [rangMetrik, setRangMetrik] = useState("xp");
  const [myTeams, setMyTeams] = useState([]);
  const [darfDetails, setDarfDetails] = useState(false);
  const [wochenStart, setWochenStart] = useState("");
  const [leistungMetrik, setLeistungMetrik] = useState("xp");
  const [organigramm, setOrganigramm] = useState(null);
  const [organigrammOffen, setOrganigrammOffen] = useState(false);
  const [offenesTeam, setOffenesTeam] = useState(null);
  const [offenesZiel, setOffenesZiel] = useState(null);
  const [vergangeneOffen, setVergangeneOffen] = useState(null);
  const [leavingId, setLeavingId] = useState(null);
  const [mentor, setMentor] = useState(null);
  const [mentees, setMentees] = useState([]);

  async function leaveTeam(teamId) {
    if (!confirm("Team wirklich verlassen? Du kannst später jederzeit eine neue Team-Anfrage stellen.")) return;
    setLeavingId(teamId);
    // Siehe pages/manager.js: eine abgelehnte Löschung meldet keinen Fehler,
    // sondern trifft null Zeilen — ohne .select() bliebe man stillschweigend
    // im Team.
    const { data: ausgetreten, error } = await supabase.from("team_members").delete()
      .eq("team_id", teamId).eq("user_id", selfId).select();
    setLeavingId(null);
    if (error) { alert(error.message); return; }
    if (!ausgetreten || ausgetreten.length === 0) {
      alert("Das Austreten wurde abgelehnt. Bitte wende dich an deine Teamleitung.");
      return;
    }
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
      setWochenStart(daten.wochenStart || "");
      setLeistungMetrik(daten.leistungMetrik || "xp");
      setFehler("");
    } catch (e) {
      // Früher blieb die Seite bei einem Fehler einfach leer — dann sieht es
      // aus, als gäbe es keine Teams.
      setFehler(e.message || "Die Team-Zahlen konnten nicht geladen werden.");
    }

    // Organigramm nur für Führungsrollen — die Route antwortet sonst mit 403.
    // Fehlschlag bleibt still: für alle anderen ist das der Normalfall, kein
    // Fehler, und der Rest der Seite hängt nicht daran.
    try {
      const { data: profil2 } = await supabase.from("profiles")
        .select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const oid = getActiveOrgId(profil2);
      setOrganigramm(await apiGet("/api/org-chart" + (oid ? `?activeOrgId=${oid}` : "")));
    } catch (e) {
      setOrganigramm(null);
    }

    const [{ data: pair }, { data: myMentees }] = await Promise.all([
      supabase.from("mentor_pairs").select("*, mentor:mentor_id(full_name, avatar_url)").eq("mentee_id", session.user.id).eq("active", true).maybeSingle(),
      supabase.from("mentor_pairs").select("*, mentee:mentee_id(full_name, avatar_url)").eq("mentor_id", session.user.id).eq("active", true),
    ]);
    setMentor(pair);
    setMentees(myMentees || []);

    // Ab hier gelten die Ziele als gesehen — der Zähler in der Navigation
    // verschwindet damit (gleiches Muster wie bei der Community).
    // Fehlt die Spalte (migration_87), schlägt nur dieses Update fehl — der
    // Rest der Seite darf davon nichts merken.
    await supabase.from("profiles").update({ last_seen_team_goals_at: new Date().toISOString() }).eq("id", session.user.id);

    setLoading(false);
  }

  async function setzeRolle(personId, rolle) {
    try {
      await apiPost("/api/org-role-title", { personId, rolle });
      // Nur den geänderten Eintrag anpassen statt alles neu zu laden — der
      // aufgeklappte Baum soll nicht zusammenklappen.
      setOrganigramm((o) => o && {
        teams: o.teams.map((t) => ({
          ...t,
          leitung: t.leitung && t.leitung.id === personId ? { ...t.leitung, rolle } : t.leitung,
          mitglieder: t.mitglieder.map((m) => (m.id === personId ? { ...m, rolle } : m)),
        })),
        ohneTeam: o.ohneTeam.map((p) => (p.id === personId ? { ...p, rolle } : p)),
      });
    } catch (e) {
      alert(e.message || "Die Rollenbezeichnung konnte nicht gespeichert werden.");
    }
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
                <div className="text-xs text-textMuted mb-2">Zurzeit läuft kein Ziel.</div>
              )}
              {t.ziele.map((z) => (
                <div key={z.id} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-textMuted min-w-0 truncate">
                      {z.user_id ? "👤" : "🎯"} {z.title}
                      {z.personName && <span className="text-amber"> · nur {z.personName}</span>}
                    </span>
                    <span className="text-xs text-textMuted flex-shrink-0">{z.fortschritt}/{z.target_count} {goalMetricLabel(z.metric)}</span>
                  </div>
                  {/* Bis wann das Ziel läuft — ohne das ist ein Fortschritt
                      von 60 % nicht einzuordnen (migration_96). */}
                  <div className="text-[10.5px] text-textMuted mb-1.5">{zeitraumLabel(z.von, z.bis)}</div>
                  <div className="h-2 bg-line rounded-full overflow-hidden">
                    <div className="h-full brand-gradient transition-all" style={{ width: `${Math.min(100, (z.fortschritt / z.target_count) * 100)}%` }} />
                  </div>

                  {/* Wer hat wie viel beigetragen — direkt am Ziel, nicht
                      versteckt in der Mitgliederliste. beitraege ist null,
                      wenn die Einzelwerte für diese Person nicht sichtbar
                      sein dürfen (siehe pages/api/team-goals.js). */}
                  {z.beitraege && (
                    <>
                      <button
                        onClick={() => setOffenesZiel(offenesZiel === z.id ? null : z.id)}
                        className="text-[11px] text-textMuted hover:text-textMain mt-1.5">
                        {offenesZiel === z.id ? "Aufteilung ausblenden" : "Wer hat was beigetragen?"}
                      </button>
                      {offenesZiel === z.id && (
                        <div className="mt-2 pl-1 flex flex-col gap-1">
                          {t.mitglieder
                            .map((m) => ({ ...m, wert: z.beitraege[m.id] || 0 }))
                            .sort((a, b) => b.wert - a.wert)
                            .map((m) => (
                              <div key={m.id} className="flex items-center gap-2">
                                <span className="text-[11px] text-textMain flex-1 min-w-0 truncate">
                                  {m.name}{m.id === selfId && <span className="text-textMuted"> (du)</span>}
                                </span>
                                {/* Auch ein Balken je Person: die blosse Zahl
                                    sagt nichts darüber, wie weit jemand vom
                                    Rest entfernt liegt. */}
                                <div className="w-20 h-1 bg-line rounded-full overflow-hidden flex-shrink-0">
                                  <div className="h-full brand-gradient" style={{ width: `${z.fortschritt ? Math.round((m.wert / z.fortschritt) * 100) : 0}%` }} />
                                </div>
                                <span className="text-[11px] font-mono text-textMuted w-10 text-right flex-shrink-0">{m.wert}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {t.vergangeneZiele?.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setVergangeneOffen(vergangeneOffen === t.id ? null : t.id)}
                    className="text-[11px] text-textMuted hover:text-textMain">
                    {vergangeneOffen === t.id ? "Vergangene Ziele ausblenden" : `Vergangene Ziele (${t.vergangeneZiele.length})`}
                  </button>
                  {vergangeneOffen === t.id && (
                    <div className="mt-2 flex flex-col gap-2">
                      {t.vergangeneZiele.map((z) => {
                        const erreicht = z.fortschritt >= z.target_count;
                        return (
                          <div key={z.id} className="opacity-70">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-textMuted min-w-0 truncate">
                                {erreicht ? "✅" : "▫️"} {z.title}
                                {z.personName && <span className="text-amber"> · nur {z.personName}</span>}
                              </span>
                              <span className="text-xs text-textMuted flex-shrink-0">{z.fortschritt}/{z.target_count}</span>
                            </div>
                            <div className="text-[10.5px] text-textMuted">{zeitraumLabel(z.von, z.bis)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Wer diese Woche vorn liegt — der ausdrücklich gewünschte
                  Blick auf die Leistung INNERHALB des Teams, nicht nur im
                  Vergleich der Teams untereinander. */}
              {t.leistung.some((l) => l.wert > 0) && (
                <div className="mt-3 pt-3 border-t border-line">
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-textMain">Leistung diese Woche</span>
                    <span className="text-[11px] text-textMuted flex-shrink-0">nach {RANG_LABEL(leistungMetrik)}</span>
                  </div>
                  {t.leistung.slice(0, 5).map((l, i) => (
                    <div key={l.id} className="flex items-center gap-2.5 py-1 cursor-pointer" onClick={() => openProfile(l.id)}>
                      <span className="w-5 text-center text-xs text-textMuted font-mono flex-shrink-0">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                      <Avatar name={l.name} src={l.avatar_url} size={22} />
                      <span className="text-xs text-textMain flex-1 min-w-0 truncate">
                        {l.name}{l.id === selfId && <span className="text-textMuted"> (du)</span>}
                      </span>
                      <span className="text-xs font-mono text-textMain flex-shrink-0">{l.wert}</span>
                    </div>
                  ))}
                </div>
              )}

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
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openProfile(m.id)}>
                        <div className="text-sm text-textMain truncate">
                          {m.name}
                          {m.id === selfId && <span className="text-textMuted"> (du)</span>}
                          {m.istLeitung && <span className="text-amber text-xs"> · Lead</span>}
                        </div>
                        {/* Lernstand ist bewusst für alle im Team sichtbar —
                            anders als die Anruf-Zahlen weiter rechts. */}
                        <div className="text-[11px] text-textMuted truncate">
                          {m.module.fertig}/{m.module.gesamt} Module
                          {m.kurse.length > 0
                            ? ` · abgeschlossen: ${m.kurse.join(", ")}`
                            : " · noch kein Kurs abgeschlossen"}
                        </div>
                      </div>
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

      {organigramm && (
        <div className="card mb-5">
          <button onClick={() => setOrganigrammOffen((v) => !v)} className="flex items-center justify-between gap-2 w-full text-left">
            <span className="font-semibold text-textMain text-sm">🗂️ Organigramm</span>
            <span className="text-xs text-textMuted flex-shrink-0">{organigrammOffen ? "ausblenden" : "anzeigen"}</span>
          </button>
          {organigrammOffen && (
            <div className="mt-3">
              <p className="text-[11px] text-textMuted mb-3">
                Die Struktur entsteht von selbst: gründet jemand aus einem Team ein eigenes Team,
                erscheint es automatisch eine Ebene tiefer. Rollenbezeichnungen lassen sich hier direkt ändern.
              </p>
              <Organigramm daten={organigramm} onRolle={setzeRolle} />
            </div>
          )}
        </div>
      )}

      {/* Die Rangliste war ein eigener Navigationspunkt. Sie gehört hierhin:
          direkt neben den Team-Wettbewerb, mit dem sie sich sonst nur
          gegenseitig Konkurrenz macht. */}
      <div className="card mb-5 flex items-center gap-3 cursor-pointer" onClick={() => router.push("/leaderboard")}>
        <span className="text-xl">🏅</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-textMain text-sm">Rangliste der Organisation</div>
          <div className="text-xs text-textMuted">Alle Mitglieder nach XP, nicht nur dein Team.</div>
        </div>
        <span className="text-xs text-textMuted flex-shrink-0">öffnen →</span>
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
