// Gemeinsame Datums-Bereiche (Tag / Woche / Monat). Lagen vorher nur im
// Call Tracker; werden jetzt auch von den Termine-Filtern und dem Kalender
// gebraucht, deshalb hier zentral — damit "Woche" überall dasselbe bedeutet.
//
// Wochenbeginn ist Montag (deutsche Konvention), nicht Sonntag.

export function startOfDay(d) { const s = new Date(d); s.setHours(0, 0, 0, 0); return s; }
export function endOfDay(d) { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; }

export function startOfWeek(d) {
  const day = (d.getDay() + 6) % 7; // Montag = 0
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() - day);
  return monday;
}
export function endOfWeek(d) {
  const sunday = new Date(startOfWeek(d));
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

export function startOfMonth(d) { const s = new Date(d.getFullYear(), d.getMonth(), 1); s.setHours(0, 0, 0, 0); return s; }
export function endOfMonth(d) { const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); e.setHours(23, 59, 59, 999); return e; }

// Liefert Anfang und Ende für einen Zeitraum-Schlüssel; "alle" = unbegrenzt.
export function bereichFuer(schluessel, jetzt = new Date()) {
  if (schluessel === "tag") return [startOfDay(jetzt), endOfDay(jetzt)];
  if (schluessel === "woche") return [startOfWeek(jetzt), endOfWeek(jetzt)];
  if (schluessel === "monat") return [startOfMonth(jetzt), endOfMonth(jetzt)];
  return [null, null];
}

export function istGleicherTag(a, b) {
  if (!a || !b) return false;
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

// Alle Tage, die ein Monatsraster füllen: vom Montag vor dem Monatsanfang
// bis zum Sonntag nach dem Monatsende. Ergibt immer volle Wochen-Zeilen.
export function monatsRaster(monat) {
  const von = startOfWeek(startOfMonth(monat));
  const bis = endOfWeek(endOfMonth(monat));
  const tage = [];
  for (const d = new Date(von); d <= bis; d.setDate(d.getDate() + 1)) tage.push(new Date(d));
  return tage;
}
