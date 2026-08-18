// Termin-/Lead-Formular, weißes Label: Name/Telefon/E-Mail/Termin-Datum
// bleiben fest (hängen an Benachrichtigungen und Suche/Sortierung unter
// "Termine"). Alles Weitere ist pro Organisation anpassbar — siehe
// pages/admin/organization.js (Editor) und organizations.lead_field_config.
// Muss inhaltlich mit dem DEFAULT_LEAD_FIELDS-Block in
// public/tools/call-tracker.html übereinstimmen (eigenständiges HTML, kann
// dieses Modul nicht importieren).
export const DEFAULT_LEAD_FIELDS = [
  { key: "company", label: "Unternehmen", type: "text" },
  { key: "website", label: "Aktuelle Webseite", type: "text" },
  { key: "is_decision_maker", label: "Ist Entscheider", type: "checkbox" },
  { key: "notes", label: "Notiz", type: "text", multiline: true },
];

// Diese vier Schlüssel sind reserviert: sie schreiben weiterhin in die
// gleichnamige Spalte der leads-Tabelle statt in custom_fields, damit
// bestehende Daten unverändert nutzbar bleiben, auch wenn eine Organisation
// das Feld umbenennt oder aus ihrem Formular entfernt.
export const RESERVED_FIELD_COLUMNS = { company: "company", website: "website", is_decision_maker: "is_decision_maker", notes: "notes" };

export function resolveLeadFields(org) {
  return Array.isArray(org?.lead_field_config) && org.lead_field_config.length ? org.lead_field_config : DEFAULT_LEAD_FIELDS;
}

// Aktuellen Wert eines Feldes aus einem Lead-Datensatz lesen — reservierte
// Schlüssel kommen aus der echten Spalte, alles andere aus custom_fields.
export function getLeadFieldValue(lead, field) {
  const column = RESERVED_FIELD_COLUMNS[field.key];
  if (column) return lead?.[column];
  return lead?.custom_fields ? lead.custom_fields[field.key] : undefined;
}
