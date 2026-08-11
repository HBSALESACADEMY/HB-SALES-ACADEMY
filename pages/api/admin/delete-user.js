import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("role, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  if (!me || (me.role !== "manager" && !me.is_platform_admin)) {
    return res.status(403).json({ error: "Nur Manager können Nutzer entfernen." });
  }

  const { targetId } = req.body || {};
  if (!targetId) return res.status(400).json({ error: "targetId erforderlich." });
  if (targetId === user.id) {
    return res.status(400).json({ error: "Du kannst dein eigenes Konto hier nicht löschen." });
  }

  try {
    const admin = getAdminSupabase();

    // Service-Role umgeht RLS komplett — ohne diese Prüfung könnte ein Manager
    // Konten einer FREMDEN Organisation löschen. Plattform-Admins sind bewusst
    // von dieser Einschränkung ausgenommen.
    if (!me.is_platform_admin) {
      const { data: target } = await admin.from("profiles").select("organization_id").eq("id", targetId).maybeSingle();
      if (!target || target.organization_id !== me.organization_id) {
        return res.status(403).json({ error: "Nutzer gehört nicht zu deiner Organisation." });
      }
    }

    // Storage-Dateien (Anruf-/Lead-Aufnahmen) hängen NICHT an einer Foreign
    // Key-Kaskade — die Datenbank-Kaskade beim Löschen des Nutzers räumt nur
    // die Zeilen weg, nicht die eigentlichen Audiodateien im Speicher. Ohne
    // das hier blieben personenbezogene Aufnahmen verwaist und dauerhaft
    // gespeichert liegen (DSGVO: Löschung muss auch die Datei selbst treffen).
    for (const bucket of ["call-recordings", "lead-recordings"]) {
      const { data: files } = await admin.storage.from(bucket).list(targetId);
      if (files?.length) {
        await admin.storage.from(bucket).remove(files.map((f) => `${targetId}/${f.name}`));
      }
    }

    // Deletes the auth.users row; the profiles row (and all quiz/exam/roleplay
    // rows referencing it) cascade-deletes automatically via foreign keys.
    const { error } = await admin.auth.admin.deleteUser(targetId);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler beim Löschen des Nutzers." });
  }
}
