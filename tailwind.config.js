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
        bg: "rgb(var(--org-bg-rgb, 20 21 28) / <alpha-value>)",
        surface: "rgb(var(--org-surface-rgb, 28 30 41) / <alpha-value>)",
        surfaceRaised: "rgb(var(--org-surface-raised-rgb, 34 36 47) / <alpha-value>)",
        line: "rgb(var(--org-line-rgb, 47 50 66) / <alpha-value>)",
        textMain: "rgb(var(--org-text-rgb, 236 237 245) / <alpha-value>)",
        textMuted: "rgb(var(--org-text-muted-rgb, 141 144 166) / <alpha-value>)",
        // amber/violet sind die Marken-Akzentfarben — pro Organisation über
        // --org-accent-rgb/--org-color-1-rgb ersetzbar (siehe lib/orgBranding.js).
        // Jede bestehende Klasse (text-amber, bg-amber/40, border-violet/40, ...)
        // wird dadurch automatisch organisationsspezifisch, ohne einzelne
        // Seiten anzupassen. Fallback-Werte = heutiges Standarddesign.
        amber: "rgb(var(--org-accent-rgb, 206 58 92) / <alpha-value>)",
        violet: "rgb(var(--org-color-1-rgb, 76 93 201) / <alpha-value>)",
        // teal (Erfolg) und coral (Gefahr/Löschen) bleiben bewusst feste
        // Statusfarben — ihre Bedeutung muss unabhängig vom Organisations-
        // Branding erkennbar bleiben.
        teal: "#3FBFA6",
        coral: "#E5716A",
      },
      // Selbst gehostet über next/font (siehe pages/_app.js) statt live von
      // fonts.googleapis.com geladen — die CSS-Variablen werden dort gesetzt.
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-work-sans)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
