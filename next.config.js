/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Call Tracker und Einwand-Trainer laden ihr Organisations-Branding
    // (Logo, Name) dynamisch per Query-Param — jegliches Zwischenspeichern
    // dieser statischen HTML-Dateien durch Browser/CDN muss ausgeschlossen
    // sein, sonst könnte ein alter Stand (mit falschem/fehlendem Branding)
    // ausgeliefert werden.
    return [
      {
        source: "/tools/:path*.html",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

module.exports = nextConfig;
