// Der Kopf einer Karte: Überschrift, Zeitraum, rechts der Filter oder eine
// Aktion.
//
// Der Filter gehört an die Karte, die er betrifft, nicht in eine Zeile über
// der ganzen Seite: Auf einer Seite mit sechs Karten beantwortet jede eine
// eigene Frage, und "Dieser Monat" gilt oft nur für eine davon.
export default function KartenKopf({ titel, zeitraum = "", hinweis = null, children = null, className = "" }) {
  return (
    <div className={`flex items-center gap-2 flex-wrap mb-3 ${className}`}>
      <span className="text-sm font-semibold text-textMain">{titel}</span>
      {zeitraum && <span className="text-[11px] text-textMuted">{zeitraum}</span>}
      {hinweis}
      {children && <span className="ml-auto flex items-center gap-2 flex-wrap">{children}</span>}
    </div>
  );
}
