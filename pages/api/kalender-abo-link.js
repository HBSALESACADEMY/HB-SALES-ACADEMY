import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { istFuehrungsrolle } from "../../lib/rollen";
import { erlaubtePersonen } from "./kalender-abo";

// Den eigenen Abo-Schlüssel holen oder neu erzeugen.
//
// Getrennt von der Feed-Route, weil hier das Gegenteil gilt: diese Route
// verlangt eine Anmeldung und arbeitet ausschliesslich mit dem eigenen
// Konto. Der Schlüssel wird beim ersten Aufruf erzeugt — wer das Abo nie
// nutzt, hat auch keinen.
//
// "neu": macht den bisherigen Link im selben Moment wertlos. Der Weg für
// den Fall, dass jemand den Link versehentlich weitergegeben hat.
export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  try {
    const admin = getAdminSupabase();
    const neu = req.method === "POST" && req.body?.neu === true;
    const umfangWunsch = req.method === "POST" ? req.body?.umfang : null;

    const { data: profil } = await admin.from("profiles")
      .select("kalender_token, kalender_umfang, kalender_personen, role, is_admin, is_platform_admin, organization_id")
      .eq("id", user.id).maybeSingle();

    // Wer darf überhaupt Team-Termine abonnieren: Führungsrollen, und wer
    // mindestens ein Team leitet. Geprüft wird hier UND bei jedem Abruf des
    // Kalenders — diese Antwort hier ist nur für die Anzeige.
    const { count: eigeneTeams } = await admin.from("teams")
      .select("id", { count: "exact", head: true }).eq("created_by", user.id);
    const darfTeam = istFuehrungsrolle(profil) || (eigeneTeams || 0) > 0;

    // Wen diese Person überhaupt auswählen könnte — dieselbe Rechnung wie
    // beim Ausliefern des Kalenders, damit die Liste nicht mehr anbietet,
    // als später tatsächlich hineinkommt.
    const erlaubt = darfTeam ? await erlaubtePersonen(admin, { ...profil, id: user.id }) : new Map();
    const auswaehlbar = [...erlaubt.entries()]
      .map(([id, name]) => ({ id, name: name || "Unbenannt" }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));

    let umfang = profil?.kalender_umfang || "eigene";
    let auswahl = profil?.kalender_personen || [];

    const wunschErlaubt = umfangWunsch === "eigene"
      || ((umfangWunsch === "team" || umfangWunsch === "auswahl") && darfTeam);
    if (wunschErlaubt) {
      umfang = umfangWunsch;
      // Nur Personen speichern, die auch wirklich erlaubt sind — sonst
      // stünden in der Liste Kennungen, die niemand vergeben hat.
      if (Array.isArray(req.body?.personen)) {
        auswahl = req.body.personen.filter((id) => erlaubt.has(id));
      }
      const { error } = await admin.from("profiles")
        .update({ kalender_umfang: umfang, kalender_personen: auswahl }).eq("id", user.id);
      if (error) throw error;
    }

    let token = profil?.kalender_token || null;
    if (!token || neu) {
      token = crypto.randomUUID();
      const { error } = await admin.from("profiles").update({ kalender_token: token }).eq("id", user.id);
      if (error) throw error;
    }

    const basis = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;
    return res.status(200).json({
      url: `${basis}/api/kalender-abo?token=${token}`,
      // Dieselbe Adresse mit webcal:// — damit tragen Apple und Outlook den
      // Kalender mit einem Klick ein, statt die Datei herunterzuladen.
      webcal: `${basis.replace(/^https?:/, "webcal:")}/api/kalender-abo?token=${token}`,
      umfang,
      darfTeam,
      auswahl,
      auswaehlbar,
      neu,
    });
  } catch (e) {
    console.error("Abo-Link fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Der Link konnte nicht erzeugt werden." });
  }
}
