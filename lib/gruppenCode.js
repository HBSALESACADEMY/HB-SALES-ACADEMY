import { createHash } from "crypto";

// Der Nachweis, dass eine Telegram-Gruppe zu DIESER Organisation gehört.
//
// Das Problem: Ein Bot bedient alle Organisationen dieser Academy, und
// Telegram gibt über getUpdates alles heraus, was der Bot zuletzt gesehen
// hat — auch die Gruppen anderer Kunden. Ohne Nachweis sähe die Leitung
// von Firma A die Gruppennamen und Kennungen von Firma B und könnte eine
// fremde Kennung in ihr eigenes Feld eintragen. Dann gingen die Meldungen
// von A in die Telegram-Gruppe von B.
//
// Der Nachweis ist ein Code, den nur diese Organisation kennt und der in
// der Gruppe geschrieben werden muss. Wer ihn dort hineinschreiben kann,
// ist in der Gruppe — mehr muss der Nachweis nicht leisten.
//
// Abgeleitet statt gespeichert: keine Spalte, keine Migration, und der
// Code ist über die Zeit stabil. Mit einem Geheimnis des Servers
// vermischt, damit er sich nicht aus der Organisations-Kennung ausrechnen
// lässt, die in mancher Adresszeile steht.
export function gruppenCode(orgId, geheimnis = process.env.SUPABASE_SERVICE_ROLE_KEY || "") {
  if (!orgId) return null;
  const roh = createHash("sha256").update(`telegram-gruppe:${orgId}:${geheimnis}`).digest("hex");
  // Nur Grossbuchstaben und Ziffern: der Code wird abgetippt, und ein
  // kleines l neben einer 1 kostet mehr Zeit als die vier Zeichen bringen.
  return `HB-${roh.slice(0, 6).toUpperCase()}`;
}

/** Steht der Code in diesem Text? Gross- und Kleinschreibung egal. */
export function codePasst(text, code) {
  if (!code) return false;
  return String(text || "").toUpperCase().includes(code.toUpperCase());
}
