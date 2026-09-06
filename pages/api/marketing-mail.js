import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../lib/rollen";
import { sendEmail } from "../../lib/email";
import { gueltigeAdresse } from "../../lib/emailKontakt";

// Die Marketing-Mail wirklich verschicken.
//
// Der Weg über einen mailto-Link hatte zwei Löcher: man landet im eigenen
// Mailprogramm (also ausserhalb jeder Nachvollziehbarkeit), und danach muss
// man daran denken, hier abzuhaken. Der vergessene Haken ist der Regelfall.
//
// Hier wird verschickt UND vermerkt, in einem Schritt. Was rausging, steht
// beim Kontakt — sonst weiss beim Nachfassen niemand mehr, was der Kunde
// eigentlich bekommen hat.
export const config = { maxDuration: 25 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  const { kontaktId, betreff, text } = req.body || {};
  if (!kontaktId || !String(betreff || "").trim() || !String(text || "").trim()) {
    return res.status(400).json({ error: "Betreff und Text sind nötig." });
  }

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("id, full_name, role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  if (!istFuehrungsrolle(profil)) return res.status(403).json({ error: "Mails verschickt die Leitung." });

  const orgId = await aktiveOrgId(admin, profil, user.id);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  try {
    const { data: kontakt } = await admin.from("email_kontakte")
      .select("*").eq("id", kontaktId).eq("organization_id", orgId).maybeSingle();
    if (!kontakt) return res.status(404).json({ error: "Kontakt nicht gefunden." });
    if (!gueltigeAdresse(kontakt.email)) return res.status(400).json({ error: "Die Adresse des Kontakts ist ungültig." });

    const { data: org } = await admin.from("organizations")
      .select("name, email_absender, email_antwort_an").eq("id", orgId).maybeSingle();

    // Zeilenumbrüche werden zu Absätzen: der Text wird in einem Textfeld
    // geschrieben, und dort erwartet niemand, HTML tippen zu müssen.
    const html = String(text).split(/\n{2,}/).map((absatz) =>
      `<p>${absatz.replace(/\n/g, "<br/>").replace(/</g, "&lt;")}</p>`
    ).join("");

    const versand = await sendEmail({
      to: kontakt.email,
      subject: String(betreff).trim(),
      html,
      fromName: org?.name || "HB Sales Academy",
      fromEmail: org?.email_absender || null,
      // Damit die Antwort des Kontakts bei der Organisation ankommt und
      // nicht in einem Postfach, das niemand liest.
      replyTo: org?.email_antwort_an || null,
    });
    // Ohne diese Prüfung stünde "verschickt" auch dann da, wenn Resend die
    // Mail abgelehnt hat — etwa weil die Absenderdomain nicht verifiziert
    // ist. Genau dann fasst niemand nach, weil scheinbar alles lief.
    if (versand?.error) {
      return res.status(502).json({
        error: "Der Mailversand wurde abgelehnt. Prüfe die Absenderadresse der Organisation — sie muss bei Resend verifiziert sein.",
      });
    }
    if (versand?.skipped) {
      return res.status(503).json({ error: "Für diese Academy ist kein Mailversand eingerichtet (RESEND_API_KEY fehlt)." });
    }

    // Erst nach dem erfolgreichen Versand vermerken. Andersherum stünde
    // "verschickt" bei einer Mail, die nie ankam — und niemand würde je
    // nachfassen.
    const jetzt = new Date().toISOString();
    await admin.from("email_kontakte").update({
      status: "verschickt",
      verschickt_am: jetzt,
      verschickt_von: user.id,
      // Was rausging, gehört zum Kontakt: beim Nachfassen weiss man sonst
      // nicht mehr, was der Kunde bekommen hat.
      notiz: kontakt.notiz
        ? `${kontakt.notiz}\n\n— Mail vom ${new Date(jetzt).toLocaleDateString("de-DE")}: ${String(betreff).trim()}`
        : `Mail vom ${new Date(jetzt).toLocaleDateString("de-DE")}: ${String(betreff).trim()}`,
      erinnert_am: null,
    }).eq("id", kontakt.id);

    return res.status(200).json({ ok: true, an: kontakt.email });
  } catch (e) {
    console.error("Marketing-Mail fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Die Mail konnte nicht verschickt werden." });
  }
}
