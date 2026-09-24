// Wann der Morgenbericht raus darf — und wann nicht mehr.
//
// Der Morgengruss gehört in die Zeit zwischen 8 und 9 Uhr deutscher Zeit.
// Die genaue Minute liegt nicht in unserer Hand: Vercel garantiert im
// Hobby-Tarif nur die Stunde. Der Auftrag "0 7 * * *" lief am 24.09.2026 um
// 7:49 UTC, die Nachricht kam also um 9:49. Weil Vercel in UTC rechnet und
// Deutschland die Uhr umstellt, heisst dieselbe Einstellung im Sommer 9 Uhr
// und im Winter 8 Uhr — beide Stunden sind deshalb erlaubt.
//
// Diese Datei entscheidet, wer senden darf:
//
//   - vor 8 Uhr deutscher Zeit: nein. Eine Nachricht um 6:30 weckt Leute,
//     die noch nicht arbeiten.
//   - nach 9 Uhr: nein. Ein "Guten Morgen" um 14 Uhr ist kein Morgengruss,
//     sondern eine Störung. Ein versehentlicher Aufruf soll nichts senden.
//   - heute schon gelaufen: nein. Ein zweiter Lauf hält still, damit
//     niemand den Bericht zweimal liest.
//
// Reine Logik, ohne Datenbank: So lässt sich jede dieser Regeln prüfen,
// ohne einen Bericht zu verschicken.

/** Die früheste und die späteste Stunde, in der der Morgengruss passt. */
export const FRUEHESTENS = 8;
export const SPAETESTENS = 9;

/**
 * Darf dieser Lauf senden?
 *
 * @param stunde      Stunde in Deutschland (berlinStunde())
 * @param heute       heutiger Tag in Deutschland ("JJJJ-MM-TT")
 * @param letzterTag  Tag des letzten Versands, oder null
 * @param force       Testlauf von der Statusseite — der darf immer
 * @returns {{ senden: boolean, grund: string }}
 */
export function darfSenden({ stunde, heute, letzterTag = null, force = false } = {}) {
  if (force) return { senden: true, grund: "Testlauf" };
  if (letzterTag && letzterTag === heute) {
    return { senden: false, grund: "Der Bericht ist heute schon raus" };
  }
  if (stunde < FRUEHESTENS) {
    return { senden: false, grund: `Lauf um ${stunde} Uhr — der Bericht geht erst ab ${FRUEHESTENS} Uhr raus` };
  }
  if (stunde > SPAETESTENS) {
    return { senden: false, grund: `Lauf um ${stunde} Uhr — nach ${SPAETESTENS} Uhr ist es kein Morgengruss mehr` };
  }
  return { senden: true, grund: `Lauf um ${stunde} Uhr` };
}

/**
 * Ist der Bericht ausgefallen?
 *
 * Für den Systemstatus. Bewusst 26 Stunden und nicht 24: Läuft er heute um
 * 9:50 und morgen um 9:05, liegen 23 Stunden dazwischen — bei 24 Stunden
 * würde jeder frühere Lauf einen Fehlalarm auslösen. Ab 26 Stunden ist ein
 * Tag wirklich übersprungen.
 *
 * Am Wochenende ist das kein Alarm: Der Bericht läuft täglich, aber ein
 * ausgefallenes Wochenende merkt niemand. Die Grenze gilt trotzdem — wer
 * am Montag hinsieht, soll es erfahren.
 */
export function laufUeberfaellig(gelaufenAt, jetzt = new Date()) {
  if (!gelaufenAt) return { ueberfaellig: false, stunden: null, grund: "Noch kein Lauf verzeichnet" };
  const dann = new Date(gelaufenAt);
  if (Number.isNaN(dann.getTime())) return { ueberfaellig: false, stunden: null, grund: "Kein lesbarer Zeitstempel" };
  const stunden = Math.floor((jetzt.getTime() - dann.getTime()) / 3600000);
  return {
    ueberfaellig: stunden >= 26,
    stunden,
    grund: stunden >= 26
      ? `Der Morgenbericht lief zuletzt vor ${stunden} Stunden`
      : `Zuletzt vor ${stunden} ${stunden === 1 ? "Stunde" : "Stunden"}`,
  };
}
