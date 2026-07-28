// Setzt den kompletten Marken-Verlauf einer Organisation als CSS-Variablen
// (siehe styles/globals.css: var(--org-color-1/--org-accent/--org-color-3, ...)).
// organizations.primary_color ist die mittlere Verlaufsfarbe (--org-accent,
// historisch so benannt), secondary_color der Anfang, tertiary_color das Ende.
// Fehlt eine Farbe, bleibt der jeweilige Standard-Marken-Ton unverändert.
// Genutzt von components/Layout.js (nach dem Login) und pages/login.js
// (Firmencode-Schritt, vor dem Login).

const BRAND_VARS = ["org-color-1", "org-accent", "org-color-3"];

function clearColorVar(varName) {
  document.documentElement.style.removeProperty(`--${varName}`);
  document.documentElement.style.removeProperty(`--${varName}-rgb`);
}

function setColorVar(varName, hexColor) {
  if (!hexColor) return;
  const hex = hexColor.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  document.documentElement.style.setProperty(`--${varName}`, `#${hex}`);
  document.documentElement.style.setProperty(`--${varName}-rgb`, `${r},${g},${b}`);
}

// Setzt alle Marken-Variablen auf den Standard zurück (entfernt die Inline-
// Overrides komplett, statt sie nur zu überschreiben). Wichtig beim Logout
// oder Organisationswechsel: verhindert, dass eine Farbe, die die NEUE
// Organisation nicht gesetzt hat, unbemerkt von der ALTEN übernommen bleibt.
export function resetOrgBranding() {
  BRAND_VARS.forEach(clearColorVar);
}

export function applyOrgBranding(org) {
  resetOrgBranding();
  if (!org) return;
  setColorVar("org-color-1", org.secondary_color);
  setColorVar("org-accent", org.primary_color);
  setColorVar("org-color-3", org.tertiary_color);
}
