import { useEffect, useState } from "react";
import { vorZeit } from "../lib/autoRefresh";

// Der Knopf zum Aktualisieren — mit der Antwort auf die Frage, die er
// auslöst: "Wie alt ist das hier eigentlich?"
//
// Die Seiten aktualisieren sich von selbst (lib/autoRefresh.js). Der Knopf
// ist für die Momente, in denen man gerade etwas in Telegram eingetragen
// hat und es JETZT sehen will.
export default function AktualisierenKnopf({ zuletzt, laeuft, onClick, className = "" }) {
  // Die Angabe altert, ohne dass etwas passiert — deshalb ein eigener Takt.
  const [, neuZeichnen] = useState(0);
  useEffect(() => {
    const t = setInterval(() => neuZeichnen((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <button type="button" onClick={onClick} disabled={laeuft}
      title={zuletzt ? `Zuletzt aktualisiert ${vorZeit(zuletzt)}` : "Aktualisieren"}
      className={`btn-ghost text-xs disabled:opacity-40 flex items-center gap-1.5 ${className}`}>
      <span aria-hidden="true" className={laeuft ? "animate-spin" : ""}>↻</span>
      <span>{laeuft ? "Lädt…" : "Aktualisieren"}</span>
      {zuletzt && !laeuft && <span className="text-textMuted hidden sm:inline">· {vorZeit(zuletzt)}</span>}
    </button>
  );
}
