import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { sendEmail } from "../../lib/email";
import { sendeAlarm } from "../../lib/alarm";
import { willMeldung } from "../../lib/benachrichtigungen";
import { deutscheZeit } from "../../lib/terminzeit";

// Ein Nachfassen anlegen — und die zuständige Person darüber informieren.
//
// Der Eintrag selbst läuft über den RLS-gebundenen Client: wer wem etwas
// zuweisen darf, entscheidet die Datenbank (migration_156) und nicht diese
// Route. Erweiterte Rechte braucht es nur für das, was der Browser nicht
// kann — die Mailadresse der anderen Person und den Telegram-Kanal der
// Organisation.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { zustaendig, faelligAm, titel, notiz, kontaktId, leadId } = req.body || {};
  if (!zustaendig || !faelligAm || !titel?.trim()) {
    return res.status(400).json({ error: "Zuständige Person, Zeitpunkt und Titel sind erforderlich." });
  }
  const zeitpunkt = new Date(faelligAm);
  if (Number.isNaN(zeitpunkt.getTime())) return res.status(400).json({ error: "Der Zeitpunkt ist ungültig." });

  try {
    const admin = getAdminSupabase();
    const { data: profil } = await admin.from("profiles")
      .select("id, full_name, organization_id, active_org").eq("id", user.id).maybeSingle();
    // Die AKTIVE Organisation, nicht die Heimat des Kontos: wer per
    // Firmencode woanders arbeitet, legt das Nachfassen dort an.
    const orgId = await aktiveOrgId(admin, profil, user.id);

    // Niemandem aus einer fremden Organisation etwas in den Kalender
    // schieben. Die Datenbank prüft das ebenfalls (migration_156) — hier
    // steht es für eine verständliche Fehlermeldung.
    const { data: ziel } = await admin.from("profiles")
      .select("id, full_name, organization_id").eq("id", zustaendig).maybeSingle();
    if (!ziel) return res.status(404).json({ error: "Diese Person gibt es nicht." });
    if (orgId && ziel.organization_id !== orgId) {
      return res.status(403).json({ error: "Diese Person gehört nicht zu eurer Organisation." });
    }

    const { data: eintrag, error: insErr } = await client.from("nachfass_termine").insert({
      organization_id: orgId || null,
      zustaendig,
      erstellt_von: user.id,
      kontakt_id: kontaktId || null,
      lead_id: leadId || null,
      titel: titel.trim(),
      notiz: notiz?.trim() || null,
      faellig_am: zeitpunkt.toISOString(),
    }).select().single();
    if (insErr) {
      // Der häufigste Fall ist keine Panne, sondern eine Grenze.
      if (insErr.code === "42501") {
        return res.status(403).json({ error: "Zuweisen darf man nur an Personen, die man führt." });
      }
      throw insErr;
    }

    // Benachrichtigen ist Beiwerk: scheitert es, steht das Nachfassen
    // trotzdem im Kalender. Umgekehrt wäre es falsch.
    try {
      if (zustaendig !== user.id) {
        const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const adresse = (authList?.users || []).find((u) => u.id === zustaendig)?.email;
        const { data: empfaenger } = await admin.from("profiles")
          .select("benachrichtigungen").eq("id", zustaendig).maybeSingle();
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        const wann = `${deutscheZeit(zeitpunkt.toISOString())} Uhr`;

        if (adresse && willMeldung(empfaenger, "aufgaben")) {
          await sendEmail({
            to: adresse,
            subject: `Nachfassen am ${wann}: ${titel.trim()}`,
            html:
              `<p><strong>${profil?.full_name || "Jemand"}</strong> hat dir ein Nachfassen eingetragen:</p>` +
              `<p><strong>${titel.trim()}</strong><br/>Fällig: ${wann}</p>` +
              (notiz?.trim() ? `<p>${notiz.trim()}</p>` : "") +
              (appUrl ? `<p><a href="${appUrl}/kalender" target="_blank" rel="noopener noreferrer">Im Kalender ansehen →</a></p>` : ""),
          });
        }

        const { data: org } = orgId
          ? await admin.from("organizations")
            .select("telegram_chat_id, telegram_marketing_chat_id").eq("id", orgId).maybeSingle()
          : { data: null };
        const kanal = org?.telegram_marketing_chat_id || org?.telegram_chat_id;
        if (kanal) {
          await sendeAlarm(
            `📌 Nachfassen für ${ziel.full_name || "jemanden"}: ${titel.trim()}\nFällig: ${wann}`
            + (appUrl ? `\n${appUrl}/kalender` : ""),
            kanal,
          );
        }
      }
    } catch (meldeFehler) {
      console.error("Nachfass-Benachrichtigung fehlgeschlagen:", meldeFehler.message);
    }

    return res.status(200).json({ ok: true, eintrag });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Das Nachfassen konnte nicht gespeichert werden." });
  }
}
