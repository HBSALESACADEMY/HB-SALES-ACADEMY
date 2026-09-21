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
import { punkteFuer, weicherPfad, flaechenPfad } from "../lib/kurve";
export default function Kennzahl({
  label, wert, zusatz = "", delta = null, farbe = null, gross = false, className = "", verlauf = null,
}) {
  return (
    <div className={`bg-surface rounded-xl px-4 py-3 ${className}`}>
      <div className="label">{label}</div>
      <div className="flex items-baseline gap-2 mt-1 flex-wrap">
        <span className={gross ? "kennzahl text-[32px]" : "kennzahl"} style={farbe ? { color: farbe } : undefined}>{wert}</span>
        {delta && <Veraenderung {...delta} />}
      </div>
      {zusatz && <div className="text-[11px] text-textMuted mt-0.5">{zusatz}</div>}
      {/* Die kleine Kurve darunter beantwortet die Frage, die eine einzelne
          Zahl offen lässt: Geht es rauf oder runter? */}
      {verlauf && verlauf.length >= 2 && <Sparkline werte={verlauf} farbe={farbe} />}
    </div>
  );
}

/** Eine Kurve in Daumennagelgrösse — ohne Achsen, ohne Zahlen. */
export function Sparkline({ werte = [], farbe = null, hoehe = 26 }) {
  const { punkte } = punkteFuer(werte.map((w) => (typeof w === "number" ? w : w.wert || 0)), 100, hoehe, 2);
  if (punkte.length < 2) return null;
  const strich = farbe || "currentColor";
  return (
    <svg viewBox={`0 0 100 ${hoehe}`} className="w-full mt-2" style={{ height: hoehe }} preserveAspectRatio="none" aria-hidden="true">
      <path d={flaechenPfad(punkte, hoehe)} fill={strich} opacity=".13" />
      <path d={weicherPfad(punkte)} fill="none" stroke={strich} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
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
