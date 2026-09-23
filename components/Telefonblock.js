import { useEffect, useRef, useState } from "react";
import { BLOCK_MINUTEN, blockErgebnis, blockStand, blockText, leseBlockEingabe } from "../lib/anwahlSpiel";
import { zeigeBlockFeier } from "../lib/blockFeier";
import { feldFarbe } from "../lib/diagrammFarben";
import Icon from "./Icon";

// Der Telefonblock: Anfang, Uhr, Belohnung, Ergebnis.
//
// Telefonieren hat von sich aus keinen Rahmen — man fängt an und hört
// irgendwann auf. Ein Block macht daraus eine Runde mit Uhr, Ziel und
// Ergebnis. Genau das ist der Unterschied zwischen "ich telefoniere mal"
// und "ich mache jetzt fünfundzwanzig Minuten Vollgas".
//
// Die Uhr zählt HOCH (siehe lib/anwahlSpiel.js): Die gewählten Minuten
// sind ein Ziel, keine Frist. Ist die Zeit voll, kommt die Belohnung
// (lib/blockFeier.js) — und der Block läuft weiter, bis man selbst
// beendet. Nur beim Doppelten hört er von sich aus auf, damit ein
// vergessener Block kein unsinniges Ergebnis liefert.
//
// Gezählt werden die Anwahlen als Differenz des Tageszählers: Kein zweiter
// Zähler, der mit der Auswertung streiten könnte.
//
// Bestwert, Ton und die eigene Blocklänge liegen im Gerät (localStorage).
// Sie sind Anreiz und Einstellung für einen selbst, keine Kennzahl für die
// Leitung — und sollen in keiner Auswertung auftauchen.
export default function Telefonblock({ anwahlen = 0, speicherSchluessel = "hb-telefonblock", darfTesten = false }) {
  const [laufend, setLaufend] = useState(null);
  const [sekunden, setSekunden] = useState(0);
  const [ergebnis, setErgebnis] = useState(null);
  const [bestwert, setBestwert] = useState(0);
  const [ton, setTon] = useState(true);
  const [eigene, setEigene] = useState("");
  const [eigeneFehler, setEigeneFehler] = useState("");
  const anwahlenRef = useRef(anwahlen);
  anwahlenRef.current = anwahlen;
  const tonRef = useRef(ton);
  tonRef.current = ton;
  // Die Belohnung kommt einmal je Block, nicht bei jedem Takt danach.
  const gefeiertRef = useRef(false);

  useEffect(() => {
    try {
      setBestwert(Number(localStorage.getItem(`${speicherSchluessel}:bestwert`)) || 0);
      setTon(localStorage.getItem(`${speicherSchluessel}:ton`) !== "aus");
      setEigene(localStorage.getItem(`${speicherSchluessel}:eigene`) || "");

      // Einen laufenden Block wieder aufnehmen.
      //
      // Vorher war er nach einem Neuladen weg — mitten in einer Runde die
      // Seite aktualisieren, und die Uhr fing wieder bei null an. Gespeichert
      // sind nur drei Werte: gewählte Minuten, der Anwahlstand beim Start und
      // der ZEITPUNKT des Starts. Die Uhr wird daraus neu gerechnet und
      // stimmt deshalb auch dann, wenn der Tab zehn Minuten geschlossen war.
      const roh = localStorage.getItem(`${speicherSchluessel}:laufend`);
      if (roh) {
        const gemerkt = JSON.parse(roh);
        const gelaufen = Math.max(0, Math.round((Date.now() - Number(gemerkt.seit)) / 1000));
        const stand = blockStand({ minuten: gemerkt.minuten, sekunden: gelaufen });
        // Ein Block, der ohnehin vorbei wäre, wird nicht wieder geöffnet:
        // Wer gestern vergessen hat zu beenden, soll heute keine Uhr mit
        // vierzehn Stunden sehen.
        if (stand.vorbei) {
          localStorage.removeItem(`${speicherSchluessel}:laufend`);
        } else {
          gefeiertRef.current = !!gemerkt.gefeiert;
          setLaufend({ minuten: gemerkt.minuten, start: Number(gemerkt.start) || 0, seit: Number(gemerkt.seit) });
          setSekunden(gelaufen);
        }
      }
    } catch (e) { /* ohne Speicher eben ohne Bestwert, ohne Ton, ohne Wiederaufnahme */ }
  }, [speicherSchluessel]);

  function merke(schluessel, wert) {
    try { localStorage.setItem(`${speicherSchluessel}:${schluessel}`, wert); } catch (e) { /* egal */ }
  }

  // Die Uhr läuft nach der ECHTEN Zeit, nicht nach Sekundentakten: Ein Tab
  // im Hintergrund bekommt seltener einen Takt, und der Block wäre danach
  // Minuten zu kurz.
  useEffect(() => {
    if (!laufend) return undefined;
    const takt = setInterval(() => {
      const gelaufen = Math.max(0, Math.round((Date.now() - laufend.seit) / 1000));
      setSekunden(gelaufen);
      const stand = blockStand({ minuten: laufend.minuten, sekunden: gelaufen });
      if (stand.zielVoll && !gefeiertRef.current) {
        gefeiertRef.current = true;
        // Auch merken: Sonst käme die Belohnung nach jedem Neuladen erneut.
        merke("laufend", JSON.stringify({ ...laufend, gefeiert: true }));
        zeigeBlockFeier({ anwahlen: Math.max(0, anwahlenRef.current - laufend.start), ton: tonRef.current });
      }
      if (stand.vorbei) beendenRef.current?.();
    }, 500);
    return () => clearInterval(takt);
  }, [laufend, bestwert]);

  function starte(minuten) {
    setErgebnis(null);
    setEigeneFehler("");
    gefeiertRef.current = false;
    const neuerBlock = { minuten, start: anwahlenRef.current, seit: Date.now() };
    merke("laufend", JSON.stringify({ ...neuerBlock, gefeiert: false }));
    setLaufend(neuerBlock);
    setSekunden(0);
  }

  function starteEigene() {
    const gelesen = leseBlockEingabe(eigene);
    if (gelesen.fehler) { setEigeneFehler(gelesen.fehler); return; }
    if (!gelesen.minuten) { setEigeneFehler("Bitte eine Zahl eingeben, zum Beispiel 30."); return; }
    merke("eigene", String(gelesen.minuten));
    starte(gelesen.minuten);
  }

  // Über eine Referenz, damit der Zeitgeber immer die aktuelle Fassung
  // aufruft, ohne bei jedem Rendern neu zu starten.
  const beendenRef = useRef(null);
  function beende() {
    try { localStorage.removeItem(`${speicherSchluessel}:laufend`); } catch (e) { /* egal */ }
    setLaufend((aktuell) => {
      if (!aktuell) return null;
      const stand = blockStand({ minuten: aktuell.minuten, sekunden: (Date.now() - aktuell.seit) / 1000 });
      const roh = blockErgebnis({ start: aktuell.start, ende: anwahlenRef.current, minuten: stand.minuten });
      setErgebnis({ ...roh, text: blockText({ ...roh, bestwert }), ziel: aktuell.minuten, zielVoll: stand.zielVoll });
      if (roh.anwahlen > bestwert) {
        setBestwert(roh.anwahlen);
        merke("bestwert", String(roh.anwahlen));
      }
      return null;
    });
  }

  beendenRef.current = beende;

  function schalteTon() {
    setTon((an) => {
      merke("ton", an ? "aus" : "an");
      // Beim Einschalten einmal hören, wie es klingt.
      if (!an) zeigeBlockFeier({ anwahlen: 0, ton: true });
      return !an;
    });
  }

  if (laufend) {
    const stand = blockStand({ minuten: laufend.minuten, sekunden });
    const bisher = Math.max(0, anwahlen - laufend.start);
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {/* Ist die Zeit voll, wird die Uhr grün. Die Farbe steht hier direkt
            am Element: ".kennzahl" setzt selbst eine Farbe und gewinnt gegen
            eine Klasse wie "text-teal". */}
        <span className="kennzahl text-[26px] zahl" style={stand.zielVoll ? { color: feldFarbe("termin") } : undefined}>{stand.uhr}</span>
        <div className="text-sm text-textMain">
          {bisher} {bisher === 1 ? "Anwahl" : "Anwahlen"} in diesem Block
          <div className="text-[11px] text-textMuted zahl">
            {stand.zielVoll
              ? `${laufend.minuten} Minuten voll — du kannst weiterlaufen lassen.`
              : `Ziel: ${laufend.minuten} Minuten`}
          </div>
        </div>
        <button onClick={() => beende()} className="btn-ghost text-xs ml-auto">Block beenden</button>
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
        {/* Eigene Länge: Wer 30 oder 60 Minuten am Stück telefoniert, soll
            sich nicht an drei Knöpfe halten müssen. */}
        <span className="flex items-center gap-1">
          {/* Breite direkt am Element: ".input" setzt width 100%. */}
          <input
            className="input text-xs zahl"
            style={{ width: 70, padding: "6px 8px" }}
            value={eigene}
            onChange={(e) => { setEigene(e.target.value); setEigeneFehler(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") starteEigene(); }}
            placeholder="eigene"
            inputMode="numeric"
            aria-label="Eigene Blocklänge in Minuten"
          />
          <button onClick={starteEigene} className="btn-ghost text-xs whitespace-nowrap">Min. starten</button>
        </span>
        <button onClick={schalteTon} className="btn-ghost text-xs" title="Gong, wenn die Zeit voll ist">
          {ton ? "Ton an" : "Ton aus"}
        </button>
        {bestwert > 0 && <span className="text-[11px] text-textMuted ml-auto zahl">Bestwert: {bestwert} Anwahlen</span>}
      </div>
      {eigeneFehler && <p className="text-coral text-xs mt-2">{eigeneFehler}</p>}
      {ergebnis && (
        <p className="text-xs text-textMain mt-2">
          {ergebnis.text}
          {ergebnis.anwahlen > 0 && <span className="text-textMuted"> · Das sind {ergebnis.proStunde} pro Stunde.</span>}
        </p>
      )}
      {/* Die Leitung soll die Belohnung einmal sehen können, ohne 25 Minuten
          zu warten — sonst kann sie sie im Team nicht erklären. */}
      {darfTesten && (
        <button onClick={() => zeigeBlockFeier({ anwahlen: 14, ton })} className="btn-ghost text-[11px] mt-2">
          Belohnung ansehen (nur Leitung)
        </button>
      )}
    </div>
  );
}
