import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";

// Kommentar zu einem Skript — landet in der Community, nicht in einer
// zweiten Kommentarspalte an der Datei.
//
// Je Skript gibt es genau einen Community-Beitrag: der erste Kommentar legt
// ihn an, alle weiteren hängen als Antworten darunter. So bleibt die
// Diskussion an einem Ort, statt sich über viele Einzelbeiträge zum selben
// Skript zu verteilen.
//
// Läuft über den RLS-gebundenen Client: wer das Skript nicht sehen darf,
// kann es auch nicht kommentieren, und der Beitrag entsteht unter der
// eigenen Kennung.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { scriptId, text } = req.body || {};
  if (!scriptId || !text?.trim()) return res.status(400).json({ error: "scriptId und Text erforderlich." });

  try {
    const { data: skript } = await client.from("scripts").select("id, title, visibility, community_post_id").eq("id", scriptId).maybeSingle();
    if (!skript) return res.status(404).json({ error: "Skript nicht gefunden — oder kein Zugriff." });
    if (skript.visibility === "private") {
      return res.status(400).json({ error: "Private Skripte lassen sich nicht kommentieren — stell es zuerst auf „Ganzes Unternehmen“." });
    }

    let postId = skript.community_post_id;
    if (!postId) {
      const { data: post, error: postErr } = await client.from("community_posts").insert({
        user_id: user.id,
        content: `Diskussion zum Skript „${skript.title}“`,
        script_id: skript.id,
      }).select().single();
      if (postErr) throw postErr;
      postId = post.id;
      // Rückverweis, damit der nächste Kommentar denselben Beitrag findet.
      // Über den Admin-Client: wer ein FREMDES Skript kommentiert, darf
      // dessen Zeile nicht ändern — die Zugriffsregeln würden den Verweis
      // blockieren und beim nächsten Kommentar entstünde ein zweiter
      // Beitrag. Geschrieben wird nur dieses eine, systemeigene Feld.
      const { error: linkErr } = await getAdminSupabase()
        .from("scripts").update({ community_post_id: postId }).eq("id", skript.id);
      if (linkErr) throw linkErr;
    }

    const { error: kommentarErr } = await client.from("community_comments").insert({
      post_id: postId, user_id: user.id, content: text.trim(),
    });
    if (kommentarErr) throw kommentarErr;

    return res.status(200).json({ ok: true, postId });
  } catch (e) {
    console.error("Skript-Kommentar fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
