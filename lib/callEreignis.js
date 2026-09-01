// Ein einzelnes Anruf-Ereignis mit Zeitstempel festhalten (migration_128).
//
// Bewusst nebenläufig und ohne Rückmeldung an die zählende Person: die
// Tagessummen in call_log_days sind die verbindliche Zahl, diese Zeile ist
// die Zusatzinformation für die Tageszeit-Auswertung. Wenn sie einmal nicht
// ankommt, darf das den Anruf nicht aufhalten und keinen Fehler auf den
// Bildschirm werfen — gemeldet wird es trotzdem, sonst fehlt am Ende die
// halbe Auswertung und niemand weiss, warum.
import { supabase } from "./supabaseClient";
import { meldeStoerung } from "./fehlerMelden";

export async function merkeEreignis({ userId, orgId, art, grund = null }) {
  if (!userId || !art) return;
  try {
    const { error } = await supabase.from("call_events").insert({
      user_id: userId,
      organization_id: orgId || null,
      art,
      grund,
    });
    if (error) throw error;
  } catch (e) {
    meldeStoerung("Call-Ereignis speichern", e?.message || String(e));
  }
}

/**
 * Das zuletzt erfasste Ereignis dieser Person zurücknehmen.
 *
 * Nötig für den Minus-Knopf: wer einen negativen Anruf zurücknimmt, nimmt
 * auch dessen Zeitstempel zurück. Sonst stünde in der Tageszeit-Auswertung
 * ein Einwand, den es nie gab.
 */
export async function nimmEreignisZurueck({ userId, art }) {
  if (!userId || !art) return;
  try {
    const { data } = await supabase.from("call_events")
      .select("id").eq("user_id", userId).eq("art", art)
      .order("erfasst_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.id) await supabase.from("call_events").delete().eq("id", data.id);
  } catch (e) {
    meldeStoerung("Call-Ereignis zurücknehmen", e?.message || String(e));
  }
}
