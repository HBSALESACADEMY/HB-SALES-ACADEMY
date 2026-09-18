import { useEffect, useState } from "react";
import { hinweisFuer } from "../lib/seitenHinweise";

// Der eine Satz zur Seite, beim ersten Besuch — danach nie wieder.
//
// Gemerkt wird das Wegklicken im Browser und nicht am Konto: Der Hinweis
// ist eine Hilfe, keine Einstellung. Dafür eine Datenbankspalte anzulegen,
// hiesse eine Migration für etwas, das niemand vermisst, wenn es auf einem
// zweiten Gerät noch einmal erscheint.
//
// In privaten Fenstern oder bei blockiertem Speicher wirft der Zugriff —
// dann erscheint der Hinweis eben jedes Mal, statt dass die Seite kaputt
// geht.
const SCHLUESSEL = "hb-hinweis:";

function gelesen(pfad) {
  try {
    return window.localStorage.getItem(SCHLUESSEL + pfad) === "1";
  } catch (e) {
    return false;
  }
}

export default function SeitenHinweis({ pfad }) {
  const hinweis = hinweisFuer(pfad);
  // Erst nach dem Laden im Browser entscheiden: Auf dem Server gibt es
  // keinen Speicher, und ein Hinweis, der kurz aufblitzt und verschwindet,
  // ist schlimmer als keiner.
  const [zeigen, setZeigen] = useState(false);

  useEffect(() => {
    setZeigen(!!hinweis && !gelesen(pfad));
  }, [pfad, hinweis]);

  if (!hinweis || !zeigen) return null;

  function wegklicken() {
    setZeigen(false);
    try {
      window.localStorage.setItem(SCHLUESSEL + pfad, "1");
    } catch (e) {
      /* Ohne Speicher kommt der Hinweis beim nächsten Mal wieder — kein Grund abzubrechen. */
    }
  }

  return (
    <div className="card !py-2.5 mb-4 flex items-start gap-2.5 border-amber/30">
      <span className="text-sm flex-shrink-0">💡</span>
      <p className="text-xs text-textMuted leading-relaxed flex-1">{hinweis.text}</p>
      <button type="button" onClick={wegklicken} title="Verstanden, nicht mehr zeigen"
        className="text-textMuted hover:text-textMain text-xs flex-shrink-0">
        ×
      </button>
    </div>
  );
}
