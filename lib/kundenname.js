// Was im Namensfeld eines Termins steht.
//
// Anlass: In der Terminliste stand ein Eintrag namens
// "https://meet.google.com/bcn-euvp-ray". Beim Terminieren liegen der
// Buchungslink und das Namensfeld nebeneinander, und ein Link, der in die
// Zwischenablage gehört, landet dann im Feld daneben. In der Liste, im
// Kalender und in jeder Auswertung heisst der Kunde danach so.
//
// Bewusst nur ein Hinweis und keine Sperre: Es ist nicht Aufgabe der
// Software, einem Vertriebler zu erklären, wie sein Kunde heisst. Aber
// beim Tippen zu sagen "das sieht nach einem Link aus" kostet nichts und
// fängt genau den Fall ab, der sonst ein halbes Jahr in der Liste steht.

/** Sieht dieser Name nach einer Internetadresse aus? */
export function wirktWieLink(name) {
  const text = String(name || "").trim().toLowerCase();
  if (!text) return false;
  if (text.includes("://")) return true;
  if (text.startsWith("www.")) return true;
  // "meet.google.com/abc" — ein Punkt-getrenntes Wort mit Schrägstrich.
  // Ohne den Schrägstrich bliebe "Müller & Co. de" hängen.
  return /^[a-z0-9.-]+\.[a-z]{2,}\//.test(text);
}

/** Und sieht er nach einer E-Mail-Adresse aus? Die gehört ins Mailfeld. */
export function wirktWieMail(name) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(name || "").trim());
}

/**
 * Der Hinweis zum Namensfeld — oder null, wenn alles in Ordnung ist.
 * An einer Stelle, damit Call Tracker und Terminliste dasselbe sagen.
 */
export function namensHinweis(name) {
  if (wirktWieLink(name)) return "Das sieht nach einem Link aus. Hier gehört der Name der Person hin — der Termin heisst sonst überall so.";
  if (wirktWieMail(name)) return "Das sieht nach einer E-Mail-Adresse aus. Die gehört ins Feld darunter.";
  return null;
}
