import Icon from "./Icon";
import Aufklapper from "./Aufklapper";
import Fortschrittsbalken from "./Fortschrittsbalken";
import { liegtSeit } from "../lib/followUp";
import { deutscheZeit } from "../lib/terminzeit";
import { feldFarbe } from "../lib/diagrammFarben";
import { artVon, kuerzelVon } from "../lib/terminArt";
import { ERGEBNISSE } from "../lib/ergebnis";

// Die Follow-up-Liste: EINE ZEILE je Eintrag, nach Dringlichkeit gebündelt.
//
// Vorher war jeder Eintrag eine Karte mit Balken, Notiz und fünf Knöpfen —
// gut aussehend, aber bei zwanzig offenen Fällen eine Wand, durch die man
// scrollt, bis man aufgibt. Wer nachfassen will, braucht zuerst den
// Überblick: wie viele, wie alt, wer zuerst. Alles Weitere steht einen
// Klick entfernt und dann vollständig da, statt halb in der Zeile.
//
// Als eigenes Bauteil, damit sich die Liste mit Beispieldaten ansehen
// lässt, ohne sich anzumelden.

export const TON = {
  coral: { text: "text-coral", rand: "border-coral/50" },
  amber: { text: "text-amber", rand: "border-amber/40" },
  muted: { text: "text-textMuted", rand: "border-line" },
};

export default function FollowUpListe({
  gruppen = [], reiter = "offen", leitung = false,
  nameVon = () => "", offenId = null, onOeffnen = () => {}, onErgebnis = () => {},
}) {
  return (
    <>
      {gruppen.map((gruppe) => (
        <div key={gruppe.key} className="mb-4">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className={`text-xs font-semibold uppercase tracking-wide ${TON[gruppe.ton].text}`}>{gruppe.label}</span>
            <span className="text-xs text-textMuted zahl">{gruppe.leads.length}</span>
            <span className="text-[11px] text-textMuted">· {gruppe.hinweis}</span>
          </div>

          <div className={`card !p-0 overflow-hidden ${TON[gruppe.ton].rand}`}>
            {gruppe.leads.map((l, i) => {
              const tage = liegtSeit(l);
              const art = artVon(l);
              const offen = offenId === l.id;
              return (
                <div key={l.id} className={i ? "border-t border-line" : ""}>
                  {/* Die Zeile: Stufe, Name, Firma, wie lange. Mehr nicht —
                      alles Weitere steht einen Klick entfernt. */}
                  <button
                    onClick={() => onOeffnen(offen ? null : l.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surfaceRaised/60"
                    aria-expanded={offen}
                    aria-label={`${l.name}${l.company ? `, ${l.company}` : ""} — liegt ${tage} Tage`}>
                    {kuerzelVon(art) && (
                      <span className="font-mono text-[11px] flex-shrink-0" style={{ color: art.farbe }} title={art.label}>
                        {kuerzelVon(art)}
                      </span>
                    )}
                    <span className="text-sm text-textMain truncate">{l.name}</span>
                    {l.company && <span className="text-xs text-textMuted truncate hidden sm:inline">{l.company}</span>}
                    {l.notes && <span className="text-textMuted flex-shrink-0" title="Notiz vorhanden"><Icon name="note" size={12} /></span>}
                    <span className={`text-[11px] ml-auto flex-shrink-0 zahl ${TON[gruppe.ton].text}`}>
                      {tage === null ? "" : `${tage} T`}
                    </span>
                    <span className={`text-textMuted flex-shrink-0 transition-transform ${offen ? "rotate-90" : ""}`}>
                      <Icon name="chevron" size={12} />
                    </span>
                  </button>

                  {/* Der Inhalt entsteht erst beim Aufklappen. Sonst wären
                      die Telefonnummern und Ergebnis-Knöpfe aller
                      zugeklappten Zeilen mit der Tastatur erreichbar — und
                      bei hundert Einträgen hängt zudem die ganze Liste im
                      Dokument, obwohl man eine Zeile liest. */}
                  <Aufklapper offen={offen}>
                    {offen && <div className="px-3 pb-3 pt-1">
                      <div className="flex items-center gap-3 flex-wrap text-xs text-textMuted mb-2">
                        {l.phone && <a href={`tel:${l.phone}`} className="text-amber hover:underline">{l.phone}</a>}
                        {l.email && <a href={`mailto:${l.email}`} className="text-amber hover:underline">{l.email}</a>}
                        {l.company && <span className="sm:hidden">{l.company}</span>}
                        {l.appointment_at && <span>Termin war {deutscheZeit(l.appointment_at)} Uhr</span>}
                        {leitung && nameVon(l.created_by) && <span>· {nameVon(l.created_by)}</span>}
                      </div>

                      <div className="mb-2">
                        <Fortschrittsbalken lead={l} kompakt />
                      </div>
                      {l.notes && <p className="text-xs text-textMain bg-surfaceRaised rounded-lg px-3 py-2 mb-2">{l.notes}</p>}

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Beim abgesagten Termin ist das Ergebnis nicht die Frage —
                            dort geht es um einen neuen Zeitpunkt. */}
                        {reiter !== "abgesagt" && ERGEBNISSE.map((e) => (
                          <button key={e.wert} onClick={() => onErgebnis(l, e.wert)}
                            title={l.outcome === e.wert ? "Nochmal tippen, um das Ergebnis zurückzunehmen" : e.hinweis}
                            className={`btn-ghost text-xs ${l.outcome === e.wert ? "text-textMain" : ""}`}
                            style={l.outcome === e.wert ? { borderColor: feldFarbe("termin") } : undefined}>
                            {l.outcome === e.wert ? "✓ " : ""}{e.label}
                          </button>
                        ))}
                        <a href={`/termine?leadId=${l.id}`} className="btn-ghost text-xs ml-auto">
                          Zum Termin →
                        </a>
                      </div>
                    </div>}
                  </Aufklapper>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
