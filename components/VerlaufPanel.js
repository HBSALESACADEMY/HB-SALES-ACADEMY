import Icon from "./Icon";
import Aufklapper from "./Aufklapper";
import { feldFarbe } from "../lib/diagrammFarben";

// Der Reiter "Vergangene Tage" im Call Tracker.
//
// Eine Zeile je Tag: Datum, Anwahlen, Termine und die Runden dieses Tages.
// Beides gehört zusammen — die Frage ist nicht "wie viele Anwahlen" oder
// "wie viele Blöcke", sondern wie es zusammenhängt: achtzig Anwahlen in
// drei konzentrierten Runden sind ein anderer Tag als achtzig über neun
// Stunden verteilt.
//
// Eine Zeile, nicht eine Karte je Tag: Dreissig Karten wären eine Wand,
// durch die man scrollt. Die Runden stehen einen Klick entfernt und dann
// vollständig da.
//
// Als eigenes Bauteil, damit sich die Ansicht mit Beispieldaten prüfen
// lässt, ohne sich anzumelden.

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** "Mo, 21.9." — der Wochentag gehört dazu: Ein Montag liest sich anders als ein Freitag. */
export function tagText(tag) {
  const d = new Date(`${tag}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return tag;
  return `${WOCHENTAGE[d.getUTCDay()]}, ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}

/** "14:05" — nur die Uhrzeit, der Tag steht schon in der Zeile darüber. */
function uhrzeit(zeitpunkt) {
  const d = new Date(zeitpunkt);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default function VerlaufPanel({
  tage = [], offenerTag = null, onOeffnen = () => {}, laedt = false, tageZurueck = 30,
}) {
  if (laedt) return <p className="text-textMuted text-sm">Lädt...</p>;

  if (!tage.length) {
    return (
      <div className="card text-sm text-textMuted">
        Hier stehen deine vergangenen Tage, sobald du Anrufe erfasst hast — mit den Telefonblöcken,
        die du an dem Tag gelaufen bist.
      </div>
    );
  }

  const gesamt = tage.reduce((s, t) => s + t.anwahlen, 0);
  const bloeckeGesamt = tage.reduce((s, t) => s + t.bloecke.length, 0);

  return (
    <>
      <div className="card mb-3">
        <p className="text-xs text-textMuted">
          Die letzten {tageZurueck} Tage, an denen etwas erfasst wurde — neueste zuerst.
          Insgesamt {gesamt} {gesamt === 1 ? "Anwahl" : "Anwahlen"}
          {bloeckeGesamt > 0 && <> in {bloeckeGesamt} {bloeckeGesamt === 1 ? "Runde" : "Runden"}</>}.
          Eine Zeile antippen zeigt die Runden des Tages.
        </p>
      </div>

      <div className="card !p-0 overflow-hidden">
        {tage.map((t, i) => {
          const offen = offenerTag === t.tag;
          return (
            <div key={t.tag} className={i ? "border-t border-line" : ""}>
              <button
                onClick={() => onOeffnen(offen ? null : t.tag)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surfaceRaised/60"
                aria-expanded={offen}
                aria-label={`${tagText(t.tag)}: ${t.anwahlen} Anwahlen, ${t.bloecke.length} Runden`}>
                <span className={`text-sm w-[5.5rem] flex-shrink-0 ${t.istHeute ? "text-textMain font-semibold" : "text-textMain"}`}>
                  {tagText(t.tag)}
                </span>
                {t.istHeute && <span className="text-[10px] text-textMuted flex-shrink-0 hidden sm:inline">heute</span>}
                <span className="text-sm zahl flex-shrink-0" style={{ color: feldFarbe("anwahlen") }}>
                  {t.anwahlen}
                </span>
                <span className="text-[11px] text-textMuted flex-shrink-0">Anwahlen</span>
                {t.termin > 0 && (
                  <span className="text-[11px] zahl flex-shrink-0" style={{ color: feldFarbe("termin") }}>
                    +{t.termin} {t.termin === 1 ? "Termin" : "Termine"}
                  </span>
                )}
                {/* Auf dem Handy nur die Zahl: Der ganze Satz wurde dort auf
                    "1…" abgeschnitten, und ein abgeschnittener Satz sagt
                    weniger als eine Zahl. Vollständig steht er ab Tablet-
                    Breite — und beim Aufklappen ohnehin. */}
                <span className="text-[11px] text-textMuted flex-1 truncate text-right hidden sm:inline">
                  {t.bloecke.length
                    ? `${t.bloecke.length} ${t.bloecke.length === 1 ? "Block" : "Blöcke"} · ${t.bilanz.minuten} Min · ${t.bilanz.anwahlen} in Runden`
                    : "keine Runde"}
                </span>
                <span className="text-[11px] text-textMuted flex-1 text-right zahl whitespace-nowrap sm:hidden">
                  {t.bloecke.length ? `${t.bloecke.length} Bl.` : ""}
                </span>
                <span className={`text-textMuted flex-shrink-0 transition-transform ${offen ? "rotate-90" : ""}`}>
                  <Icon name="chevron" size={12} />
                </span>
              </button>

              <Aufklapper offen={offen}>
                {offen && (
                  <div className="px-3 pb-3 pt-1">
                    {t.bloecke.length === 0 ? (
                      <p className="text-[11px] text-textMuted">
                        An diesem Tag lief kein Telefonblock. Die Anwahlen sind trotzdem gezählt —
                        ein Block ist ein Rahmen, keine Pflicht.
                      </p>
                    ) : (
                      <>
                        <div className="text-[11px] text-textMuted mb-1">
                          {t.bilanz.minuten} Minuten am Stück · {t.bilanz.anwahlen}{" "}
                          {t.bilanz.anwahlen === 1 ? "Anwahl" : "Anwahlen"}
                          {t.bilanz.proStunde !== null && <span className="zahl"> · {t.bilanz.proStunde}/Std</span>}
                          {/* Wie viel des Tages in Runden lief. Der Rest sind
                              Anrufe zwischendurch — auch das ist eine Aussage. */}
                          {t.anwahlen > 0 && (
                            <> · {Math.round((t.bilanz.anwahlen / t.anwahlen) * 100)} % des Tages in Runden</>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {t.bloecke.map((b) => (
                            <div key={b.id} className="flex items-center gap-2 text-[11px] text-textMuted">
                              <span className="zahl w-11 text-right">{uhrzeit(b.gestartet_at)}</span>
                              <span className="zahl w-14">{b.minuten} Min</span>
                              <span className="flex-1 truncate">
                                {b.anwahlen} {b.anwahlen === 1 ? "Anwahl" : "Anwahlen"}
                                {!b.ziel_erreicht && b.ziel_minuten > b.minuten && (
                                  <span> (von {b.ziel_minuten} geplant)</span>
                                )}
                              </span>
                              {b.anwahlen > 0 && b.minuten > 0 && (
                                <span className="zahl" style={{ color: feldFarbe("anwahlen") }}>
                                  {Math.round((b.anwahlen / b.minuten) * 60)}/Std
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Aufklapper>
            </div>
          );
        })}
      </div>
    </>
  );
}
