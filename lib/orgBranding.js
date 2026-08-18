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
// RGB-Variablen sind bewusst LEERZEICHEN-getrennt (z.B. "206 58 92"), nicht
// komma-getrennt — das ist das Format, das Tailwinds rgb(var(--x) / <alpha>)-
// Opacity-Syntax braucht.

import { hexToRgb, toHex, blend, textColorForColors, worstContrastAgainst, MIN_HEADING_CONTRAST, MIN_TEXT_CONTRAST } from "./colorMath.js";
import { getResolvedTheme, THEME_BG_HEX } from "./theme.js";

// Reine Farb-Mathematik lebt in lib/colorMath.js (DOM-frei, auch serverseitig
// nutzbar, z.B. für gebrandete PDF-Zertifikate) — hier re-exportiert, weil
// mehrere Seiten (u.a. der Branding-Editor) blend/textColorForColors bisher
// von hier importieren.
export { blend, textColorForColors };

const BRAND_VARS = [
  "org-color-1", "org-accent", "org-color-3",
  "org-bg", "org-surface", "org-surface-raised", "org-line",
  "org-text", "org-text-muted", "org-sidebar-tint", "org-sidebar-mid",
];

function clearColorVar(varName) {
  document.documentElement.style.removeProperty(`--${varName}`);
  document.documentElement.style.removeProperty(`--${varName}-rgb`);
}

function setColorVar(varName, hexColor) {
  if (!hexColor) return null;
  const rgb = hexToRgb(hexColor);
  if (!rgb) return null;
  document.documentElement.style.setProperty(`--${varName}`, `#${hexColor.replace("#", "")}`);
  document.documentElement.style.setProperty(`--${varName}-rgb`, `${rgb.r} ${rgb.g} ${rgb.b}`);
  return rgb;
}

// Der Marken-Verlauf wird bei Überschriften (.brand-text-gradient) direkt
// als sichtbare "Textfarbe" verwendet (background-clip: text). Reicht der
// Kontrast dieses Verlaufs gegen den (ggf. organisationsspezifischen)
// Seitenhintergrund nicht aus, fällt die Überschrift automatisch auf eine
// sichere, einfarbige Textfarbe zurück (siehe globals.css
// [data-gradient-headings="off"]) statt unlesbar zu bleiben.
function setHeadingSafety(gradientHexes, bgHex) {
  const worst = gradientHexes.length ? worstContrastAgainst(gradientHexes, bgHex) : null;
  if (worst !== null && worst < MIN_HEADING_CONTRAST) {
    document.documentElement.setAttribute("data-gradient-headings", "off");
    document.documentElement.style.setProperty("--org-heading-text", textColorForColors([bgHex]));
  } else {
    document.documentElement.removeAttribute("data-gradient-headings");
    document.documentElement.style.removeProperty("--org-heading-text");
  }
}

// Aktiver Sidebar-Eintrag: die Akzentfarbe wird nur als Text-/Icon-Farbe
// verwendet, wenn sie ausreichend Kontrast gegen den Sidebar-Hintergrund
// hat — sonst automatisch eine sichere, gegen die Sidebar geprüfte Textfarbe
// (siehe components/Layout.js, nutzt --org-nav-active-text statt text-amber).
function setNavActiveTextVar(accentHex, sidebarBgHex) {
  if (!accentHex) {
    document.documentElement.style.removeProperty("--org-nav-active-text");
    return;
  }
  const contrast = worstContrastAgainst([accentHex], sidebarBgHex);
  const safe = contrast !== null && contrast >= MIN_TEXT_CONTRAST;
  document.documentElement.style.setProperty("--org-nav-active-text", safe ? accentHex : textColorForColors([sidebarBgHex]));
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
  document.documentElement.style.removeProperty("--org-heading-text");
  document.documentElement.removeAttribute("data-gradient-headings");
  document.documentElement.style.removeProperty("--org-nav-active-text");
}

export function applyOrgBranding(org) {
  resetOrgBranding();
  if (!org) return;

  // Verlauf/Buttons (bestehend) — Markenfarben gelten unverändert in
  // BEIDEN Themes, das ist Identität, kein Oberflächen-Ton.
  const gradientRgb = [
    setColorVar("org-color-1", org.secondary_color),
    setColorVar("org-accent", org.primary_color),
    setColorVar("org-color-3", org.tertiary_color),
  ].filter(Boolean);
  setButtonTextVar(gradientRgb);

  const theme = getResolvedTheme();
  // Eigene Hintergrund-/Flächen-/Textfarben ("Auch Hintergrund, Kartenfläche
  // und Textfarbe anpassen" im Branding-Editor) gab es bisher nur im
  // dunklen Standarddesign — im hellen Theme angewendet, könnten sie leicht
  // unlesbar wirken (z.B. ein dunkler, für Dunkelmodus gewählter
  // Kartenhintergrund mit hellem Text, plötzlich auf sonst hellem Grund).
  // Sie gelten deshalb nur im dunklen Theme; im hellen Theme übernimmt die
  // Seite automatisch das geprüfte HB-Hell-Design (siehe globals.css
  // --theme-*). Betrifft nur die wenigen Organisationen, die diese
  // erweiterte Option überhaupt gesetzt haben — die Markenfarben (Verlauf/
  // Logo) bleiben davon unberührt.
  const useCustomSurface = theme === "dark";
  const effectiveBg = (useCustomSurface && org.background_color) || THEME_BG_HEX[theme];

  // Überschriften-Verlauf gegen den TATSÄCHLICHEN Seitenhintergrund prüfen
  // (das aktuelle Theme, nicht immer der dunkle Standard).
  setHeadingSafety([org.secondary_color, org.primary_color, org.tertiary_color].filter(Boolean), effectiveBg);

  // Abgetönte Variante der Sekundärfarbe für den Sidebar-Verlauf — Richtung
  // des tatsächlichen Seitenhintergrunds gemischt, damit die Sidebar im
  // hellen Theme auch hell bleibt (nicht immer Richtung Dunkel).
  const sidebarBase = org.secondary_color || org.primary_color;
  const sidebarTint = sidebarBase ? blend(sidebarBase, effectiveBg, 0.72) : (theme === "dark" ? "#1A1D33" : "#EEF0F6");
  if (sidebarBase) setColorVar("org-sidebar-tint", sidebarTint);
  // Mittlerer Verlaufs-Halt der Sidebar (siehe components/Layout.js) — ohne
  // eigene Sekundärfarbe reicht der Theme-Standardton.
  if (sidebarBase) setColorVar("org-sidebar-mid", blend(sidebarBase, effectiveBg, 0.85));

  // Aktiver Sidebar-Eintrag: Akzentfarbe gegen den TATSÄCHLICHEN Sidebar-
  // Hintergrund prüfen (nicht gegen die Seite) — die Sidebar hat ihren
  // eigenen, meist getönten Verlauf.
  setNavActiveTextVar(org.primary_color, sidebarTint);

  // Oberfläche/Hintergrund/Rahmen — nur im dunklen Theme (siehe oben).
  if (useCustomSurface) {
    setColorVar("org-bg", org.background_color);
    setColorVar("org-line", org.border_color);
    setColorVar("org-surface", org.surface_color);
    if (org.surface_color) {
      // "Angehobene" Fläche (Sidebar-Hover, Karten-Verlaufsende) — leicht
      // Richtung Weiß gemischt, unabhängig vom gewählten Farbton.
      setColorVar("org-surface-raised", blend(org.surface_color, "#FFFFFF", 0.08));
    }
  }

  // Text/gedämpfter Text: expliziter Wert hat immer Vorrang (volle Kontrolle
  // für die Organisation, nur im dunklen Theme). Ohne expliziten Wert wird —
  // sobald ein eigener Hintergrund/eine eigene Fläche gesetzt ist —
  // automatisch eine gut lesbare Farbe berechnet, damit das Branding nie
  // unlesbar werden kann.
  const contrastBasis = useCustomSurface ? (org.surface_color || org.background_color) : null;
  if (useCustomSurface && org.text_color) {
    setColorVar("org-text", org.text_color);
  } else if (contrastBasis) {
    setColorVar("org-text", textColorForColors([contrastBasis]));
  }
  if (useCustomSurface && org.muted_color) {
    setColorVar("org-text-muted", org.muted_color);
  } else if (contrastBasis) {
    const autoText = textColorForColors([contrastBasis]);
    setColorVar("org-text-muted", blend(autoText, contrastBasis, 0.42));
  }
}
