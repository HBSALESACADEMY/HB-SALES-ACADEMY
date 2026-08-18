import { supabase } from "./supabaseClient";

// Der Zugangs-Schlüssel einer Sitzung läuft nach einer Weile ab. Blieb die
// Academy lange offen (oder war der Rechner im Ruhezustand), schickte die App
// den abgelaufenen Schlüssel bisher trotzdem los und reichte die Absage des
// Servers roh durch — beim Nutzer kam nur "Nicht authentifiziert." an, ohne
// Hinweis, was zu tun ist. Jetzt wird einmal ein frischer Schlüssel geholt und
// die Anfrage wiederholt; klappt auch das nicht, gibt es eine verständliche
// Aufforderung zum erneuten Anmelden statt einer technischen Meldung.
const SESSION_ABGELAUFEN = "Deine Sitzung ist abgelaufen. Bitte lade die Seite neu und melde dich erneut an.";

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return `Bearer ${session ? session.access_token : ""}`;
}

async function refreshedAuthHeader() {
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    return session ? `Bearer ${session.access_token}` : null;
  } catch (e) {
    return null;
  }
}

// Führt die Anfrage aus und wiederholt sie genau einmal mit frischem
// Schlüssel, falls der Server mit 401 (nicht authentifiziert) antwortet.
async function fetchMitErneuerung(run) {
  let res = await run(await authHeader());
  if (res.status !== 401) return res;
  const frisch = await refreshedAuthHeader();
  if (!frisch) throw new Error(SESSION_ABGELAUFEN);
  res = await run(frisch);
  if (res.status === 401) throw new Error(SESSION_ABGELAUFEN);
  return res;
}

export async function apiPost(path, body) {
  const res = await fetchMitErneuerung((auth) => fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body || {}),
  }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Anfrage fehlgeschlagen.");
  return data;
}

export async function apiGet(path) {
  const res = await fetchMitErneuerung((auth) => fetch(path, { headers: { Authorization: auth } }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Anfrage fehlgeschlagen.");
  return data;
}

export async function apiGetBlob(path) {
  const res = await fetchMitErneuerung((auth) => fetch(path, { headers: { Authorization: auth } }));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Anfrage fehlgeschlagen.");
  }
  return res.blob();
}
