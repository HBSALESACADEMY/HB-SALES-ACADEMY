// Speichern, auch wenn eine Spalte noch fehlt.
//
// Die Academy bekommt ihre Datenbank-Änderungen von Hand eingespielt. Wer
// eine neue Fassung ausliefert, bevor die Migration gelaufen ist, hat in
// der Datenbank eine Spalte weniger als im Code — und Postgres lehnt dann
// die GANZE Änderung ab.
//
// Genau das ist passiert: Nach der Einstellung "wer darf das
// E-Mail-Marketing sehen" (migration_180) liess sich die Organisation
// überhaupt nicht mehr speichern. Nicht nur die neue Einstellung war
// betroffen, sondern jede — Firmenname, Farben, Vorlagen, alles. Eine
// fehlende Migration darf nicht die ganze Maske lahmlegen.
//
// Deshalb: Was die Datenbank nicht kennt, wird weggelassen und der Rest
// gespeichert. Und es wird gesagt, was deshalb nicht angekommen ist —
// stillschweigend die Hälfte zu speichern wäre schlimmer.
import { ERWARTUNGEN } from "./schemaErwartung.js";

/**
 * Welche Spalte die Datenbank nicht kennt — oder null.
 *
 * Erkannt wird die Meldung von PostgREST ("Could not find the 'x' column
 * of 'y' in the schema cache") und der Fehlercode 42703 von Postgres
 * selbst, dessen Meldung die Spalte in Anführungszeichen nennt.
 */
export function fehlendeSpalte(fehler) {
  const text = String(fehler?.message || fehler || "");
  const code = String(fehler?.code || "");
  const treffer = text.match(/Could not find the '([^']+)' column/i)
    || text.match(/column "([^"]+)" of relation/i)
    || (code === "42703" ? text.match(/column ([a-z0-9_]+)/i) : null);
  return treffer ? treffer[1] : null;
}

/** Eine Kopie der Daten ohne diese Spalte. */
export function ohneSpalte(daten, spalte) {
  if (!daten || !spalte || !(spalte in daten)) return daten;
  const kopie = { ...daten };
  delete kopie[spalte];
  return kopie;
}

/**
 * Welche Migration diese Spalte mitbringt — für einen Hinweis, mit dem die
 * Leitung etwas anfangen kann. Die Zuordnung steht ohnehin schon in
 * lib/schemaErwartung.js, also wird sie hier nur gelesen.
 */
export function migrationFuer(tabelle, spalte) {
  const treffer = ERWARTUNGEN.find((e) => e.tabelle === tabelle && e.spalte === spalte);
  return treffer ? treffer.migration : null;
}

/**
 * Der Satz, der erklärt, was nicht gespeichert wurde.
 *
 * Bewusst mit der Nummer der Migration: "Eine Spalte fehlt" kann niemand
 * beheben, "migration_180 fehlt" schon.
 */
export function fehlendeSpaltenText(tabelle, spalten = []) {
  if (!spalten.length) return null;
  const migrationen = [...new Set(spalten.map((s) => migrationFuer(tabelle, s)).filter(Boolean))];
  const namen = spalten.join(", ");
  const wo = migrationen.length
    ? ` Dafür fehlt in der Datenbank noch ${migrationen.length === 1 ? "die Änderung" : "die Änderungen"} `
      + `${migrationen.map((m) => `migration_${m}`).join(" und ")}.`
    : " Dafür fehlt in der Datenbank noch eine Änderung.";
  return `Gespeichert — bis auf ${namen}.${wo}`;
}

/**
 * Speichern und dabei Spalten weglassen, die die Datenbank nicht kennt.
 *
 * @param schreibe  Funktion, die mit den Daten aufgerufen wird und
 *                  { error } zurückgibt — so bleibt diese Datei frei von
 *                  Datenbank-Code und damit prüfbar.
 * @returns { error, weggelassen } — "weggelassen" sind die Spalten, die
 *          nicht gespeichert werden konnten.
 */
export async function schreibeOhneFehlendeSpalten(daten, schreibe, hoechstens = 6) {
  let aktuell = daten;
  const weggelassen = [];
  for (let versuch = 0; versuch <= hoechstens; versuch += 1) {
    const { error } = await schreibe(aktuell);
    if (!error) return { error: null, weggelassen };
    const spalte = fehlendeSpalte(error);
    // Ein anderer Fehler (Firmencode vergeben, fehlendes Recht) gehört
    // unverändert nach oben: Er hat nichts mit einer Migration zu tun.
    if (!spalte || !(spalte in aktuell)) return { error, weggelassen };
    weggelassen.push(spalte);
    aktuell = ohneSpalte(aktuell, spalte);
  }
  return { error: null, weggelassen };
}
