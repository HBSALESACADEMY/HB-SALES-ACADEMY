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

// Hinterlegt die gewählte Organisation zusätzlich SERVERSEITIG (Tabelle
// active_org, migration_92). Der sessionStorage-Eintrag oben reicht nicht:
// die Zugriffsregeln der Datenbank laufen im Server und sehen den Browser
// nicht — ohne diesen Eintrag könnten sie einen Plattform-Admin nicht auf
// eine Organisation begrenzen.
//
// Fehler werden bewusst nur protokolliert: schlägt es fehl, bleibt die
// Sichtbarkeit auf dem Stand von vorher, aber die Anmeldung soll deshalb
// nicht scheitern.
export async function merkeAktiveOrg(supabase, userId, organizationId) {
  if (!userId) return;
  try {
    if (organizationId) {
      await supabase.from("active_org").upsert({ user_id: userId, organization_id: organizationId, gesetzt_at: new Date().toISOString() });
    } else {
      await supabase.from("active_org").delete().eq("user_id", userId);
    }
  } catch (e) {
    console.error("Aktive Organisation konnte nicht hinterlegt werden:", e.message);
  }
}
