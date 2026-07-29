// Zentrales Organisations-Theme: setzt ALLE Marken-/Oberflächen-Farben einer
// Organisation als CSS-Variablen (siehe styles/globals.css und
// tailwind.config.js). Jede Seite/Komponente im Projekt liest ausschließlich
// diese Variablen (über CSS var() oder die entsprechenden Tailwind-Klassen
// bg-bg/bg-surface/border-line/text-textMain/text-textMuted/text-amber/
// text-violet) — es gibt keine Stelle mehr, die "ihre eigene" Organisations-
// Farbe lädt. Fehlt ein Wert bei einer Organisation, bleibt der jeweilige
// HB-Sales-Academy-Standardton unverändert (Fallback direkt im var()-Aufruf
// an jeder Nutzungsstelle).
//
// Genutzt von components/Layout.js (nach dem Login) und pages/login.js
// (Firmencode-Schritt, vor dem Login).
//
// RGB-Variablen sind bewusst LEERZEICHEN-getrennt (z.B. "232 54 143"), nicht
// komma-getrennt — das ist das Format, das Tailwinds rgb(var(--x) / <alpha>)-
// Opacity-Syntax braucht.

const BRAND_VARS = [
  "org-color-1", "org-accent", "org-color-3",
  "org-bg", "org-surface", "org-surface-raised", "org-line",
  "org-text", "org-text-muted", "org-sidebar-tint",
];

function clearColorVar(varName) {
  document.documentElement.style.removeProperty(`--${varName}`);
  document.documentElement.style.removeProperty(`--${varName}-rgb`);
}

export function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
}

// Mischt zwei Hex-Farben (t=0 → hexA, t=1 → hexB). Für "angehoben" wirkende
// Kartenflächen (Richtung Weiß) und gedämpfte Textfarben (Richtung Hintergrund).
// Exportiert, damit z.B. die Live-Vorschau im Branding-Editor dieselbe
// Logik für den gedämpften Text-Ton nutzen kann.
export function blend(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  return toHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
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
// weil der Marken-Button (und Verläufe generell) aus MEHREREN Farben
// bestehen: eine reine Durchschnittsbetrachtung übersieht, dass schon EIN
// heller Punkt im Verlauf für weiße Schrift zu wenig Kontrast haben kann.
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
// Verlaufsfarben, oder einer einzelnen Hintergrundfarbe) die Textfarbe
// (schwarz/weiß) wählen, die den SCHLECHTESTEN Punkt am besten lesbar
// macht. Exportiert, damit z.B. die Live-Vorschau im Branding-Editor
// dieselbe Logik nutzen kann, bevor überhaupt gespeichert wurde.
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
    textColorForColors(rgbColors.map(({ r, g, b }) => toHex({ r, g, b })))
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

  // Verlauf/Buttons (bestehend).
  const gradientRgb = [
    setColorVar("org-color-1", org.secondary_color),
    setColorVar("org-accent", org.primary_color),
    setColorVar("org-color-3", org.tertiary_color),
  ].filter(Boolean);
  setButtonTextVar(gradientRgb);

  // Abgedunkelte Variante der Sekundärfarbe für den Sidebar-Verlauf — die
  // Sidebar soll das Branding erkennbar aufnehmen, aber als dunkle Fläche
  // bestehen bleiben (nicht die volle, helle Akzentfarbe als Hintergrund).
  const sidebarBase = org.secondary_color || org.primary_color;
  if (sidebarBase) setColorVar("org-sidebar-tint", blend(sidebarBase, "#0A0C13", 0.72));

  // Oberfläche/Hintergrund/Rahmen.
  setColorVar("org-bg", org.background_color);
  setColorVar("org-line", org.border_color);
  setColorVar("org-surface", org.surface_color);
  if (org.surface_color) {
    // "Angehobene" Fläche (Sidebar-Hover, Karten-Verlaufsende) — leicht
    // Richtung Weiß gemischt, unabhängig vom gewählten Farbton.
    setColorVar("org-surface-raised", blend(org.surface_color, "#FFFFFF", 0.08));
  }

  // Text/gedämpfter Text: expliziter Wert hat immer Vorrang (volle Kontrolle
  // für die Organisation). Ohne expliziten Wert wird — sobald ein eigener
  // Hintergrund/eine eigene Fläche gesetzt ist — automatisch eine gut
  // lesbare Farbe berechnet, damit das Branding nie unlesbar werden kann.
  const contrastBasis = org.surface_color || org.background_color;
  if (org.text_color) {
    setColorVar("org-text", org.text_color);
  } else if (contrastBasis) {
    setColorVar("org-text", textColorForColors([contrastBasis]));
  }
  if (org.muted_color) {
    setColorVar("org-text-muted", org.muted_color);
  } else if (contrastBasis) {
    const autoText = textColorForColors([contrastBasis]);
    setColorVar("org-text-muted", blend(autoText, contrastBasis, 0.42));
  }
}
