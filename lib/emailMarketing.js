import { istFuehrungsrolle } from "./rollen.js";

// Ob das E-Mail-Marketing in dieser Organisation eingeschaltet ist — und
// wer es sehen darf.
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

// Wer es sehen darf, wenn es eingeschaltet ist.
//
// Der Grund für die Abstufung: Das E-Mail-Marketing ist das bequeme
// Werkzeug — es fühlt sich nach Arbeit an und tut nicht weh. Für manche im
// Team ist es genau richtig, für andere die Ausrede, nicht zum Telefon zu
// greifen. Ganz abschalten ist dann zu grob.
export const ZUGANG_ARTEN = [
  { key: "alle", label: "Alle im Team" },
  { key: "leitung", label: "Nur die Leitung" },
  { key: "auswahl", label: "Ausgewählte Personen" },
];

/** Fehlt die Spalte (migration_180 noch nicht eingespielt), gilt "alle". */
export function zugangVon(org) {
  const art = org?.email_marketing_zugang;
  return ZUGANG_ARTEN.some((z) => z.key === art) ? art : "alle";
}

/** Die ausgewählten Personen — immer eine Liste, auch wenn nichts steht. */
export function zugangsPersonen(org) {
  const liste = org?.email_marketing_personen;
  return Array.isArray(liste) ? liste.filter((id) => typeof id === "string" && id) : [];
}

/**
 * Darf DIESE Person das E-Mail-Marketing benutzen?
 *
 * Die Leitung darf immer, solange es überhaupt eingeschaltet ist: Sie legt
 * die Vorlagen an und trägt die Verantwortung für das, was nach draussen
 * geht. Eine Leitung, die sich selbst aussperrt, könnte nichts mehr
 * einrichten und würde den Fehler für einen Fehler der Academy halten.
 */
export function darfEmailMarketing(org, profil, istLeitung = null) {
  if (!emailMarketingAktiv(org)) return false;
  const leitung = istLeitung === null ? istFuehrungsrolle(profil) : !!istLeitung;
  const art = zugangVon(org);
  if (art === "alle") return true;
  if (leitung) return true;
  if (art === "leitung") return false;
  return zugangsPersonen(org).includes(profil?.id);
}

// Ein Satz, der erklärt statt nur zu verbieten. Er steht im Call Tracker,
// im E-Mail-Marketing und in der Antwort des Servers — überall derselbe,
// damit niemand rätselt, ob es dreierlei Gründe gibt.
export const AUS_TEXT = "Das E-Mail-Marketing ist für eure Organisation ausgeschaltet. "
  + "Die Leitung kann es in der Verwaltung unter Organisation → E-Mail wieder einschalten.";

// Eingeschaltet, aber nicht für diese Person. Bewusst ein eigener Satz: "ist
// ausgeschaltet" wäre falsch, und wer es bei Kolleg:innen sieht, hielte die
// Academy sonst für kaputt.
export const NICHT_FUER_DICH = "Das E-Mail-Marketing ist in eurer Organisation nur für bestimmte Personen "
  + "freigegeben. Wenn du es brauchst, sag es deiner Vertriebsleitung — sie kann dich dafür freischalten.";
