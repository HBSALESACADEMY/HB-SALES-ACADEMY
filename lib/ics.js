// Termine an den eigenen Kalender übergeben — als .ics-Datei.
//
// Kein Paket nötig: iCalendar ist ein Zeilenformat. Apple Kalender, Google
// Kalender, Outlook und Thunderbird lesen alle dieselbe Datei, deshalb
// braucht es keine Anbindung an einen einzelnen Anbieter und keine
// Anmeldung bei Dritten.
//
// Zeiten stehen in UTC (Suffix Z). Das ist keine Vereinfachung, sondern die
// verlässlichste Form: der Kalender der empfangenden Person rechnet selbst
// in ihre Zeitzone um — so steht der Termin auch im Ausland richtig da
// (siehe lib/terminzeit.js für dieselbe Frage in der Academy).

// Sonderzeichen, die im Format eine Bedeutung haben. Der Backslash muss
// zuerst ersetzt werden, sonst verdoppelt er die danach eingefügten.
function maskiere(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Zeilen dürfen höchstens 75 Zeichen lang sein; längere werden umgebrochen
// und mit einem führenden Leerzeichen fortgesetzt. Ohne das lehnen manche
// Kalender die Datei stillschweigend ab.
function falte(zeile) {
  if (zeile.length <= 75) return zeile;
  const teile = [zeile.slice(0, 75)];
  let rest = zeile.slice(75);
  while (rest.length > 74) {
    teile.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) teile.push(" " + rest);
  return teile.join("\r\n");
}

export function icsZeitpunkt(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function icsDatum(tag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tag || ""))) return null;
  return String(tag).replace(/-/g, "");
}

// Einen Tag weiter — ganztägige Termine enden im Format am Folgetag.
function tagDanach(tag) {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// termin: { uid, titel, beschreibung, ort, start, dauerMinuten } für einen
// Zeitpunkt — oder { uid, titel, tagVon, tagBis } für einen ganzen Tag.
export function baueIcs(termin) {
  const jetzt = icsZeitpunkt(new Date());
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HB Sales Academy//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${maskiere(termin.uid || `${Date.now()}@hb-sales-academy.de`)}`,
    `DTSTAMP:${jetzt}`,
    `SUMMARY:${maskiere(termin.titel || "Termin")}`,
  ];

  if (termin.start) {
    const start = icsZeitpunkt(termin.start);
    if (!start) return null;
    const dauer = Number(termin.dauerMinuten) > 0 ? Number(termin.dauerMinuten) : 60;
    const ende = icsZeitpunkt(new Date(new Date(termin.start).getTime() + dauer * 60000));
    zeilen.push(`DTSTART:${start}`, `DTEND:${ende}`);
  } else {
    const von = icsDatum(termin.tagVon);
    if (!von) return null;
    // DTEND ist bei ganztägigen Terminen der erste Tag DANACH.
    const bis = icsDatum(tagDanach(termin.tagBis || termin.tagVon));
    zeilen.push(`DTSTART;VALUE=DATE:${von}`, `DTEND;VALUE=DATE:${bis}`);
  }

  if (termin.beschreibung) zeilen.push(`DESCRIPTION:${maskiere(termin.beschreibung)}`);
  if (termin.ort) zeilen.push(`LOCATION:${maskiere(termin.ort)}`);
  zeilen.push("END:VEVENT", "END:VCALENDAR");

  return zeilen.map(falte).join("\r\n") + "\r\n";
}

// Dateiname ohne Sonderzeichen: manche Systeme stolpern sonst beim Speichern.
export function icsDateiname(titel) {
  const sauber = String(titel || "Termin").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `${sauber || "Termin"}.ics`;
}

export function ladeIcsHerunter(termin) {
  const inhalt = baueIcs(termin);
  if (!inhalt) return false;
  const blob = new Blob([inhalt], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = icsDateiname(termin.titel);
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
