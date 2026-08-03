import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { callAIWithAudio } from "../../lib/aiClient";

// Audio-Auswertungen brauchen deutlich mehr Zeit als reine Text-Anfragen.
export const config = { maxDuration: 60 };

const MIME_BY_EXT = {
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", mp4: "audio/mp4",
  ogg: "audio/ogg", webm: "audio/webm", aac: "audio/aac", flac: "audio/flac",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  const { recordingId } = req.body || {};
  if (!recordingId) return res.status(400).json({ error: "recordingId erforderlich." });

  const admin = getAdminSupabase();

  try {
    const { data: recording } = await admin.from("call_recordings").select("*").eq("id", recordingId).maybeSingle();
    if (!recording) return res.status(404).json({ error: "Recording nicht gefunden." });
    if (recording.created_by !== auth.user.id) return res.status(403).json({ error: "Nur die eigene Aufnahme kann ausgewertet werden." });

    const { data: fileBlob, error: dlErr } = await admin.storage.from("call-recordings").download(recording.recording_path);
    if (dlErr) throw dlErr;

    const ext = (recording.file_name || recording.recording_path).split(".").pop().toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || "audio/mpeg";
    const arrayBuffer = await fileBlob.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

    const raw = await callAIWithAudio(
      "Du bist ein Trainer für Verkaufspsychologie. Höre dir die angehängte Aufnahme eines Vertriebsanrufs an und bewerte " +
        "sie auf Deutsch, konstruktiv und konkret — unabhängig davon, ob das Gespräch positiv oder negativ verlaufen ist. " +
        "Nenne zu den Verbesserungspunkten passende, konkrete Beispielsätze — wörtliche Formulierungen, die der/die " +
        "Vertriebler:in an der jeweiligen Stelle im Gespräch hätte sagen können. Falls in der Aufnahme kein erkennbares " +
        "Verkaufsgespräch zu hören ist, setze score auf null und erkläre das kurz in der Zusammenfassung. " +
        "Antworte AUSSCHLIESSLICH als valides JSON-Objekt mit den Feldern: " +
        '{"score": <Zahl 0-100 oder null>, "staerken": [<max 3 kurze Punkte>], "verbesserung": [<max 3 kurze Punkte>], ' +
        '"beispielsaetze": [{"moment": "<kurzer Kontext>", "satz": "<wörtlicher Beispielsatz>"}, max 3], ' +
        '"zusammenfassung": "<2-3 Sätze>"}. Kein Text außerhalb des JSON.',
      "Bewerte diese Anruf-Aufnahme:",
      audioBase64,
      mimeType,
      900
    );

    let evaluation;
    try {
      evaluation = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      evaluation = { score: null, staerken: [], verbesserung: [], beispielsaetze: [], zusammenfassung: raw };
    }

    const { error: updateErr } = await admin.from("call_recordings").update({
      status: "evaluated",
      evaluation_score: evaluation.score,
      evaluation_summary: evaluation.zusammenfassung || "",
      evaluation_detail: { staerken: evaluation.staerken || [], verbesserung: evaluation.verbesserung || [], beispielsaetze: evaluation.beispielsaetze || [] },
    }).eq("id", recordingId);
    if (updateErr) throw updateErr;

    return res.status(200).json({ evaluation });
  } catch (e) {
    console.error(e);
    await admin.from("call_recordings").update({ status: "failed" }).eq("id", recordingId);
    return res.status(500).json({ error: e.message || "Auswertung fehlgeschlagen." });
  }
}
