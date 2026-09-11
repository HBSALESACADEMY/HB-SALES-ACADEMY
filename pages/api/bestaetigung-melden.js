import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { sendeAlarm } from "../../lib/alarm";
import { bestaetigungsText, followUpErledigtText } from "../../lib/bestaetigung";
import { SCHRITTE, schrittErledigt } from "../../lib/terminArt";

// Meldet an den Bestätigungs-Kanal, dass sich jemand gekümmert hat.
//
// Drei Anlässe, dieselbe Frage: die Bestätigung vor dem Setting Call, die
// vor dem Closing Call und ein erledigtes Follow-up. Deshalb ein Kanal und
// eine Route — zwei Gruppen im Blick zu behalten, um eine Antwort zu
// bekommen, ist keine.
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

  const { leadId, schritt, nachfassId } = req.body || {};
  if (!leadId && !nachfassId) return res.status(400).json({ error: "leadId mit schritt oder nachfassId ist nötig." });
  if (leadId && !schritt) return res.status(400).json({ error: "Zu einem Termin gehört der Schritt." });

  try {
    const admin = getAdminSupabase();
    const { data: profil } = await admin.from("profiles")
      .select("id, full_name, organization_id, active_org").eq("id", user.id).maybeSingle();
    const orgId = await aktiveOrgId(admin, profil, user.id);
    if (!orgId) return res.status(200).json({ ok: true, still: true });

    // Erst den Text bauen, dann den Kanal holen: gibt es nichts zu melden,
    // muss auch nichts nachgeschlagen werden.
    const text = leadId
      ? await terminText({ client, admin, leadId, schritt })
      : await followUpText({ client, admin, nachfassId });
    if (!text) return res.status(200).json({ ok: true, still: true });

    const { data: org } = await admin.from("organizations")
      .select("telegram_chat_id, telegram_bestaetigung_chat_id").eq("id", orgId).maybeSingle();
    const kanal = org?.telegram_bestaetigung_chat_id || org?.telegram_chat_id;
    if (!kanal) return res.status(200).json({ ok: true, ohneKanal: true });

    await sendeAlarm(text, kanal);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Bestätigung melden fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Die Meldung konnte nicht verschickt werden." });
  }
}

/**
 * Die Bestätigung vor einem Gespräch.
 *
 * Ausdrücklich OHNE Abgleich mit der aktuellen Stufe: Wer die
 * Closing-Bestätigung setzt, während der Termin noch auf der Setting-Stufe
 * steht, hat trotzdem bestätigt. Vorher fiel genau diese Meldung still
 * unter den Tisch.
 *
 * Die Projektumsetzung und der Check-in sind keine Terminbestätigungen und
 * haben in diesem Kanal nichts zu suchen.
 */
async function terminText({ client, admin, leadId, schritt }) {
  const gemeint = SCHRITTE.find((x) => x.key === schritt && x.vorStufe);
  if (!gemeint) return null;

  const { data: lead } = await client.from("leads")
    .select("id, name, company, appointment_at, termin_art, status, schritte, created_by, kein_kundentermin")
    .is("geloescht_am", null).eq("id", leadId).maybeSingle();
  if (!lead) return null;
  // Ein persönlicher Termin geht das Vertriebsteam nichts an.
  if (lead.kein_kundentermin) return null;

  // Nur melden, was wirklich in der Datenbank steht. Sonst meldet ein
  // zweiter Aufruf eine Bestätigung, die es nicht gibt.
  if (!schrittErledigt(lead, schritt)) return null;

  // Der Name der Person, die den Termin ANGELEGT hat — nicht der, die
  // gerade abhakt. In der Gruppe geht es darum, wessen Termin stattfindet.
  const { data: besitzer } = await admin.from("profiles")
    .select("full_name").eq("id", lead.created_by).maybeSingle();

  return bestaetigungsText(lead, besitzer?.full_name || "", gemeint);
}

/** Ein erledigtes Follow-up — dieselbe Frage, derselbe Kanal. */
async function followUpText({ client, admin, nachfassId }) {
  const { data: nachfass } = await client.from("nachfass_termine")
    .select("id, titel, faellig_am, erledigt_am, zustaendig").eq("id", nachfassId).maybeSingle();
  if (!nachfass || !nachfass.erledigt_am) return null;

  const { data: person } = await admin.from("profiles")
    .select("full_name").eq("id", nachfass.zustaendig).maybeSingle();

  return followUpErledigtText(nachfass, person?.full_name || "");
}
