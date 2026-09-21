import { OEFFENTLICHE_PFADE, seitenAdresse } from "../lib/oeffentlicheSeiten";

// robots.txt als Seite statt als Datei: Die Zeile "Sitemap:" muss eine
// vollständige Adresse tragen, und die kennt erst der Server
// (NEXT_PUBLIC_APP_URL).
//
// Erlaubt ist nur, was ohne Anmeldung erreichbar ist. Alles andere steht
// hinter der Anmeldung — dort stehen Namen von Kund:innen, Auswertungen
// und Gesprächsnotizen. Diese Datei ist dabei nur eine Bitte an die
// Suchmaschine; verbindlich ist das "noindex" auf den Seiten selbst
// (pages/_app.js).
export async function getServerSideProps({ res }) {
  const sitemap = seitenAdresse("/sitemap.xml");
  const zeilen = [
    "User-agent: *",
    ...OEFFENTLICHE_PFADE.map((p) => `Allow: ${p}`),
    "Allow: /logo.svg",
    "Allow: /logo.png",
    "Allow: /og-bild.png",
    "Disallow: /",
    "Disallow: /api/",
    sitemap ? `\nSitemap: ${sitemap}` : null,
  ].filter((z) => z !== null);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.write(zeilen.join("\n"));
  res.end();
  return { props: {} };
}

export default function Robots() {
  return null;
}
