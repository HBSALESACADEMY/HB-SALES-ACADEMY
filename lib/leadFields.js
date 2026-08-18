// Termin-/Lead-Formular, weißes Label: Name/Telefon/E-Mail/Termin-Datum
// bleiben fest (hängen an Benachrichtigungen und Suche/Sortierung unter
// "Termine"). Alles Weitere ist pro Organisation anpassbar — siehe
// pages/admin/organization.js (Editor) und organizations.lead_field_config.
// Genutzt von pages/call-tracker.js und pages/termine.js.
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

// Pflichtfelder. Name und Termin-Zeitpunkt sind IMMER Pflicht: ohne Namen hat
// der Eintrag keine Bezeichnung in der Liste, ohne Zeitpunkt taucht er im
// Kalender und in den Zeitraum-Filtern nirgends auf. Bei Telefon und E-Mail
// entscheidet die Organisation selbst (migration_81).
export const DEFAULT_CORE_REQUIRED = { phone: true, email: true };

export function resolveCoreRequired(org) {
  const c = org?.lead_core_required;
  if (!c || typeof c !== "object") return DEFAULT_CORE_REQUIRED;
  return { phone: c.phone !== false, email: c.email !== false };
}

// Prüft ein ausgefülltes Formular gegen die Pflicht-Einstellungen und liefert
// die Namen der fehlenden Felder — bewusst als Liste, damit die Meldung nur
// das benennt, was wirklich fehlt.
export function fehlendePflichtfelder({ name, phone, email, appointmentAt, fields, org }) {
  const core = resolveCoreRequired(org);
  const leer = (v) => !v || !String(v).trim();
  const fehlt = [
    leer(name) && "Name",
    core.phone && leer(phone) && "Telefon",
    core.email && leer(email) && "E-Mail",
    leer(appointmentAt) && "Termin (Datum/Uhrzeit)",
  ].filter(Boolean);

  resolveLeadFields(org).forEach((f) => {
    if (!f.required) return;
    const wert = fields?.[f.key];
    // Ein Ja/Nein-Feld als Pflicht heisst: es muss angehakt sein.
    const fehltDieses = f.type === "checkbox" ? !wert : leer(wert);
    if (fehltDieses) fehlt.push(f.label);
  });

  return fehlt;
}
