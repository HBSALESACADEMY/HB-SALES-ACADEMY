// Welcher Buchungslink beim Terminieren gilt — und ob er brauchbar ist.
//
// Zwei Ebenen: die Organisation hinterlegt einen gemeinsamen Kalender,
// einzelne Vertriebler haben oft ihren eigenen. Der persönliche gewinnt,
// denn gebucht wird in SEINEN Kalender.
//
// Geprüft wird der Link, weil er im Gespräch angeklickt wird: ein Tippfehler
// ("cal.com/max" ohne Protokoll) führt sonst ins Leere, und zwar genau in
// dem Moment, in dem jemand am Telefon wartet.
export function buchungslink(profil, org) {
  return normalisiere(profil?.booking_url) || normalisiere(org?.booking_url) || null;
}

export function normalisiere(roh) {
  const text = String(roh || "").trim();
  if (!text) return null;
  // Ohne Protokoll deutet der Browser die Adresse als Unterseite der Academy.
  const mitProtokoll = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(mitProtokoll);
    // Nur Web-Adressen: "javascript:" oder "data:" hätten hier nichts zu
    // suchen, sie werden aus einem Eingabefeld angeklickt.
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch (e) {
    return null;
  }
}

// Für die Anzeige: "cal.com/houman" statt der vollen Adresse mit https.
export function kurzform(link) {
  const url = normalisiere(link);
  if (!url) return "";
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
