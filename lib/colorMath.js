// Reine Farb-Mathematik, DOM-frei — nutzbar im Browser (lib/orgBranding.js,
// Live-Vorschau im Branding-Editor) UND serverseitig (z.B.
// pages/api/certificate.js für gebrandete PDF-Zertifikate). Keine Abhängigkeit
// von document/window, damit dieselbe WCAG-Kontrastlogik überall exakt
// gleich rechnet statt zweimal (leicht abweichend) implementiert zu sein.

export function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
}

// Mischt zwei Hex-Farben (t=0 → hexA, t=1 → hexB).
export function blend(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  return toHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
}

function srgbToLinear(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
export function contrastRatio(lumA, lumB) {
  const lighter = Math.max(lumA, lumB), darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

// Automatischer Kontrast: aus einer Reihe von Hex-Farben die Textfarbe
// (schwarz/weiß) wählen, die den SCHLECHTESTEN Punkt am besten lesbar macht.
export function textColorForColors(hexColors) {
  const rgbColors = (hexColors || []).map(hexToRgb).filter(Boolean);
  if (!rgbColors.length) return "#FFFFFF";
  const lums = rgbColors.map(relativeLuminance);
  const worstWithWhite = Math.min(...lums.map((l) => contrastRatio(l, 1)));
  const worstWithBlack = Math.min(...lums.map((l) => contrastRatio(l, 0)));
  return worstWithBlack > worstWithWhite ? "#12141C" : "#FFFFFF";
}

export const MIN_HEADING_CONTRAST = 3;
export const MIN_TEXT_CONTRAST = 4.5;

export function worstContrastAgainst(hexColors, bgHex) {
  const bgRgb = hexToRgb(bgHex);
  const lums = (hexColors || []).map(hexToRgb).filter(Boolean).map(relativeLuminance);
  if (!bgRgb || !lums.length) return null;
  const bgLum = relativeLuminance(bgRgb);
  return Math.min(...lums.map((l) => contrastRatio(l, bgLum)));
}
