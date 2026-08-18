import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { notifyOrgManagers } from "../../lib/notifyManagers";
import { sendEmail } from "../../lib/email";
import { RESERVED_FIELD_COLUMNS } from "../../lib/leadFields";

// Läuft anstelle eines direkten Client-Inserts (Call Tracker und die
// Termine-Seite nutzen beide diese Route) — nur so gibt es einen Server-Zeitpunkt,
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
    const { name, phone, email, fields, recordingPath, appointmentAt, activeOrgId } = req.body || {};
    if (!name || !phone || !email || !appointmentAt) {
      return res.status(400).json({ error: "Name, Telefon, E-Mail und Termin sind erforderlich." });
    }

    // "fields" kommt vom jeweiligen Formular bereits aufgelöst (Organisation
    // kann eigene Felder definieren, siehe lib/leadFields.js): reservierte
    // Schlüssel (company/website/is_decision_maker/notes) landen weiterhin in
    // der gleichnamigen Spalte, alles andere in custom_fields.
    const columnUpdates = {};
    const customFields = {};
    (Array.isArray(fields) ? fields : []).forEach((f) => {
      if (!f || !f.key) return;
      const column = RESERVED_FIELD_COLUMNS[f.key];
      const value = f.type === "checkbox" ? !!f.value : (typeof f.value === "string" ? f.value.trim() || null : f.value ?? null);
      if (column) columnUpdates[column] = value;
      else if (value !== null && value !== "") customFields[f.key] = value;
    });

    const { data: lead, error: insertErr } = await client.from("leads").insert({
      created_by: user.id,
      name, phone, email,
      ...columnUpdates,
      custom_fields: customFields,
      recording_path: recordingPath || null,
      appointment_at: appointmentAt,
    }).select().single();
    if (insertErr) throw insertErr;

    // Benachrichtigung ist best-effort — darf das eigentliche Speichern des
    // Termins nie blockieren, falls der E-Mail-Versand fehlschlägt.
    try {
      const admin = getAdminSupabase();
      const { data: me } = await client.from("profiles").select("full_name, organization_id, is_platform_admin").eq("id", user.id).maybeSingle();
      // Für Plattform-Admins, die per Firmencode "als" eine andere
      // Organisation unterwegs sind: me.organization_id ist nur deren eigene
      // Heimat-Organisation, nicht die gerade aktive — die kommt vom Client
      // und wird nur akzeptiert, wenn der Aufrufer wirklich Plattform-Admin
      // ist oder es ohnehin die eigene Organisation ist (wie bei certificate.js).
      let effectiveOrgId = me?.organization_id || null;
      if (activeOrgId && (me?.is_platform_admin || activeOrgId === me?.organization_id)) {
        effectiveOrgId = activeOrgId;
      }
      if (effectiveOrgId) {
        const { data: org } = await admin.from("organizations").select("name").eq("id", effectiveOrgId).maybeSingle();
        const orgName = org?.name || null;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        const link = appUrl ? `${appUrl}/termine?leadId=${lead.id}` : null;

        // Zusatzfelder sind pro Organisation frei konfigurierbar (siehe
        // lib/leadFields.js) — die E-Mail baut sich generisch aus den
        // tatsächlich übermittelten Feldern samt ihrer (ggf. individuellen)
        // Labels auf, statt fest "Unternehmen"/"Webseite"/... anzunehmen.
        const fieldList = Array.isArray(fields) ? fields : [];
        const companyValue = (() => { const f = fieldList.find((x) => x?.key === "company"); return typeof f?.value === "string" ? f.value.trim() : ""; })();
        const notesValue = (() => { const f = fieldList.find((x) => x?.key === "notes"); return typeof f?.value === "string" ? f.value.trim() : ""; })();
        const extraLines = fieldList
          .filter((f) => f && f.key !== "company" && f.key !== "notes")
          .map((f) => {
            if (f.type === "checkbox") return f.value ? `${f.label}: Ja` : null;
            const v = typeof f.value === "string" ? f.value.trim() : f.value;
            return v ? `${f.label}: ${v}` : null;
          })
          .filter(Boolean);

        const html =
          `<p><strong>${me.full_name || "Ein/e Vertriebler:in"}</strong> hat einen neuen Termin erfasst${orgName ? ` bei ${orgName}` : ""}:</p>` +
          `<p><strong>${name}</strong>${companyValue ? ` (${companyValue})` : ""}<br/>` +
          `Termin: ${new Date(appointmentAt).toLocaleString("de-DE")}<br/>` +
          `Telefon: ${phone}<br/>` +
          `E-Mail: ${email}` +
          (extraLines.length ? `<br/>${extraLines.join("<br/>")}` : "") +
          `</p>` +
          (notesValue ? `<p>${notesValue}</p>` : "") +
          (link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Termin ansehen →</a></p>` : "");

        const subject = `Neuer Termin: ${name}`;
        const fromName = orgName || "HB Sales Academy";

        // Nur die Manager/Admins DIESER Organisation (bestehendes Muster,
        // siehe lib/notifyManagers.js) + deren frei konfigurierte
        // Zusatz-Adressen (notification_emails, verwaltbar auf der
        // Termine-Seite) — bewusst NICHT organisationsübergreifend an alle
        // Plattform-Admins, jede Organisation bekommt nur ihre eigenen
        // Termin-Benachrichtigungen. Das ist anders als bei den
        // Freischaltungs-Benachrichtigungen (notify-pending-approval.js),
        // wo der Plattform-Betreiber bewusst alles sehen soll.
        await notifyOrgManagers(admin, effectiveOrgId, { subject, html, fromName });

        const { data: extra } = await admin.from("notification_emails").select("email").eq("organization_id", effectiveOrgId);
        const extraEmails = (extra || []).map((e) => e.email);
        // Einzeln statt als Sammel-Anfrage, siehe Kommentar in notifyManagers.js.
        await Promise.all(extraEmails.map((to) => sendEmail({ to, subject, html, fromName })));
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
