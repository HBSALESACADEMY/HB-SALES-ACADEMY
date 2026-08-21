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
