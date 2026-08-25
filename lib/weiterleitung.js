// Wohin nach dem Anmelden — und warum das geprüft werden muss.
//
// Beim Neuladen einer Seite kann es passieren, dass die Sitzung noch nicht
// wiederhergestellt ist; dann schickt die Academy zur Anmeldung. Ohne
// gemerktes Ziel landet man danach auf der Startseite, also NICHT dort, wo
// man war — bei einem Neuladen mitten in einer Liste ist das ärgerlich.
//
// Das Ziel kommt aus der Adresszeile und ist damit von aussen beeinflussbar.
// Erlaubt sind deshalb nur Adressen INNERHALB der Academy: ein "//fremde.de"
// oder "https://..." würde den Anmelde-Link zu einem Umleiter auf fremde
// Seiten machen — ein bekannter Trick beim Phishing.
export function sicheresZiel(weiter, startseite) {
  const ersatz = startseite || "/";
  if (typeof weiter !== "string" || !weiter) return ersatz;
  if (!weiter.startsWith("/")) return ersatz;
  // "//host" ist eine vollständige Adresse ohne Protokoll.
  if (weiter.startsWith("//")) return ersatz;
  // Auf der Anmeldeseite selbst zu landen wäre eine Schleife.
  if (weiter === "/login" || weiter.startsWith("/login?")) return ersatz;
  // Zeilenumbrüche und Rückwärtsschrägstriche: manche Browser lesen "/\evil"
  // als "//evil".
  if (/[\\\n\r\t]/.test(weiter)) return ersatz;
  return weiter;
}
