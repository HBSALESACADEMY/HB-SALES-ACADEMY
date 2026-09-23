import { feldFarbe } from "../lib/diagrammFarben";

// Die Zähler des Call Trackers als Kacheln.
//
// Neun Zähler in EINER Spalte waren auf dem Handy eine Wand, durch die man
// scrollen musste, um überhaupt an den Anruf-Knopf zu kommen. Zwei Spalten
// auf dem Handy und fünf am Rechner zeigen dieselben Zahlen auf einem
// Fünftel der Höhe.
//
// Die Zahl bleibt gross und antippbar, der Minus-Knopf bleibt ein eigenes
// Ziel: Hier wird im Stehen mit dem Daumen getippt, da darf nichts
// schrumpfen, worauf man zielen muss. Gespart wird an Luft, nicht an
// Trefferflächen.
//
// Als eigenes Bauteil, damit sich die Dichte mit Beispielzahlen ansehen
// lässt, ohne sich anzumelden.
export default function ZaehlerKacheln({
  felder = [], counts = {}, setzeFeld = null, setzeWert = "",
  onWert = () => {}, onOeffnen = () => {}, onAbbrechen = () => {},
  onSetzen = () => {}, onRunter = () => {},
}) {
  return (
    <>
          {/* Neun Zähler in EINER Spalte waren auf dem Handy eine Wand, durch
              die man scrollen musste, um an den Anruf-Knopf zu kommen. Zwei
              Spalten auf dem Handy, fünf am Rechner: dieselben Zahlen auf
              einem Fünftel der Höhe. Der Hinweis zum Korrigieren stand
              neunmal untereinander — jetzt einmal unter dem Gitter. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-2">
            {felder.map((f) => (
              // Dieselbe Farbe wie im Diagramm: wer die Kachel gesehen hat,
              // findet den Wert im Kreis ohne Legende wieder.
              // Im Reiter "Heute" gibt es nichts aufzuschlüsseln — es IST ein
              // einzelner Tag. Die Aufschlüsselung steht in den Statistiken.
              <div key={f.key} className="card !p-2.5" style={{ borderColor: `color-mix(in srgb, ${feldFarbe(f.key)} 40%, transparent)` }}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: feldFarbe(f.key) }} />
                  <span className="text-[11px] text-textMuted flex-1 leading-tight">{f.label}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {setzeFeld === f.key ? (
                    <input
                      autoFocus type="number" inputMode="numeric" min="0"
                      className="input !py-1 !px-2 text-2xl font-display font-semibold w-24"
                      value={setzeWert}
                      onChange={(e) => onWert(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSetzen(f.key, setzeWert);
                        if (e.key === "Escape") onAbbrechen();
                      }}
                      onBlur={() => onSetzen(f.key, setzeWert)} />
                  ) : (
                    <button
                      onClick={() => onOeffnen(f.key)}
                      title="Zahl anklicken, um sie zu setzen"
                      className="text-2xl font-display font-semibold hover:opacity-70"
                      style={{ color: feldFarbe(f.key) }}>
                      {counts[f.key] || 0}
                    </button>
                  )}
                  <button onClick={() => onRunter(f.key)}
                    title={f.key === "anwahlen"
                      ? "Nimmt den letzten Anruf ganz zurück"
                      : "Zähler um eins verringern"}
                    className="w-7 h-7 rounded-lg border border-line text-textMuted hover:text-textMain hover:border-amber flex items-center justify-center flex-shrink-0">
                    –
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-textMuted mb-5">
            {setzeFeld
              ? "Zahl eintippen, Enter — gilt für alle Geräte."
              : "Zahl antippen, um sie zu setzen. − korrigiert um eins; bei den Anwahlen nimmt es den letzten Anruf ganz zurück."}
          </p>
    </>
  );
}
