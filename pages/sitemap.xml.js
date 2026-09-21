import { OEFFENTLICHE_PFADE, seitenAdresse } from "../lib/oeffentlicheSeiten";

// Die Sitemap führt ausschliesslich die Seiten ohne Anmeldung.
//
// Ohne hinterlegte Adresse (NEXT_PUBLIC_APP_URL) bleibt sie leer statt
// relative Pfade zu behaupten: Eine Sitemap mit "/login" darin ist für
// eine Suchmaschine unbrauchbar und sieht nur nach Fehler aus.
export async function getServerSideProps({ res }) {
  const eintraege = OEFFENTLICHE_PFADE
    .map((pfad) => seitenAdresse(pfad))
    .filter(Boolean)
    .map((adresse) => `  <url><loc>${adresse}</loc></url>`);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...eintraege,
    "</urlset>",
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.write(xml);
  res.end();
  return { props: {} };
}

export default function Sitemap() {
  return null;
}
