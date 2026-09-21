import { paletteFarbe } from "../lib/diagrammFarben";

// Eine Rangfolge als waagerechte Balken.
//
// Ein Ring sagt "wie verteilt sich das". Diese Liste sagt "was ist am
// grössten" — und das ist bei Einwandgründen, Teams und Personen die
// eigentliche Frage. Sechs Ringstücke muss man der Legende zuordnen; sechs
// Balken untereinander liest man von oben nach unten.
//
// Von Hand gezeichnet, ohne Diagramm-Bibliothek (fremde Skripte lässt die
// Sicherheitsprüfung nicht zu).
export default function Balkenliste({
  daten = [], leerText = "Noch nichts erfasst.", erklaerung = null, einheit = "", hoechstens = 12, mitAnteil = true,
}) {
  const gefuellt = daten.filter((d) => (d.value || d.wert || 0) > 0)
    .map((d, i) => ({ label: d.label, wert: d.value ?? d.wert ?? 0, farbe: d.color || d.farbe || paletteFarbe(i) }))
    .sort((a, b) => b.wert - a.wert);
  if (!gefuellt.length) {
    return (
      <>
        <p className="text-textMuted text-xs">{leerText}</p>
        {erklaerung && <p className="text-[11px] text-textMuted mt-2 leading-snug">{erklaerung}</p>}
      </>
    );
  }

  const summe = gefuellt.reduce((s, d) => s + d.wert, 0);
  // Ein gemeinsamer Maßstab: der grösste Balken füllt die Zeile, alle
  // anderen stehen im Verhältnis dazu.
  const groesster = gefuellt[0].wert;
  const sichtbar = gefuellt.slice(0, hoechstens);
  const rest = gefuellt.slice(hoechstens);

  return (
    <div>
      <div className="flex flex-col gap-2">
        {sichtbar.map((d) => (
          <div key={d.label}>
            <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
              <span className="text-textMain truncate">{d.label}</span>
              <span className="text-textMuted flex-shrink-0 zahl">
                {d.wert}{einheit ? ` ${einheit}` : ""}
                {mitAnteil && summe > 0 ? ` · ${Math.round((d.wert / summe) * 100)} %` : ""}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.max(2, Math.round((d.wert / groesster) * 100))}%`, background: d.farbe }} />
            </div>
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <p className="text-[11px] text-textMuted mt-2">
          {rest.length} weitere mit zusammen {rest.reduce((s, d) => s + d.wert, 0)}{einheit ? ` ${einheit}` : ""}
        </p>
      )}
      {erklaerung && <p className="text-[11px] text-textMuted mt-2 leading-snug">{erklaerung}</p>}
    </div>
  );
}
