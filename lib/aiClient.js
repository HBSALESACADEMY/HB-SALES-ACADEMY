// Gemini (Google AI Studio) — kostenloser API-Tarif, kein Guthaben nötig.
// flash-lite hat das großzügigste Freikontingent (Stand 2026: mehr Anfragen/Minute als das
// normale flash-Modell). API-Key: aistudio.google.com → "Get API key" → GEMINI_API_KEY.
const MODEL = "gemini-2.5-flash-lite";

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
