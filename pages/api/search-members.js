import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";

// Globale Namenssuche für Freundschaftsanfragen (wie die Community bewusst
// unternehmensübergreifend, nicht auf same_org beschränkt). Läuft über
// Service-Role, weil normale Profil-Sichtbarkeit (can_view_profile) sonst
// nur Leute aus der eigenen Organisation oder mit Community-Aktivität
// zurückgeben würde. Gibt bewusst NUR Name+Avatar zurück, keine weiteren
// Profildaten (Bio, Kontakt, Firma etc.).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireUser(req, res);
  if (!auth) return;

  const q = (req.query.q || "").trim();
  if (q.length < 2) return res.status(200).json({ results: [] });

  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("status", "approved")
      .neq("id", auth.user.id)
      .ilike("full_name", `%${q}%`)
      .order("full_name")
      .limit(10);
    if (error) throw error;

    return res.status(200).json({ results: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Fehler bei der Suche." });
  }
}
