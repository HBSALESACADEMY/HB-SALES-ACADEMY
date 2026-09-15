// Zitate für das Lob in der Tagesauswertung.
//
// Nur Sätze, deren Urheber gesichert ist, oder echte Sprichwörter. Die
// meisten "Motivationszitate" im Netz sind falsch zugeordnet — Einstein,
// Churchill und Konfuzius haben das Meiste davon nie gesagt. Steht unter
// dem Lob ein falscher Name, macht das die ganze Nachricht unglaubwürdig.
// Wer ein Zitat ergänzt, prüft die Quelle.
//
// "anlass" sagt, wozu es passt: Ein Zitat über das Dranbleiben unter einem
// neuen Kunden liest sich wie ein Versehen.
export const ZITATE = [
  // Ein Abschluss
  { anlass: "abschluss", text: "Die Tat ist alles, nichts der Ruhm.", von: "Johann Wolfgang von Goethe" },
  { anlass: "abschluss", text: "Es gibt nichts Gutes, außer: Man tut es.", von: "Erich Kästner" },
  { anlass: "abschluss", text: "Wer nicht wagt, der nicht gewinnt.", von: "Sprichwort" },
  { anlass: "abschluss", text: "Ohne Fleiß kein Preis.", von: "Sprichwort" },

  // Platz 1 im Team
  { anlass: "spitze", text: "Genie ist ein Prozent Inspiration und neunundneunzig Prozent Transpiration.", von: "Thomas Edison" },
  { anlass: "spitze", text: "Es wächst der Mensch mit seinen größern Zwecken.", von: "Friedrich Schiller" },
  { anlass: "spitze", text: "Übung macht den Meister.", von: "Sprichwort" },

  // Mehr nachgefasst als am Tag davor
  { anlass: "nachfassen", text: "Man muss das Eisen schmieden, solange es heiß ist.", von: "Sprichwort" },
  { anlass: "nachfassen", text: "Was du heute kannst besorgen, das verschiebe nicht auf morgen.", von: "Sprichwort" },

  // Besser als am Tag davor
  { anlass: "steigerung", text: "Steter Tropfen höhlt den Stein.", von: "nach Ovid" },
  { anlass: "steigerung", text: "Eine Reise von tausend Meilen beginnt mit dem ersten Schritt.", von: "Laozi" },
  { anlass: "steigerung", text: "Es ist nicht genug zu wissen, man muss auch anwenden; es ist nicht genug zu wollen, man muss auch tun.", von: "Johann Wolfgang von Goethe" },

  // Ein ruhigerer Tag
  { anlass: "dranbleiben", text: "Nicht weil es schwer ist, wagen wir es nicht, sondern weil wir es nicht wagen, ist es schwer.", von: "Seneca" },
  { anlass: "dranbleiben", text: "Wo ein Wille ist, ist auch ein Weg.", von: "Sprichwort" },
  // Bewusst nichts, das nach "streng dich mehr an" klingt: An einem
  // ruhigeren Tag soll die Nachricht aufbauen, nicht mahnen.
  { anlass: "dranbleiben", text: "Rom wurde auch nicht an einem Tag erbaut.", von: "Sprichwort" },
];

/**
 * Das Zitat für diesen Anlass an diesem Tag.
 *
 * Nach der Zahl der Tage seit 1970 statt zufällig: Für denselben Tag kommt
 * immer dasselbe (ein zweiter Lauf schickt nichts anderes), und an zwei
 * aufeinanderfolgenden Tagen nie dasselbe.
 */
export function zitatFuer(anlass, tag) {
  const passende = ZITATE.filter((z) => z.anlass === anlass);
  const liste = passende.length ? passende : ZITATE;
  const tagNummer = Math.floor(new Date(`${tag}T00:00:00Z`).getTime() / 86400000);
  const index = Number.isFinite(tagNummer) ? ((tagNummer % liste.length) + liste.length) % liste.length : 0;
  return liste[index];
}

/** Als Zeile für Telegram. Ein Sprichwort hat keinen Urheber, es steht nur dabei, was es ist. */
export function zitatZeile(zitat) {
  if (!zitat) return "";
  return `💬 „${zitat.text}“ — ${zitat.von}`;
}
