import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../lib/rollen";
import { haeufigeHerausforderungen, stimmungsBild } from "../../lib/buddyRueckblick";
import { wochenStartTag, tagPlus } from "../../lib/woche";

// Was die Leitung aus den Buddy-Gesprächen ihres Teams sieht.
//
// Und was sie NICHT sieht: die Sätze selbst. Diese Route liest die Spalte
// "zusammenfassung" nicht einmal aus der Datenbank — sie enthält das
// Gedächtnis des Buddys samt Persönlichem und geht niemanden sonst etwas
// an. Heraus kommen die Herausforderungen, die Stimmung und das, was sich
// jemand vorgenommen hat.
//
// Ohne diese Grenze wäre der Buddy in zwei Wochen tot: Wer weiss, dass
// seine Worte bei der Leitung landen, schreibt nichts Ehrliches mehr.
export const config = { maxDuration: 20 };

const WOCHEN = 8;
const MIGRATION_FEHLT = "In der Datenbank fehlt die Tabelle für die Wochenrückblicke (migration_169).";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("id, role, is_admin, is_platform_admin, organization_id").eq("id", auth.user.id).maybeSingle();
  if (!istFuehrungsrolle(profil)) return res.status(403).json({ error: "Das sieht die Leitung." });
  const orgId = await aktiveOrgId(admin, profil, auth.user.id);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  try {
    const ab = tagPlus(wochenStartTag(), -7 * (WOCHEN - 1));
    const { data: rueckblicke, error } = await admin.from("buddy_wochen")
      // Ausdrücklich ohne "zusammenfassung".
      .select("user_id, woche, herausforderungen, stimmung, vorhaben")
      .eq("organization_id", orgId).gte("woche", ab)
      .order("woche", { ascending: false });
    if (error) {
      return res.status(500).json({ error: /buddy_wochen/.test(error.message) ? MIGRATION_FEHLT : error.message });
    }

    const ids = [...new Set((rueckblicke || []).map((r) => r.user_id))];
    const { data: profile } = ids.length
      ? await admin.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] };
    const nameVon = new Map((profile || []).map((p) => [p.id, p.full_name || "Unbenannt"]));

    const jeWoche = new Map();
    (rueckblicke || []).forEach((r) => {
      if (!jeWoche.has(r.woche)) jeWoche.set(r.woche, []);
      jeWoche.get(r.woche).push(r);
    });

    const wochen = [...jeWoche.entries()].map(([woche, liste]) => ({
      woche,
      personen: liste.map((r) => ({
        id: r.user_id,
        name: nameVon.get(r.user_id) || "Unbenannt",
        herausforderungen: Array.isArray(r.herausforderungen) ? r.herausforderungen : [],
        stimmung: r.stimmung || null,
        vorhaben: r.vorhaben || null,
      })),
      haeufig: haeufigeHerausforderungen(liste),
      stimmung: stimmungsBild(liste),
    }));

    return res.status(200).json({ wochen, diese: wochenStartTag() });
  } catch (e) {
    console.error("Herausforderungen fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}
