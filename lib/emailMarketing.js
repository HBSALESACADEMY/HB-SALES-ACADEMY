// Ob das E-Mail-Marketing in dieser Organisation eingeschaltet ist.
//
// Der Grund für den Schalter: Mailschreiben fühlt sich nach Arbeit an und
// ist bequemer als telefonieren. Wenn die Anwahlen fallen, seit es die
// Funktion gibt, muss die Leitung sie abschalten können — und zwar so,
// dass danach wirklich keine Mail mehr rausgeht, nicht nur der Knopf
// verschwindet.
//
// Standard ist EIN. Ein Schalter, der stillschweigend etwas abschaltet,
// das gestern noch lief, wäre schlimmer als gar keiner: Niemand würde die
// Ursache finden.
//
// Was der Schalter NICHT tut, wenn er aus ist:
//   - Nichts löschen. Kontakte, Verlauf und Vorlagen bleiben stehen und
//     sind wieder da, sobald er wieder an ist.
//   - Keine andere Mail der Academy anhalten. Termin-Benachrichtigungen,
//     Einladungen, Passwort-Zurücksetzen und die Meldungen an die Leitung
//     laufen weiter. Abgeschaltet ist genau das, was Vertriebler selbst an
//     Kunden schicken.
//   - Das Nachfassen nicht abwürgen. Wer ein Follow-up eingetragen hat,
//     wird weiter erinnert — er ruft dann eben an.

/** Fehlt die Spalte (migration_179 noch nicht eingespielt), gilt "an". */
export function emailMarketingAktiv(org) {
  return org?.email_marketing_aktiv !== false;
}

// Ein Satz, der erklärt statt nur zu verbieten. Er steht im Call Tracker,
// im E-Mail-Marketing und in der Antwort des Servers — überall derselbe,
// damit niemand rätselt, ob es dreierlei Gründe gibt.
export const AUS_TEXT = "Das E-Mail-Marketing ist für eure Organisation ausgeschaltet. "
  + "Die Leitung kann es in der Verwaltung unter Organisation → E-Mail wieder einschalten.";
