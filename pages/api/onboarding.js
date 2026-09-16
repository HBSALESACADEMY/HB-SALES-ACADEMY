import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../lib/rollen";
import { pruefeSchritt, darfAbhaken } from "../../lib/onboarding";
import { ladeOnboarding } from "../../lib/onboardingStand";
import { berlinHeute } from "../../lib/woche";

// Das Onboarding lesen und verwalten.
//
// Alle Schreibzugriffe laufen hier (migration_167 lässt dem Browser nur das
// Lesen). Die Regeln:
//   - Plan und Zuweisungen verwaltet die Leitung, und zwar nur in der
//     eigenen, aktiven Organisation.
//   - Abhaken darf die Leitung jeden Schritt von Hand, ein Vertriebler nur
//     seine eigenen, für ihn gedachten (lib/onboarding.js#darfAbhaken).
//   - Automatische Schritte hakt niemand ab.
export const config = { maxDuration: 30 };

const MIGRATION_FEHLT = "In der Datenbank fehlen die Tabellen fürs Onboarding (migration_167).";
const lesbar = (e) => (/onboarding_/.test(e?.message || "") ? MIGRATION_FEHLT : (e?.message || "Unbekannter Fehler."));
const istDatum = (t) => /^\d{4}-\d{2}-\d{2}$/.test(String(t || ""));

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("id, full_name, role, is_admin, is_platform_admin, organization_id").eq("id", auth.user.id).maybeSingle();
  const orgId = await aktiveOrgId(admin, profil, auth.user.id);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });
  const leitung = istFuehrungsrolle(profil);

  try {
    if (req.method === "GET") return await lesen(req, res, { admin, orgId, profil, leitung });
    if (req.method === "POST") return await schreiben(req, res, { admin, orgId, profil, leitung });
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("Onboarding fehlgeschlagen:", e.message);
    return res.status(500).json({ error: lesbar(e) });
  }
}

async function lesen(req, res, { admin, orgId, profil, leitung }) {
  // Der eigene Plan — für den Startbildschirm, auch bei der Leitung.
  if (!leitung || req.query.ansicht === "mein") {
    const { schritte, zuweisungen } = await ladeOnboarding(admin, { orgId, userIds: [profil.id] });
    return res.status(200).json({ rolle: "vertrieb", schritte, zuweisung: zuweisungen[0] || null });
  }

  const [{ schritte, zuweisungen }, { data: mitglieder, error }] = await Promise.all([
    ladeOnboarding(admin, { orgId }),
    admin.from("profiles").select("id, full_name, role_title")
      .eq("organization_id", orgId).eq("status", "approved").order("full_name"),
  ]);
  if (error) throw error;
  return res.status(200).json({ rolle: "leitung", schritte, zuweisungen, mitglieder: mitglieder || [], heute: berlinHeute() });
}

async function schreiben(req, res, { admin, orgId, profil, leitung }) {
  const b = req.body || {};

  if (b.aktion === "haken") {
    const [{ data: zuweisung }, { data: schritt }] = await Promise.all([
      admin.from("onboarding_zuweisungen").select("id, user_id")
        .eq("id", b.zuweisungId).eq("organization_id", orgId).maybeSingle(),
      admin.from("onboarding_schritte").select("id, wer, automatisch")
        .eq("id", b.schrittId).eq("organization_id", orgId).maybeSingle(),
    ]);
    if (!zuweisung || !schritt) return res.status(404).json({ error: "Schritt oder Onboarding nicht gefunden." });
    if (!darfAbhaken(schritt, { istLeitung: leitung, istEigene: zuweisung.user_id === profil.id })) {
      return res.status(403).json({
        error: schritt.automatisch ? "Dieser Schritt hakt sich automatisch ab." : "Diesen Schritt hakt die Leitung ab.",
      });
    }
    const { error } = b.erledigt
      ? await admin.from("onboarding_haken").upsert(
        { zuweisung_id: zuweisung.id, schritt_id: schritt.id, erledigt_am: new Date().toISOString(), erledigt_von: profil.id },
        { onConflict: "zuweisung_id,schritt_id" })
      : await admin.from("onboarding_haken").delete().eq("zuweisung_id", zuweisung.id).eq("schritt_id", schritt.id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  }

  if (!leitung) return res.status(403).json({ error: "Das Onboarding verwaltet die Leitung." });

  if (b.aktion === "schritt_speichern") {
    const { schritt, fehler } = pruefeSchritt(b.schritt);
    if (fehler) return res.status(400).json({ error: fehler });
    if (b.schritt?.id) {
      const { data, error } = await admin.from("onboarding_schritte").update(schritt)
        .eq("id", b.schritt.id).eq("organization_id", orgId).select("id");
      if (error) throw error;
      if (!data?.length) return res.status(404).json({ error: "Diesen Schritt gibt es nicht (mehr)." });
      return res.status(200).json({ ok: true });
    }
    const { data: letzter } = await admin.from("onboarding_schritte").select("reihenfolge")
      .eq("organization_id", orgId).order("reihenfolge", { ascending: false }).limit(1);
    const { error } = await admin.from("onboarding_schritte").insert({
      ...schritt, organization_id: orgId, created_by: profil.id, reihenfolge: (letzter?.[0]?.reihenfolge ?? -1) + 1,
    });
    if (error) throw error;
    return res.status(200).json({ ok: true });
  }

  if (b.aktion === "schritt_loeschen") {
    const { data, error } = await admin.from("onboarding_schritte").delete()
      .eq("id", b.id).eq("organization_id", orgId).select("id");
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Diesen Schritt gibt es nicht (mehr)." });
    return res.status(200).json({ ok: true });
  }

  if (b.aktion === "reihenfolge") {
    const ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === "string").slice(0, 200) : [];
    const ergebnisse = await Promise.all(ids.map((id, i) =>
      admin.from("onboarding_schritte").update({ reihenfolge: i }).eq("id", id).eq("organization_id", orgId)));
    const fehler = ergebnisse.find((r) => r.error);
    if (fehler) throw fehler.error;
    return res.status(200).json({ ok: true });
  }

  if (b.aktion === "zuweisen") {
    const { data: person } = await admin.from("profiles").select("id, organization_id, status").eq("id", b.userId).maybeSingle();
    if (!person || person.organization_id !== orgId || person.status !== "approved") {
      return res.status(400).json({ error: "Diese Person gehört nicht (freigeschaltet) zu eurer Organisation." });
    }
    const { error } = await admin.from("onboarding_zuweisungen").insert({
      organization_id: orgId,
      user_id: person.id,
      gestartet_am: istDatum(b.gestartetAm) ? b.gestartetAm : berlinHeute(),
      zugewiesen_von: profil.id,
    });
    if (error?.code === "23505") return res.status(409).json({ error: "Diese Person ist schon im Onboarding." });
    if (error) throw error;
    return res.status(200).json({ ok: true });
  }

  if (b.aktion === "startdatum") {
    if (!istDatum(b.gestartetAm)) return res.status(400).json({ error: "Das Startdatum ist ungültig." });
    const { data, error } = await admin.from("onboarding_zuweisungen")
      // Neuer Start, neue Fristen: alte Erinnerungen gelten nicht mehr.
      .update({ gestartet_am: b.gestartetAm, erinnert: {}, abgeschlossen_am: null })
      .eq("id", b.id).eq("organization_id", orgId).select("id");
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Dieses Onboarding gibt es nicht (mehr)." });
    return res.status(200).json({ ok: true });
  }

  if (b.aktion === "zuweisung_entfernen") {
    const { data, error } = await admin.from("onboarding_zuweisungen").delete()
      .eq("id", b.id).eq("organization_id", orgId).select("id");
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Dieses Onboarding gibt es nicht (mehr)." });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Unbekannte Aktion." });
}
