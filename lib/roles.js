// Zentrale Beschreibung aller Rollen — genutzt überall, wo Rollen angezeigt
// oder vergeben werden (admin.js), damit die Bedeutung jeder Rolle konsistent
// erklärt wird. "Teamleiter" ist bewusst keine eigene Rolle in profiles.role,
// sondern wird aus teams.created_by abgeleitet (wer mindestens ein Team
// gegründet hat) und nur als Info-Badge angezeigt.

export const ROLE_INFO = {
  platform_admin: {
    label: "Administrator",
    description: "Vollzugriff auf alle Organisationen: kann Organisationen erstellen, bearbeiten und löschen, Nutzer jeder Organisation freigeben und Rollen aller Nutzer verwalten.",
  },
  org_manager: {
    label: "Organisations-Manager",
    description: "Verwaltet ausschließlich die eigene Organisation: gibt Nutzer frei oder ab, vergibt Rollen innerhalb der Organisation, verwaltet Logo und Branding.",
  },
  manager: {
    label: "Manager",
    description: "Kann Registrierungen der eigenen Organisation freigeben oder ablehnen.",
  },
  trainer: {
    label: "Trainer",
    description: "Verwaltet Trainingsinhalte der eigenen Organisation (Wissensdatenbank-Vorschläge, individuelle Kurse, Navigation) — ohne Nutzerfreigabe.",
  },
  rep: {
    label: "Standard-Benutzer",
    description: "Normales Mitglied ohne Verwaltungsrechte.",
  },
  team_lead: {
    label: "Teamleiter",
    description: "Hat mindestens ein Team gegründet und leitet es — kein eigenes Freigabe-Recht, unabhängig von der übrigen Rolle.",
  },
};

// Ordnet ein Profil (role, is_admin, is_platform_admin) der treffendsten
// Rollen-Beschreibung zu, für Anzeigezwecke.
export function describeRole(profile) {
  if (!profile) return ROLE_INFO.rep;
  if (profile.is_platform_admin) return ROLE_INFO.platform_admin;
  if (profile.role === "manager" && profile.is_admin) return ROLE_INFO.org_manager;
  if (profile.role === "manager") return ROLE_INFO.manager;
  if (profile.role === "trainer") return ROLE_INFO.trainer;
  return ROLE_INFO.rep;
}
