// An welchen Wochentagen die Entscheider zu erreichen sind.
//
// Die Frage ist nicht akademisch: Wer montags anruft und dreimal das
// Vorzimmer bekommt, während donnerstags jeder zweite Anruf beim Chef
// landet, telefoniert am falschen Tag. Das sieht man einer Wochensumme
// nicht an — dort stehen beide Tage im selben Topf.
//
// Gerechnet wird aus den TAGESSUMMEN (call_log_days), nicht aus einzelnen
// Ereignissen: die Tagessumme ist die verbindliche Zahl dieser Anwendung,
// und sie reicht für die Frage nach dem Wochentag vollkommen.

const NAMEN = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Unter so vielen Anwahlen an einem Wochentag ist jede Quote Zufall. Drei
// Anrufe an einem Samstag, davon einer beim Chef, wären "33 % Entscheider"
// — und eine Empfehlung, samstags zu telefonieren.
export const MINDESTENS_JE_TAG = 10;

/** Montag = 0 … Sonntag = 6, aus "JJJJ-MM-TT". */
function wochentagIndex(tagStr) {
  const d = new Date(`${tagStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Ein Raster über die sieben Wochentage.
 *
 * @param zeilen  call_log_days-Zeilen: { log_date, counts }
 */
export function wochentagsRaster(zeilen = []) {
  const raster = NAMEN.map((name, i) => ({
    index: i, name, kurz: KURZ[i],
    anwahlen: 0, erreicht: 0, entscheider: 0, weitergeleitet: 0, termin: 0, tage: new Set(),
  }));

  zeilen.forEach((z) => {
    const i = wochentagIndex(z?.log_date);
    if (i === null) return;
    const r = raster[i];
    const c = z.counts || {};
    r.anwahlen += c.anwahlen || 0;
    r.erreicht += c.erreicht || 0;
    r.entscheider += c.entscheider || 0;
    r.weitergeleitet += c.weitergeleitet || 0;
    r.termin += c.termin || 0;
    if ((c.anwahlen || 0) > 0) r.tage.add(z.log_date);
  });

  return raster.map((r) => {
    // Wie oft jemand bei der Entscheidung landet: direkt erreicht plus
    // durchgestellt. Abgeleitet und nicht zusätzlich gebucht — sonst wäre
    // die Summe der Zähler grösser als "erreicht".
    const beiEntscheidung = r.entscheider + r.weitergeleitet;
    const genug = r.anwahlen >= MINDESTENS_JE_TAG;
    return {
      ...r,
      tage: r.tage.size,
      beiEntscheidung,
      // Ohne genug Anrufe KEINE Quote. Eine Zahl, die auf drei Anrufen
      // steht, ist keine Erkenntnis, sondern eine Einladung zum Irrtum.
      entscheiderQuote: genug && r.anwahlen > 0 ? Math.round((beiEntscheidung / r.anwahlen) * 100) : null,
      erreichbarkeit: genug && r.anwahlen > 0 ? Math.round((r.erreicht / r.anwahlen) * 100) : null,
      terminQuote: genug && r.anwahlen > 0 ? Math.round((r.termin / r.anwahlen) * 100) : null,
      genug,
    };
  });
}

/** Der Tag mit der höchsten Entscheider-Quote — null, wenn keiner zählt. */
export function besterTag(raster = []) {
  const bewertbar = raster.filter((r) => r.entscheiderQuote !== null);
  if (!bewertbar.length) return null;
  return bewertbar.reduce((a, b) => (b.entscheiderQuote > a.entscheiderQuote ? b : a));
}

/** Und der schwächste — nur wenn es überhaupt etwas zu vergleichen gibt. */
export function schwaechsterTag(raster = []) {
  const bewertbar = raster.filter((r) => r.entscheiderQuote !== null);
  if (bewertbar.length < 2) return null;
  return bewertbar.reduce((a, b) => (b.entscheiderQuote < a.entscheiderQuote ? b : a));
}

/**
 * Der Satz darüber — oder null, wenn die Grundlage zu dünn ist.
 *
 * Lieber nichts sagen als etwas behaupten: Eine Empfehlung, die auf zwei
 * Wochentagen mit je zwölf Anrufen steht, klingt genauso sicher wie eine
 * auf tausend, und niemand sieht ihr den Unterschied an.
 */
export function wochentagsBefund(raster = []) {
  const beste = besterTag(raster);
  const schwaechste = schwaechsterTag(raster);
  if (!beste || !schwaechste || beste.index === schwaechste.index) return null;
  const abstand = beste.entscheiderQuote - schwaechste.entscheiderQuote;
  // Unter fünf Punkten Unterschied ist es Rauschen und keine Empfehlung.
  if (abstand < 5) return null;
  return {
    beste, schwaechste, abstand,
    text: `${beste.name}s landen ${beste.entscheiderQuote} % der Anwahlen bei der Entscheidung, `
      + `${schwaechste.name.toLowerCase()}s nur ${schwaechste.entscheiderQuote} %.`,
  };
}
