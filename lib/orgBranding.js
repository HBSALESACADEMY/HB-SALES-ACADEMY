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

import { hexToRgb, toHex, blend, textColorForColors, worstContrastAgainst, relativeLuminance, MIN_HEADING_CONTRAST, MIN_TEXT_CONTRAST } from "./colorMath.js";
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
// Ist ein Farbton hell oder dunkel? Entscheidet, in WELCHEM Modus die
// eigenen Flächenfarben einer Organisation gelten dürfen.
//
// Die Schwelle liegt bei 0.35 statt bei 0.5: Mittelgraue Töne wirken auf
// einer ganzen Seite eher dunkel, und ein zu hell eingestufter Ton würde den
// Dunkelmodus aufhellen — genau das soll nicht passieren.
export function istHellerTon(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return relativeLuminance(rgb) >= 0.35;
}

// Dürfen die eigenen Flächenfarben im aktuellen Modus gelten?
//
// Früher galten sie IMMER im Dunkelmodus und NIE im Hellmodus. Folge: Eine
// Organisation mit hellem Corporate Design machte den Dunkelmodus hell —
// "dunkel" war dann nicht dunkel, und wer abends arbeitete, wurde geblendet.
// Umgekehrt bekam dieselbe Organisation im Hellmodus ihre Farben gar nicht
// zu sehen.
//
// Jetzt entscheidet der Farbton selbst: helle Flächen gelten im Hellmodus,
// dunkle im Dunkelmodus. Im jeweils anderen Modus übernimmt das geprüfte
// Standarddesign. Die Marke bleibt in beiden Fällen über Akzentfarbe,
// Verlauf und Logo sichtbar — daran erkennt man eine Firma, nicht am
// Grauton des Hintergrunds.
export function eigeneFlaechenGelten(org, theme) {
  const basis = org?.background_color || org?.surface_color;
  if (!basis) return false;
  const hell = istHellerTon(basis);
  if (hell === null) return false;
  return hell === (theme === "light");
}

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
  // Eigene Hintergrund-/Flächen-/Textfarben gelten nur in dem Modus, zu dem
  // ihr Farbton passt (siehe eigeneFlaechenGelten): helle Flächen im
  // Hellmodus, dunkle im Dunkelmodus. Sonst wäre "dunkel" bei einer
  // Organisation mit hellem Corporate Design nicht dunkel.
  const useCustomSurface = eigeneFlaechenGelten(org, theme);
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
  if (contrastBasis) {
    const sicher = textColorForColors([contrastBasis]);
    // Eine ausdrücklich gesetzte Textfarbe wurde bisher blind übernommen —
    // auch dann, wenn sie auf der gewählten Fläche kaum zu lesen war (grau
    // auf grau). Sie gilt nur noch, wenn sie den Mindestkontrast erreicht;
    // sonst übernimmt die berechnete Farbe. Lieber eine Marke, die im Detail
    // abweicht, als Text, den niemand entziffert.
    const eigeneTaugt = org.text_color && worstContrastAgainst([org.text_color], contrastBasis) >= MIN_TEXT_CONTRAST;
    setColorVar("org-text", eigeneTaugt ? org.text_color : sicher);

    // Gedämpfter Text braucht weniger Kontrast als Fliesstext, aber nicht
    // beliebig wenig — 3:1 ist die Grenze, ab der Text auf Flächen noch
    // erkennbar bleibt.
    const eigeneMutedTaugt = org.muted_color && worstContrastAgainst([org.muted_color], contrastBasis) >= MIN_HEADING_CONTRAST;
    setColorVar("org-text-muted", eigeneMutedTaugt ? org.muted_color : blend(sicher, contrastBasis, 0.42));
  }
}
