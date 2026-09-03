// Sucht ausschliesslich nach unbekannten Variablen (no-undef).
//
// Warum eigens: das Projekt hat keine ESLint-Einrichtung, und `next build`
// meldet diese Fehlerklasse nicht — eine unbekannte Variable in JSX fällt
// erst zur Laufzeit auf, dann bleibt die Seite weiss. Genau so gingen beim
// Herausziehen des Betreiber-Bereichs zwei Dinge kaputt: ein fehlender
// Import und eine Hilfsvariable, die in der alten Datei zurückblieb.
//
// Bewusst nur diese eine Regel: kein Stilkram, der bestehenden Code
// umkrempeln würde.
const browserGlobals = [
  "window", "document", "console", "fetch", "localStorage", "sessionStorage",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "alert", "confirm", "navigator", "Blob", "File", "FileReader",
  "URL", "URLSearchParams", "FormData", "Image", "Audio", "MediaRecorder", "AbortController", "AbortSignal",
  "crypto", "atob", "btoa", "CustomEvent", "Event", "EventTarget", "Intl", "React", "process", "Buffer", "structuredClone",
];

export default [
  {
    // Eine bestehende eslint-disable-Zeile verweist auf eine Regel aus
    // eslint-plugin-react-hooks, das hier nicht geladen ist. Die Datei wird
    // deshalb übersprungen — sie hat sonst keine Befunde.
    ignores: ["pages/einwand-trainer.js"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: Object.fromEntries(browserGlobals.map((g) => [g, "readonly"])),
    },
    rules: { "no-undef": "error" },
  },
];
