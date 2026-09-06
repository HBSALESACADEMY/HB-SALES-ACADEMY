// Was die Anwendung von der Datenbank erwartet — und welche Migration es
// mitbringt.
//
// Der Grund für diese Datei: Migrationen werden von Hand eingespielt. Fehlt
// eine, sieht das im Betrieb nicht aus wie "Migration fehlt", sondern wie
// ein Fehler im Programm — ein Vorschlag kommt nicht an, ein Kontakt lässt
// sich nicht löschen, ein Kalender bleibt leer. Dann sucht man an der
// falschen Stelle, manchmal stundenlang.
//
// Die Liste beginnt bei 122; alles davor ist so lange in Betrieb, dass es
// erwiesenermassen eingespielt ist.
//
// Wichtig: Hier stehen nur Tabellen und Spalten. Zugriffsregeln und
// Funktionen lassen sich von aussen nicht so einfach abfragen — was diese
// Prüfung also NICHT leisten kann, steht im Hinweistext der Statusseite,
// damit sich niemand in falscher Sicherheit wiegt.
export const ERWARTUNGEN = [
  { migration: 122, zweck: "Cold Call Bingo", tabelle: "bingo_karten" },
  { migration: 123, zweck: "Buchungslink beim Terminieren", tabelle: "organizations", spalte: "booking_url" },
  { migration: 124, zweck: "Wer gerade da ist", tabelle: "anwesenheit" },
  { migration: 125, zweck: "Ziele auf Call-Tracker-Kennzahlen", tabelle: "nav_items", spalte: "key" },
  { migration: 126, zweck: "Eigene Aufnahmen lesen", tabelle: "call_recordings", spalte: "created_by" },
  { migration: 128, zweck: "Einwände nach Uhrzeit", tabelle: "call_events" },
  { migration: 129, zweck: "Korrektur schlägt Maximum", tabelle: "call_log_days", spalte: "korrigiert_at" },
  { migration: 131, zweck: "Kalender abonnieren", tabelle: "profiles", spalte: "kalender_token" },
  { migration: 135, zweck: "Eigene Ablehnungsgründe vorschlagen", tabelle: "grund_vorschlaege" },
  { migration: 137, zweck: "XP aus dem Call Tracker", tabelle: "call_log_days", spalte: "xp_vergeben" },
  { migration: 138, zweck: "E-Mail-Kontakte aus dem Gespräch", tabelle: "email_kontakte" },
  { migration: 139, zweck: "Eigener Telegram-Kanal fürs Marketing", tabelle: "organizations", spalte: "telegram_marketing_chat_id" },
  { migration: 141, zweck: "Mail-Vorlagen und Wiedervorlage", tabelle: "organizations", spalte: "email_vorlagen" },
  { migration: 142, zweck: "Eigene Absenderadresse", tabelle: "organizations", spalte: "email_absender" },
  { migration: 143, zweck: "Signatur, Vorlagen-Erfolg, Anhänge", tabelle: "email_anhaenge" },
  { migration: 144, zweck: "Rückrufliste", tabelle: "rueckrufe" },
  { migration: 145, zweck: "Papierkorb statt endgültigem Löschen", tabelle: "leads", spalte: "geloescht_am" },
];

/**
 * Aus den Prüfergebnissen eine Liste fehlender Migrationen machen.
 *
 * Eine Migration gilt als fehlend, sobald EINE ihrer Erwartungen nicht
 * erfüllt ist — eine halb eingespielte Migration ist so gut wie keine.
 */
export function fehlendeMigrationen(ergebnisse = []) {
  const proMigration = new Map();
  ergebnisse.forEach((e) => {
    if (e.vorhanden) return;
    if (!proMigration.has(e.migration)) {
      proMigration.set(e.migration, { migration: e.migration, zweck: e.zweck, fehlt: [] });
    }
    proMigration.get(e.migration).fehlt.push(e.spalte ? `${e.tabelle}.${e.spalte}` : e.tabelle);
  });
  return [...proMigration.values()].sort((a, b) => a.migration - b.migration);
}

/** Kurzfassung für die Anzeige. */
export function zustandsText(ergebnisse = []) {
  const fehlend = fehlendeMigrationen(ergebnisse);
  if (!ergebnisse.length) return "Noch nicht geprüft.";
  if (!fehlend.length) return "Alle erwarteten Tabellen und Spalten sind vorhanden.";
  return `${fehlend.length} ${fehlend.length === 1 ? "Migration fehlt" : "Migrationen fehlen"}: ${fehlend.map((f) => f.migration).join(", ")}`;
}
