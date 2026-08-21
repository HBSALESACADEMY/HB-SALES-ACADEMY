import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";

// Alles, was im Firmenkalender eines Monats steht: eingetragene Termine,
// Geburtstage und Abwesenheiten.
//
// Über eine Route, weil drei Quellen zusammenkommen und die Geburtstage aus
// profiles gelesen werden müssen — dort steht mehr, als im Kalender zu
// sehen sein soll. Herausgegeben wird nur Name, Bild und der Tag.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const monat = String(req.query.monat || "").slice(0, 7); // "JJJJ-MM"
  if (!/^\d{4}-\d{2}$/.test(monat)) return res.status(400).json({ error: "Monat im Format JJJJ-MM erforderlich." });

  try {
    const admin = getAdminSupabase();
    const { data: ich } = await auth.client.from("profiles")
      .select("organization_id, is_platform_admin, role, is_admin").eq("id", auth.user.id).maybeSingle();
    const orgId = await aktiveOrgId(admin, ich, auth.user.id);
    if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

    const monatsErster = `${monat}-01`;
    // Letzter Tag des Monats über den nullten Tag des Folgemonats.
    const [j, m] = monat.split("-").map(Number);
    const monatsLetzter = `${monat}-${String(new Date(Date.UTC(j, m, 0)).getUTCDate()).padStart(2, "0")}`;

    const [{ data: eintraege }, { data: personen }] = await Promise.all([
      // Überlappend statt nur beginnend: ein mehrtägiger Eintrag, der im
      // Vormonat startet, gehört trotzdem in diesen Monat.
      admin.from("org_events").select("*").eq("organization_id", orgId)
        .lte("von", monatsLetzter)
        .or(`bis.is.null,bis.gte.${monatsErster}`)
        .order("von"),
      admin.from("profiles").select("id, full_name, avatar_url, geburtstag, abwesend_von, abwesend_bis")
        .eq("organization_id", orgId),
    ]);

    // Ein Eintrag, der im Vormonat begann und kein Ende hat, dauert einen Tag
    // — der gehört dann doch nicht hierher.
    const gefiltert = (eintraege || []).filter((e) => (e.bis || e.von) >= monatsErster);

    const geburtstage = (personen || [])
      .filter((p) => p.geburtstag)
      .map((p) => ({
        id: p.id,
        name: p.full_name || "Unbenannt",
        avatar_url: p.avatar_url,
        // Nur Tag und Monat herausgeben — das Geburtsjahr geht niemanden an.
        tag: `${monat}-${p.geburtstag.slice(8, 10)}`,
        monatTag: p.geburtstag.slice(5),
      }))
      .filter((g) => g.monatTag.slice(0, 2) === monat.slice(5, 7));

    const abwesenheiten = (personen || [])
      .filter((p) => (p.abwesend_von || p.abwesend_bis))
      .map((p) => ({
        id: p.id,
        name: p.full_name || "Unbenannt",
        von: p.abwesend_von || p.abwesend_bis,
        bis: p.abwesend_bis || p.abwesend_von,
      }))
      .filter((a) => a.von <= monatsLetzter && a.bis >= monatsErster);

    const namen = new Map((personen || []).map((p) => [p.id, p.full_name || "Unbenannt"]));
    return res.status(200).json({
      eintraege: gefiltert.map((e) => ({ ...e, autor: namen.get(e.created_by) || "Unbenannt" })),
      geburtstage,
      abwesenheiten,
      selbst: auth.user.id,
    });
  } catch (e) {
    console.error("Kalender konnte nicht geladen werden:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
