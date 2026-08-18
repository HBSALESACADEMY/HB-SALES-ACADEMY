import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { callAIWithAudio } from "../../lib/aiClient";

// Zieht die wichtigsten Informationen aus der hochgeladenen Gesprächsaufnahme
// eines Termins — als Mitschrift, NICHT als Bewertung.
//
// Bewusst getrennt von pages/api/call-recording-evaluate.js: das ist die
// Trainings-Auswertung mit Punktzahl für frei hochgeladene Aufnahmen unter
// "Recordings". Hier geht es um Gesprächsnotizen zum Kundentermin — es gibt
// keine Note, keine Kritik, nur was besprochen wurde.
export const config = { maxDuration: 120 };

const ANWEISUNG =
  "Du bist Protokollführer:in in einem Vertriebsgespräch. Fasse NUR zusammen, was tatsächlich gesagt wurde. " +
  "Bewerte nicht, kritisiere nicht, gib keine Ratschläge und keine Punktzahl. Erfinde nichts — was nicht " +
  "vorkommt, lässt du weg bzw. gibst eine leere Liste zurück. Antworte AUSSCHLIESSLICH als valides JSON: " +
  '{"zusammenfassung": "<3-5 Sätze, worum es ging>", ' +
  '"bedarf": ["<was die Kundin/der Kunde braucht oder sucht>"], ' +
  '"einwaende": ["<geäusserte Bedenken>"], ' +
  '"vereinbarungen": ["<was konkret vereinbart wurde>"], ' +
  '"naechsteSchritte": ["<wer macht bis wann was>"], ' +
  '"sonstiges": ["<sonstige erwähnenswerte Fakten, z.B. Budget, Zuständigkeiten, Fristen>"]}. ' +
  "Alles auf Deutsch. Kein Text ausserhalb des JSON.";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY fehlt." });

  const { leadId } = req.body || {};
  if (!leadId) return res.status(400).json({ error: "leadId erforderlich." });

  const admin = getAdminSupabase();
  try {
    // Über den RLS-gebundenen Client: wer den Termin nicht sehen darf, kann
    // auch keine Notizen dazu anstossen.
    const { data: lead } = await auth.client.from("leads").select("id, recording_path").eq("id", leadId).maybeSingle();
    if (!lead) return res.status(404).json({ error: "Termin nicht gefunden — oder kein Zugriff." });
    if (!lead.recording_path) return res.status(400).json({ error: "Zu diesem Termin gibt es keine Aufnahme." });

    await admin.from("leads").update({ call_notes_status: "pending" }).eq("id", leadId);

    const { data: datei, error: ladeFehler } = await admin.storage.from("lead-recordings").download(lead.recording_path);
    if (ladeFehler) throw ladeFehler;

    const puffer = Buffer.from(await datei.arrayBuffer());
    const roh = await callAIWithAudio(
      ANWEISUNG,
      "Erstelle die Gesprächsnotizen zu dieser Aufnahme.",
      puffer.toString("base64"),
      datei.type || "audio/mpeg",
      1200
    );

    let notizen;
    try {
      notizen = JSON.parse(roh.replace(/```json|```/g, "").trim());
    } catch (e) {
      // Lieber die reine Textantwort behalten als gar nichts — die
      // Zusammenfassung ist auch dann brauchbar.
      notizen = { zusammenfassung: roh.trim(), bedarf: [], einwaende: [], vereinbarungen: [], naechsteSchritte: [], sonstiges: [] };
    }

    await admin.from("leads").update({ call_notes: notizen, call_notes_status: "done" }).eq("id", leadId);
    return res.status(200).json({ ok: true, notizen });
  } catch (e) {
    console.error("Gesprächsnotizen fehlgeschlagen:", e.message);
    await admin.from("leads").update({ call_notes_status: "failed" }).eq("id", leadId).then(() => {}, () => {});
    return res.status(500).json({ error: e.message || "Notizen konnten nicht erstellt werden." });
  }
}
