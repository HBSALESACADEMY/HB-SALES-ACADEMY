import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { sendeAlarm } from "../../lib/alarm";
import { deutscheZeit } from "../../lib/terminzeit";
import { meldungsGrund, MELDENSWERT } from "../../lib/terminMeldung";

// Meldet Änderungen an einem bestehenden Termin an das Team — Statuswechsel,
// Ergebnis, Folgetermin, Bearbeitung, Löschung.
//
// Nur über Telegram, bewusst ohne E-Mail: das Anlegen eines Termins geht
// weiterhin über beide Wege (pages/api/lead-created.js), jede Änderung
// danach nur noch in den Kanal. Sonst füllt ein einziger Termin, an dem
// mehrmals etwas gedreht wird, das Postfach aller Führungskräfte.
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

// Überschrift nach dem GRUND der Meldung, nicht nach der Art der Änderung:
// "Termin abgesagt" sagt mehr als "Status geändert".
const GRUND_TITEL = {
  verschoben: "🕐 Termin verschoben",
  abgesagt: "❌ Termin abgesagt",
  geloescht: "🗑️ Termin gelöscht",
  folgetermin: "📅 Folgetermin angelegt",
  kunde: "🎉 Kunde geworden",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { leadId, ereignis, beschreibung, activeOrgId, details } = req.body || {};
  if (!leadId || !TITEL[ereignis]) return res.status(400).json({ error: "leadId und gültiges Ereignis erforderlich." });

  // Die Entscheidung fällt auf dem SERVER, nicht in der Seite: sonst
  // müsste jede aufrufende Stelle sie einzeln richtig treffen, und die
  // erste, die es vergisst, füllt den Kanal wieder.
  const grund = meldungsGrund(ereignis, details || {});
  if (!grund) return res.status(200).json({ ok: true, gemeldet: false });

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
    const wer = me?.full_name || "Ein Teammitglied";
    const terminDeutsch = lead.appointment_at ? `${deutscheZeit(lead.appointment_at)} Uhr` : "kein Zeitpunkt";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    // Nach dem Löschen führt der Link ins Leere — dann weglassen.
    const link = appUrl && ereignis !== "geloescht" ? `${appUrl}/termine?leadId=${lead.id}` : null;

    if (org?.telegram_chat_id) {
      const text = [
        `${GRUND_TITEL[grund] || TITEL[ereignis]}: ${lead.name}` + (lead.company ? ` (${lead.company})` : ""),
        beschreibung ? beschreibung : null,
        `Von ${wer}`,
        ``,
        `Termin: ${terminDeutsch}`,
        link ? `\n${link}` : null,
      ].filter((z) => z !== null).join("\n");
      await sendeAlarm(text, org.telegram_chat_id);
    }

    return res.status(200).json({ ok: true, gemeldet: true, grund: MELDENSWERT[grund] });
  } catch (e) {
    console.error("Termin-Meldung fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Meldung konnte nicht gesendet werden." });
  }
}
