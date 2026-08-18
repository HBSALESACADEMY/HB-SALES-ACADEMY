import { useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { apiPost } from "../lib/apiClient";
import { meldeFehler } from "../lib/errorBus";
import { SCENARIOS } from "../lib/scenarios";

export default function Simulator() {
  const [scenario, setScenario] = useState(null);
  const [nodeId, setNodeId] = useState(null);
  const [path, setPath] = useState([]);

  function start(s) {
    setScenario(s);
    setNodeId(s.start);
    setPath([]);
  }

  async function choose(option) {
    setPath((p) => [...p, option.label]);
    const nextNode = scenario.nodes[option.next];
    setNodeId(option.next);
    if (nextNode.outcome) {
      // XP wird serverseitig aus dem festen Szenario-Baum abgeleitet, nicht
      // vom Client übermittelt.
      // Früher ein komplett leeres catch: schlug die Punktevergabe fehl,
      // verschwand das spurlos — man beendete das Szenario und bekam ohne
      // jeden Hinweis keine XP.
      try {
        await apiPost("/api/simulator-progress", { scenarioId: scenario.id, nodeId: option.next });
      } catch (e) {
        meldeFehler("Die Punkte für dieses Szenario konnten nicht gutgeschrieben werden.", e);
      }
    }
  }

  const node = scenario ? scenario.nodes[nodeId] : null;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Szenario-Simulator</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Echte Gesprächssituationen zum Durchspielen — jede Entscheidung führt zu einer anderen Wendung. Guter Einstieg, bevor es ins freie <a href="/roleplay" className="text-amber underline">KI-Rollenspiel</a> geht.</p>

      {!scenario ? (
        <div className="flex flex-col gap-3.5">
          {SCENARIOS.map((s) => (
            <div key={s.id} className="card cursor-pointer hover:-translate-y-0.5 transition" onClick={() => start(s)}>
              <div className="flex items-center gap-3">
                <Icon name="chat" color="var(--org-color-1, #4C5DC9)" />
                <div>
                  <div className="font-display font-semibold text-textMain">{s.title}</div>
                  <div className="text-xs text-textMuted mt-0.5">{s.intro}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <button onClick={() => setScenario(null)} className="btn-ghost text-xs mb-4">← Zurück zur Übersicht</button>

          {node.outcome ? (
            <div className={`p-4 rounded-lg border ${node.score >= 80 ? "border-teal/40 bg-teal/10" : node.score >= 50 ? "border-amber/40 bg-amber/10" : "border-coral/40 bg-coral/10"}`}>
              <p className="text-textMain text-sm font-medium mb-1">{node.text}</p>
              <p className="text-xs text-textMuted">Ergebnis-Score: {node.score}/100</p>
            </div>
          ) : (
            <>
              <p className="text-textMain text-[16px] leading-relaxed mb-5">{node.text}</p>
              <div className="flex flex-col gap-2">
                {node.options.map((opt, i) => (
                  <button key={i} onClick={() => choose(opt)} className="text-left px-4 py-3 rounded-lg border border-line text-sm text-textMain hover:border-[var(--org-color-1,#35406E)] hover:bg-surfaceRaised transition">
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
