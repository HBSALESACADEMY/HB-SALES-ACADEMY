import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { sendeAlarm } from "../../lib/alarm";
import { bestaetigungsText, schrittZurStufe } from "../../lib/bestaetigung";
import { artVon, schrittErledigt } from "../../lib/terminArt";

// Meldet eine gesetzte Terminbestätigung an den Telegram-Kanal.
//
// Der Text wird HIER gebaut, nicht im Browser mitgeschickt: sonst könnte
// jede angemeldete Person eine beliebige Nachricht in den Kanal der
// Organisation schreiben. Herein kommen nur eine Termin-Kennung und der
// Name des Schritts, alles andere kommt aus der Datenbank.
//
// Gelesen wird über den RLS-gebundenen Client — wer den Termin nicht sehen
// darf, kann über diese Route auch nichts über ihn melden.
export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { leadId, schritt } = req.body || {};
  if (!leadId || !schritt) return res.status(400).json({ error: "leadId und schritt sind nötig." });

  try {
    const { data: lead } = await client.from("leads")
      .select("id, name, company, appointment_at, termin_art, status, schritte, created_by")
      .is("geloescht_am", null).eq("id", leadId).maybeSingle();
    if (!lead) return res.status(404).json({ error: "Termin nicht gefunden." });

    // Nur die Bestätigungen vor einem Gespräch werden gemeldet. Die
    // Projektumsetzung ist kein Terminereignis und hat in diesem Kanal
    // nichts zu suchen.
    const erwartet = schrittZurStufe(artVon(lead).key);
    if (!erwartet || erwartet.key !== schritt) {
      return res.status(200).json({ ok: true, still: true });
    }

    // Nur melden, was wirklich in der Datenbank steht. Sonst meldet ein
    // zweiter Aufruf eine Bestätigung, die es nicht gibt.
    if (!schrittErledigt(lead, schritt)) return res.status(200).json({ ok: true, still: true });

    const admin = getAdminSupabase();
    const { data: profil } = await admin.from("profiles")
      .select("id, full_name, organization_id, active_org").eq("id", user.id).maybeSingle();
    const orgId = await aktiveOrgId(admin, profil, user.id);
    if (!orgId) return res.status(200).json({ ok: true, still: true });

    const { data: org } = await admin.from("organizations")
      .select("telegram_chat_id, telegram_bestaetigung_chat_id").eq("id", orgId).maybeSingle();
    const kanal = org?.telegram_bestaetigung_chat_id || org?.telegram_chat_id;
    if (!kanal) return res.status(200).json({ ok: true, ohneKanal: true });

    // Der Name der Person, die den Termin ANGELEGT hat — nicht der, die
    // gerade abhakt. In der Gruppe geht es darum, wessen Termin stattfindet.
    const { data: besitzer } = await admin.from("profiles")
      .select("full_name").eq("id", lead.created_by).maybeSingle();

    await sendeAlarm(bestaetigungsText(lead, besitzer?.full_name || ""), kanal);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Bestätigung melden fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Die Meldung konnte nicht verschickt werden." });
  }
}
