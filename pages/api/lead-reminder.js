import { requireUser } from "../../lib/supabaseServer";
import { sendEmail } from "../../lib/email";

// Manuelle Termin-Erinnerung per E-Mail an den/die Kund:in (nicht an die
// eigene Organisation — das ist die separate automatische Benachrichtigung
// in lead-created.js). Wer den Lead sehen darf (RLS leads_select: eigene,
// oder Manager/Backend/Admin derselben Organisation, oder Plattform-Admin),
// darf auch die Erinnerung auslösen — keine zusätzliche Rechteprüfung nötig.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { leadId } = req.body || {};
  if (!leadId) return res.status(400).json({ error: "leadId erforderlich." });

  try {
    const { data: lead, error: leadErr } = await client.from("leads").select("*").eq("id", leadId).maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return res.status(404).json({ error: "Termin nicht gefunden — oder kein Zugriff." });
    if (!lead.email) return res.status(400).json({ error: "Für diesen Termin ist keine E-Mail-Adresse hinterlegt." });

    const { data: me } = await client.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

    const appointmentText = lead.appointment_at
      ? new Date(lead.appointment_at).toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" })
      : "in Kürze";

    const html =
      `<p>Hallo ${lead.name || ""},</p>` +
      `<p>kurze Erinnerung an unseren Termin am <strong>${appointmentText}</strong>.</p>` +
      (lead.notes ? `<p>${lead.notes}</p>` : "") +
      `<p>Viele Grüße${me?.full_name ? `<br/>${me.full_name}` : ""}</p>`;

    const result = await sendEmail({ to: lead.email, subject: "Erinnerung an unseren Termin", html });
    if (result?.error) return res.status(502).json({ error: "E-Mail-Versand fehlgeschlagen." });

    return res.status(200).json({ ok: true, skipped: !!result?.skipped });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Erinnerung konnte nicht gesendet werden." });
  }
}
