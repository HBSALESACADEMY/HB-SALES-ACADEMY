import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { notifyOrgManagers } from "../../lib/notifyManagers";
import { sendEmail } from "../../lib/email";
import { sendeAlarm } from "../../lib/alarm";

// Manuelle Erinnerung an einen bestehenden Termin — geht NICHT an die
// Kund:in, sondern an dieselben Empfänger wie die automatische
// Termin-Benachrichtigung (siehe lead-created.js): nur die Manager/Admins
// DIESER Organisation plus deren konfigurierte Zusatz-Adressen. Wer den
// Lead sehen darf (RLS leads_select), darf auch die Erinnerung auslösen.
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

    // Früher wurde hier abgebrochen, wenn kein E-Mail-Zugang hinterlegt ist.
    // Seit die Erinnerung auch per Telegram geht, wäre das genau verkehrt: der
    // Weg, der funktioniert, würde ausgerechnet dann übersprungen, wenn der
    // andere nicht eingerichtet ist. sendEmail() überspringt sich ohne Zugang
    // ohnehin von selbst.
    const admin = getAdminSupabase();
    const { data: me } = await client.from("profiles").select("organization_id, is_platform_admin").eq("id", user.id).maybeSingle();
    // Fallback ist die Organisation des/der Termin-ERSTELLER:in, nicht die
    // eigene — sonst ginge die Erinnerung bei einer Person, die den Termin
    // nur per zugewiesener Aufgabe/Erwähnung sieht (migration_77), an die
    // FALSCHE Organisation. Firmencode-Override wie in lead-created.js/
    // certificate.js: nur akzeptieren, wenn wirklich Plattform-Admin oder es
    // ohnehin die eigene Organisation ist.
    const { data: leadOwner } = await admin.from("profiles").select("organization_id").eq("id", lead.created_by).maybeSingle();
    let effectiveOrgId = leadOwner?.organization_id || me?.organization_id || null;
    if (activeOrgId && (me?.is_platform_admin || activeOrgId === me?.organization_id)) {
      effectiveOrgId = activeOrgId;
    }
    if (!effectiveOrgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

    const { data: org } = await admin.from("organizations").select("name, telegram_chat_id").eq("id", effectiveOrgId).maybeSingle();
    const orgName = org?.name || null;

    const appointmentText = lead.appointment_at
      ? new Date(lead.appointment_at).toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" })
      : "noch offen";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const link = appUrl ? `${appUrl}/termine?leadId=${lead.id}` : null;

    const html =
      `<p><strong>Erinnerung</strong> an den Termin mit <strong>${lead.name}</strong>${lead.company ? ` (${lead.company})` : ""}${orgName ? ` bei ${orgName}` : ""}:</p>` +
      `<p>Termin: ${appointmentText}` +
      (lead.phone ? `<br/>Telefon: ${lead.phone}` : "") +
      (lead.email ? `<br/>E-Mail: ${lead.email}` : "") +
      (lead.website ? `<br/>Webseite: ${lead.website}` : "") +
      `</p>` +
      (lead.notes ? `<p>${lead.notes}</p>` : "") +
      (link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Termin ansehen →</a></p>` : "");

    const subject = `Erinnerung: Termin mit ${lead.name}`;
    const fromName = orgName || "HB Sales Academy";

    await notifyOrgManagers(admin, effectiveOrgId, { subject, html, fromName, art: "termine" });

    const { data: extra } = await admin.from("notification_emails").select("email").eq("organization_id", effectiveOrgId);
    const extraEmails = (extra || []).map((e) => e.email);
    // Einzeln statt als Sammel-Anfrage, siehe Kommentar in notifyManagers.js.
    await Promise.all(extraEmails.map((to) => sendEmail({ to, subject, html, fromName })));

    // Zusätzlich in den Telegram-Chat der Organisation, falls hinterlegt
    // (migration_84). Wie bei der Termin-Benachrichtigung: ergänzt die E-Mail.
    if (org?.telegram_chat_id) {
      const text = [
        `🔔 Erinnerung: Termin mit ${lead.name}` + (lead.company ? ` (${lead.company})` : ""),
        ``,
        `Termin: ${appointmentText}`,
        lead.phone ? `Telefon: ${lead.phone}` : null,
        lead.email ? `E-Mail: ${lead.email}` : null,
        lead.notes ? `\n${lead.notes}` : null,
        link ? `\n${link}` : null,
      ].filter((z) => z !== null).join("\n");
      await sendeAlarm(text, org.telegram_chat_id);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Erinnerung konnte nicht gesendet werden." });
  }
}
