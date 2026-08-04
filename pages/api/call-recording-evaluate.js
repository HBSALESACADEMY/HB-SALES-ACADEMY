import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { callAIWithAudio } from "../../lib/aiClient";

// Audio-Auswertungen brauchen deutlich mehr Zeit als reine Text-Anfragen —
// noch mehr seit die Auswertung ausführlicher geworden ist.
export const config = { maxDuration: 120 };

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
      "Du bist ein erfahrener Trainer für Verkaufspsychologie. Höre dir die angehängte Aufnahme eines Vertriebsanrufs " +
        "vollständig und aufmerksam an und erstelle eine SEHR AUSFÜHRLICHE, konkrete Analyse auf Deutsch — unabhängig davon, " +
        "ob das Gespräch positiv oder negativ verlaufen ist. Gehe wirklich ins Detail, nicht nur oberflächlich. " +
        "Beschreibe zunächst den GESAMTEN AUFBAU des Gesprächs als eigenen Abschnitt: welche Phasen kamen in welcher " +
        "Reihenfolge vor, wie natürlich waren die Übergänge zwischen ihnen, wirkte das Gespräch wie aus einem Guss oder " +
        "sprunghaft, wurde eine Phase übersprungen oder deutlich zu kurz/zu lang behandelt, wer hat wie viel geredet " +
        "(grober Gesprächsanteil in Prozent, geschätzt), und wie war das generelle Tempo. " +
        "Gliedere das Gespräch danach in erkennbare Einzelphasen (z.B. Einstieg, Bedarfsermittlung, Präsentation/Angebot, " +
        "Einwandbehandlung, Abschluss — nur die Phasen, die tatsächlich vorkommen). Gib zu JEDER Phase: einen groben " +
        "geschätzten Zeit-/Gesprächsanteil (z.B. \"ca. 20%\"), 2-4 konkrete Stichpunkte, WAS in dieser Phase inhaltlich " +
        "besprochen wurde, und eine eigene ausführliche Bewertung dieser Phase (3-4 Sätze, nicht nur 1-2). " +
        "Liste jeden Einwand, den der Kunde vorgebracht hat, mit der Reaktion des/der Vertriebler:in und einer " +
        "kurzen Einschätzung, ob die Reaktion überzeugend war. Nenne zu den Verbesserungspunkten passende, konkrete " +
        "Beispielsätze — wörtliche Formulierungen, die der/die Vertriebler:in an der jeweiligen Stelle im Gespräch " +
        "hätte sagen können. Gib am Ende eine konkrete, ausführliche Empfehlung für die nächsten Schritte (z.B. " +
        "Follow-up-Timing, worauf beim nächsten Kontakt zu achten ist, welches Thema als nächstes vertieft werden sollte). " +
        "Falls in der Aufnahme kein erkennbares Verkaufsgespräch zu hören ist, setze score auf null und erkläre das kurz " +
        "in der Zusammenfassung. " +
        "Achte außerdem gezielt auf zwei weitere Kriterien, die auch in den Score einfließen sollen: " +
        "1) TONALITÄT — wie klingt der/die Vertriebler:in stimmlich? Sicher oder unsicher, freundlich oder distanziert, " +
        "monoton oder mit Betonung, zu schnell/zu langsam gesprochen, souverän oder nervös, wirkt es einstudiert oder " +
        "natürlich. 2) ANREDE (Sie/Du) — welche Anredeform wurde verwendet, war sie über das ganze Gespräch konsistent " +
        "oder gab es einen ungewollten Wechsel, und passt die gewählte Form zum Kontext/zur Beziehung zum Kunden (z.B. " +
        "unpassend duzend bei einem förmlichen Erstkontakt, oder unnötig steif gesiezt trotz erkennbar lockerer Beziehung). " +
        "Zitiere außerdem bis zu 6 konkrete, WÖRTLICHE Formulierungen, die der/die Vertriebler:in tatsächlich im " +
        "Gespräch gesagt hat und die verbesserungswürdig waren (z.B. Füllwörter, unsichere/weiche Formulierungen, " +
        "missverständliche oder zu komplizierte Sätze) — mit jeweils einer korrigierten, besseren Version derselben Aussage. " +
        "Das ist etwas anderes als die Beispielsätze oben: hier geht es um tatsächlich gesagte Sätze, die repariert werden, " +
        "nicht um neue Vorschläge für stille Momente. " +
        "Antworte AUSSCHLIESSLICH als valides JSON-Objekt mit den Feldern: " +
        '{"score": <Zahl 0-100 oder null>, "zusammenfassung": "<4-6 ausführliche Sätze>", ' +
        '"gespraechsstruktur": "<4-6 ausführliche Sätze zum Gesamtaufbau: Reihenfolge der Phasen, Übergänge, Tempo, Gesprächsanteil>", ' +
        '"phasen": [{"phase": "<Name>", "anteil": "<grober Anteil, z.B. ca. 20%>", "kernpunkte": [<2-4 Stichpunkte, was inhaltlich besprochen wurde>], "bewertung": "<3-4 Sätze ausführliche Einschätzung>"}], ' +
        '"tonalitaet": "<3-4 Sätze zur Stimme/Tonalität: Sicherheit, Freundlichkeit, Sprechtempo, Betonung, Wirkung>", ' +
        '"anrede": "<2-3 Sätze zur Sie/Du-Form: welche Form verwendet wurde, ob konsistent, ob passend zum Kontext>", ' +
        '"staerken": [<max 6 konkrete Punkte>], "verbesserung": [<max 6 konkrete Punkte>], ' +
        '"einwaende": [{"einwand": "<was der Kunde einwendete>", "reaktion": "<wie darauf reagiert wurde>", "bewertung": "<kurze Einschätzung>"}], ' +
        '"beispielsaetze": [{"moment": "<kurzer Kontext>", "satz": "<wörtlicher Beispielsatz>"}, max 6], ' +
        '"phrasenKorrektur": [{"original": "<wörtliches Zitat aus dem Gespräch>", "verbessert": "<korrigierte, bessere Formulierung>"}, max 6], ' +
        '"naechsteSchritte": "<konkrete, ausführliche Empfehlung, 3-4 Sätze>"}. Kein Text außerhalb des JSON.',
      "Bewerte diese Anruf-Aufnahme ausführlich, mit besonderem Fokus auf den Gesprächsaufbau und die Struktur:",
      audioBase64,
      mimeType,
      3800
    );

    let evaluation;
    try {
      evaluation = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (e) {
      evaluation = { score: null, zusammenfassung: raw, gespraechsstruktur: "", phasen: [], tonalitaet: "", anrede: "", staerken: [], verbesserung: [], einwaende: [], beispielsaetze: [], phrasenKorrektur: [], naechsteSchritte: "" };
    }

    const { error: updateErr } = await admin.from("call_recordings").update({
      status: "evaluated",
      evaluation_score: evaluation.score,
      evaluation_summary: evaluation.zusammenfassung || "",
      evaluation_detail: {
        gespraechsstruktur: evaluation.gespraechsstruktur || "",
        phasen: evaluation.phasen || [],
        tonalitaet: evaluation.tonalitaet || "",
        anrede: evaluation.anrede || "",
        staerken: evaluation.staerken || [],
        verbesserung: evaluation.verbesserung || [],
        einwaende: evaluation.einwaende || [],
        beispielsaetze: evaluation.beispielsaetze || [],
        phrasenKorrektur: evaluation.phrasenKorrektur || [],
        naechsteSchritte: evaluation.naechsteSchritte || "",
      },
    }).eq("id", recordingId);
    if (updateErr) throw updateErr;

    return res.status(200).json({ evaluation });
  } catch (e) {
    console.error(e);
    await admin.from("call_recordings").update({ status: "failed" }).eq("id", recordingId);
    return res.status(500).json({ error: e.message || "Auswertung fehlgeschlagen." });
  }
}
