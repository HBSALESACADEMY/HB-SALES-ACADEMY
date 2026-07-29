// Setzt den kompletten Marken-Verlauf einer Organisation als CSS-Variablen
// (siehe styles/globals.css: var(--org-color-1/--org-accent/--org-color-3, ...)).
// organizations.primary_color ist die mittlere Verlaufsfarbe (--org-accent,
// historisch so benannt), secondary_color der Anfang, tertiary_color das Ende.
// Fehlt eine Farbe, bleibt der jeweilige Standard-Marken-Ton unverändert.
// Genutzt von components/Layout.js (nach dem Login) und pages/login.js
// (Firmencode-Schritt, vor dem Login).
//
// RGB-Variablen sind bewusst LEERZEICHEN-getrennt (z.B. "232 54 143"), nicht
// komma-getrennt — das ist das Format, das Tailwinds rgb(var(--x) / <alpha>)-
// Opacity-Syntax braucht (siehe tailwind.config.js: amber/violet).

const BRAND_VARS = ["org-color-1", "org-accent", "org-color-3"];

function clearColorVar(varName) {
  document.documentElement.style.removeProperty(`--${varName}`);
  document.documentElement.style.removeProperty(`--${varName}-rgb`);
}

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function setColorVar(varName, hexColor) {
  if (!hexColor) return null;
  const rgb = hexToRgb(hexColor);
  if (!rgb) return null;
  document.documentElement.style.setProperty(`--${varName}`, `#${hexColor.replace("#", "")}`);
  document.documentElement.style.setProperty(`--${varName}-rgb`, `${rgb.r} ${rgb.g} ${rgb.b}`);
  return rgb;
}

// Echte WCAG-Kontrastberechnung statt nur Durchschnittshelligkeit — wichtig,
// weil der Marken-Button ein VERLAUF aus 3 Farben ist: eine reine Durch-
// schnittsbetrachtung übersieht, dass schon EIN heller Punkt im Verlauf
// (z.B. das helle Ende) für weiße Schrift zu wenig Kontrast haben kann,
// auch wenn die anderen beiden Farben dunkel genug wirken.
function srgbToLinear(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrastRatio(lumA, lumB) {
  const lighter = Math.max(lumA, lumB), darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

// Automatischer Kontrast: aus einer Reihe von Hex-Farben (z.B. den 3
// Verlaufsfarben) die Textfarbe (schwarz/weiß) wählen, die den SCHLECHTESTEN
// Punkt im Verlauf am besten lesbar macht — nicht nur den Durchschnitt.
// Exportiert, damit z.B. eine Live-Vorschau im Branding-Editor dieselbe
// Logik nutzen kann, bevor überhaupt gespeichert/angewendet wurde.
export function textColorForColors(hexColors) {
  const rgbColors = (hexColors || []).map(hexToRgb).filter(Boolean);
  if (!rgbColors.length) return "#FFFFFF";
  const lums = rgbColors.map(relativeLuminance);
  const worstWithWhite = Math.min(...lums.map((l) => contrastRatio(l, 1)));
  const worstWithBlack = Math.min(...lums.map((l) => contrastRatio(l, 0)));
  return worstWithBlack > worstWithWhite ? "#12141C" : "#FFFFFF";
}

function setButtonTextVar(rgbColors) {
  if (!rgbColors.length) {
    document.documentElement.style.removeProperty("--org-button-text");
    return;
  }
  document.documentElement.style.setProperty(
    "--org-button-text",
    textColorForColors(rgbColors.map(({ r, g, b }) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`))
  );
}

// Setzt alle Marken-Variablen auf den Standard zurück (entfernt die Inline-
// Overrides komplett, statt sie nur zu überschreiben). Wichtig beim Logout
// oder Organisationswechsel: verhindert, dass eine Farbe, die die NEUE
// Organisation nicht gesetzt hat, unbemerkt von der ALTEN übernommen bleibt.
export function resetOrgBranding() {
  BRAND_VARS.forEach(clearColorVar);
  document.documentElement.style.removeProperty("--org-button-text");
}

export function applyOrgBranding(org) {
  resetOrgBranding();
  if (!org) return;
  const rgbColors = [
    setColorVar("org-color-1", org.secondary_color),
    setColorVar("org-accent", org.primary_color),
    setColorVar("org-color-3", org.tertiary_color),
  ].filter(Boolean);
  setButtonTextVar(rgbColors);
}
