// Gemini (Google AI Studio) — kostenloser API-Tarif, kein Guthaben nötig.
// gemini-3.1-flash-lite ist Stand Juli 2026 das aktuelle, generell verfügbare
// Flash-Lite-Modell (2.5-Familie wurde von Google eingestellt). Google tauscht
// Modellnamen periodisch aus — falls hier künftig wieder ein 404 auftaucht,
// unter ai.google.dev/gemini-api/docs/models nachsehen und MODEL aktualisieren.
// API-Key: aistudio.google.com.
const MODEL = "gemini-3.1-flash-lite";

// Freikontingent gilt PRO PROJEKT, nicht pro Nutzer — wenn mehrere Leute
// gleichzeitig das Rollenspiel nutzen, teilen sie sich dasselbe Minutenlimit.
// SAFE_RPM liegt bewusst konservativ unter dem echten Google-Limit (Stand 2026:
// je nach Modell 5–15 Anfragen/Minute), damit Puffer für Schwankungen bleibt.
const SAFE_RPM = 4;
const WINDOW_MS = 60000;

async function waitForFreeSlot() {
  const { getAdminSupabase } = await import("./supabaseAdmin");
  let admin;
  try {
    admin = getAdminSupabase();
  } catch (e) {
    return; // Kein Service-Role-Key konfiguriert — Drosselung überspringen, nur der 429-Retry greift dann noch.
  }

  const maxWaitMs = 20000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count } = await admin.from("ai_request_log").select("id", { count: "exact", head: true }).gt("created_at", since);
    if ((count || 0) < SAFE_RPM) {
      await admin.from("ai_request_log").insert({});
      // Alte Einträge aufräumen, damit die Tabelle nicht unbegrenzt wächst.
      await admin.from("ai_request_log").delete().lt("created_at", new Date(Date.now() - 5 * WINDOW_MS).toISOString());
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  // Nach maximaler Wartezeit trotzdem versuchen — besser eine verzögerte Antwort
  // riskieren als den Nutzer ewig warten zu lassen.
}

export async function callAI(system, messages, maxTokens = 300) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ist auf dem Server nicht gesetzt. Siehe README.");
  }

  await waitForFreeSlot();

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const doFetch = () => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );

  let res = await doFetch();
  if (res.status === 429) {
    // Freikontingent trotz Drosselung kurz überschritten — einmal warten und erneut versuchen.
    await new Promise((r) => setTimeout(r, 5000));
    res = await doFetch();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Gemini API error " + res.status + ": " + text);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");
  return text || "";
}
