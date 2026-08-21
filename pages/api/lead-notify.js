import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { notifyOrgManagers } from "../../lib/notifyManagers";
import { sendEmail } from "../../lib/email";
import { sendeAlarm } from "../../lib/alarm";

// Meldet Änderungen an einem bestehenden Termin an das Team — Statuswechsel,
// Ergebnis, Folgetermin, Bearbeitung, Löschung.
//
// Warum eine eigene Route: Diese Änderungen laufen direkt aus dem Browser in
// die Datenbank (pages/termine.js). Ohne einen Server-Zeitpunkt gibt es keine
// Stelle, an der eine Benachrichtigung ausgelöst werden könnte — genau wie
// beim Anlegen, das deshalb schon über pages/api/lead-created.js läuft.
//
// Beim Löschen MUSS diese Route vor dem Löschen aufgerufen werden: danach
// gibt es den Termin nicht mehr und die Daten wären nicht mehr lesbar.
export const config = { maxDuration: 20 };

const TITEL = {
  status: "🔄 Termin-Status geändert",
  ergebnis: "🎯 Termin-Ergebnis eingetragen",
  folgetermin: "📅 Folgetermin angelegt",
  bearbeitet: "✏️ Termin bearbeitet",
  geloescht: "🗑️ Termin gelöscht",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { leadId, ereignis, beschreibung, activeOrgId } = req.body || {};
  if (!leadId || !TITEL[ereignis]) return res.status(400).json({ error: "leadId und gültiges Ereignis erforderlich." });

  try {
    // Über den RLS-gebundenen Client: wer den Termin nicht sehen darf, kann
    // auch keine Meldung dazu auslösen.
    const { data: lead } = await client.from("leads").select("*").eq("id", leadId).maybeSingle();
    if (!lead) return res.status(404).json({ error: "Termin nicht gefunden — oder kein Zugriff." });

    const admin = getAdminSupabase();
    const { data: me } = await client.from("profiles").select("full_name, organization_id, is_platform_admin").eq("id", user.id).maybeSingle();
    // Fallback ist die Organisation des/der Termin-Ersteller:in, nicht die
    // eigene — sonst ginge die Meldung bei einer nur per Aufgabe berechtigten
    // Person an die falsche Organisation (gleicher Grund wie lead-reminder.js).
    const { data: besitzer } = await admin.from("profiles").select("organization_id").eq("id", lead.created_by).maybeSingle();
    let orgId = besitzer?.organization_id || me?.organization_id || null;
    if (activeOrgId && (me?.is_platform_admin || activeOrgId === me?.organization_id)) orgId = activeOrgId;
    if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

    const { data: org } = await admin.from("organizations").select("name, telegram_chat_id").eq("id", orgId).maybeSingle();
    const orgName = org?.name || null;
    const wer = me?.full_name || "Ein Teammitglied";
    const termin = lead.appointment_at ? new Date(lead.appointment_at).toLocaleString("de-DE") : "kein Zeitpunkt";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    // Nach dem Löschen führt der Link ins Leere — dann weglassen.
    const link = appUrl && ereignis !== "geloescht" ? `${appUrl}/termine?leadId=${lead.id}` : null;

    const subject = `${TITEL[ereignis].replace(/^\S+\s/, "")}: ${lead.name}`;
    const html =
      `<p><strong>${wer}</strong>: ${beschreibung || TITEL[ereignis]}</p>` +
      `<p><strong>${lead.name}</strong>${lead.company ? ` (${lead.company})` : ""}<br/>Termin: ${termin}</p>` +
      (link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Termin ansehen →</a></p>` : "");

    await notifyOrgManagers(admin, orgId, { subject, html, fromName: orgName || "HB Sales Academy", art: "termine" });

    const { data: extra } = await admin.from("notification_emails").select("email").eq("organization_id", orgId);
    await Promise.all((extra || []).map((e) =>
      sendEmail({ to: e.email, subject, html, fromName: orgName || "HB Sales Academy" })));

    if (org?.telegram_chat_id) {
      const text = [
        `${TITEL[ereignis]}: ${lead.name}` + (lead.company ? ` (${lead.company})` : ""),
        beschreibung ? beschreibung : null,
        `Von ${wer}`,
        ``,
        `Termin: ${termin}`,
        link ? `\n${link}` : null,
      ].filter((z) => z !== null).join("\n");
      await sendeAlarm(text, org.telegram_chat_id);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Termin-Meldung fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Meldung konnte nicht gesendet werden." });
  }
}
