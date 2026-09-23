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

/**
 * Fehlt die Tabelle noch (migration_181 nicht eingespielt)?
 *
 * Dieser Fall darf NICHT als Störung gemeldet werden. Er ist keine Panne
 * im Betrieb, sondern eine offene Migration — und die gehört in den
 * Systemstatus (Verwaltung → Betrieb), nicht als Warnung auf den
 * Bildschirm jeder Vertriebsperson. Genau das ist passiert: Beim Öffnen
 * des Call Trackers bekam das ganze Team "Could not find the table
 * 'public.telefon_bloecke'" zu sehen, mehrmals am Tag, für etwas, das
 * niemand von ihnen beheben kann.
 *
 * Erkannt wird sowohl die Meldung von PostgREST ("Could not find the
 * table") als auch der Fehlercode 42P01 von Postgres selbst.
 */
function tabelleFehlt(fehler) {
  const text = `${fehler?.message || ""} ${fehler?.code || ""}`;
  return /telefon_bloecke/.test(text) && /could not find|does not exist|42P01|schema cache/i.test(text);
}

/** Einen beendeten Block speichern. Gibt true zurück, wenn er drin ist. */
export async function merkeBlock(zeile) {
  if (!zeile) return false;
  try {
    const { error } = await supabase.from("telefon_bloecke").insert(zeile);
    if (error) throw error;
    return true;
  } catch (e) {
    // Ohne die Tabelle wird nichts gespeichert — still, und ohne jemanden
    // damit zu behelligen, der es nicht ändern kann.
    if (!tabelleFehlt(e)) meldeStoerung("Telefonblock speichern", e?.message || String(e));
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
    if (!tabelleFehlt(e)) meldeStoerung("Telefonblöcke laden", e?.message || String(e));
    return [];
  }
}
