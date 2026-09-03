// Einen fremden Kalender lesen (iCalendar/ICS).
//
// Gegenstück zu lib/ics.js: dort schreiben wir das Format, hier lesen wir
// es. Kein Paket dafür — die drei Dinge, an denen ein selbstgebauter Leser
// scheitert, sind bekannt und hier ausdrücklich behandelt:
//
//   1. GEFALTETE ZEILEN. Lange Zeilen werden umgebrochen und mit einem
//      Leerzeichen fortgesetzt. Wer das übersieht, bekommt abgeschnittene
//      Titel und kaputte Datumsangaben.
//   2. ZEITZONEN. "20260910T090000Z" ist UTC, "...T090000" ohne Z ist
//      Ortszeit, und "TZID=Europe/Berlin" nennt sie ausdrücklich. Wir
//      rechnen alles nach UTC — sonst steht der Termin je nach Gerät
//      woanders.
//   3. WIEDERHOLUNGEN. Ein wöchentliches Meeting steht EINMAL in der Datei,
//      mit einer Regel. Ohne deren Auflösung fehlt es in jeder Woche ausser
//      der ersten — und der Kalender wäre wertlos.

function entfalte(text) {
  // Erst \r\n vereinheitlichen, dann Fortsetzungszeilen anhängen.
  return String(text || "").replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function entmaskiere(wert) {
  return String(wert || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// "DTSTART;TZID=Europe/Berlin:20260910T090000" → { name, params, wert }
function zerlegeZeile(zeile) {
  const doppelpunkt = zeile.indexOf(":");
  if (doppelpunkt === -1) return null;
  const kopf = zeile.slice(0, doppelpunkt);
  const wert = zeile.slice(doppelpunkt + 1);
  const [name, ...rest] = kopf.split(";");
  const params = {};
  rest.forEach((p) => {
    const gleich = p.indexOf("=");
    if (gleich > 0) params[p.slice(0, gleich).toUpperCase()] = p.slice(gleich + 1).replace(/^"|"$/g, "");
  });
  return { name: name.toUpperCase(), params, wert };
}

/**
 * Einen Zeitpunkt lesen. Gibt { ms, ganztags } zurück.
 *
 * Ohne "Z" und ohne bekannte Zeitzone bleibt nur die Annahme, dass es
 * Ortszeit ist — wir nehmen dann die deutsche, weil hier gearbeitet wird.
 * Falsch wäre, es stillschweigend als UTC zu lesen: dann läge jeder Termin
 * im Sommer zwei Stunden daneben.
 */
export function leseZeitpunkt(wert, params = {}) {
  const roh = String(wert || "").trim();
  const nurDatum = /^(\d{4})(\d{2})(\d{2})$/.exec(roh);
  if (nurDatum) {
    const [, j, m, t] = nurDatum;
    return { ms: Date.UTC(+j, +m - 1, +t), ganztags: true };
  }
  const mitZeit = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(roh);
  if (!mitZeit) return null;
  const [, j, m, t, h, min, s, z] = mitZeit;
  const alsUtc = Date.UTC(+j, +m - 1, +t, +h, +min, +s);
  if (z) return { ms: alsUtc, ganztags: false };

  // Ortszeit: den Versatz der genannten (oder ersatzweise der deutschen)
  // Zeitzone zu diesem Zeitpunkt bestimmen und abziehen.
  const zone = params.TZID || "Europe/Berlin";
  return { ms: alsUtc - versatzMs(alsUtc, zone), ganztags: false };
}

// Wie weit eine Zeitzone zu einem Zeitpunkt vor UTC liegt, in Millisekunden.
// Über Intl statt über eine Tabelle: Sommerzeit-Umstellungen ändern sich,
// die Zeitzonendaten des Systems werden gepflegt, eine eigene Tabelle nicht.
function versatzMs(utcMs, zone) {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const teile = {};
    f.formatToParts(new Date(utcMs)).forEach((p) => { teile[p.type] = p.value; });
    const alsUtc = Date.UTC(+teile.year, +teile.month - 1, +teile.day, +teile.hour % 24, +teile.minute, +teile.second);
    return alsUtc - utcMs;
  } catch (e) {
    // Unbekannte Zeitzone: lieber UTC als gar kein Termin.
    return 0;
  }
}

// Eine Wiederholungsregel auflösen. Unterstützt wird, was in privaten
// Kalendern tatsächlich vorkommt: täglich, wöchentlich (auch mit
// Wochentagen), monatlich und jährlich, mit INTERVAL, COUNT und UNTIL.
// Alles Exotischere (BYSETPOS, BYMONTHDAY-Listen) wird bewusst ignoriert —
// dann steht der Termin einmal statt falsch oft.
const WOCHENTAGE = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function loeseWiederholung(startMs, regel, { bisMs, maxAnzahl = 400 }) {
  const teile = {};
  String(regel || "").split(";").forEach((p) => {
    const gleich = p.indexOf("=");
    if (gleich > 0) teile[p.slice(0, gleich).toUpperCase()] = p.slice(gleich + 1);
  });
  const freq = (teile.FREQ || "").toUpperCase();
  if (!freq) return [startMs];

  const interval = Math.max(1, parseInt(teile.INTERVAL, 10) || 1);
  const count = parseInt(teile.COUNT, 10) || null;
  const until = teile.UNTIL ? leseZeitpunkt(teile.UNTIL)?.ms ?? null : null;
  const grenze = Math.min(bisMs, until ?? bisMs);

  const tage = (teile.BYDAY || "").split(",").map((d) => WOCHENTAGE[d.trim().slice(-2).toUpperCase()])
    .filter((n) => n !== undefined);

  const treffer = [];
  const d = new Date(startMs);

  for (let i = 0; i < maxAnzahl; i++) {
    let zeitpunkt;
    if (freq === "DAILY") {
      zeitpunkt = startMs + i * interval * 86400000;
    } else if (freq === "WEEKLY") {
      if (tage.length) {
        // Woche für Woche, darin die genannten Wochentage.
        const wochenStart = startMs - ((d.getUTCDay() - 1 + 7) % 7) * 86400000 + i * interval * 7 * 86400000;
        tage.forEach((wt) => {
          const t = wochenStart + ((wt - 1 + 7) % 7) * 86400000;
          if (t >= startMs && t <= grenze) treffer.push(t);
        });
        if (wochenStart > grenze) break;
        continue;
      }
      zeitpunkt = startMs + i * interval * 7 * 86400000;
    } else if (freq === "MONTHLY" || freq === "YEARLY") {
      const n = new Date(startMs);
      if (freq === "MONTHLY") n.setUTCMonth(n.getUTCMonth() + i * interval);
      else n.setUTCFullYear(n.getUTCFullYear() + i * interval);
      zeitpunkt = n.getTime();
    } else {
      return [startMs];
    }

    if (zeitpunkt > grenze) break;
    treffer.push(zeitpunkt);
    if (count && treffer.length >= count) break;
  }

  const sortiert = [...new Set(treffer)].sort((a, b) => a - b);
  return count ? sortiert.slice(0, count) : sortiert;
}

/**
 * Eine ICS-Datei in Termine übersetzen.
 *
 * @param {string} text   Inhalt der Datei
 * @param {object} opts   { vonMs, bisMs } — Zeitfenster, das interessiert
 */
export function leseIcs(text, { vonMs, bisMs } = {}) {
  const zeilen = entfalte(text).split("\n");
  const termine = [];
  let aktuell = null;

  zeilen.forEach((roh) => {
    const zeile = roh.trim();
    if (zeile === "BEGIN:VEVENT") { aktuell = {}; return; }
    if (zeile === "END:VEVENT") {
      if (aktuell?.start) termine.push(aktuell);
      aktuell = null;
      return;
    }
    if (!aktuell) return;

    const teil = zerlegeZeile(zeile);
    if (!teil) return;
    if (teil.name === "SUMMARY") aktuell.titel = entmaskiere(teil.wert);
    else if (teil.name === "UID") aktuell.uid = teil.wert;
    else if (teil.name === "LOCATION") aktuell.ort = entmaskiere(teil.wert);
    else if (teil.name === "STATUS") aktuell.status = teil.wert;
    else if (teil.name === "RRULE") aktuell.rrule = teil.wert;
    else if (teil.name === "DTSTART") aktuell.start = leseZeitpunkt(teil.wert, teil.params);
    else if (teil.name === "DTEND") aktuell.ende = leseZeitpunkt(teil.wert, teil.params);
  });

  const von = vonMs ?? -Infinity;
  const bis = bisMs ?? Infinity;
  const ergebnis = [];

  termine.forEach((t) => {
    // Abgesagte Termine gehören nicht in den Kalender.
    if (String(t.status || "").toUpperCase() === "CANCELLED") return;

    const dauer = t.ende ? Math.max(0, t.ende.ms - t.start.ms) : (t.start.ganztags ? 86400000 : 3600000);
    const starts = t.rrule
      ? loeseWiederholung(t.start.ms, t.rrule, { bisMs: bis })
      : [t.start.ms];

    starts.forEach((ms, i) => {
      if (ms + dauer < von || ms > bis) return;
      ergebnis.push({
        // Bei Wiederholungen braucht jede Ausprägung eine eigene Kennung,
        // sonst überschreiben sie sich beim Speichern gegenseitig.
        uid: t.uid ? (i === 0 && !t.rrule ? t.uid : `${t.uid}-${ms}`) : `ohne-${ms}`,
        titel: t.titel || "Termin",
        ort: t.ort || null,
        beginn: new Date(ms).toISOString(),
        ende: new Date(ms + dauer).toISOString(),
        ganztags: !!t.start.ganztags,
      });
    });
  });

  return ergebnis.sort((a, b) => a.beginn.localeCompare(b.beginn));
}
