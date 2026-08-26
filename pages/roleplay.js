import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import AIBadge from "../components/AIBadge";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { COURSES } from "../lib/curriculum";
import { PERSONAS, SCENARIOS, DIFFICULTY } from "../lib/personas";
import BereichsTabs, { TRAINING } from "../components/BereichsTabs";
import LogoHintergrund from "../components/LogoHintergrund";

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
  // Sprache: aufnehmen, hinschicken, Antwort hören. Bewusst "sprechen und
  // loslassen" statt Dauerverbindung — das läuft in jedem Browser und auf
  // jedem Handy (siehe pages/api/roleplay-voice.js).
  const [nimmtAuf, setNimmtAuf] = useState(false);
  const [einwilligung, setEinwilligung] = useState(false);
  const [tonAn, setTonAn] = useState(true);
  const rekorderRef = useRef(null);
  const stueckeRef = useRef([]);
  const audioRef = useRef(null);

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

  // Einmal zugestimmt, bleibt es zugestimmt — aber nur auf diesem Gerät.
  useEffect(() => {
    try { setEinwilligung(localStorage.getItem("hb_sprach_einwilligung") === "ja"); } catch (e) { /* privates Fenster */ }
  }, []);

  function stimmeZu() {
    setEinwilligung(true);
    try { localStorage.setItem("hb_sprach_einwilligung", "ja"); } catch (e) { /* egal */ }
  }

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

  // --- Sprache ------------------------------------------------------------

  async function starteAufnahme() {
    setError("");
    try {
      const strom = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Derselbe Weg wie bei den Sprachnachrichten: das Handy kann nicht
      // jedes Format, deshalb wird genommen, was der Browser anbietet.
      const bevorzugt = ["audio/webm", "audio/mp4", "audio/ogg"];
      const typ = bevorzugt.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
      const rekorder = typ ? new MediaRecorder(strom, { mimeType: typ }) : new MediaRecorder(strom);
      stueckeRef.current = [];
      rekorder.ondataavailable = (e) => { if (e.data.size > 0) stueckeRef.current.push(e.data); };
      rekorder.onstop = async () => {
        const echterTyp = rekorder.mimeType || typ || "audio/webm";
        const paket = new Blob(stueckeRef.current, { type: echterTyp });
        strom.getTracks().forEach((t) => t.stop());
        if (paket.size > 0) await schickeAufnahme(paket, echterTyp);
      };
      rekorder.start();
      rekorderRef.current = rekorder;
      setNimmtAuf(true);
      // Sicherheitsnetz: eine vergessene Aufnahme soll nicht minutenlang
      // mitlaufen und dann als riesige Datei losgeschickt werden.
      setTimeout(() => { if (rekorderRef.current?.state === "recording") beendeAufnahme(); }, 45000);
    } catch (e) {
      setError("Kein Zugriff aufs Mikrofon. Bitte im Browser erlauben — auf dem iPhone unter Einstellungen › Safari › Mikrofon.");
    }
  }

  function beendeAufnahme() {
    rekorderRef.current?.stop();
    setNimmtAuf(false);
  }

  async function schickeAufnahme(paket, typ) {
    setLoading(true);
    setError("");
    try {
      const datenUrl = await new Promise((auf, ab) => {
        const leser = new FileReader();
        leser.onload = () => auf(leser.result);
        leser.onerror = () => ab(new Error("Die Aufnahme konnte nicht gelesen werden."));
        leser.readAsDataURL(paket);
      });
      const verlauf = messages.filter((m) => !m.system).map((m) => ({ role: m.role, content: m.content }));
      const daten = await apiPost("/api/roleplay-voice", {
        personaId: persona.id, scenarioId, difficulty, history: verlauf,
        audio: String(datenUrl).split(",")[1],
        mimeType: typ,
      });
      setMessages((prev) => [
        ...prev,
        { role: "user", content: daten.transkript || "🎤 (gesprochen)" },
        { role: "assistant", content: daten.reply },
      ]);
      setDetected((prev) => {
        const zusammen = new Set(prev);
        (daten.detected || []).forEach((d) => zusammen.add(d));
        return Array.from(zusammen);
      });
      if (tonAn) spieleAntwort(daten.stimme, daten.reply);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Zuerst die echte Stimme vom Server. Kommt keine (Kontingent, Ausfall),
  // liest der Browser den Text selbst vor — blechern, aber nicht stumm.
  function spieleAntwort(stimme, text) {
    try {
      if (stimme) {
        if (audioRef.current) audioRef.current.pause();
        const ton = new Audio(stimme);
        audioRef.current = ton;
        ton.play().catch(() => vorlesen(text));
        return;
      }
      vorlesen(text);
    } catch (e) {
      vorlesen(text);
    }
  }

  function vorlesen(text) {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel();
      const spruch = new window.SpeechSynthesisUtterance(text);
      spruch.lang = "de-DE";
      window.speechSynthesis.speak(spruch);
    } catch (e) { /* ohne Stimme weiter */ }
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
        <BereichsTabs tabs={TRAINING} />
        <p className="text-textMuted text-sm mb-2">Szenario, Schwierigkeit und Kundentyp wählen — freies Gespräch mit einer KI. Neu hier? Der <a href="/simulator" className="text-amber underline">Szenario-Simulator</a> ist ein guter erster Einstieg.</p>
        {/* Der Hinweis gehört hierher: der Sprechen-Knopf erscheint erst im
            laufenden Gespräch, und wer ihn dort nicht vermutet, sucht ihn
            auch nicht. */}
        <p className="text-textMuted text-sm mb-6">
          🎤 <strong className="text-textMain">Neu:</strong> Das Gespräch lässt sich auch <strong className="text-textMain">sprechen</strong> statt tippen —
          wie am Telefon. Der Knopf dafür steht im Gespräch unter dem Eingabefeld, sobald du einen Kundentyp gewählt hast.
        </p>
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

      {/* Das Logo liegt im ruhenden Rahmen, nicht im scrollenden Verlauf —
          sonst wanderte es beim Scrollen mit. Die Sprechblasen sind deckend,
          der Text bleibt also lesbar. */}
      <div className="relative overflow-hidden bg-surfaceRaised border border-line rounded-xl mb-3">
      <LogoHintergrund breite="w-1/2" hoehe="max-h-[60%]" />
      <div ref={chatRef} className="relative flex flex-col gap-2.5 h-[320px] overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[75%] px-3.5 py-2 rounded-xl text-sm leading-snug ${m.role === "user" ? "self-end bg-amber text-[var(--org-button-text,#fff)]" : "self-start bg-surfaceRaised text-textMain"}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="self-start bg-surfaceRaised text-textMain px-3.5 py-2 rounded-xl text-sm">…</div>}
      </div>
      </div>

      {error && <p className="text-coral text-xs mb-2">{error}</p>}

      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Deine Nachricht..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          disabled={loading || nimmtAuf}
        />
        <button className="btn" onClick={sendMessage} disabled={loading || nimmtAuf}><Icon name="send" size={14} /></button>
      </div>

      {/* Sprechen statt tippen. Vor der ersten Aufnahme steht, was mit der
          Stimme passiert — danach nicht mehr bei jedem Zug. */}
      {!einwilligung ? (
        <div className="card mt-3 border-amber/40">
          <div className="text-sm font-semibold text-amber mb-1">Mit dem Kunden sprechen</div>
          <p className="text-xs text-textMuted mb-3">
            Du kannst dieses Rollenspiel wie ein Telefonat führen. Deine Aufnahme wird dafür an unseren
            KI-Dienst übertragen, dort verstanden und beantwortet — und <strong>nicht gespeichert</strong>.
            Im Gesprächsverlauf bleibt nur der Text, genau wie beim Tippen.
          </p>
          <button onClick={stimmeZu} className="btn text-xs">Verstanden, Mikrofon nutzen</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={nimmtAuf ? beendeAufnahme : starteAufnahme}
            disabled={loading}
            className={`btn text-sm disabled:opacity-40 ${nimmtAuf ? "!bg-none !bg-coral" : ""}`}>
            <Icon name="mic" size={14} /> {nimmtAuf ? "Fertig — abschicken" : "Sprechen"}
          </button>
          {nimmtAuf && <span className="text-xs text-coral">● Aufnahme läuft — höchstens 45 Sekunden</span>}
          <button onClick={() => setTonAn((v) => !v)} className="btn-ghost text-xs ml-auto">
            {tonAn ? "🔊 Antwort wird vorgelesen" : "🔇 Antwort stumm"}
          </button>
        </div>
      )}

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
