// Der Impuls am Morgen — der Teil der Tagesauswertung, in dem es nicht um
// Zahlen geht.
//
// Die Zahlen sagen, was war. Sie sagen nichts darüber, wie jemand in den
// Tag geht, und genau das entscheidet am Telefon mit. Deshalb steht unter
// der Auswertung ein Impuls: ein Gedanke und eine konkrete Sache für
// heute.
//
// Drei Regeln, die den Ton halten:
//   1. Alles fest formuliert, nichts von einer KI erzeugt. Die Nachricht
//      geht jeden Morgen an echte Menschen — da darf nicht durch Zufall
//      ein schiefer Satz herauskommen.
//   2. Kein Gesundheits- oder Seelenratschlag. Ein Impuls über Pausen,
//      Ordnung und Menschen ist in Ordnung; alles, was nach Diagnose oder
//      Therapie klingt, gehört hier nicht hin.
//   3. Kein erhobener Zeigefinger, vor allem nicht nach einem schwachen
//      Tag. Wer ohnehin schon hängt, braucht keinen Antreiber.
//
// "lage" sagt, wann ein Impuls passt:
//   stark   — es lief (neuer Kunde oder Platz 1 im Team)
//   schwach — nichts war besser als am Tag davor
//   montag  — Wochenstart
//   freitag — Wochenende vor der Tür
//   immer   — ein normaler Tag
export const IMPULSE = [
  // ── Ein normaler Tag ──────────────────────────────────────────────
  {
    lage: "immer", thema: "Umfeld",
    titel: "Dein Schreibtisch redet mit.",
    gedanke: "Du sitzt heute mehrere Stunden an derselben Stelle. Wie die aussieht, entscheidet mit, wie du in die Gespräche gehst — ein voller Tisch ist ein voller Kopf.",
    heute: "Bevor du die erste Nummer wählst: alles vom Tisch, was nicht zum Telefonieren gehört. Liste, Ziel, Wasser. Sonst nichts.",
  },
  {
    lage: "immer", thema: "Körper",
    titel: "Stehen hört man.",
    gedanke: "Am Telefon sieht dich niemand, aber man hört alles: die Schultern, den Atem, ob du zusammengesunken sitzt. Aufrecht klingt nicht lauter, sondern sicherer.",
    heute: "Führe die nächsten fünf Gespräche im Stehen und achte darauf, was sich in deiner Stimme ändert.",
  },
  {
    lage: "immer", thema: "Kopf",
    titel: "Der erste Satz gehört dir.",
    gedanke: "Den Anfang eines Gesprächs bestimmst du allein, alles danach ist Reaktion. Wer seinen Einstieg auswendig kann, kommt ruhiger in den Rest.",
    heute: "Sprich deinen Einstieg dreimal laut aus, bevor du wählst. Laut, nicht im Kopf.",
  },
  {
    lage: "immer", thema: "Menschen",
    titel: "Am anderen Ende sitzt ein Mensch mit einem Tag.",
    gedanke: "Die Person, die du anrufst, hatte vor dir schon acht andere Dinge. Ein Nein um elf ist oft nur ein „nicht jetzt“. Das zu trennen, nimmt dem Nein das Gewicht — und dir bleibt der freundliche Ton für den nächsten Anruf.",
    heute: "Frag heute einmal mehr als sonst, wie es gerade passt. Du wirst sehen, wie oft das ein Gespräch öffnet.",
  },
  {
    lage: "immer", thema: "Ordnung",
    titel: "Zwischen zwei Anrufen ist kein Platz zum Suchen.",
    gedanke: "Wer die Liste vorher hat, telefoniert. Wer sie zwischendurch baut, sucht — und aus jedem Suchen werden schnell zehn Minuten.",
    heute: "Leg dir vor dem ersten Block die nächsten zwanzig Nummern zurecht. Erst dann anfangen.",
  },
  {
    lage: "immer", thema: "Kopf",
    titel: "Gute Laune ist Handwerk.",
    gedanke: "Man hört in den ersten drei Sekunden, ob jemand gern telefoniert. Das ist keine Charakterfrage, sondern eine der Vorbereitung: Musik, die dich hochzieht, ein Kaffee, ein Ziel, das du dir selbst gesetzt hast.",
    heute: "Setz dir etwas, auf das du dich freust, wenn der Block sitzt. Erst der Block, dann die Belohnung.",
  },
  {
    lage: "immer", thema: "Umfeld",
    titel: "Du wirst wie die, mit denen du telefonierst.",
    gedanke: "Stimmung ist ansteckend, in beide Richtungen. Wer den Vormittag neben jemandem sitzt, der jeden Anruf kommentiert, hat am Mittag dieselbe Laune.",
    heute: "Setz dich für einen Block neben die Person im Team, bei der es gerade läuft. Nur zuhören reicht schon.",
  },

  // ── Es lief ───────────────────────────────────────────────────────
  {
    lage: "stark", thema: "Menschen",
    titel: "Erfolg hat einen Absender.",
    gedanke: "Der Tag war gut, und das lag nicht nur an dir. Irgendwer hat dir eine Nummer besorgt, ein Gespräch abgenommen oder den Tipp gegeben, der gezogen hat.",
    heute: "Sag einer Person im Team in einem Satz, was sie dazu beigetragen hat. Konkret, nicht „danke für alles“.",
  },
  {
    lage: "stark", thema: "Kopf",
    titel: "Schreib auf, was funktioniert hat.",
    gedanke: "Nach einem starken Tag weiß man noch genau, welcher Satz gezogen hat. Eine Woche später nicht mehr. Erfolg wiederholbar machen heißt, ihn festzuhalten, solange er frisch ist.",
    heute: "Notiere den einen Satz, der zuletzt gezogen hat — und benutze ihn heute bewusst wieder.",
  },
  {
    lage: "stark", thema: "Umfeld",
    titel: "Weitergeben kostet dich nichts.",
    gedanke: "Wer vorne liegt, kann es für sich behalten oder teilen. Das eine bringt einen Tag Vorsprung, das andere ein Team, das dich trägt, wenn du mal nicht vorne liegst.",
    heute: "Erzähl in der Runde, was du anders gemacht hast. Zwei Sätze reichen.",
  },
  {
    lage: "stark", thema: "Körper",
    titel: "Nach dem guten Tag kommt der Tag danach.",
    gedanke: "Ein starker Tag zieht Energie. Wer danach einfach weiter Vollgas gibt, kippt irgendwann mitten in einer guten Woche. Erhol dich, solange es läuft — nicht erst, wenn du musst.",
    heute: "Plan eine echte Pause ein, ohne Handy. Fünfzehn Minuten genügen.",
  },

  // ── Ein zäher Tag ─────────────────────────────────────────────────
  {
    lage: "schwach", thema: "Kopf",
    titel: "Ein Nein ist kein Urteil.",
    gedanke: "Ein Nein sagt etwas über den Zeitpunkt, das Budget oder den Tag des anderen — fast nie über dich. Wer das trennt, klingt auch beim zehnten Anruf noch freundlich.",
    heute: "Nach dem nächsten Nein: einmal durchatmen, Hörer wieder hoch. Ohne die Runde im Kopf noch einmal zu drehen.",
  },
  {
    lage: "schwach", thema: "Ordnung",
    titel: "Kleiner anfangen ist erlaubt.",
    gedanke: "An manchen Tagen steht die große Zahl im Weg. Dann ist die Frage nicht, wie du achtzig schaffst, sondern wie du in die ersten fünf kommst. Bewegung ist leichter als Anfangen.",
    heute: "Nimm dir nur die ersten zehn Anwahlen vor. Danach entscheidest du neu.",
  },
  {
    lage: "schwach", thema: "Menschen",
    titel: "Allein fühlt sich eine zähe Woche doppelt so lang an.",
    gedanke: "Im Team hat jeder solche Wochen gehabt. Die meisten erzählen es nur nicht, und deshalb hält jeder seine für die Ausnahme.",
    heute: "Sprich eine Person an, der du zutraust, dass sie das kennt. Zehn Minuten, kein großes Thema.",
  },
  {
    lage: "schwach", thema: "Umfeld",
    titel: "Manchmal liegt es am Platz, nicht am Skript.",
    gedanke: "Der Kopf verbindet Orte mit Stimmungen. Wenn es an derselben Stelle seit Tagen nicht läuft, hilft ein anderer Raum mehr als der zehnte neue Einstieg.",
    heute: "Mach den nächsten Block an einem anderen Platz als gestern. Fenster auf.",
  },

  // ── Montag ────────────────────────────────────────────────────────
  {
    lage: "montag", thema: "Ordnung",
    titel: "Der Montag gibt die Woche vor.",
    gedanke: "Nicht weil er magisch ist, sondern weil er die Liste vorgibt, von der du den Rest der Woche abarbeitest.",
    heute: "Schreib die drei Sachen auf, die diese Woche wirklich passieren müssen. Nur drei.",
  },
  {
    lage: "montag", thema: "Kopf",
    titel: "Erst telefonieren, dann aufräumen.",
    gedanke: "Montags ist die Versuchung groß, zuerst das Postfach zu sortieren. Das fühlt sich nach Arbeit an und ist keine. Die ersten Stunden sind die, in denen die anderen am besten erreichbar sind.",
    heute: "Der erste Block heute ist ein Telefonblock. Mails danach.",
  },
  {
    lage: "montag", thema: "Umfeld",
    titel: "Sauber starten.",
    gedanke: "Eine Woche auf dem Chaos der letzten zu beginnen, kostet jeden Tag ein bisschen Kraft. Zehn Minuten am Montagmorgen sparen das.",
    heute: "Zehn Minuten aufräumen: Tisch, Ablage, offene Fenster. Dann anfangen.",
  },

  // ── Freitag ───────────────────────────────────────────────────────
  {
    lage: "freitag", thema: "Körper",
    titel: "Der Freitag darf enden.",
    gedanke: "Wer nie abschaltet, ist montags nicht ausgeruht, sondern nur weniger müde. Abschalten ist der Teil der Arbeit, den man nicht sieht.",
    heute: "Leg jetzt fest, wann heute Schluss ist — und halte es. Auch wenn noch etwas offen bleibt.",
  },
  {
    lage: "freitag", thema: "Kopf",
    titel: "Fünf Minuten Rückblick sparen eine Stunde Suchen.",
    gedanke: "Heute weißt du noch, was diese Woche gelaufen ist. Am Montag musst du es zusammensuchen.",
    heute: "Schreib zwei Zeilen: Was hat diese Woche funktioniert, was nimmst du nicht mit?",
  },
  {
    lage: "freitag", thema: "Menschen",
    titel: "Das Wochenende gehört den Menschen.",
    gedanke: "Das Geschäft läuft über Menschen, dein Leben auch. Die, die zu Hause warten, haben die Woche mitgetragen, ohne dass es in einer Statistik steht.",
    heute: "Sag heute jemandem außerhalb der Arbeit, dass du froh bist, dass er da ist.",
  },
];

const WOCHENTAGE_ZAHL = { montag: 1, freitag: 5 };

/**
 * Welche Lage heute passt.
 *
 * Die Reihenfolge ist Absicht. Ein neuer Kunde oder Platz 1 schlägt alles:
 * An dem Morgen geht es um das Weitergeben, nicht darum, dass Montag ist.
 * Ein zäher Tag kommt als zweites — wer hängt, braucht keinen
 * Wochenstart-Antreiber, und der Montags-Impuls würde genau so klingen.
 *
 * @param heuteTag  Der heutige Tag (YYYY-MM-DD) — nicht der Berichtstag.
 *                  Am Montag wird der Freitag ausgewertet, aber der Impuls
 *                  gilt für den Tag, der jetzt anfängt.
 */
export function impulsLage({ heute = {}, vorher = {}, bestwerte = [], heuteTag = "", kennzahlen = [] } = {}) {
  if ((Number(heute.kunden) || 0) > 0 || bestwerte.length) return "stark";
  const keys = kennzahlen.length ? kennzahlen : Object.keys(heute);
  const etwasBesser = keys.some((k) => (Number(heute[k]) || 0) > (Number(vorher[k]) || 0));
  if (!etwasBesser) return "schwach";
  const wochentag = new Date(`${heuteTag}T00:00:00Z`).getUTCDay();
  if (wochentag === WOCHENTAGE_ZAHL.montag) return "montag";
  if (wochentag === WOCHENTAGE_ZAHL.freitag) return "freitag";
  return "immer";
}

/**
 * Der Impuls für diese Lage an diesem Tag.
 *
 * Nach der Zahl der Tage seit 1970 statt zufällig — wie beim Zitat: Für
 * denselben Tag kommt immer dasselbe, an zwei aufeinanderfolgenden Tagen
 * nie dasselbe.
 */
export function impulsFuer(lage, tag) {
  const passende = IMPULSE.filter((i) => i.lage === lage);
  const liste = passende.length ? passende : IMPULSE.filter((i) => i.lage === "immer");
  const tagNummer = Math.floor(new Date(`${tag}T00:00:00Z`).getTime() / 86400000);
  const index = Number.isFinite(tagNummer) ? ((tagNummer % liste.length) + liste.length) % liste.length : 0;
  return liste[index];
}

/** Der Impuls als Zeilen für Telegram — Überschrift, Gedanke, eine Sache für heute. */
export function impulsZeilen(impuls) {
  if (!impuls) return [];
  return ["🌱 Für den Kopf", impuls.titel, impuls.gedanke, `→ Heute: ${impuls.heute}`];
}
