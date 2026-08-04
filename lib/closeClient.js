// Serverseitiger Client für die Close-CRM-API (https://developer.close.com).
// NIE clientseitig importieren — der API-Key eines Nutzers darf den Server
// nicht verlassen. Auth: HTTP Basic mit dem API-Key als Username, leeres Passwort.
const BASE_URL = "https://api.close.com/api/v1";

function authHeader(apiKey) {
  return "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
}

async function closeRequest(apiKey, path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: authHeader(apiKey),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("Close-API-Key ist ungültig oder wurde widerrufen.");
    const body = await res.json().catch(() => null);
    throw new Error(body?.["field-errors"] ? JSON.stringify(body["field-errors"]) : `Close-API-Fehler (${res.status}).`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const closeFetch = (apiKey, path) => closeRequest(apiKey, path);

// Validiert den Key und liefert die Close-Nutzer-ID (für Task-/Anruf-Filter) + E-Mail.
export async function closeValidateKey(apiKey) {
  const me = await closeFetch(apiKey, "/me/");
  return { closeUserId: me.id, email: me.email || null };
}

function mapLead(l) {
  const contact = (l.contacts || [])[0];
  return {
    id: l.id,
    name: l.display_name || l.name || "Unbenannt",
    statusLabel: l.status_label || null,
    description: l.description || null,
    htmlUrl: l.html_url || null,
    dateUpdated: l.date_updated || l.date_created || null,
    contactName: contact?.display_name || contact?.name || null,
    email: contact?.emails?.[0]?.email || null,
    phone: contact?.phones?.[0]?.phone_formatted || contact?.phones?.[0]?.phone || null,
  };
}

export async function closeListLeads(apiKey, limit = 25) {
  const data = await closeFetch(apiKey, `/lead/?_limit=${limit}&_order_by=-date_updated`);
  return (data.data || []).map(mapLead);
}

export async function closeGetLead(apiKey, leadId) {
  const l = await closeFetch(apiKey, `/lead/${encodeURIComponent(leadId)}/`);
  return mapLead(l);
}

export async function closeCreateLead(apiKey, { name, contactName, email, phone, description }) {
  const contact = {};
  if (contactName) contact.name = contactName;
  if (email) contact.emails = [{ email, type: "office" }];
  if (phone) contact.phones = [{ phone, type: "office" }];

  const l = await closeRequest(apiKey, "/lead/", {
    method: "POST",
    body: JSON.stringify({
      name,
      description: description || undefined,
      contacts: Object.keys(contact).length ? [contact] : undefined,
    }),
  });
  return mapLead(l);
}

export async function closeListFollowUps(apiKey, closeUserId, limit = 25) {
  const data = await closeFetch(
    apiKey,
    `/task/?_type=lead&is_complete=false&assigned_to=${encodeURIComponent(closeUserId)}&_order_by=date&_limit=${limit}`
  );
  return (data.data || []).map((t) => ({
    id: t.id,
    leadId: t.lead_id || null,
    text: t.text || "",
    dueDate: t.date || t.due_date || null,
  }));
}

export async function closeUpdateTask(apiKey, taskId, { isComplete, text, date }) {
  const body = {};
  if (isComplete !== undefined) body.is_complete = isComplete;
  if (text !== undefined) body.text = text;
  if (date !== undefined) body.date = date;
  const t = await closeRequest(apiKey, `/task/${encodeURIComponent(taskId)}/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return { id: t.id, leadId: t.lead_id || null, text: t.text || "", dueDate: t.date || t.due_date || null, isComplete: t.is_complete };
}

const ACTIVITY_TYPE_LABELS = {
  Call: "Anruf", Email: "E-Mail", Note: "Notiz", SMS: "SMS", Meeting: "Termin",
  Created: "Lead erstellt", LeadStatusChange: "Statusänderung", Task: "Aufgabe", Opportunity: "Opportunity",
};

export async function closeListActivity(apiKey, leadId, limit = 30) {
  const data = await closeFetch(
    apiKey,
    `/activity/?lead_id=${encodeURIComponent(leadId)}&_order_by=-date_created&_limit=${limit}`
  );
  return (data.data || []).map((a) => ({
    id: a.id,
    type: a._type || "Custom",
    typeLabel: ACTIVITY_TYPE_LABELS[a._type] || a._type || "Aktivität",
    date: a.date_created || a.activity_at || null,
    summary:
      a._type === "Call" ? `${a.direction === "outbound" ? "Ausgehend" : "Eingehend"}${a.duration != null ? ` · ${a.duration}s` : ""}${a.disposition ? ` · ${a.disposition}` : ""}`
      : a._type === "Note" ? (a.note || "")
      : a._type === "Email" ? (a.subject || "")
      : a._type === "SMS" ? (a.text || "")
      : a._type === "LeadStatusChange" ? `${a.old_status_label || "?"} → ${a.new_status_label || "?"}`
      : a._type === "Created" ? "Lead wurde erstellt"
      : "",
  }));
}

export async function closeCreateNote(apiKey, leadId, note) {
  const n = await closeRequest(apiKey, "/activity/note/", {
    method: "POST",
    body: JSON.stringify({ lead_id: leadId, note }),
  });
  return { id: n.id, leadId: n.lead_id, note: n.note, date: n.date_created };
}

// Ausgehende Anrufe pro Tag, gezählt aus den echten Close-Aktivitäten — läuft
// PARALLEL zu den manuellen Positiv/Negativ-Buttons im Call Tracker, ersetzt
// sie nicht (siehe pages/api/crm/call-stats.js).
export async function closeCountOutgoingCallsByDay(apiKey, closeUserId, sinceIso) {
  const data = await closeFetch(
    apiKey,
    `/activity/call/?user_id=${encodeURIComponent(closeUserId)}&date_created__gte=${encodeURIComponent(sinceIso)}&_limit=200`
  );
  const byDay = {};
  (data.data || []).forEach((c) => {
    if (c.direction !== "outbound") return;
    const day = (c.date_created || "").slice(0, 10);
    if (!day) return;
    byDay[day] = (byDay[day] || 0) + 1;
  });
  return byDay;
}
