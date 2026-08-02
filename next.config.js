/** @type {import('next').NextConfig} */

// Gemeinsame Sicherheits-Header für alle Seiten. Die Content-Security-Policy
// erlaubt bewusst style-src 'unsafe-inline' — das zentrale Branding-System
// (lib/orgBranding.js) setzt Organisationsfarben per document.documentElement
// .style.setProperty(...), das ist technisch ein Inline-Style und würde sonst
// blockiert. script-src bleibt dagegen strikt (kein 'unsafe-inline'), das ist
// der eigentlich wichtige Schutz gegen eingeschleusten JavaScript-Code.
const BASE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Call Tracker und Einwand-Trainer (public/tools/*.html) sind eigenständige,
// selbst geschriebene HTML-Dateien mit einem kleinen Inline-<script>, das das
// Organisations-Branding per Query-Param übernimmt — dafür ist hier
// (nur für diese beiden Dateien) 'unsafe-inline' für script-src nötig. Der
// Call Tracker lädt außerdem die Supabase- und Chart.js-Bibliothek von
// jsdelivr — ohne diese Domain in script-src bricht die komplette
// Termin-/Team-Synchronisierung stumm ab (window.supabase bleibt undefined).
const TOOLS_CSP = BASE_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Call Tracker und Einwand-Trainer laden ihr Organisations-Branding
    // (Logo, Name) dynamisch per Query-Param — jegliches Zwischenspeichern
    // dieser statischen HTML-Dateien durch Browser/CDN muss ausgeschlossen
    // sein, sonst könnte ein alter Stand (mit falschem/fehlendem Branding)
    // ausgeliefert werden.
    const headers = [
      {
        source: "/tools/:path*.html",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }, ...SECURITY_HEADERS, { key: "Content-Security-Policy", value: TOOLS_CSP }],
      },
      {
        source: "/((?!tools/).*)",
        headers: [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: BASE_CSP }],
      },
    ];
    // Die strikte CSP nur in Produktion aktiv — Next.js' Dev-Server nutzt für
    // Hot Reload teils eval()-basiertes Tooling, das eine strikte script-src
    // sonst lokal blockieren würde.
    if (process.env.NODE_ENV !== "production") {
      return headers.map((h) => ({ ...h, headers: h.headers.filter((x) => x.key !== "Content-Security-Policy") }));
    }
    return headers;
  },
};

module.exports = nextConfig;
