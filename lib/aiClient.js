// Gemini (Google AI Studio) — kostenloser API-Tarif, kein Guthaben nötig.
// Mehrere Modelle als Fallback-Kette: jedes Modell hat bei Google ein EIGENES,
// unabhängiges Kontingent. Wenn eins ausgelastet/überlastet ist (429/503) oder
// eingestellt wurde (404), probiert die App automatisch das nächste — der
// Vertriebler bekommt davon idealerweise nichts mit.
// Stand Juli 2026. Google tauscht Modellnamen periodisch aus — bei neuen
// 404ern hier die Liste gegen ai.google.dev/gemini-api/docs/models prüfen.
const MODEL_FALLBACKS = ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"];

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
    return; // Kein Service-Role-Key konfiguriert — Drosselung überspringen, nur der Retry/Fallback greift dann noch.
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

// Gemeinsamer Kern für Text- und Audio-Anfragen: Modell-Fallback-Kette +
// Antwort-Extraktion. "contents" ist bereits im Gemini-API-Format.
async function generateContent(system, contents, maxTokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ist auf dem Server nicht gesetzt. Siehe README.");
  }

  const doFetch = (model) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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

  let res, lastErrorText = "";
  for (const model of MODEL_FALLBACKS) {
    res = await doFetch(model);
    if (res.ok) break;

    // 429 = Kontingent dieses Modells kurz überschritten. 503 = Google gerade
    // überlastet. 404 = Modell wurde eingestellt. In allen drei Fällen lohnt
    // sich, das nächste Modell in der Kette zu probieren statt lange zu warten.
    if ([429, 503, 404].includes(res.status)) {
      lastErrorText = await res.text();
      if (res.status !== 404) {
        // Ein einziger kurzer Nachversuch auf demselben Modell — danach lieber
        // sofort weiter zum nächsten Modell, statt Zeit zu verlieren.
        await new Promise((r) => setTimeout(r, 2500));
        res = await doFetch(model);
        if (res.ok) break;
      }
      continue; // nächstes Modell in der Kette probieren
    }
    // Andere Fehler (z.B. 400 ungültige Anfrage) sind nicht durch Modellwechsel lösbar.
    lastErrorText = await res.text();
    break;
  }

  if (!res || !res.ok) {
    throw new Error("Gemini API error " + (res ? res.status : "?") + ": " + lastErrorText);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n");
  return text || "";
}

export async function callAI(system, messages, maxTokens = 300) {
  await waitForFreeSlot();
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  return generateContent(system, contents, maxTokens);
}

// Für Audio-Auswertung (z.B. hochgeladene Anruf-Aufnahmen, siehe
// pages/api/call-recording-evaluate.js): Gemini unterstützt Audio direkt als
// "inline_data" neben dem Text-Prompt (kein separater Transkriptions-Schritt
// nötig). audioBase64 ohne "data:...;base64,"-Prefix übergeben.
export async function callAIWithAudio(system, prompt, audioBase64, mimeType, maxTokens = 800) {
  await waitForFreeSlot();
  const contents = [{
    role: "user",
    parts: [
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: audioBase64 } },
    ],
  }];
  return generateContent(system, contents, maxTokens);
}

// Sprachausgabe: Text zu gesprochener Stimme.
//
// Eigener Weg statt generateContent(), weil das TTS-Modell weder
// system_instruction noch eine Modellkette verträgt — es gibt genau dieses
// eine Modell, und es antwortet mit Audio statt Text.
//
// Schlägt es fehl (Kontingent, Modell umbenannt, kein Schlüssel), wird NICHT
// geworfen: das Rollenspiel läuft dann mit der eingebauten Stimme des
// Browsers weiter. Eine stumme Antwort wäre schlimmer als eine blecherne.
const TTS_MODELL = "gemini-2.5-flash-preview-tts";

export async function spracheErzeugen(text, stimme = "Kore") {
  if (!process.env.GEMINI_API_KEY || !text) return null;
  try {
    await waitForFreeSlot();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODELL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: stimme } } },
          },
        }),
      }
    );
    if (!res.ok) {
      console.error("Sprachausgabe fehlgeschlagen:", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const teil = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
    const inline = teil?.inlineData || teil?.inline_data;
    if (!inline?.data) return null;
    return { base64: inline.data, mime: inline.mimeType || inline.mime_type || "audio/L16;rate=24000" };
  } catch (e) {
    console.error("Sprachausgabe fehlgeschlagen:", e.message);
    return null;
  }
}
