// Welche hochgeladenen Dateien zu welchem Eintrag gehören.
//
// Skripte, Kursanhänge, Karteikarten, Kursvideos und Community-Uploads lagen
// in öffentlich lesbaren Speicherbereichen: Wer den Link kannte, sah die
// Datei — ohne Anmeldung und über Organisationsgrenzen hinweg. Ein
// weitergeleiteter Gesprächsleitfaden war damit für jeden lesbar.
//
// Seit migration_174 sind diese Bereiche privat. Eine Datei gibt der
// Server nur noch über einen kurzlebigen Link heraus (pages/api/datei-link.js),
// und nur, wenn die anfragende Person den Eintrag sehen darf, zu dem die
// Datei gehört. Welcher Eintrag das ist, steht hier.
//
// Eine Datei ist damit genau so sichtbar wie ihr Eintrag — keine zweite
// Regel, die mit den Organisationsregeln auseinanderlaufen könnte.

export const DATEI_QUELLEN = {
  "script-files": [{ tabelle: "scripts", spalte: "file_url" }],
  "content-files": [
    { tabelle: "flashcards", spalte: "file_url" },
    { tabelle: "custom_modules", spalte: "file_url" },
  ],
  "course-videos": [{ tabelle: "custom_modules", spalte: "video_url" }],
  "community-uploads": [{ tabelle: "community_posts", spalte: "attachment_url" }],
};

export const GESCHUETZTE_BEREICHE = Object.keys(DATEI_QUELLEN);

/**
 * Speicherbereich und Pfad aus einem gespeicherten Link.
 *
 * Gespeichert sind öffentliche Adressen der Form
 * ".../storage/v1/object/public/<bereich>/<pfad>". Sie bleiben die Kennung
 * der Datei, auch wenn der Bereich jetzt privat ist — so muss keine
 * einzige alte Datei verschoben oder umgeschrieben werden.
 */
export function bereichUndPfad(url) {
  const text = String(url || "");
  const treffer = text.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([a-z0-9-]+)\/([^?#]+)/i);
  if (!treffer) return null;
  const bereich = treffer[1];
  if (!DATEI_QUELLEN[bereich]) return null;
  let pfad = treffer[2];
  try { pfad = decodeURIComponent(pfad); } catch (e) { /* so, wie er ist */ }
  // Kein Ausweg aus dem eigenen Bereich über "../".
  if (!pfad || pfad.split("/").some((teil) => teil === ".." || teil === ".")) return null;
  return { bereich, pfad };
}
