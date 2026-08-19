// Der Wochenstart — festgenagelt auf Europa/Berlin.
//
// Warum eigens: team_goals.week_start wird im BROWSER geschrieben und auf dem
// SERVER abgefragt. Der naheliegende Weg (Montag 00:00 Ortszeit, dann
// toISOString().slice(0,10)) liefert je nach Zeitzone ein anderes Datum:
// Montag 00:00 in Berlin ist Sonntag 22:00 UTC, das Datum kippt einen Tag
// zurück. Der Browser schrieb dadurch den Sonntag, der Server (Vercel läuft
// in UTC) suchte den Montag — es wurde nie ein Ziel gefunden.
//
// Beide Seiten nutzen deshalb diese Funktionen. Gerechnet wird über UTC-
// Bausteine, damit die Ortszeit des ausführenden Rechners keine Rolle spielt.
const ZONE = "Europe/Berlin";

// Heutiges Datum in Berlin als "JJJJ-MM-TT" (en-CA liefert genau dieses Format).
export function berlinHeute(jetzt = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(jetzt);
}

// Montag der laufenden Woche als "JJJJ-MM-TT".
export function wochenStartTag(jetzt = new Date()) {
  const [j, m, t] = berlinHeute(jetzt).split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  const tag = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + ((tag === 0 ? -6 : 1) - tag));
  return d.toISOString().slice(0, 10);
}

// Wie weit die Berliner Zeit zum gegebenen Zeitpunkt von UTC abweicht, in
// Millisekunden — berücksichtigt Sommer- und Winterzeit.
function versatzMs(zeitpunkt) {
  const teile = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(zeitpunkt).map((p) => [p.type, p.value]));
  // "24" statt "00" kommt bei hour12:false in manchen Umgebungen vor.
  const stunde = teile.hour === "24" ? 0 : Number(teile.hour);
  const alsUtc = Date.UTC(Number(teile.year), Number(teile.month) - 1, Number(teile.day), stunde, Number(teile.minute), Number(teile.second));
  return alsUtc - zeitpunkt.getTime();
}

// Der echte Zeitpunkt, an dem in Berlin die Woche beginnt (Montag 00:00), als
// ISO-Zeichenkette — für Vergleiche mit created_at, das UTC ist.
export function wochenStartZeitpunkt(jetzt = new Date()) {
  const probe = new Date(`${wochenStartTag(jetzt)}T00:00:00Z`);
  return new Date(probe.getTime() - versatzMs(probe)).toISOString();
}
