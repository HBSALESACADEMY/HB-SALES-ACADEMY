// Wann eine Aufnahme gelöscht wird.
//
// Eine Frist, die von selbst greift, ist die einzige, die eingehalten wird.
// Alles andere heisst: irgendwann räumt jemand auf, und dieser Jemand ist
// niemand.

// Voreinstellung, wenn eine Organisation nichts anderes festlegt.
// Dreissig Tage, weil Coaching zeitnah passiert oder gar nicht: eine
// Aufnahme wird in der Woche danach besprochen, spätestens im nächsten
// Monatsgespräch. Sieben Tage wären zu knapp für Urlaub und Krankheit,
// neunzig sammeln nur an.
export const STANDARD_FRIST_TAGE = 30;

export function fristTage(org) {
  const wert = org?.aufnahme_frist_tage;
  if (wert === 0) return 0; // ausdrücklich keine Frist
  return Number.isFinite(wert) && wert > 0 ? wert : STANDARD_FRIST_TAGE;
}

/** Wie viele Tage eine Aufnahme noch hat — null, wenn sie bleibt. */
export function verbleibendeTage(aufnahme, org, jetzt = new Date()) {
  const tage = fristTage(org);
  if (!tage || aufnahme?.behalten || aufnahme?.aufnahme_behalten) return null;
  const erstellt = new Date(aufnahme?.created_at || aufnahme?.appointment_at || jetzt);
  if (Number.isNaN(erstellt.getTime())) return null;
  const vergangen = (jetzt.getTime() - erstellt.getTime()) / 86400000;
  return Math.max(0, Math.ceil(tage - vergangen));
}

/** Der Hinweis, der beim Hochladen und an jeder Aufnahme steht. */
export function fristText(org) {
  const tage = fristTage(org);
  if (!tage) return "Aufnahmen bleiben unbegrenzt gespeichert.";
  return `Aufnahmen werden nach ${tage} Tagen automatisch gelöscht.`;
}

/** Ist die Frist dieser Aufnahme abgelaufen? Für den täglichen Lauf. */
export function istAbgelaufen(aufnahme, org, jetzt = new Date()) {
  const rest = verbleibendeTage(aufnahme, org, jetzt);
  return rest !== null && rest <= 0;
}
