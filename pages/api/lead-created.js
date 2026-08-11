import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { notifyOrgManagers } from "../../lib/notifyManagers";
import { sendEmail } from "../../lib/email";

// Läuft anstelle des früheren direkten Client-Inserts aus dem Call Tracker
// (public/tools/call-tracker.html) — nur so gibt es einen Server-Zeitpunkt,
// an dem nach dem Speichern automatisch eine Benachrichtigung ausgelöst
// werden kann. Der eigentliche Insert läuft weiterhin über den RLS-
// gebundenen Client der aufrufenden Person, keine erweiterten Rechte.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  try {
    const { name, phone, email, company, website, isDecisionMaker, notes, recordingPath, appointmentAt } = req.body || {};
    if (!name || !phone || !email || !appointmentAt) {
      return res.status(400).json({ error: "Name, Telefon, E-Mail und Termin sind erforderlich." });
    }

    const { data: lead, error: insertErr } = await client.from("leads").insert({
      created_by: user.id,
      name, phone, email,
      company: company || null,
      website: website || null,
      is_decision_maker: !!isDecisionMaker,
      notes: notes || null,
      recording_path: recordingPath || null,
      appointment_at: appointmentAt,
    }).select().single();
    if (insertErr) throw insertErr;

    // Benachrichtigung ist best-effort — darf das eigentliche Speichern des
    // Termins nie blockieren, falls der E-Mail-Versand fehlschlägt.
    try {
      const admin = getAdminSupabase();
      const { data: me } = await client.from("profiles").select("full_name, organization_id").eq("id", user.id).maybeSingle();
      if (me?.organization_id) {
        const { data: org } = await admin.from("organizations").select("name").eq("id", me.organization_id).maybeSingle();
        const orgName = org?.name || null;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        const link = appUrl ? `${appUrl}/termine?leadId=${lead.id}` : null;

        const html =
          `<p><strong>${me.full_name || "Ein/e Vertriebler:in"}</strong> hat einen neuen Termin erfasst${orgName ? ` bei ${orgName}` : ""}:</p>` +
          `<p><strong>${name}</strong>${company ? ` (${company})` : ""}<br/>` +
          `Termin: ${new Date(appointmentAt).toLocaleString("de-DE")}</p>` +
          (link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Termin ansehen →</a></p>` : "");

        const subject = `Neuer Termin: ${name}`;

        // Org-Manager (bestehendes Muster, siehe lib/notifyManagers.js) +
        // zusätzlich frei konfigurierte Adressen (siehe notification_emails,
        // verwaltbar von Manager/Backend/Admin auf der Termine-Seite).
        await notifyOrgManagers(admin, me.organization_id, { subject, html });

        const { data: extra } = await admin.from("notification_emails").select("email").eq("organization_id", me.organization_id);
        const extraEmails = (extra || []).map((e) => e.email);
        if (extraEmails.length) await sendEmail({ to: extraEmails, subject, html });
      }
    } catch (notifyErr) {
      console.error("Termin-Benachrichtigung fehlgeschlagen:", notifyErr.message);
    }

    return res.status(200).json({ ok: true, leadId: lead.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Termin konnte nicht gespeichert werden." });
  }
}
