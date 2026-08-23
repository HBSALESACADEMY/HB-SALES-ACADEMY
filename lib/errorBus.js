// Zentrale Stelle für Fehler, die im Hintergrund passieren.
//
// Vorher wurden solche Fehler an vielen Stellen stillschweigend verworfen
// ("catch (e) { /* nicht kritisch */ }"). Für Betreiber ohne Technik-
// Hintergrund ist das die schlechteste Variante: es passiert etwas nicht,
// und nirgends steht warum. Genau daran haben wir bei der Helligkeits-
// Einstellung einen ganzen Tag gesucht.
//
// Jetzt melden diese Stellen den Fehler hierher; components/Layout.js zeigt
// ihn als kurzen Hinweis an — auf jeder Seite, ohne dass die einzelne
// Komponente eine eigene Anzeige braucht (gleiches Prinzip wie
// lib/profileModalBus.js).
//
// Bewusst NICHT für Fehler gedacht, die eine Seite ohnehin schon selbst
// anzeigt (z.B. ein fehlgeschlagenes Speichern mit eigener Fehlermeldung) —
// sonst stünde dieselbe Sache doppelt da.

export function meldeFehler(text, details) {
  if (typeof window === "undefined") return;
  // Zusätzlich an den Betreiber: der Hinweis auf dem Bildschirm hilft der
  // betroffenen Person, sagt aber niemandem, dass etwas kaputt ist.
  //
  // Nachgeladen statt oben eingebunden: fehlerMelden.js zieht den
  // Supabase-Zugang mit sich, und dieser Bus wird auch aus reiner
  // Rechenlogik heraus benutzt, die in den Tests ohne Zugangsdaten läuft.
  import("./fehlerMelden.js")
    .then((m) => m.meldeStoerung(text, details?.message || details || text))
    .catch(() => {});
  // Für die Fehlersuche bleibt die technische Ursache in der Konsole,
  // dem Nutzer wird nur der verständliche Satz gezeigt.
  if (details) console.error(text, details);
  window.dispatchEvent(new CustomEvent("hb:fehler", { detail: String(text) }));
}
