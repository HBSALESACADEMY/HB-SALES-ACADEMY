import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { sendeAlarm } from "../../lib/alarm";
import { bestaetigungsText } from "../../lib/bestaetigung";
import { SCHRITTE, schrittErledigt } from "../../lib/terminArt";

// Meldet an den Bestätigungs-Kanal, dass sich jemand gekümmert hat.
//
// Die Bestätigung vor dem Setting Call, die vor dem Closing Call und der
// erledigte Check-in.
//
// Erledigte Follow-ups aus dem E-Mail-Marketing gehen ausdrücklich NICHT
// hierhin: Sie gehen die zuständige Person an, nicht die ganze Gruppe.
//
// Der Text wird HIER gebaut, nicht im Browser mitgeschickt: sonst könnte
// jede angemeldete Person eine beliebige Nachricht in den Kanal der
// Organisation schreiben. Herein kommen nur Kennungen.
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
    const admin = getAdminSupabase();
    const { data: profil } = await admin.from("profiles")
      .select("id, full_name, organization_id, is_platform_admin").eq("id", user.id).maybeSingle();
    const orgId = await aktiveOrgId(admin, profil, user.id);
    if (!orgId) return res.status(200).json({ ok: true, still: true, hinweis: "Keine aktive Organisation gefunden." });

    // Erst den Text bauen, dann den Kanal holen: gibt es nichts zu melden,
    // muss auch nichts nachgeschlagen werden.
    const { text, grund } = await terminText({ client, admin, leadId, schritt });
    if (!text) return res.status(200).json({ ok: true, still: true, hinweis: grund || null });

    // Warum nichts rausging, muss auf den Bildschirm.
    //
    // Vorher scheiterte das hier lautlos: fehlte die Spalte aus
    // migration_158, kam aus der Abfrage null zurück, der Kanal war leer,
    // und die Route antwortete mit "ok". Man hakte ab, in der Gruppe kam
    // nichts an, und nirgends stand ein Grund.
    const { data: org, error: orgFehler } = await admin.from("organizations")
      .select("telegram_chat_id, telegram_bestaetigung_chat_id").eq("id", orgId).maybeSingle();
    if (orgFehler) {
      return res.status(500).json({
        error: /telegram_bestaetigung_chat_id/.test(orgFehler.message)
          ? "In der Datenbank fehlt die Spalte für den Bestätigungs-Kanal (migration_158)."
          : orgFehler.message,
      });
    }

    const kanal = org?.telegram_bestaetigung_chat_id || org?.telegram_chat_id;
    if (!kanal) {
      return res.status(200).json({
        ok: true, ohneKanal: true,
        hinweis: "Für eure Organisation ist keine Telegram-Gruppe hinterlegt — unter Verwaltung → Organisation → Benachrichtigungen eintragen.",
      });
    }

    const versand = await sendeAlarm(text, kanal);
    if (versand?.error) {
      return res.status(502).json({ error: `Telegram hat die Nachricht abgelehnt: ${versand.meldung || "kein Grund angegeben"}` });
    }
    if (versand?.skipped) {
      return res.status(503).json({ error: "Für diese Academy ist kein Telegram-Bot eingerichtet (TELEGRAM_BOT_TOKEN fehlt)." });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Bestätigung melden fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Die Meldung konnte nicht verschickt werden." });
  }
}

/**
 * Ein abgehakter Schritt an einem Termin.
 *
 * Welche Schritte gemeldet werden, steht am Schritt selbst (SCHRITTE.meldet
 * in lib/terminArt.js) — die beiden Bestätigungen und der Check-in. Nicht
 * die Projektumsetzung: die hakt die Leitung selbst ab und weiss es damit
 * bereits.
 *
 * Ausdrücklich OHNE Abgleich mit der aktuellen Stufe: Wer die
 * Closing-Bestätigung setzt, während der Termin noch auf der Setting-Stufe
 * steht, hat trotzdem bestätigt. Vorher fiel genau diese Meldung still
 * unter den Tisch.
 */
async function terminText({ client, admin, leadId, schritt }) {
  // Immer ein Objekt zurückgeben, nie null: Der Aufrufer liest "text" und
  // "grund" daraus, und ein null liess die Route mit einem TypeError
  // abbrechen, statt still nichts zu melden.
  const nichts = { text: null };
  const gemeint = SCHRITTE.find((x) => x.key === schritt && x.meldet);
  if (!gemeint) return nichts;

  const { data: lead } = await client.from("leads")
    .select("id, name, company, appointment_at, termin_art, status, schritte, created_by, kein_kundentermin")
    .is("geloescht_am", null).eq("id", leadId).maybeSingle();
  if (!lead) return nichts;
  // Ein persönlicher Termin geht das Vertriebsteam nichts an.
  if (lead.kein_kundentermin) return nichts;

  // Nur melden, was wirklich in der Datenbank steht. Sonst meldet ein
  // zweiter Aufruf eine Bestätigung, die es nicht gibt.
  if (!schrittErledigt(lead, schritt)) return nichts;

  // Der Name der Person, die den Termin ANGELEGT hat — nicht der, die
  // gerade abhakt. In der Gruppe geht es darum, wessen Termin stattfindet.
  const { data: besitzer } = await admin.from("profiles")
    .select("full_name").eq("id", lead.created_by).maybeSingle();

  return { text: bestaetigungsText(lead, besitzer?.full_name || "", gemeint) };
}
