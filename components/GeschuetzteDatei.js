import { useEffect, useState } from "react";
import { apiPost } from "../lib/apiClient";

// Hochgeladene Dateien öffnen und anzeigen, seit ihre Speicherbereiche
// privat sind (migration_174).
//
// Ein gespeicherter Link ist nur noch die Kennung einer Datei, keine
// offene Adresse. Den eigentlichen Link gibt der Server — kurzlebig und nur,
// wenn man den zugehörigen Eintrag sehen darf (pages/api/datei-link.js).

// Einmal geholt, eine Weile wiederverwendet: Eine Liste mit zwanzig Bildern
// soll nicht bei jedem Neuzeichnen zwanzig Anfragen stellen. Etwas kürzer
// als die Gültigkeit des Links, damit keiner kurz vor Ablauf benutzt wird.
const PUFFER_MS = 50 * 60 * 1000;
const puffer = new Map();

function ausPuffer(url) {
  const eintrag = puffer.get(url);
  return eintrag && eintrag.bis > Date.now() ? eintrag.link : null;
}

export async function signierteLinks(urls = []) {
  const fehlend = [...new Set(urls.filter((u) => u && !ausPuffer(u)))];
  if (fehlend.length) {
    const { links } = await apiPost("/api/datei-link", { urls: fehlend });
    Object.entries(links || {}).forEach(([url, link]) => {
      if (link) puffer.set(url, { link, bis: Date.now() + PUFFER_MS });
    });
  }
  return Object.fromEntries(urls.map((u) => [u, ausPuffer(u)]));
}

/**
 * Eine Datei in einem neuen Fenster öffnen.
 *
 * Das Fenster geht sofort auf, der Link kommt danach: Wer erst nach der
 * Antwort des Servers ein Fenster öffnet, landet im Popup-Blocker.
 */
export async function oeffneDatei(url) {
  const fenster = typeof window !== "undefined" ? window.open("", "_blank") : null;
  try {
    const links = await signierteLinks([url]);
    const link = links[url];
    if (!link) throw new Error("Diese Datei lässt sich nicht öffnen.");
    if (fenster) fenster.location.href = link;
    else window.location.href = link;
  } catch (e) {
    if (fenster) fenster.close();
    window.alert(e.message || "Diese Datei lässt sich nicht öffnen.");
  }
}

/** Der unterschriebene Link zu einer Datei — für Bilder und Videos. */
export function useDateiLink(url) {
  const [link, setLink] = useState(() => (url ? ausPuffer(url) : null));
  useEffect(() => {
    if (!url) { setLink(null); return undefined; }
    let aktiv = true;
    const bekannt = ausPuffer(url);
    if (bekannt) { setLink(bekannt); return undefined; }
    signierteLinks([url])
      .then((links) => { if (aktiv) setLink(links[url] || null); })
      .catch(() => { if (aktiv) setLink(null); });
    return () => { aktiv = false; };
  }, [url]);
  return link;
}

/** Ein Knopf, der die Datei öffnet — statt eines offenen Links. */
export function DateiKnopf({ url, className = "", children }) {
  return (
    <button type="button" onClick={() => oeffneDatei(url)} className={className}>
      {children}
    </button>
  );
}

export function GeschuetztesBild({ url, alt = "", className = "" }) {
  const link = useDateiLink(url);
  if (!link) return <div className={`${className} bg-surfaceRaised animate-pulse min-h-[6rem]`} />;
  return <img src={link} alt={alt} className={className} />;
}

export function GeschuetztesVideo({ url, className = "" }) {
  const link = useDateiLink(url);
  if (!link) return <div className={`${className} bg-surfaceRaised animate-pulse min-h-[10rem]`} />;
  return <video controls src={link} className={className} />;
}
