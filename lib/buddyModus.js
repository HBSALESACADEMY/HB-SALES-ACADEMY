import { sendePersoenlich } from "./telegramPersoenlich.js";

// Was im Chat gerade läuft: ein Rollenspiel, ein Termin-Dialog, ein
// Vorschlag, der auf ein "Ja" wartet.
//
// An einer Stelle, weil alle Dialoge dasselbe brauchen — und weil ein
// Fehler hier NICHT still bleiben darf: Fehlt migration_175, gibt es die
// Spalten nicht, kein Dialog kann sich etwas merken, und der Buddy
// antwortete bisher einfach mit einem Coaching-Satz weiter. Von aussen sah
// das aus, als ignoriere er die Bitte.

export const MIGRATION_FEHLT = "In der Datenbank der Academy fehlt noch eine Änderung (migration_175) — "
  + "deshalb kann ich mir hier nichts merken und nichts eintragen. "
  + "Sag bitte deiner Leitung Bescheid; bis dahin geht es über die Termin-Seite der Academy.";

/** Fehlen die Spalten aus migration_175? */
export function fehltMigration(fehler) {
  return /modus|column .* does not exist/i.test(fehler?.message || "");
}

/**
 * Den Stand eines Dialogs speichern.
 *
 * @returns true, wenn es geklappt hat. Bei einem Fehler schreibt der Buddy
 *          in den Chat, woran es liegt — statt stumm weiterzureden.
 */
export async function setzeModus(admin, v, modus, daten = null) {
  const { error } = await admin.from("telegram_verknuepfungen").update({
    modus, modus_daten: daten, modus_seit: modus ? new Date().toISOString() : null,
  }).eq("user_id", v.user_id);
  if (!error) return true;

  console.error("Vertriebsbuddy: Dialog nicht gespeichert:", error.message);
  await sendePersoenlich(admin, v, fehltMigration(error)
    ? MIGRATION_FEHLT
    : "Das konnte ich gerade nicht speichern. Versuch es bitte gleich noch einmal.");
  return false;
}

/** Den Dialog beenden — ohne Meldung, das ist nie dringend. */
export async function loescheModus(admin, userId) {
  const { error } = await admin.from("telegram_verknuepfungen")
    .update({ modus: null, modus_daten: null, modus_seit: null }).eq("user_id", userId);
  if (error) console.error("Vertriebsbuddy: Dialog nicht beendet:", error.message);
  return !error;
}
