import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { apiGet, apiPost } from "../lib/apiClient";

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + " · " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

const EMPTY_NEW_LEAD = { name: "", contactName: "", email: "", phone: "", description: "" };

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

  const [expandedLeadId, setExpandedLeadId] = useState(null);
  const [leadDetail, setLeadDetail] = useState(null);
  const [leadDetailLoading, setLeadDetailLoading] = useState(false);
  const [leadDetailError, setLeadDetailError] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [showNewLead, setShowNewLead] = useState(false);
  const [newLead, setNewLead] = useState(EMPTY_NEW_LEAD);
  const [savingNewLead, setSavingNewLead] = useState(false);
  const [newLeadError, setNewLeadError] = useState("");

  const [busyTaskId, setBusyTaskId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskEditForm, setTaskEditForm] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/api/crm/leads");
      setConnected(!!data.connected);
      setEmail(data.email || null);
      setLeads(data.leads || []);
      setFollowUps(data.followUps || []);
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
    return leads.find((x) => x.id === leadId)?.name || null;
  }

  async function toggleLead(lead) {
    if (expandedLeadId === lead.id) { setExpandedLeadId(null); setLeadDetail(null); return; }
    setExpandedLeadId(lead.id);
    setLeadDetail(null);
    setLeadDetailError("");
    setNoteInput("");
    setLeadDetailLoading(true);
    try {
      const data = await apiGet(`/api/crm/lead-detail?id=${encodeURIComponent(lead.id)}`);
      setLeadDetail(data);
    } catch (e) {
      setLeadDetailError(e.message);
    }
    setLeadDetailLoading(false);
  }

  async function addNote() {
    if (!noteInput.trim() || !expandedLeadId) return;
    setSavingNote(true);
    try {
      await apiPost("/api/crm/note", { leadId: expandedLeadId, note: noteInput.trim() });
      setNoteInput("");
      const data = await apiGet(`/api/crm/lead-detail?id=${encodeURIComponent(expandedLeadId)}`);
      setLeadDetail(data);
    } catch (e) {
      setLeadDetailError(e.message);
    }
    setSavingNote(false);
  }

  async function completeTask(task) {
    setBusyTaskId(task.id);
    try {
      await apiPost("/api/crm/task-update", { taskId: task.id, isComplete: true });
      setFollowUps((prev) => prev.filter((f) => f.id !== task.id));
    } catch (e) {
      setError(e.message);
    }
    setBusyTaskId(null);
  }

  function startEditTask(task) {
    setEditingTaskId(task.id);
    setTaskEditForm({ text: task.text, date: task.dueDate ? task.dueDate.slice(0, 10) : "" });
  }

  async function saveEditTask(task) {
    setBusyTaskId(task.id);
    try {
      await apiPost("/api/crm/task-update", { taskId: task.id, text: taskEditForm.text, date: taskEditForm.date || undefined });
      setFollowUps((prev) => prev.map((f) => f.id === task.id ? { ...f, text: taskEditForm.text, dueDate: taskEditForm.date } : f));
      setEditingTaskId(null);
      setTaskEditForm(null);
    } catch (e) {
      setError(e.message);
    }
    setBusyTaskId(null);
  }

  async function createLead() {
    if (!newLead.name.trim()) return;
    setSavingNewLead(true);
    setNewLeadError("");
    try {
      const { lead } = await apiPost("/api/crm/create-lead", newLead);
      setLeads((prev) => [lead, ...prev]);
      setNewLead(EMPTY_NEW_LEAD);
      setShowNewLead(false);
    } catch (e) {
      setNewLeadError(e.message);
    }
    setSavingNewLead(false);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-display font-medium brand-text-gradient">CRM</h1>
        {connected && <button onClick={() => { setNewLeadError(""); setShowNewLead(true); }} className="btn text-xs flex-shrink-0">+ Neuer Lead</button>}
      </div>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Verbinde dein persönliches Close-Konto, um deine Leads, offenen Follow-ups und den Gesprächsverlauf direkt hier zu sehen und zu bearbeiten.</p>

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

          {showNewLead && (
            <div className="card mb-6">
              <div className="font-display font-semibold text-textMain text-sm mb-2">Neuer Lead</div>
              {newLeadError && <p className="text-coral text-xs mb-2">{newLeadError}</p>}
              <input className="input mb-2" placeholder="Name / Firma *" value={newLead.name} onChange={(e) => setNewLead((f) => ({ ...f, name: e.target.value }))} />
              <input className="input mb-2" placeholder="Ansprechpartner" value={newLead.contactName} onChange={(e) => setNewLead((f) => ({ ...f, contactName: e.target.value }))} />
              <div className="flex items-center gap-2 mb-2">
                <input className="input flex-1" placeholder="E-Mail" value={newLead.email} onChange={(e) => setNewLead((f) => ({ ...f, email: e.target.value }))} />
                <input className="input flex-1" placeholder="Telefon" value={newLead.phone} onChange={(e) => setNewLead((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <textarea className="input mb-3" rows={2} placeholder="Notiz (optional)" value={newLead.description} onChange={(e) => setNewLead((f) => ({ ...f, description: e.target.value }))} />
              <div className="flex items-center gap-2">
                <button disabled={savingNewLead} onClick={() => setShowNewLead(false)} className="btn-ghost text-xs flex-1 disabled:opacity-40">Abbrechen</button>
                <button disabled={savingNewLead || !newLead.name.trim()} onClick={createLead} className="btn text-xs flex-1 justify-center disabled:opacity-40">{savingNewLead ? "Speichert..." : "Anlegen"}</button>
              </div>
            </div>
          )}

          <div className="mb-6">
            <div className="text-sm font-semibold text-textMain mb-2.5">Offene Follow-ups</div>
            <div className="flex flex-col gap-2.5">
              {followUps.map((f) => {
                const busy = busyTaskId === f.id;
                if (editingTaskId === f.id) {
                  return (
                    <div key={f.id} className="card">
                      <input className="input mb-2" value={taskEditForm.text} onChange={(e) => setTaskEditForm((s) => ({ ...s, text: e.target.value }))} />
                      <input className="input mb-2" type="date" value={taskEditForm.date} onChange={(e) => setTaskEditForm((s) => ({ ...s, date: e.target.value }))} />
                      <div className="flex items-center gap-2">
                        <button disabled={busy} onClick={() => { setEditingTaskId(null); setTaskEditForm(null); }} className="btn-ghost text-xs flex-1 disabled:opacity-40">Abbrechen</button>
                        <button disabled={busy} onClick={() => saveEditTask(f)} className="btn text-xs flex-1 justify-center disabled:opacity-40">{busy ? "Speichert..." : "Speichern"}</button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={f.id} className="card flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-textMain truncate">{f.text || "Follow-up"}</div>
                      {leadNameFor(f.leadId) && <div className="text-xs text-textMuted truncate">{leadNameFor(f.leadId)}</div>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {f.dueDate && <span className="text-xs text-amber">{formatDate(f.dueDate)}</span>}
                      <button disabled={busy} onClick={() => startEditTask(f)} className="btn-ghost text-xs disabled:opacity-40">Bearbeiten</button>
                      <button disabled={busy} onClick={() => completeTask(f)} className="btn-ghost text-xs text-teal border-teal/40 disabled:opacity-40">{busy ? "..." : "Erledigt"}</button>
                    </div>
                  </div>
                );
              })}
              {followUps.length === 0 && <p className="text-textMuted text-sm">Keine offenen Follow-ups.</p>}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-textMain mb-2.5">Leads</div>
            <div className="flex flex-col gap-2.5">
              {leads.map((l) => {
                const isOpen = expandedLeadId === l.id;
                return (
                  <div key={l.id} className="card">
                    <button onClick={() => toggleLead(l)} className="w-full flex items-center justify-between gap-3 text-left">
                      <div className="min-w-0">
                        <div className="text-sm text-textMain truncate">{l.name}</div>
                        <div className="text-xs text-textMuted truncate flex items-center gap-2">
                          {l.contactName && <span>{l.contactName}</span>}
                          {l.email && <span className="flex items-center gap-1"><Icon name="send" size={11} />{l.email}</span>}
                          {l.phone && <span>{l.phone}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {l.statusLabel && <span className="text-[10.5px] uppercase tracking-wide text-violet border border-violet/40 rounded-full px-2 py-0.5">{l.statusLabel}</span>}
                        <Icon name="chevron" size={14} color="var(--org-color-1, #4C5DC9)" />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-line">
                        {leadDetailLoading && <p className="text-textMuted text-xs">Lädt...</p>}
                        {leadDetailError && <p className="text-coral text-xs">{leadDetailError}</p>}
                        {!leadDetailLoading && leadDetail && (
                          <>
                            <div className="flex items-center gap-2 flex-wrap mb-3">
                              {l.phone && (
                                <a href={`tel:${l.phone}`} className="btn-ghost text-xs flex items-center gap-1.5">
                                  <Icon name="phone" size={12} /> Anrufen
                                </a>
                              )}
                              {leadDetail.lead?.htmlUrl && (
                                <a href={leadDetail.lead.htmlUrl} target="_blank" rel="noreferrer" className="btn-ghost text-xs">In Close öffnen</a>
                              )}
                            </div>

                            {leadDetail.lead?.description && (
                              <p className="text-xs text-textMuted mb-3">{leadDetail.lead.description}</p>
                            )}

                            <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-1.5">Verlauf</div>
                            <div className="flex flex-col gap-2 mb-3 max-h-64 overflow-y-auto">
                              {(leadDetail.activity || []).map((a) => (
                                <div key={a.id} className="text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="text-textMain font-semibold">{a.typeLabel}</span>
                                    {a.date && <span className="text-textMuted">{formatDateTime(a.date)}</span>}
                                  </div>
                                  {a.summary && <div className="text-textMuted mt-0.5 whitespace-pre-wrap">{a.summary}</div>}
                                </div>
                              ))}
                              {(leadDetail.activity || []).length === 0 && <p className="text-textMuted text-xs">Noch keine Aktivität.</p>}
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                className="input flex-1 text-xs"
                                placeholder="Notiz hinzufügen..."
                                value={noteInput}
                                onChange={(e) => setNoteInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addNote()}
                              />
                              <button disabled={savingNote || !noteInput.trim()} onClick={addNote} className="btn text-xs flex-shrink-0 disabled:opacity-40">
                                {savingNote ? "..." : "Speichern"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {leads.length === 0 && <p className="text-textMuted text-sm">Keine Leads gefunden.</p>}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
