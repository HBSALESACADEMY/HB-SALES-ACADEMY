// Das Tagespensum als Ring, der sich füllt.
//
// Ein Balken sagt "wie viel Prozent". Ein Ring mit der fehlenden Zahl in
// der Mitte sagt, was jetzt zu tun ist: "noch 12". Das ist die Auskunft,
// die um zehn Uhr morgens zählt.
export default function Zielring({
  wert = 0, ziel = 0, groesse = 92, farbe = "var(--org-accent, #CE3A5C)", label = "Tagesziel",
}) {
  const anteil = ziel > 0 ? Math.min(1, wert / ziel) : 0;
  const fehlt = Math.max(0, ziel - wert);
  const erreicht = ziel > 0 && wert >= ziel;
  const dicke = 8;
  const r = (groesse - dicke) / 2;
  const umfang = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-shrink-0" style={{ width: groesse, height: groesse }}>
        <svg width={groesse} height={groesse} viewBox={`0 0 ${groesse} ${groesse}`} aria-hidden="true">
          <circle cx={groesse / 2} cy={groesse / 2} r={r} fill="none" strokeWidth={dicke}
            stroke="rgb(var(--org-line-rgb, var(--theme-line-rgb)))" />
          <circle cx={groesse / 2} cy={groesse / 2} r={r} fill="none" strokeWidth={dicke} strokeLinecap="round"
            stroke={erreicht ? "#3FBFA6" : farbe}
            strokeDasharray={umfang}
            strokeDashoffset={umfang * (1 - anteil)}
            transform={`rotate(-90 ${groesse / 2} ${groesse / 2})`}
            style={{ transition: "stroke-dashoffset .4s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="kennzahl text-[20px]">{erreicht ? wert : fehlt}</span>
          <span className="text-[10px] text-textMuted">{erreicht ? "geschafft" : "noch"}</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="label">{label}</div>
        <div className="text-sm text-textMain mt-0.5 zahl">{wert} von {ziel}</div>
        <div className="text-[11px] text-textMuted">
          {erreicht ? "Pensum erreicht — alles darüber ist Vorsprung." : `${Math.round(anteil * 100)} % des heutigen Pensums`}
        </div>
      </div>
    </div>
  );
}
