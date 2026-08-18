// Setzt die gespeicherte Hell/Dunkel-Einstellung, BEVOR die Seite gezeichnet
// wird — sonst würde sie kurz im falschen Theme aufblitzen (siehe
// lib/theme.js, styles/globals.css).
//
// Bewusst eine eigene Datei statt eines eingebetteten <script>-Blocks: die
// Sicherheitsregeln der App erlauben nur Skripte von der eigenen Adresse
// (script-src 'self', siehe next.config.js). Ein eingebettetes Skript wurde
// in der ausgelieferten Academy deshalb blockiert — die Einstellung wirkte
// dadurch nur bis zum nächsten Laden und sprang dann auf Dunkel zurück. In
// der Entwicklung sind diese Regeln abgeschaltet, weshalb das lange
// unentdeckt blieb.
//
// Wird ohne "async"/"defer" eingebunden und läuft daher garantiert vor dem
// ersten Zeichnen.
(function () {
  try {
    var pref = localStorage.getItem("hb_theme_pref");
    var resolved = (pref === "light" || pref === "dark")
      ? pref
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", resolved);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
