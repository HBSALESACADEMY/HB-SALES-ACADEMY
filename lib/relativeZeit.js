// "vor 3 Minuten" statt "22.08.2026, 14:07".
//
// Für alles, was gerade passiert: dort will man den Abstand zu jetzt lesen,
// nicht eine Uhrzeit mit einer anderen im Kopf verrechnen. Für ältere
// Ereignisse ist es umgekehrt — deshalb schaltet die Funktion nach einem Tag
// auf das Datum um.
export function vorWieLange(zeitpunkt, jetzt = Date.now()) {
  if (!zeitpunkt) return "";
  const d = zeitpunkt instanceof Date ? zeitpunkt : new Date(zeitpunkt);
  if (isNaN(d.getTime())) return "";
  const sekunden = Math.round((jetzt - d.getTime()) / 1000);

  // Kleine Abweichungen in die Zukunft entstehen, wenn die Uhr des Geräts
  // ein paar Sekunden vorgeht — das ist kein Grund für "in 3 Sekunden".
  if (sekunden < 60) return "gerade eben";
  const minuten = Math.round(sekunden / 60);
  if (minuten < 60) return `vor ${minuten} Min.`;
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return `vor ${stunden} Std.`;
  const tage = Math.round(stunden / 24);
  return tage === 1 ? "gestern" : `vor ${tage} Tagen`;
}

// Wer in den letzten Minuten eine Seite geöffnet hat, ist gerade da.
export const AKTIV_FENSTER_MS = 15 * 60 * 1000;

export function istGeradeAktiv(zeitpunkt, jetzt = Date.now(), fenster = AKTIV_FENSTER_MS) {
  if (!zeitpunkt) return false;
  const d = zeitpunkt instanceof Date ? zeitpunkt : new Date(zeitpunkt);
  if (isNaN(d.getTime())) return false;
  return jetzt - d.getTime() <= fenster;
}
