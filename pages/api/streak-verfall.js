import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { berlinHeute, tagPlus } from "../../lib/woche";
import { streakLossPenalty } from "../../lib/streak";

// Eine abgelaufene Serie der Tages-Challenge zurücksetzen — mit XP-Abzug.
//
// Vorher tat das der Browser selbst: Serie auf 0 über das eigene Profil,
// dann increment_xp. Nur darf increment_xp seit migration_70 allein der
// Server aufrufen. Der Abzug scheiterte also bei jedem, still, und die
// Serie stand trotzdem auf 0. Und XP im eigenen Profil zu ändern, lässt
// migration_166 aus gutem Grund nicht mehr zu.
//
// Hier wird nichts vom Browser übernommen: ob die Serie abgelaufen ist und
// wie hoch der Abzug ausfällt, rechnet der Server aus der Datenbank nach.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  try {
    const admin = getAdminSupabase();
    const { data: profil, error } = await admin.from("profiles")
      .select("streak_count, last_challenge_date, xp").eq("id", auth.user.id).maybeSingle();
    if (error) throw error;

    // Nach deutschem Kalendertag: Gestern oder heute gespielt heisst, die
    // Serie läuft noch.
    const heute = berlinHeute();
    const laeuft = !profil?.last_challenge_date
      || profil.last_challenge_date === heute
      || profil.last_challenge_date === tagPlus(heute, -1);
    if (!profil || !(profil.streak_count > 0) || laeuft) {
      return res.status(200).json({ verfallen: false });
    }

    const abzug = streakLossPenalty(profil.streak_count);
    // Erst die Serie zurücksetzen, und nur dann abziehen: Scheitert der
    // erste Schritt, darf der Abzug beim nächsten Laden nicht doppelt kommen.
    const { error: resetFehler } = await admin.from("profiles").update({ streak_count: 0 }).eq("id", auth.user.id);
    if (resetFehler) throw resetFehler;
    const { error: xpFehler } = await admin.rpc("increment_xp", { uid: auth.user.id, amount: -abzug });
    if (xpFehler) console.error("Streak-Abzug fehlgeschlagen:", xpFehler.message);

    return res.status(200).json({
      verfallen: true,
      abzug: xpFehler ? 0 : abzug,
      xp: xpFehler ? profil.xp : Math.max(0, (profil.xp || 0) - abzug),
    });
  } catch (e) {
    console.error("Streak-Verfall fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Die Serie konnte nicht aktualisiert werden." });
  }
}
