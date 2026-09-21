import { useEffect, useRef, useState } from "react";
import { BLOCK_MINUTEN, blockErgebnis, blockText } from "../lib/anwahlSpiel";
import Icon from "./Icon";

// Der Telefonblock: Anfang, Ende, Ergebnis.
//
// Telefonieren hat von sich aus keinen Rahmen — man fängt an und hört
// irgendwann auf. Ein Block macht daraus eine Runde mit Uhr, Ziel und
// Ergebnis. Genau das ist der Unterschied zwischen "ich telefoniere mal"
// und "ich mache jetzt fünfundzwanzig Minuten Vollgas".
//
// Gezählt wird die Differenz des Tageszählers (siehe lib/anwahlSpiel.js):
// Kein zweiter Zähler, der mit der Auswertung streiten könnte.
//
// Der Bestwert liegt im Gerät (localStorage). Er ist ein Anreiz für einen
// selbst, keine Kennzahl für die Leitung — und er soll auch nicht in einer
// Auswertung auftauchen.
export default function Telefonblock({ anwahlen = 0, speicherSchluessel = "hb-telefonblock" }) {
  const [laufend, setLaufend] = useState(null);
  const [restSekunden, setRestSekunden] = useState(0);
  const [ergebnis, setErgebnis] = useState(null);
  const [bestwert, setBestwert] = useState(0);
  const anwahlenRef = useRef(anwahlen);
  anwahlenRef.current = anwahlen;

  useEffect(() => {
    try {
      const gespeichert = Number(localStorage.getItem(`${speicherSchluessel}:bestwert`)) || 0;
      setBestwert(gespeichert);
    } catch (e) { /* ohne Speicher eben ohne Bestwert */ }
  }, [speicherSchluessel]);

  // Die Uhr läuft nach der ECHTEN Zeit, nicht nach Sekundentakten: Ein Tab
  // im Hintergrund bekommt seltener einen Takt, und der Block wäre danach
  // Minuten zu lang.
  useEffect(() => {
    if (!laufend) return undefined;
    const takt = setInterval(() => {
      const rest = Math.max(0, Math.round((laufend.bis - Date.now()) / 1000));
      setRestSekunden(rest);
      if (rest <= 0) beendenRef.current?.(true);
    }, 500);
    return () => clearInterval(takt);
  }, [laufend, bestwert]);

  function starte(minuten) {
    setErgebnis(null);
    setLaufend({ minuten, start: anwahlenRef.current, bis: Date.now() + minuten * 60000 });
    setRestSekunden(minuten * 60);
  }

  // Über eine Referenz, damit der Zeitgeber immer die aktuelle Fassung
  // aufruft, ohne bei jedem Rendern neu zu starten.
  const beendenRef = useRef(null);
  function beende(abgelaufen = false) {
    setLaufend((aktuell) => {
      if (!aktuell) return null;
      const gelaufen = abgelaufen
        ? aktuell.minuten
        : Math.max(1, Math.round((aktuell.minuten * 60000 - (aktuell.bis - Date.now())) / 60000));
      const roh = blockErgebnis({ start: aktuell.start, ende: anwahlenRef.current, minuten: gelaufen });
      setErgebnis({ ...roh, text: blockText({ ...roh, bestwert }), vorzeitig: !abgelaufen });
      if (roh.anwahlen > bestwert) {
        setBestwert(roh.anwahlen);
        try { localStorage.setItem(`${speicherSchluessel}:bestwert`, String(roh.anwahlen)); } catch (e) { /* egal */ }
      }
      return null;
    });
  }

  beendenRef.current = beende;

  const uhr = `${String(Math.floor(restSekunden / 60)).padStart(2, "0")}:${String(restSekunden % 60).padStart(2, "0")}`;

  if (laufend) {
    const bisher = Math.max(0, anwahlen - laufend.start);
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="kennzahl text-[26px] zahl">{uhr}</span>
        <span className="text-sm text-textMain">
          {bisher} {bisher === 1 ? "Anwahl" : "Anwahlen"} in diesem Block
        </span>
        <button onClick={() => beende(false)} className="btn-ghost text-xs ml-auto">Block beenden</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {BLOCK_MINUTEN.map((m) => (
          <button key={m} onClick={() => starte(m)} className="btn-ghost text-xs">
            <Icon name="timer" size={12} /> {m} Minuten
          </button>
        ))}
        {bestwert > 0 && <span className="text-[11px] text-textMuted ml-auto zahl">Bestwert: {bestwert} Anwahlen</span>}
      </div>
      {ergebnis && (
        <p className="text-xs text-textMain mt-2">
          {ergebnis.text}
          {ergebnis.anwahlen > 0 && <span className="text-textMuted"> · Das sind {ergebnis.proStunde} pro Stunde.</span>}
        </p>
      )}
    </div>
  );
}
