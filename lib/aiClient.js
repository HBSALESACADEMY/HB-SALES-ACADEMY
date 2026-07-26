// Gemini (Google AI Studio) — kostenloser API-Tarif, kein Guthaben nötig.
// Free-Tier-Limit (Stand 2026): ca. 1.500 Anfragen/Tag auf gemini-2.5-flash.
// API-Key: aistudio.google.com → "Get API key" → in .env.local als GEMINI_API_KEY eintragen.
export async function callAI(system, messages, maxTokens = 300) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ist auf dem Server nicht gesetzt. Siehe README.");
  }

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Gemini API error " + res.status + ": " + text);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");
  return text || "";
}
