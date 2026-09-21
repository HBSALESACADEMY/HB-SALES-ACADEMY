import { useEffect, useState } from "react";
import Icon from "./Icon";

// "Neu in der Academy" — die Erklärung einer neuen Funktion, einmal.
//
// Der Seitenhinweis erklärt den ZWECK einer Seite in einem Satz und
// erscheint nur beim ersten Besuch. Wer die Seite längst kennt, hat ihn
// weggeklickt — und bekommt von einer neuen Funktion dort nie etwas mit.
// Genau diese Lücke füllt diese Karte: Sie kommt unabhängig davon, wie oft
// jemand schon da war, und verschwindet nach dem Lesen.
//
// Gemerkt wird das Wegklicken im Browser, nicht am Konto: Eine Erklärung
// ist eine Hilfe, keine Einstellung. Erscheint sie auf einem zweiten Gerät
// noch einmal, hat niemand einen Schaden.
export default function NeuHinweis({ id, titel, punkte = [], schluss = null }) {
  const [zeigen, setZeigen] = useState(false);
  const speicher = `hb-neu:${id}`;

  useEffect(() => {
    try {
      setZeigen(window.localStorage.getItem(speicher) !== "1");
    } catch (e) {
      setZeigen(true);
    }
  }, [speicher]);

  if (!zeigen || !punkte.length) return null;

  function verstanden() {
    setZeigen(false);
    try { window.localStorage.setItem(speicher, "1"); } catch (e) { /* dann eben nochmal */ }
  }

  return (
    <div className="card mb-3 border-amber/40">
      <div className="flex items-start gap-2">
        <span className="label text-amber flex-shrink-0 mt-0.5">Neu</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-textMain">{titel}</div>
          <ul className="flex flex-col gap-1.5 mt-2">
            {punkte.map((p) => (
              <li key={p.text} className="flex items-start gap-2 text-xs text-textMuted leading-relaxed">
                <span className="text-textMain flex-shrink-0 mt-0.5"><Icon name={p.icon} size={13} /></span>
                <span><strong className="text-textMain font-medium">{p.was}</strong> {p.text}</span>
              </li>
            ))}
          </ul>
          {schluss && <p className="text-[11px] text-textMuted mt-2">{schluss}</p>}
          <button type="button" onClick={verstanden} className="btn-ghost text-xs mt-3">Verstanden</button>
        </div>
      </div>
    </div>
  );
}
