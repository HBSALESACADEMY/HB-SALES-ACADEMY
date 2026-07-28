import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { PERSONAS } from "../lib/personas";

export default function RoleplayHistory() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("roleplay_sessions").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(50);
      setSessions(data || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Rollenspiel-Verlauf</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Deine vergangenen Rollenspiele nochmal durchlesen.</p>

      <div className="flex flex-col gap-3">
        {sessions.map((s) => {
          const persona = PERSONAS.find((p) => p.id === s.persona_id);
          const isOpen = expandedId === s.id;
          const d = new Date(s.created_at);
          return (
            <div key={s.id} className="card">
              <button onClick={() => setExpandedId(isOpen ? null : s.id)} className="flex items-center justify-between w-full text-left">
                <div>
                  <div className="font-semibold text-white text-sm">{persona?.name || "Rollenspiel"} {s.difficulty && `· ${s.difficulty}`}</div>
                  <div className="text-xs text-textMuted mt-0.5">{d.toLocaleDateString("de-DE")} · {d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} {s.evaluation_score != null && `· Score ${s.evaluation_score}`}</div>
                </div>
                <Icon name="chevron" size={14} color="#5A5F72" />
              </button>
              {s.evaluation && <p className="text-xs text-textMuted mt-2">{s.evaluation}</p>}
              {isOpen && (
                <div className="mt-3 pt-3 border-t border-line flex flex-col gap-3">
                  {s.evaluation_detail && (
                    <div className="flex flex-col gap-3">
                      {(s.evaluation_detail.staerken?.length > 0 || s.evaluation_detail.verbesserung?.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <strong className="text-xs text-teal block mb-1.5">Stärken</strong>
                            <ul className="text-xs text-textMuted list-disc pl-4 space-y-1">
                              {(s.evaluation_detail.staerken || []).map((x, i) => <li key={i}>{x}</li>)}
                            </ul>
                          </div>
                          <div>
                            <strong className="text-xs text-coral block mb-1.5">Verbesserung</strong>
                            <ul className="text-xs text-textMuted list-disc pl-4 space-y-1">
                              {(s.evaluation_detail.verbesserung || []).map((x, i) => <li key={i}>{x}</li>)}
                            </ul>
                          </div>
                        </div>
                      )}
                      {s.evaluation_detail.beispielsaetze?.length > 0 && (
                        <div>
                          <strong className="text-xs text-violet block mb-2">Das hättest du sagen können</strong>
                          <div className="flex flex-col gap-2.5">
                            {s.evaluation_detail.beispielsaetze.map((b, i) => (
                              <div key={i} className="text-xs">
                                <div className="text-textMuted mb-0.5">{b.moment}</div>
                                <div className="text-white italic">„{b.satz}“</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {(s.transcript || []).map((m, i) => (
                      <div key={i} className={`max-w-[85%] px-3 py-2 rounded-lg text-xs ${m.role === "user" ? "self-end bg-amber text-white ml-auto" : "self-start bg-surfaceRaised text-white"}`}>
                        {m.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {sessions.length === 0 && <p className="text-textMuted text-sm">Noch keine Rollenspiele aufgezeichnet.</p>}
      </div>
    </Layout>
  );
}
