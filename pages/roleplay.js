import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import AIBadge from "../components/AIBadge";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { COURSES } from "../lib/curriculum";
import { PERSONAS, SCENARIOS, DIFFICULTY } from "../lib/personas";

export default function Roleplay() {
  const [examResults, setExamResults] = useState([]);
  const [difficulty, setDifficulty] = useState("fortgeschritten");
  const [scenarioId, setScenarioId] = useState("grundlagen");
  const [persona, setPersona] = useState(null);
  const [messages, setMessages] = useState([]);
  const [detected, setDetected] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState("");
  const chatRef = useRef(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("exam_results").select("*").eq("user_id", session.user.id);
      setExamResults(data || []);
    }
    load();
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  function courseUnlockedFor(scenId) {
    const idx = COURSES.findIndex((c) => c.id === scenId);
    if (idx <= 0) return true;
    return examResults.some((r) => r.course_id === COURSES[idx - 1].id && r.passed);
  }

  function selectPersona(p) {
    setPersona(p);
    const sc = SCENARIOS.find((s) => s.id === scenarioId);
    setMessages([{ role: "assistant", content: `(${p.name} ist bereit. Szenario: ${sc.label}. Beginne mit deiner Ansprache.)`, system: true }]);
    setDetected([]);
    setFeedback(null);
  }

  function resetPersona() {
    setPersona(null); setMessages([]); setDetected([]); setFeedback(null); setError("");
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);
    setError("");
    try {
      const history = newMessages.filter((m) => !m.system).slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      const data = await apiPost("/api/roleplay-turn", {
        personaId: persona.id, scenarioId, difficulty, history, message: text,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setDetected((prev) => {
        const merged = new Set(prev);
        (data.detected || []).forEach((d) => merged.add(d));
        return Array.from(merged);
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function evaluateConversation() {
    setLoading(true);
    setError("");
    try {
      const cleanMessages = messages.filter((m) => !m.system).map((m) => ({ role: m.role, content: m.content }));
      const { evaluation } = await apiPost("/api/roleplay-evaluate", {
        personaId: persona.id, scenarioId, difficulty, messages: cleanMessages, detected,
      });
      setFeedback(evaluation);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!persona) {
    return (
      <Layout>
        <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Rollenspiel</h1>
        <div className="brand-stripe w-16 mb-4" />
        <p className="text-textMuted text-sm mb-6">Szenario, Schwierigkeit und Kundentyp wählen — freies Gespräch mit einer KI. Neu hier? Der <a href="/simulator" className="text-amber underline">Szenario-Simulator</a> ist ein guter erster Einstieg.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {SCENARIOS.map((s) => {
            const unlocked = courseUnlockedFor(s.id);
            return (
              <div
                key={s.id}
                className={`px-3.5 py-1.5 rounded-full border text-[12.5px] cursor-pointer ${scenarioId === s.id ? "bg-amber text-[var(--org-button-text,#fff)] border-amber font-semibold" : "border-line text-textMuted hover:text-textMain hover:border-amber"} ${unlocked ? "" : "opacity-40 cursor-not-allowed"}`}
                onClick={() => unlocked && setScenarioId(s.id)}
              >
                {!unlocked && <Icon name="lock" size={11} />} {s.label}
              </div>
            );
          })}
        </div>
        <div className="inline-flex border border-line rounded-lg overflow-hidden mb-6">
          {Object.keys(DIFFICULTY).map((k) => (
            <button key={k} className={`px-3.5 py-2 text-[12.5px] font-semibold ${difficulty === k ? "bg-amber text-[var(--org-button-text,#fff)]" : "bg-surface text-textMuted"}`} onClick={() => setDifficulty(k)}>
              {DIFFICULTY[k].label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {PERSONAS.map((p) => (
            <div key={p.id} className="card cursor-pointer hover:-translate-y-0.5 hover:shadow-xl transition" style={{ borderLeft: `4px solid ${p.accent}` }} onClick={() => selectPersona(p)}>
              <div className="font-display font-semibold text-[15px] text-textMain">{p.name}</div>
              <div className="text-[12.5px] text-textMuted mt-1">{p.tagline}</div>
            </div>
          ))}
        </div>
      </Layout>
    );
  }

  const sc = SCENARIOS.find((s) => s.id === scenarioId);

  return (
    <Layout>
      <h1 className="text-2xl font-display text-textMain mb-1 flex items-center gap-2">
        {persona.name}
        <AIBadge label="KI-simuliert" title="Dieser Gesprächspartner ist eine KI, keine echte Person." />
      </h1>
      <p className="text-textMuted text-sm mb-4">{persona.tagline} · Szenario: {sc.label} · Modus: {DIFFICULTY[difficulty].label}</p>

      <div ref={chatRef} className="flex flex-col gap-2.5 h-[320px] overflow-y-auto p-4 bg-surfaceRaised border border-line rounded-xl mb-3">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[75%] px-3.5 py-2 rounded-xl text-sm leading-snug ${m.role === "user" ? "self-end bg-amber text-[var(--org-button-text,#fff)]" : "self-start bg-[#262A3B] text-textMain"}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="self-start bg-[#262A3B] text-textMain px-3.5 py-2 rounded-xl text-sm">…</div>}
      </div>

      {error && <p className="text-coral text-xs mb-2">{error}</p>}

      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Deine Nachricht..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          disabled={loading}
        />
        <button className="btn" onClick={sendMessage} disabled={loading}><Icon name="send" size={14} /></button>
      </div>

      <div className="mt-4 mb-1.5"><strong className="text-[12.5px] text-textMuted">Erkannte Prinzipien:</strong></div>
      {detected.length ? (
        <div className="flex flex-wrap gap-2 mb-2">
          {detected.map((d, i) => (
            <span key={i} className="text-[11.5px] px-2.5 py-1 rounded-full border border-violet text-violet" style={{ background: "rgba(158,140,240,.12)" }}>{d}</span>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-textMuted mb-2">Noch keine Prinzipien erkannt.</p>
      )}

      <div className="flex gap-2 mt-1.5">
        <button className="btn" onClick={evaluateConversation} disabled={loading || messages.filter((m) => m.role === "user").length === 0}>Gespräch auswerten</button>
        <button className="btn-ghost btn" onClick={resetPersona}>Anderer Kundentyp</button>
      </div>

      {feedback && (
        <div className="card mt-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-xl font-bold text-textMain">{feedback.score !== null ? feedback.score + "%" : "–"}</span>
            <AIBadge title="Diese Auswertung wurde automatisch von einer KI erstellt." />
          </div>
          <p className="text-sm text-textMuted mb-3">{feedback.zusammenfassung}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <strong className="text-xs text-teal block mb-1.5">Stärken</strong>
              <ul className="text-xs text-textMuted list-disc pl-4 space-y-1">
                {(feedback.staerken || []).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <strong className="text-xs text-coral block mb-1.5">Verbesserung</strong>
              <ul className="text-xs text-textMuted list-disc pl-4 space-y-1">
                {(feedback.verbesserung || []).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>
          {(feedback.beispielsaetze || []).length > 0 && (
            <div className="mt-4 pt-4 border-t border-line">
              <strong className="text-xs text-violet block mb-2">Das hättest du sagen können</strong>
              <div className="flex flex-col gap-2.5">
                {feedback.beispielsaetze.map((b, i) => (
                  <div key={i} className="text-xs">
                    <div className="text-textMuted mb-0.5">{b.moment}</div>
                    <div className="text-textMain italic">„{b.satz}“</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
