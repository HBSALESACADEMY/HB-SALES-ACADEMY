import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";

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

    const { data: profil } = await admin.from("profiles")
      .select("kalender_token").eq("id", user.id).maybeSingle();

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
      neu,
    });
  } catch (e) {
    console.error("Abo-Link fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Der Link konnte nicht erzeugt werden." });
  }
}
