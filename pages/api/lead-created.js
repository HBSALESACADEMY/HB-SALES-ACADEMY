import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { RESERVED_FIELD_COLUMNS } from "../../lib/leadFields";
import { meldeNeuenTermin } from "../../lib/terminAngelegt";

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
    // Serverseitig wird nur das strukturell Nötige verlangt: ohne Namen hat
    // der Eintrag keine Bezeichnung in der Liste, ohne Zeitpunkt taucht er im
    // Kalender und in den Zeitraum-Filtern nirgends auf. Ob Telefon/E-Mail
    // Pflicht sind, entscheidet die Organisation selbst (migration_81) — das
    // ist eine Erfassungs-Regel, keine Sicherheitsgrenze, und wird dort
    // geprüft, wo sie hingehört: im Formular (siehe lib/leadFields.js).
    if (!name || !appointmentAt) {
      return res.status(400).json({ error: "Name und Termin-Zeitpunkt sind erforderlich." });
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

    // Die Organisation gehört AN den Termin (migration_114) — deshalb wird
    // sie vor dem Speichern aufgelöst, nicht erst für die Benachrichtigung.
    const admin = getAdminSupabase();
    const { data: me } = await client.from("profiles").select("full_name, organization_id, is_platform_admin").eq("id", user.id).maybeSingle();
    // Für Plattform-Admins, die per Firmencode "als" eine andere Organisation
    // unterwegs sind: me.organization_id ist nur deren eigene Heimat, nicht
    // die gerade aktive — die kommt vom Client und wird nur akzeptiert, wenn
    // der Aufrufer wirklich Plattform-Admin ist oder es ohnehin die eigene
    // Organisation ist (wie bei certificate.js).
    let effectiveOrgId = me?.organization_id || null;
    if (activeOrgId && (me?.is_platform_admin || activeOrgId === me?.organization_id)) {
      effectiveOrgId = activeOrgId;
    }

    const { data: lead, error: insertErr } = await client.from("leads").insert({
      created_by: user.id,
      organization_id: effectiveOrgId,
      name, phone, email,
      // Die Stufe steht beim Anlegen fest, statt später geraten zu werden.
      // Vorher war sie leer, und die Anzeige machte daraus überall ein
      // "ST:" — auch bei Terminen, die nie ein Erstgespräch waren.
      termin_art: "erstgespraech",
      ...columnUpdates,
      custom_fields: customFields,
      recording_path: recordingPath || null,
      appointment_at: appointmentAt,
    }).select().single();
    if (insertErr) throw insertErr;

    // Mail an die Leitung und Meldung in die Telegram-Gruppe — in
    // lib/terminAngelegt.js, weil der Vertriebsbuddy Termine auf demselben
    // Weg anlegt und dieselbe Meldung auslösen soll.
    await meldeNeuenTermin(admin, {
      lead, orgId: effectiveOrgId, name, phone, email, fields, appointmentAt,
      erfasser: me?.full_name || "",
    });

    return res.status(200).json({ ok: true, leadId: lead.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Termin konnte nicht gespeichert werden." });
  }
}
