// Gemini (Google AI Studio) — kostenloser API-Tarif, kein Guthaben nötig.
// gemini-3.1-flash-lite ist Stand Juli 2026 das aktuelle, generell verfügbare
// Flash-Lite-Modell (2.5-Familie wurde von Google eingestellt). Google tauscht
// Modellnamen periodisch aus — falls hier künftig wieder ein 404 auftaucht,
// unter ai.google.dev/gemini-api/docs/models nachsehen und MODEL aktualisieren.
// API-Key: aistudio.google.com.
const MODEL = "gemini-3.1-flash-lite";

export async function callAI(system, messages, maxTokens = 300) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ist auf dem Server nicht gesetzt. Siehe README.");
  }

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
    // Freikontingent kurz überschritten — einmal kurz warten und erneut versuchen.
    await new Promise((r) => setTimeout(r, 4000));
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
