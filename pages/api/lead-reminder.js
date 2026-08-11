import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { notifyOrgManagers, notifyPlatformAdmins } from "../../lib/notifyManagers";
import { sendEmail } from "../../lib/email";

// Manuelle Erinnerung an einen bestehenden Termin — geht NICHT an die
// Kund:in, sondern an dieselben Empfänger wie die automatische
// Termin-Benachrichtigung (siehe lead-created.js): Org-Manager,
// Plattform-Admins, plus konfigurierte Zusatz-Adressen. Wer den Lead sehen
// darf (RLS leads_select), darf auch die Erinnerung auslösen.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { leadId, activeOrgId } = req.body || {};
  if (!leadId) return res.status(400).json({ error: "leadId erforderlich." });

  try {
    const { data: lead, error: leadErr } = await client.from("leads").select("*").eq("id", leadId).maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return res.status(404).json({ error: "Termin nicht gefunden — oder kein Zugriff." });

    if (!process.env.RESEND_API_KEY) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const admin = getAdminSupabase();
    const { data: me } = await client.from("profiles").select("organization_id, is_platform_admin").eq("id", user.id).maybeSingle();
    // Firmencode-Muster wie in lead-created.js/certificate.js: nur akzeptieren,
    // wenn wirklich Plattform-Admin oder es ohnehin die eigene Organisation ist.
    let effectiveOrgId = me?.organization_id || null;
    if (activeOrgId && (me?.is_platform_admin || activeOrgId === me?.organization_id)) {
      effectiveOrgId = activeOrgId;
    }
    if (!effectiveOrgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

    const appointmentText = lead.appointment_at
      ? new Date(lead.appointment_at).toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" })
      : "noch offen";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const link = appUrl ? `${appUrl}/termine?leadId=${lead.id}` : null;

    const html =
      `<p><strong>Erinnerung</strong> an den Termin mit <strong>${lead.name}</strong>${lead.company ? ` (${lead.company})` : ""}:</p>` +
      `<p>Termin: ${appointmentText}</p>` +
      (lead.notes ? `<p>${lead.notes}</p>` : "") +
      (link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Termin ansehen →</a></p>` : "");

    const subject = `Erinnerung: Termin mit ${lead.name}`;

    await Promise.all([
      notifyOrgManagers(admin, effectiveOrgId, { subject, html }),
      notifyPlatformAdmins(admin, { subject, html }),
    ]);

    const { data: extra } = await admin.from("notification_emails").select("email").eq("organization_id", effectiveOrgId);
    const extraEmails = (extra || []).map((e) => e.email);
    if (extraEmails.length) await sendEmail({ to: extraEmails, subject, html });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Erinnerung konnte nicht gesendet werden." });
  }
}
