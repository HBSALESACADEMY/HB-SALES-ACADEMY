import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";

// Löscht das eigene Konto endgültig.
//
// DSGVO: Es gab bisher nur einen Datenexport, aber keinen Weg, das Konto
// selbst zu beenden — man musste jemanden darum bitten.
//
// Wirkung: Das Konto in auth.users wird entfernt. Alles, was daran hängt,
// verschwindet über die Fremdschlüssel mit (profiles, Ergebnisse, Termine,
// Beiträge). Das ist Absicht und lässt sich nicht rückgängig machen.
//
// Bewusst eine eigene Route und NICHT über die Nutzerverwaltung: dort löscht
// jemand anderen, hier sich selbst — und dafür braucht es keine Rolle.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  try {
    const admin = getAdminSupabase();

    // Der einzige Plattform-Admin darf sich nicht selbst löschen — danach
    // käme niemand mehr an die Verwaltung heran.
    const { data: ich } = await auth.client.from("profiles").select("is_platform_admin").eq("id", auth.user.id).maybeSingle();
    if (ich?.is_platform_admin) {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_platform_admin", true);
      if ((count || 0) <= 1) {
        return res.status(400).json({ error: "Du bist der einzige Plattform-Betreiber — dieses Konto lässt sich nicht löschen. Ernenne zuerst eine zweite Person." });
      }
    }

    // Aufnahmen liegen im Dateispeicher und hängen an keinem Fremdschlüssel —
    // die müssen eigens weg, sonst bliebe die Datei ohne Eintrag zurück.
    const { data: eigeneLeads } = await admin.from("leads").select("recording_path").eq("created_by", auth.user.id);
    const pfade = (eigeneLeads || []).map((l) => l.recording_path).filter(Boolean);
    if (pfade.length) await admin.storage.from("lead-recordings").remove(pfade);

    const { error } = await admin.auth.admin.deleteUser(auth.user.id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Konto löschen fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Das Konto konnte nicht gelöscht werden." });
  }
}
