import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { apiGet, apiPost } from "../lib/apiClient";

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Crm() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState(null);
  const [leads, setLeads] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [error, setError] = useState("");

  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/api/crm/leads");
      setConnected(!!data.connected);
      setEmail(data.email || null);
      setLeads(data.leads || []);
      setFollowUps(data.followUps || []);
      if (!data.connected) setError("");
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function connect() {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setConnectError("");
    try {
      await apiPost("/api/crm/connect", { apiKey: apiKey.trim() });
      setApiKey("");
      await load();
    } catch (e) {
      setConnectError(e.message);
    }
    setConnecting(false);
  }

  async function disconnect() {
    if (!confirm("Close-Konto wirklich trennen?")) return;
    setDisconnecting(true);
    try {
      await apiPost("/api/crm/disconnect", {});
      await load();
    } catch (e) {
      setError(e.message);
    }
    setDisconnecting(false);
  }

  function leadNameFor(leadId) {
    const l = leads.find((x) => x.id === leadId);
    return l?.name || null;
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-display font-medium brand-text-gradient">CRM</h1>
      </div>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Verbinde dein persönliches Close-Konto, um deine Leads und offenen Follow-ups direkt hier zu sehen.</p>

      {!connected && (
        <div className="card mb-6">
          <div className="font-display font-semibold text-textMain text-sm mb-2">Close-Konto verbinden</div>
          <p className="text-xs text-textMuted mb-3">
            Den API-Key findest du in Close unter Einstellungen → API Keys. Er wird ausschließlich serverseitig gespeichert und ist nur für dich sichtbar.
          </p>
          {connectError && <p className="text-coral text-xs mb-2">{connectError}</p>}
          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              type="password"
              placeholder="Close API-Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()}
            />
            <button disabled={connecting || !apiKey.trim()} onClick={connect} className="btn text-xs flex-shrink-0 disabled:opacity-40">
              {connecting ? "Verbindet..." : "Verbinden"}
            </button>
          </div>
        </div>
      )}

      {connected && (
        <>
          <div className="card flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-sm text-textMain">
              <span className="w-2 h-2 rounded-full bg-teal flex-shrink-0" />
              Verbunden{email ? ` als ${email}` : ""}
            </div>
            <button disabled={disconnecting} onClick={disconnect} className="btn-ghost text-xs text-coral disabled:opacity-40">
              {disconnecting ? "Trennt..." : "Trennen"}
            </button>
          </div>

          {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

          <div className="mb-6">
            <div className="text-sm font-semibold text-textMain mb-2.5">Offene Follow-ups</div>
            <div className="flex flex-col gap-2.5">
              {followUps.map((f) => (
                <div key={f.id} className="card flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-textMain truncate">{f.text || "Follow-up"}</div>
                    {leadNameFor(f.leadId) && <div className="text-xs text-textMuted truncate">{leadNameFor(f.leadId)}</div>}
                  </div>
                  {f.dueDate && <span className="text-xs text-amber flex-shrink-0">{formatDate(f.dueDate)}</span>}
                </div>
              ))}
              {followUps.length === 0 && <p className="text-textMuted text-sm">Keine offenen Follow-ups.</p>}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-textMain mb-2.5">Leads</div>
            <div className="flex flex-col gap-2.5">
              {leads.map((l) => (
                <div key={l.id} className="card flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-textMain truncate">{l.name}</div>
                    <div className="text-xs text-textMuted truncate flex items-center gap-2">
                      {l.contactName && <span>{l.contactName}</span>}
                      {l.email && <span className="flex items-center gap-1"><Icon name="send" size={11} />{l.email}</span>}
                      {l.phone && <span>{l.phone}</span>}
                    </div>
                  </div>
                  {l.statusLabel && <span className="text-[10.5px] uppercase tracking-wide text-violet border border-violet/40 rounded-full px-2 py-0.5 flex-shrink-0">{l.statusLabel}</span>}
                </div>
              ))}
              {leads.length === 0 && <p className="text-textMuted text-sm">Keine Leads gefunden.</p>}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
