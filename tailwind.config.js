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
        amber: "#F0B23E",
        teal: "#3FBFA6",
        coral: "#E5716A",
        violet: "#9E8CF0",
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
