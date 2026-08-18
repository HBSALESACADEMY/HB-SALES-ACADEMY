// Hell/Dunkel/Systemeinstellung — pro Gerät in localStorage gespeichert
// (kein Sync über Geräte hinweg nötig für ein Sales-Team-Tool). Die
// tatsächliche Anwendung passiert über das data-theme-Attribut auf <html>;
// styles/globals.css definiert dafür zwei komplette Token-Sets
// (--theme-*-rgb), auf die tailwind.config.js als zweite Fallback-Ebene
// zurückfällt (nach den organisationseigenen --org-*-rgb-Werten). Dadurch
// passt sich praktisch die GESAMTE App automatisch an, ohne dass einzelne
// Seiten ihre Farben selbst kennen müssen.
const KEY = "hb_theme_pref";

export function getStoredThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch (e) {
    return "system";
  }
}

// Unterscheidet "nie bewusst gewählt" von "bewusst Systemeinstellung gewählt".
// getStoredThemePref() liefert in beiden Fällen "system" — für die Frage, ob
// der am Konto gespeicherte Wert dieses Gerät überschreiben darf, ist der
// Unterschied aber entscheidend (siehe components/Layout.js).
export function hasStoredThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system";
  } catch (e) {
    return false;
  }
}

export function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function getResolvedTheme() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function applyThemePref(pref) {
  const resolved = resolveTheme(pref);
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", resolved);
  return resolved;
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch (e) { /* Safari Private Mode o.ä. — Theme gilt dann nur für diese Sitzung */ }
  return applyThemePref(pref);
}

// Bei "Systemeinstellung": live nachziehen, wenn das Betriebssystem-Theme
// sich während der Sitzung ändert (z.B. automatischer Wechsel abends),
// ohne dass ein Neuladen der Seite nötig ist.
export function watchSystemTheme(onChange) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const handler = () => { if (getStoredThemePref() === "system") onChange(applyThemePref("system")); };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

// Muss mit den --theme-bg-rgb-Werten in styles/globals.css übereinstimmen —
// als Hex für die WCAG-Kontrastrechnung in lib/orgBranding.js.
export const THEME_BG_HEX = { dark: "#14151C", light: "#F4F5F9" };

// Das HB-Standard-Logo (public/logo.svg) ist hell/weiß eingefärbt, für einen
// dunklen Hintergrund gedacht — auf einem hellen Kartenhintergrund (helles
// Theme) wäre es fast unsichtbar. public/logo-on-light.svg ist dieselbe
// Datei mit dunkel eingefärbtem Schriftzug. Gilt nur für das UNGEBRANDETE
// Standard-Logo — organisationseigene Logos (org.logo_url) sind davon nicht
// betroffen, die verwalten Organisationen selbst.
export function defaultLogoSrc(resolvedTheme) {
  return resolvedTheme === "light" ? "/logo-on-light.svg" : "/logo.svg";
}
