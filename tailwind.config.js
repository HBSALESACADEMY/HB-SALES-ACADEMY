/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0F1117",
        surface: "#171A24",
        surfaceRaised: "#1D2130",
        line: "#2A2E3F",
        textMain: "#EDEDF4",
        textMuted: "#90939F",
        // amber/violet sind die Marken-Akzentfarben — pro Organisation über
        // --org-accent-rgb/--org-color-1-rgb ersetzbar (siehe lib/orgBranding.js).
        // Jede bestehende Klasse (text-amber, bg-amber/40, border-violet/40, ...)
        // wird dadurch automatisch organisationsspezifisch, ohne einzelne
        // Seiten anzupassen. Fallback-Werte = heutiges Standarddesign.
        amber: "rgb(var(--org-accent-rgb, 240 178 62) / <alpha-value>)",
        violet: "rgb(var(--org-color-1-rgb, 158 140 240) / <alpha-value>)",
        // teal (Erfolg) und coral (Gefahr/Löschen) bleiben bewusst feste
        // Statusfarben — ihre Bedeutung muss unabhängig vom Organisations-
        // Branding erkennbar bleiben.
        teal: "#3FBFA6",
        coral: "#E5716A",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        sans: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
