/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Basis-Oberflächenfarben — pro Organisation über --org-*-rgb
        // ersetzbar (siehe lib/orgBranding.js). Fallback-Werte = heutiges
        // Standarddesign, macht jede bestehende Nutzung (bg-bg, bg-surface,
        // bg-surfaceRaised, border-line, text-textMain, text-textMuted) im
        // gesamten Projekt automatisch organisationsspezifisch.
        bg: "rgb(var(--org-bg-rgb, 15 17 23) / <alpha-value>)",
        surface: "rgb(var(--org-surface-rgb, 23 26 36) / <alpha-value>)",
        surfaceRaised: "rgb(var(--org-surface-raised-rgb, 29 33 48) / <alpha-value>)",
        line: "rgb(var(--org-line-rgb, 42 46 63) / <alpha-value>)",
        textMain: "rgb(var(--org-text-rgb, 237 237 244) / <alpha-value>)",
        textMuted: "rgb(var(--org-text-muted-rgb, 144 147 159) / <alpha-value>)",
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
      // Selbst gehostet über next/font (siehe pages/_app.js) statt live von
      // fonts.googleapis.com geladen — die CSS-Variablen werden dort gesetzt.
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
