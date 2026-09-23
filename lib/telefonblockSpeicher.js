// Telefonblöcke aufbewahren (migration_181).
//
// Der Block war bisher ein Selbstgespräch: Uhr läuft, Ergebnis erscheint,
// Ergebnis verschwindet. Nur der Bestwert blieb — und der lag im Browser,
// also auf genau einem Gerät. Damit fehlte die Antwort auf die Frage, die
// der Block überhaupt stellt: Wie viele Anwahlen schaffe ich in einer
// konzentrierten Runde, und wird das über die Wochen besser?
//
// Die Zeile ist Zusatzinformation, nicht die verbindliche Zahl: Die
// Anwahlen selbst stehen weiter in call_log_days. Scheitert das Speichern,
// darf das den nächsten Anruf nicht aufhalten — gemeldet wird es trotzdem,
// sonst fehlt später die halbe Auswertung und niemand weiss, warum.
import { supabase } from "./supabaseClient";
import { meldeStoerung } from "./fehlerMelden";

// Das Rechnen steht in lib/telefonblock.js — hier nur der Weg zur
// Datenbank.

/** Einen beendeten Block speichern. Gibt true zurück, wenn er drin ist. */
export async function merkeBlock(zeile) {
  if (!zeile) return false;
  try {
    const { error } = await supabase.from("telefon_bloecke").insert(zeile);
    if (error) throw error;
    return true;
  } catch (e) {
    meldeStoerung("Telefonblock speichern", /telefon_bloecke/.test(e?.message || "")
      ? "In der Datenbank fehlt noch eine Änderung (migration_181)."
      : (e?.message || String(e)));
    return false;
  }
}

/** Die eigenen Blöcke eines Tages, neueste zuerst. */
export async function ladeBloecke({ userId, tagVon, tagBis }) {
  if (!userId || !tagVon) return [];
  try {
    const { data, error } = await supabase.from("telefon_bloecke")
      .select("id, gestartet_at, beendet_at, ziel_minuten, minuten, anwahlen, ziel_erreicht")
      .eq("user_id", userId)
      .gte("gestartet_at", tagVon)
      .lt("gestartet_at", tagBis)
      .order("gestartet_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  } catch (e) {
    // Ohne Liste geht der Block trotzdem — nur die Rückschau fehlt.
    meldeStoerung("Telefonblöcke laden", e?.message || String(e));
    return [];
  }
}
