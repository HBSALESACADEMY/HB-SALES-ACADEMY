import { supabase } from "./supabaseClient";

export async function apiPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session ? session.access_token : ""}`,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Anfrage fehlgeschlagen.");
  return data;
}

export async function apiGetBlob(path) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${session ? session.access_token : ""}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Anfrage fehlgeschlagen.");
  }
  return res.blob();
}
