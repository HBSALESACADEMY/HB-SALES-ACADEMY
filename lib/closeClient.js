// Serverseitiger Client für die Close-CRM-API (https://developer.close.com).
// NIE clientseitig importieren — der API-Key eines Nutzers darf den Server
// nicht verlassen. Auth: HTTP Basic mit dem API-Key als Username, leeres Passwort.
const BASE_URL = "https://api.close.com/api/v1";

function authHeader(apiKey) {
  return "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
}

async function closeFetch(apiKey, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: authHeader(apiKey) },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("Close-API-Key ist ungültig oder wurde widerrufen.");
    throw new Error(`Close-API-Fehler (${res.status}).`);
  }
  return res.json();
}

// Validiert den Key und liefert die Close-Nutzer-ID (für Task-Filter) + E-Mail.
export async function closeValidateKey(apiKey) {
  const me = await closeFetch(apiKey, "/me/");
  return { closeUserId: me.id, email: me.email || null };
}

export async function closeListLeads(apiKey, limit = 25) {
  const data = await closeFetch(apiKey, `/lead/?_limit=${limit}&_order_by=-date_updated`);
  return (data.data || []).map((l) => {
    const contact = (l.contacts || [])[0];
    return {
      id: l.id,
      name: l.display_name || l.name || "Unbenannt",
      statusLabel: l.status_label || null,
      dateUpdated: l.date_updated || l.date_created || null,
      contactName: contact?.display_name || contact?.name || null,
      email: contact?.emails?.[0]?.email || null,
      phone: contact?.phones?.[0]?.phone_formatted || contact?.phones?.[0]?.phone || null,
    };
  });
}

export async function closeListFollowUps(apiKey, closeUserId, limit = 25) {
  const data = await closeFetch(
    apiKey,
    `/task/?_type=lead&is_complete=false&assigned_to=${encodeURIComponent(closeUserId)}&_order_by=due_date&_limit=${limit}`
  );
  return (data.data || []).map((t) => ({
    id: t.id,
    leadId: t.lead_id || null,
    text: t.text || "",
    dueDate: t.due_date || t.date || null,
  }));
}
