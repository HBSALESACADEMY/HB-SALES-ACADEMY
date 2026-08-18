// Gemeinsame Einwand-Kategorien für Call Tracker UND Einwand-Trainer — ein
// einziges Set pro Organisation statt zwei getrennter Systeme (siehe
// organizations.objection_categories, pages/admin/organization.js).
export const DEFAULT_OBJECTION_CATEGORIES = [
  { key: "preis", label: "Preis & Auslastung" },
  { key: "skepsis", label: "Skepsis & Vertrauen" },
  { key: "vorhanden", label: "Bereits vorhanden" },
  { key: "zeit", label: "Zeit & Aufschub" },
  { key: "entscheidung", label: "Entscheidung" },
  { key: "sonstiges", label: "Sonstiges" },
];

export function resolveObjectionCategories(org) {
  return Array.isArray(org?.objection_categories) && org.objection_categories.length ? org.objection_categories : DEFAULT_OBJECTION_CATEGORIES;
}
