// Welche E-Mails jemand bekommen will (migration_108).
//
// Bisher bekam jede Führungsrolle jede Meldung — neuer Termin, Verschiebung,
// Absage, Aufgabe, Erwähnung, Freischaltung. Bei zehn Terminen am Tag sind
// das schnell vierzig Mails, und dann liest man keine mehr.
//
// Leer bedeutet "alles": für bestehende Konten ändert sich dadurch nichts,
// und wer die Einstellung nie öffnet, verpasst nichts.
export const MELDUNGSARTEN = [
  // Nur noch das Anlegen geht per E-Mail raus. Änderungen danach laufen
  // ausschliesslich über Telegram (pages/api/lead-notify.js) — sonst füllt
  // ein einziger Termin, an dem mehrmals etwas gedreht wird, das Postfach.
  { key: "termine", label: "Termine", hinweis: "Neuer Termin und Erinnerungen. Änderungen danach kommen nur über Telegram." },
  { key: "aufgaben", label: "Aufgaben", hinweis: "Wenn dir jemand eine Aufgabe zuweist" },
  { key: "erwaehnungen", label: "Erwähnungen", hinweis: "Wenn dich jemand mit @ nennt" },
  { key: "freigaben", label: "Freischaltungen", hinweis: "Wenn sich jemand Neues registriert und auf Freigabe wartet" },
];

export function willMeldung(profil, art) {
  const wahl = profil?.benachrichtigungen;
  // Nichts hinterlegt oder Schlüssel unbekannt: zustellen. Im Zweifel lieber
  // eine Mail zu viel als eine verpasste Terminabsage.
  if (!wahl || typeof wahl !== "object") return true;
  return wahl[art] !== false;
}

export function standardWahl() {
  return Object.fromEntries(MELDUNGSARTEN.map((m) => [m.key, true]));
}
