// Wer ist Führungsrolle?
//
// Diese Frage wurde an fünf Stellen einzeln beantwortet — und lief
// auseinander: Ein Manager durfte die Ziele eines Teams serverseitig ändern,
// bekam die Knöpfe dafür aber nicht angezeigt, weil eine andere Stelle
// role='manager' nicht mitzählte. Solche Widersprüche entstehen nicht durch
// Nachlässigkeit, sondern durch die Wiederholung selbst.
//
// "Admin" ist hier immer organisationsbezogen: is_admin bedeutet Admin der
// EIGENEN Organisation. Plattformweite Rechte gibt ausschliesslich
// is_platform_admin, und die Zugriffsregeln prüfen zusätzlich die aktive
// Organisation (siehe migration_92).
//
// Gegenstück in der Datenbank: public.ist_fuehrungsrolle(uid),
// migration_103. Beide müssen dieselben Rollen nennen.
export const FUEHRUNGSROLLEN = ["manager", "backend"];

export function istFuehrungsrolle(profil) {
  if (!profil) return false;
  return FUEHRUNGSROLLEN.includes(profil.role) || !!profil.is_admin || !!profil.is_platform_admin;
}

/**
 * Was diese Person von den Terminen sieht.
 *
 * Diese Frage kostete am 24.09.2026 einen halben Tag: Eine Führungskraft sah
 * die Setting Calls seiner Setterin nicht, und niemand konnte sagen warum —
 * denn nirgends in der Academy stand, was eine Rolle überhaupt sehen darf.
 * Die Antwort lag in einer Zugriffsregel in der Datenbank, also an dem Ort,
 * an dem am wenigsten Menschen nachsehen.
 *
 * Die drei Stufen bilden die Regel "leads_select" aus migration_114 ab.
 * Ändert sich die Regel, muss sich dieser Text mit ändern — ein Text, der
 * etwas anderes verspricht als die Datenbank tut, ist schlimmer als keiner.
 *
 * Nicht genannt, weil es an der Person nicht ablesbar ist: Zu einzelnen
 * Terminen kann man eingeladen werden, und eine Aufgabe oder Erwähnung
 * öffnet den Blick auf den einen Termin, um den es geht.
 */
export function terminSicht(profil) {
  if (!profil) return { umfang: "eigene", text: "Sieht nur eigene Termine" };
  if (istFuehrungsrolle(profil)) {
    return { umfang: "alle", text: "Sieht alle Termine der Organisation" };
  }
  if (profil.is_team_lead) {
    return { umfang: "team", text: "Sieht eigene Termine und die des eigenen Teams" };
  }
  return {
    umfang: "eigene",
    text: "Sieht nur eigene Termine — fremde nur nach Einladung",
  };
}
