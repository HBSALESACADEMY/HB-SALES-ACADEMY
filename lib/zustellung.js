// Was der Mailversand über eine verschickte Mail zurückmeldet.
//
// Die Namen der Ereignisse kommen vom Dienst, die Bedeutung für die Academy
// steht hier — an einer Stelle, damit die Empfangsroute nur zuordnen muss
// und nicht auch noch entscheiden.

// Welches Ereignis welchen Zustand bedeutet. Alles, was hier nicht steht
// (etwa "geöffnet"), wird bewusst ignoriert: Öffnungsraten sind ungenau,
// und eine Zahl, der man nicht trauen kann, ist schlimmer als keine.
export const EREIGNISSE = {
  "email.sent": "angenommen",
  "email.delivered": "zugestellt",
  "email.bounced": "unzustellbar",
  "email.complained": "beschwerde",
};

export const ZUSTELLUNG_LABELS = {
  angenommen: "Angenommen",
  zugestellt: "Zugestellt",
  unzustellbar: "Adresse unzustellbar",
  beschwerde: "Als Spam gemeldet",
};

export function zustandFuer(ereignis) {
  return EREIGNISSE[ereignis] || null;
}

/**
 * Eine unzustellbare Adresse braucht kein Nachfassen, sondern eine
 * Korrektur. Wer das nicht trennt, telefoniert einer toten Adresse
 * hinterher.
 */
export function istGescheitert(zustellung) {
  return zustellung === "unzustellbar" || zustellung === "beschwerde";
}

/**
 * Nach einer Beschwerde wird an diese Adresse nichts mehr geschickt.
 * Das ist keine Höflichkeit — es ist die Bedingung dafür, dass die eigene
 * Domain zustellbar bleibt.
 */
export function darfNochSenden(kontakt) {
  return kontakt?.zustellung !== "beschwerde";
}
