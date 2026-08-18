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
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Call Tracker und Einwand-Trainer waren früher eigenständige HTML-Dateien
    // unter /tools/ mit gelockerter CSP (Inline-Script + Bibliotheken von
    // jsdelivr). Seit dem Umbau zu normalen App-Seiten ist beides nicht mehr
    // nötig — die strikte script-src 'self' gilt jetzt lückenlos überall.
    const headers = [
      {
        source: "/(.*)",
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
