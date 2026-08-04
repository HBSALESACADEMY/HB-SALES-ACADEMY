// Für Plattform-Admins: die Organisation, deren Firmencode sie zuletzt auf
// der Login-Seite eingegeben haben (session-gebunden), NICHT zwingend ihre
// eigene Heimat-Organisation. Für alle anderen Konten: immer die eigene,
// echte organization_id.
//
// Zentral hier, damit "welche Organisation ist gerade aktiv" überall exakt
// gleich berechnet wird — unterschiedliche Berechnungen an verschiedenen
// Stellen führten dazu, dass von Plattform-Admins per Firmencode angelegte
// Ordner/Kurse fälschlich der eigenen Heimat-Organisation des Plattform-
// Admins zugeordnet wurden statt der gerade aktiven (siehe migration_53).
export function getActiveOrgId(profile) {
  if (!profile) return null;
  if (profile.is_platform_admin) {
    return sessionStorage.getItem("hb_active_org_id") || profile.organization_id || null;
  }
  return profile.organization_id || null;
}
