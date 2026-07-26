import { useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
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
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try { await supabase.rpc("increment_xp", { uid: session.user.id, amount: Math.round(nextNode.score / 5) }); } catch (e) {}
      }
    }
  }

  const node = scenario ? scenario.nodes[nodeId] : null;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Szenario-Simulator</h1>
      <div className="brand-stripe w-16 mb-3" />
      <p className="text-textMuted text-sm mb-6">Echte Gesprächssituationen zum Durchspielen — jede Entscheidung führt zu einer anderen Wendung.</p>

      {!scenario ? (
        <div className="flex flex-col gap-3.5">
          {SCENARIOS.map((s) => (
            <div key={s.id} className="card cursor-pointer hover:-translate-y-0.5 transition" onClick={() => start(s)}>
              <div className="flex items-center gap-3">
                <Icon name="chat" color="#7B2FF7" />
                <div>
                  <div className="font-display font-semibold text-white">{s.title}</div>
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
              <p className="text-white text-sm font-medium mb-1">{node.text}</p>
              <p className="text-xs text-textMuted">Ergebnis-Score: {node.score}/100</p>
            </div>
          ) : (
            <>
              <p className="text-white text-[16px] leading-relaxed mb-5">{node.text}</p>
              <div className="flex flex-col gap-2">
                {node.options.map((opt, i) => (
                  <button key={i} onClick={() => choose(opt)} className="text-left px-4 py-3 rounded-lg border border-line text-sm text-white hover:border-[#4A3565] hover:bg-surfaceRaised transition">
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
