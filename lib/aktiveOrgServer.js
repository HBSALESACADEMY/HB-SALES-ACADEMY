// Die aktive Organisation auf dem Server — das Gegenstück zu
// lib/activeOrg.js im Browser.
//
// Nötig, weil die Verwaltungs-Routen mit erweiterten Rechten arbeiten
// (Service-Role) und damit sämtliche Zugriffsregeln umgehen. Die Trennung
// aus migration_92 wirkt dort NICHT von selbst: sie muss in der Abfrage
// stehen. Genau daran lag es, dass ein Plattform-Admin in der Nutzerliste
// weiterhin alle Organisationen sah.
//
// Der Wert kommt aus der Tabelle active_org (beim Anmelden gesetzt), nicht
// vom Client — sonst könnte man ihn in der Anfrage einfach überschreiben.
export async function aktiveOrgId(admin, profil, userId) {
  if (!profil) return null;
  if (!profil.is_platform_admin) return profil.organization_id || null;
  const { data } = await admin.from("active_org").select("organization_id").eq("user_id", userId).maybeSingle();
  return data?.organization_id || profil.organization_id || null;
}
