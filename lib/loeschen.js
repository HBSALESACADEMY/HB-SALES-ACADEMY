// Eine von den Zugriffsregeln verbotene Löschung meldet in Postgres KEINEN
// Fehler: sie trifft null Zeilen und gilt als erfolgreich. Wer nur auf
// "error" prüft, hält das für erledigt, lädt neu — und der Eintrag ist noch
// da. Aus Sicht der Nutzenden passiert einfach nichts, ohne Erklärung.
//
// Deshalb hier zentral: .select() anhängen und prüfen, ob wirklich etwas
// getroffen wurde. Gibt null zurück, wenn alles gut ging, sonst einen Text
// zum Anzeigen.
export async function loescheGeprueft(query, ablehnungstext) {
  const { data, error } = await query.select();
  if (error) return error.message;
  if (!data || data.length === 0) {
    return ablehnungstext || "Das Löschen wurde abgelehnt — dafür fehlen dir die Rechte.";
  }
  return null;
}
