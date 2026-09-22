import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { saeubere, vergleichsForm } from "../../lib/grundVorschlag";
import { meldeNeuenGrund } from "../../lib/einwandMeldungVersand";

// Die Leitung erfährt, wenn im Call Tracker ein neuer Einwandgrund
// eingetippt wurde.
//
// Aufgerufen direkt nach dem Eintrag (pages/call-tracker.js). Der Eintrag
// selbst läuft über die Datenbank-Regeln der eingetragenen Person; diese
// Route verschickt nur die Meldung.
//
// Damit sie kein Weg wird, der Leitung beliebigen Text zu schicken, geht
// NICHT der Text aus dem Aufruf raus: Die Route sucht den gespeicherten
// Vorschlag dieser Person in dieser Organisation und meldet dessen
// Wortlaut. Ohne passenden Eintrag geht nichts.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const userId = auth.user.id;
  const admin = getAdminSupabase();

  const gesucht = vergleichsForm(req.body?.text);
  if (!gesucht) return res.status(400).json({ error: "Kein Grund angegeben." });

  const { data: profil } = await admin.from("profiles")
    .select("role, is_admin, is_platform_admin, organization_id").eq("id", userId).maybeSingle();
  const orgId = await aktiveOrgId(admin, profil, userId);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  try {
    // Der jüngste eigene Vorschlag mit diesem Wortlaut — das ist der, der
    // eben eingetragen wurde.
    const { data: eigene, error } = await admin.from("grund_vorschlaege")
      .select("id, text").eq("organization_id", orgId).eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    const treffer = (eigene || []).find((v) => vergleichsForm(v.text) === gesucht);
    if (!treffer) return res.status(404).json({ error: "Zu diesem Grund liegt kein Eintrag vor." });

    const ergebnis = await meldeNeuenGrund(admin, { orgId, userId, text: saeubere(treffer.text) });
    return res.status(200).json({ ok: true, ...ergebnis });
  } catch (e) {
    // Der Vorschlag ist gespeichert, nur die Meldung fehlt. Das darf den
    // Call Tracker nicht aufhalten — und es bleibt sichtbar, weil der
    // Vorschlag ohnehin in Verwaltung → Einwände steht.
    console.error("Einwand-Meldung fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Die Meldung konnte nicht verschickt werden." });
  }
}
