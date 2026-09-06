import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../lib/rollen";
import { sendEmail } from "../../lib/email";

// Eine Probemail an die eigene Adresse — mit genau den Einstellungen, die
// für diese Organisation hinterlegt sind.
//
// Der Grund: Eine falsche Absenderadresse legt den Mailversand der ganzen
// Organisation still lahm. Ohne diesen Knopf merkt man das erst daran, dass
// eine Kundenmail nicht ankommt — und sucht dann tagelang an der falschen
// Stelle. Hier steht im Klartext, was Resend antwortet.
//
// Verschickt wird ausschliesslich an die eigene Anmeldeadresse. Ein
// Testversand an beliebige Empfänger wäre ein bequemer Weg, fremde Leute
// über eine fremde Absenderdomain anzuschreiben.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("id, full_name, role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  if (!istFuehrungsrolle(profil)) return res.status(403).json({ error: "Diese Prüfung ist der Leitung vorbehalten." });

  const orgId = await aktiveOrgId(admin, profil, user.id);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  const ziel = user.email;
  if (!ziel) return res.status(400).json({ error: "Zu deinem Konto ist keine E-Mail-Adresse hinterlegt." });

  try {
    const { data: org } = await admin.from("organizations")
      .select("name, email_absender, email_antwort_an").eq("id", orgId).maybeSingle();

    const ergebnis = await sendEmail({
      to: ziel,
      subject: `Testmail von ${org?.name || "der Academy"}`,
      html:
        `<p>Diese Testmail wurde aus der Verwaltung ausgelöst.</p>` +
        `<p>Absender: <strong>${org?.email_absender || "(globale Adresse)"}</strong><br/>` +
        `Antwortadresse: <strong>${org?.email_antwort_an || "(keine gesetzt)"}</strong></p>` +
        `<p>Kommt diese Mail an und steht der richtige Absender darüber, ist alles eingerichtet. ` +
        `Antworte einmal darauf, um zu prüfen, ob die Antwort dort landet, wo sie soll.</p>`,
      fromName: org?.name || "HB Sales Academy",
      fromEmail: org?.email_absender || null,
      replyTo: org?.email_antwort_an || null,
    });

    if (ergebnis?.skipped) {
      return res.status(200).json({
        ok: false,
        text: "Für diese Academy ist gar kein Mailversand eingerichtet (RESEND_API_KEY fehlt in den Umgebungsvariablen).",
      });
    }
    if (ergebnis?.error) {
      return res.status(200).json({
        ok: false,
        text: `Resend hat abgelehnt${ergebnis.status ? ` (${ergebnis.status})` : ""}: ${ergebnis.meldung || "keine nähere Angabe"}`,
        absender: ergebnis.absender,
      });
    }
    return res.status(200).json({
      ok: true,
      text: `Testmail ist raus an ${ziel}. Absender: ${ergebnis.absender}. Wenn sie in ein paar Minuten nicht da ist, schau in den Spam-Ordner.`,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Die Testmail konnte nicht ausgelöst werden." });
  }
}
