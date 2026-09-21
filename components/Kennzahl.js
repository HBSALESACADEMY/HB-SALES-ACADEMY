// Eine Kennzahl: Beschriftung, Zahl, Zeitraum — und optional die
// Veränderung gegenüber einem Vergleichszeitraum.
//
// Bisher schrieb jede Seite das selbst, mit unterschiedlichen Grössen und
// Abständen: auf dem Startbildschirm 3xl, in der Auswertung xl, im Manager
// wieder anders. Eine Kennzahl soll überall gleich aussehen, sonst
// vergleicht man beim Blättern Äpfel mit Birnen.
//
// Ohne Rahmen, nur mit eigener Fläche: Die Kacheln stehen meist INNERHALB
// einer Karte, und ein Rahmen im Rahmen ist eine Trennung ohne Aussage.
export default function Kennzahl({ label, wert, zusatz = "", delta = null, farbe = null, gross = false, className = "" }) {
  return (
    <div className={`bg-surface rounded-xl px-4 py-3 ${className}`}>
      <div className="label">{label}</div>
      <div className="flex items-baseline gap-2 mt-1 flex-wrap">
        <span className={gross ? "kennzahl text-[32px]" : "kennzahl"} style={farbe ? { color: farbe } : undefined}>{wert}</span>
        {delta && <Veraenderung {...delta} />}
      </div>
      {zusatz && <div className="text-[11px] text-textMuted mt-0.5">{zusatz}</div>}
    </div>
  );
}

/**
 * Die Veränderung als kleine Angabe hinter der Zahl.
 *
 * "gut" sagt, welche Richtung erwünscht ist: Bei Absagen ist ein Plus keine
 * gute Nachricht, und grün wäre dort schlicht falsch.
 */
export function Veraenderung({ delta = 0, prozent = null, gut = "hoch" }) {
  if (!delta) return <span className="text-[11px] text-textMuted zahl">±0</span>;
  const besser = gut === "hoch" ? delta > 0 : delta < 0;
  return (
    <span className={`text-[11px] zahl ${besser ? "text-teal" : "text-coral"}`}>
      {delta > 0 ? "+" : "−"}{Math.abs(delta)}
      {prozent === null ? "" : ` · ${delta > 0 ? "+" : "−"}${Math.abs(prozent)} %`}
    </span>
  );
}
