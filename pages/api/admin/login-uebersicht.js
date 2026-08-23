import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../../lib/rollen";

// Wer aus dieser Organisation war wann zuletzt angemeldet — ALLE Mitglieder,
// auch die ohne einen einzigen Eintrag.
//
// Warum über den Server: die Liste im Browser zeigt nur, was die
// Zugriffsregeln durchlassen, und filtert zusätzlich nach Organisation.
// Fehlt jemand, kann das drei verschiedene Ursachen haben — er gehört zu
// einer anderen Organisation, sein Profil hat gar keine, oder es gibt
// schlicht keine Anmeldung. Von aussen sieht alles drei gleich aus. Hier
// steht, was tatsächlich in der Datenbank steht.
//
// Die Mandanten-Grenze bleibt: gezeigt wird nur die AKTIVE Organisation.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { data: ich } = await auth.client.from("profiles")
    .select("id, role, is_admin, is_platform_admin, organization_id").eq("id", auth.user.id).maybeSingle();
  if (!istFuehrungsrolle(ich)) return res.status(403).json({ error: "Nur für Führungsrollen." });

  try {
    const admin = getAdminSupabase();
    const orgId = await aktiveOrgId(admin, ich, auth.user.id);
    if (!orgId) return res.status(400).json({ error: "Keine Organisation aktiv." });

    const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
    const { data: personen } = await admin.from("profiles")
      .select("id, full_name, avatar_url, status, created_at").eq("organization_id", orgId);

    const ids = (personen || []).map((p) => p.id);
    const { data: ereignisse } = ids.length
      ? await admin.from("login_events").select("user_id, created_at").in("user_id", ids)
          .order("created_at", { ascending: false }).limit(3000)
      : { data: [] };

    const zuletzt = new Map();
    const anzahl = new Map();
    (ereignisse || []).forEach((e) => {
      if (!zuletzt.has(e.user_id)) zuletzt.set(e.user_id, e.created_at);
      anzahl.set(e.user_id, (anzahl.get(e.user_id) || 0) + 1);
    });

    const liste = (personen || []).map((p) => ({
      id: p.id,
      name: p.full_name || "Unbenannt",
      avatar_url: p.avatar_url,
      status: p.status || null,
      dabei_seit: p.created_at,
      zuletzt: zuletzt.get(p.id) || null,
      anzahl: anzahl.get(p.id) || 0,
    })).sort((a, b) => String(b.zuletzt || "").localeCompare(String(a.zuletzt || "")));

    // Konten ohne Organisation gehören zu niemandem und tauchen deshalb in
    // keiner Liste auf — nur ein Plattform-Admin kann sie zuordnen. Für alle
    // anderen wäre selbst die Zahl eine Auskunft über fremde Daten.
    let ohneOrganisation = null;
    if (ich?.is_platform_admin) {
      const { data: heimatlos } = await admin.from("profiles")
        .select("id, full_name").is("organization_id", null).limit(50);
      ohneOrganisation = (heimatlos || []).map((p) => ({ id: p.id, name: p.full_name || "Unbenannt" }));
    }

    return res.status(200).json({ organisation: org?.name || null, personen: liste, ohneOrganisation });
  } catch (e) {
    console.error("Login-Übersicht fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
