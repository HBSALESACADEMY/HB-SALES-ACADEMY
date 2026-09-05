import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { sendeAlarm } from "../../lib/alarm";
import { gueltigeAdresse } from "../../lib/emailKontakt";

// Kontakte aus dem Gespräch: anlegen und auf Dubletten prüfen.
//
// Über eine Route statt direkt aus dem Browser, weil zwei Dinge dazugehören,
// die der Browser nicht kann: die Meldung an die Organisation und der Blick
// auf Kontakte ANDERER Vertriebler bei der Dublettenprüfung. Letzteres darf
// die Zugriffsregel bewusst nicht erlauben — sonst könnte jeder die
// Kontaktliste der Kollegen durchsuchen. Hier wird deshalb nur beantwortet,
// OB es die Adresse schon gibt, und von wem — nicht mehr.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("id, full_name, organization_id, is_platform_admin").eq("id", user.id).maybeSingle();
  const orgId = await aktiveOrgId(admin, profil, user.id);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  // --- Dublettenprüfung ---
  if (req.method === "GET") {
    const adresse = String(req.query.email || "").trim().toLowerCase();
    if (!gueltigeAdresse(adresse)) return res.status(200).json({ kontakt: null });
    const { data } = await admin.from("email_kontakte")
      .select("id, user_id, status, created_at")
      .eq("organization_id", orgId).ilike("email", adresse)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return res.status(200).json({ kontakt: null });
    const { data: wer } = await admin.from("profiles").select("full_name").eq("id", data.user_id).maybeSingle();
    return res.status(200).json({
      kontakt: {
        wer: data.user_id === user.id ? "dir selbst" : (wer?.full_name || "einer Kollegin/einem Kollegen"),
        status: data.status,
        created_at: data.created_at,
      },
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, firma, telefon, notiz } = req.body || {};
  if (!String(name || "").trim()) return res.status(400).json({ error: "Name fehlt." });
  if (!gueltigeAdresse(email)) return res.status(400).json({ error: "Keine gültige E-Mail-Adresse." });

  try {
    const { data: kontakt, error } = await admin.from("email_kontakte").insert({
      organization_id: orgId,
      user_id: user.id,
      name: String(name).trim(),
      email: String(email).trim(),
      firma: String(firma || "").trim() || null,
      telefon: String(telefon || "").trim() || null,
      notiz: String(notiz || "").trim() || null,
    }).select().single();
    if (error) throw error;

    // Hier muss jemand handeln — deshalb eine Meldung, anders als bei
    // Änderungen, die nur in der App stehen (siehe lib/terminMeldung.js).
    const { data: org } = await admin.from("organizations")
      .select("telegram_chat_id, telegram_marketing_chat_id").eq("id", orgId).maybeSingle();
    // Der eigene Marketing-Kanal, wenn einer eingerichtet ist. Sonst der
    // allgemeine — eine Meldung, die niemand bekommt, wäre schlimmer als
    // eine im falschen Kanal (migration_139).
    const kanal = org?.telegram_marketing_chat_id || org?.telegram_chat_id || null;
    if (kanal) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      await sendeAlarm([
        `✉️ E-Mail gewünscht: ${kontakt.name}${kontakt.firma ? ` (${kontakt.firma})` : ""}`,
        `${kontakt.email}`,
        `Von ${profil?.full_name || "einem Teammitglied"}`,
        kontakt.notiz ? `\nNotiz: ${kontakt.notiz}` : null,
        appUrl ? `\n${appUrl}/email-marketing` : null,
      ].filter(Boolean).join("\n"), kanal);
    }

    return res.status(200).json({ kontakt });
  } catch (e) {
    console.error("E-Mail-Kontakt fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Der Kontakt konnte nicht übergeben werden." });
  }
}
