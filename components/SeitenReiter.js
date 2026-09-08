import Icon from "./Icon";

// Die Reiterleiste innerhalb einer Seite.
//
// Sie sah bisher auf jeder Seite anders aus: im Call Tracker schmale
// Pillen, bei den Terminen breitere mit Symbolen, in der Verwaltung wieder
// anders. Wer zwischen den Seiten wechselt, muss die Bedienung jedes Mal
// neu suchen — und übersieht dabei, dass es überhaupt Reiter gibt.
//
// Eine Leiste, überall dieselbe. Die Anzahl steht mit dabei, wo sie
// bekannt ist: dass hinter einem Reiter nichts liegt, sieht man sonst erst
// nach dem Klick.
export default function SeitenReiter({ reiter = [], aktiv, onWechsel }) {
  if (!reiter.length) return null;
  return (
    <div className="flex items-center gap-1.5 mb-5 flex-wrap">
      {reiter.map((r) => {
        const an = r.key === aktiv;
        return (
          <button key={r.key} onClick={() => onWechsel(r.key)}
            aria-current={an ? "page" : undefined}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-colors
              ${an ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain hover:border-amber/60"}`}>
            {r.icon && <Icon name={r.icon} size={12} />}
            {r.label}
            {r.anzahl !== undefined && r.anzahl !== null && (
              <span className={an ? "opacity-80" : "text-textMuted"}>({r.anzahl})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
