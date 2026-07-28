// Setzt die Organisations-Akzentfarbe als CSS-Variablen (siehe styles/globals.css:
// var(--org-accent, ...) / rgba(var(--org-accent-rgb, ...))). Ohne gültige Farbe
// bleibt der Standard-Marken-Ton unverändert. Genutzt von components/Layout.js
// (nach dem Login) und pages/login.js (Firmencode-Schritt, vor dem Login).
export function applyOrgBranding(org) {
  if (!org?.primary_color) return;
  const hex = org.primary_color.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  document.documentElement.style.setProperty("--org-accent", `#${hex}`);
  document.documentElement.style.setProperty("--org-accent-rgb", `${r},${g},${b}`);
}
