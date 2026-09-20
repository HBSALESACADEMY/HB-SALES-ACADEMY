// Abstände für das automatische Aktualisieren von Seiten.
//
// Vorher fragten zehn Stellen stur alle 20 Sekunden nach — auch dann, wenn
// die Academy nur in einem Hintergrund-Tab offen lag. Allein die Seitenleiste
// macht 12 Abfragen pro Runde; bei acht Stunden geöffneter Academy sind das
// rund 17.000 Abfragen pro Person und Tag, für Daten, die sich meist gar
// nicht geändert haben.
//
// Alle betroffenen Stellen fragen jetzt nur noch ab, wenn der Tab sichtbar
// ist, und aktualisieren beim Zurückwechseln sofort einmal. Dadurch ist die
// Ansicht beim Hinschauen sogar frischer als vorher, obwohl insgesamt
// deutlich weniger abgefragt wird.
import { useCallback, useEffect, useRef, useState } from "react";

export const ABSTAND = {
  // Seite hat eine Echtzeit-Verbindung (Dashboard, Seitenleiste,
  // Nutzerverwaltung) — Änderungen kommen ohnehin sofort an, die Abfrage ist
  // nur noch Sicherheitsnetz, falls die Verbindung stillschweigend abbricht.
  MIT_ECHTZEIT: 5 * 60 * 1000,
  // Keine Echtzeit, aber Kolleg:innen ändern hier laufend etwas (Termine).
  LAUFEND: 60 * 1000,
  // Auswertungen und Verwaltung — hier reicht gelegentlich.
  GELEGENTLICH: 2 * 60 * 1000,
};

/**
 * Eine Seite von selbst aktuell halten — ohne den laufenden Vorgang zu stören.
 *
 * Die Regeln, die sich im Betrieb als richtig erwiesen haben:
 *   - Nur abfragen, wenn der Tab sichtbar ist.
 *   - Beim Zurückwechseln sofort einmal.
 *   - "pausiert" hält alles an: Wer gerade ein Formular ausfüllt, einen
 *     Termin bearbeitet oder eine Aufnahme hört, darf nicht mitten im Tippen
 *     eine neue Liste untergeschoben bekommen. Nachgeholt wird, sobald die
 *     Pause vorbei ist.
 *
 * @param laden    Funktion, die die Daten neu holt. Bekommt true für "still"
 *                 (kein Ladebalken, kein Sprung in der Ansicht).
 * @returns { zuletzt, laeuft, jetzt } — für den Aktualisieren-Knopf.
 */
export function useAutoAktualisieren(laden, { abstand = ABSTAND.LAUFEND, pausiert = false, aktiv = true } = {}) {
  const [zuletzt, setZuletzt] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  // Über eine Referenz, damit ein neu erzeugtes "laden" nicht jedes Mal
  // einen neuen Zeitgeber startet.
  const ladenRef = useRef(laden);
  ladenRef.current = laden;
  const pausiertRef = useRef(pausiert);
  pausiertRef.current = pausiert;
  const versaeumt = useRef(false);

  const hole = useCallback(async (still = true) => {
    if (pausiertRef.current) { versaeumt.current = true; return; }
    setLaeuft(true);
    try {
      await ladenRef.current(still);
      setZuletzt(Date.now());
    } finally {
      setLaeuft(false);
    }
  }, []);

  useEffect(() => {
    if (!aktiv) return undefined;
    const zeitgeber = setInterval(() => { if (!document.hidden) hole(true); }, abstand);
    const beiSichtbar = () => { if (!document.hidden) hole(true); };
    document.addEventListener("visibilitychange", beiSichtbar);
    window.addEventListener("focus", beiSichtbar);
    return () => {
      clearInterval(zeitgeber);
      document.removeEventListener("visibilitychange", beiSichtbar);
      window.removeEventListener("focus", beiSichtbar);
    };
  }, [abstand, aktiv, hole]);

  // Was während einer Pause ausgefallen ist, wird danach nachgeholt.
  useEffect(() => {
    if (!pausiert && versaeumt.current) {
      versaeumt.current = false;
      hole(true);
    }
  }, [pausiert, hole]);

  return { zuletzt, laeuft, jetzt: () => hole(true) };
}

/** "vor 2 Minuten" — für die Zeile am Aktualisieren-Knopf. */
export function vorZeit(zeitpunkt, jetzt = Date.now()) {
  if (!zeitpunkt) return "";
  const sekunden = Math.max(0, Math.round((jetzt - zeitpunkt) / 1000));
  if (sekunden < 45) return "gerade eben";
  const minuten = Math.round(sekunden / 60);
  if (minuten < 60) return `vor ${minuten} ${minuten === 1 ? "Minute" : "Minuten"}`;
  const stunden = Math.round(minuten / 60);
  return `vor ${stunden} ${stunden === 1 ? "Stunde" : "Stunden"}`;
}
