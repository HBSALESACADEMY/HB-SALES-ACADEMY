import { useEffect, useState } from "react";

// Der Erklärkasten oben auf jeder Seite.
//
// Beim ersten Mal ist er hilfreich, danach steht er im Weg: auf den
// Terminen schob er die Werkzeugleiste und die ersten Karten nach unten.
// Deshalb lässt er sich zuklappen — und bleibt zugeklappt, bis man ihn
// wieder aufklappt.
export default function InfoCard({ title = "Wie funktioniert das?", children }) {
  const schluessel = `infokarte:${title}`;
  const [offen, setOffen] = useState(true);

  // Erst nach dem ersten Rendern lesen: auf dem Server gibt es kein
  // localStorage, und ein Unterschied zwischen Server und Browser bricht
  // die Seite beim Zusammensetzen.
  useEffect(() => {
    try {
      if (localStorage.getItem(schluessel) === "zu") setOffen(false);
    } catch (e) { /* Speicher gesperrt — dann bleibt der Hinweis offen. */ }
  }, [schluessel]);

  function umschalten() {
    const neu = !offen;
    setOffen(neu);
    try { localStorage.setItem(schluessel, neu ? "offen" : "zu"); } catch (e) { /* egal */ }
  }

  return (
    <div className="card mb-5 border border-line/60">
      <button
        onClick={umschalten}
        aria-expanded={offen}
        className="text-xs font-semibold text-textMain flex items-center gap-1.5 w-full text-left"
      >
        <span>💡</span> {title}
        <span className="ml-auto text-textMuted font-normal">{offen ? "ausblenden ▲" : "anzeigen ▼"}</span>
      </button>
      {offen && <div className="text-xs text-textMuted leading-relaxed mt-1.5">{children}</div>}
    </div>
  );
}
