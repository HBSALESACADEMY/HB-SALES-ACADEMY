import { useState } from "react";
import { PLATZHALTER, unbekanntePlatzhalter, doppelt, verschiebeVorlage, nachNamen, nachErfolg } from "../lib/marketingVorlage";

// Die Mail-Vorlagen bearbeiten.
//
// Eine Komponente für zwei Orte: die Organisationsverwaltung (wo alle
// Einstellungen liegen) und den E-Mail-Marketing-Reiter (wo man merkt, dass
// eine Vorlage fehlt). Zwei getrennte Masken für dieselbe Sache wären der
// sichere Weg zu zwei verschiedenen Verhaltensweisen.
export default function MailVorlagen({ vorlagen = [], onChange, anhaenge = [], signatur = "", erfolge = [] }) {
  // Eine Rückfrage vor dem Entfernen. Eine Vorlage ist Arbeit von einer
  // halben Stunde, und der Knopf sass neben dem Namensfeld — ein Fehlklick
  // dort war unbemerkt weg, sobald jemand danach speicherte.
  const [loeschen, setLoeschen] = useState(null);

  function aendere(i, feld, wert) {
    onChange(vorlagen.map((v, j) => (j === i ? { ...v, [feld]: wert } : v)));
  }

  return (
    <>
      <p className="text-[11px] text-textMuted mb-3">
        Platzhalter werden beim Verschicken ersetzt:{" "}
        {PLATZHALTER.map((p, i) => (
          <span key={p.schluessel}>
            {i > 0 ? ", " : ""}<strong className="text-textMain">{`{{${p.schluessel}}}`}</strong> ({p.label})
          </span>
        ))}
        . Steht in einer Zeile nur ein Platzhalter, für den es keinen Wert gibt, fällt die ganze Zeile weg —
        sonst steht beim Kunden „Firma:“ ohne Firma, und daran erkennt er die Serienmail.
      </p>

      {/* Die Reihenfolge bestimmt, wie die Vorlagen überall stehen: in der
          Übersicht, im Schreibfeld und im Call Tracker. Bisher war das die
          Reihenfolge, in der sie angelegt wurden — jetzt lässt sie sich
          ordnen, entweder von Hand oder auf einen Klick. */}
      {vorlagen.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-[11px] text-textMuted">Reihenfolge:</span>
          <button onClick={() => onChange(nachNamen(vorlagen))} className="btn-ghost text-[11px]">
            Nach Namen
          </button>
          {/* Nur wo Zahlen vorliegen: in der Verwaltung gibt es keine
              Kontakte, und ein Knopf, der dort nichts täte, wäre eine
              Lüge. */}
          {erfolge.length > 0 && (
            <button onClick={() => onChange(nachErfolg(vorlagen, erfolge))} className="btn-ghost text-[11px]"
              title="Die Vorlage mit der besten Terminquote nach oben. Vorlagen ohne bewertete Fälle bleiben hinten.">
              Nach Erfolg
            </button>
          )}
          <span className="text-[11px] text-textMuted">oder mit ↑ ↓ von Hand</span>
        </div>
      )}

      {vorlagen.map((v, i) => {
        // Ein Tippfehler im Platzhalter landet sonst wörtlich in der Mail
        // beim Kunden: "Hallo {{vorname}}".
        const unbekannt = [...new Set([
          ...unbekanntePlatzhalter(v.betreff || ""),
          ...unbekanntePlatzhalter(v.text || ""),
        ])];
        return (
          <div key={i} className="card mb-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] text-textMuted font-mono flex-shrink-0 w-5">{i + 1}.</span>
              <input className="input !py-1.5 text-xs" placeholder="Name der Vorlage, z. B. Erstinfo"
                value={v.name || ""} onChange={(e) => aendere(i, "name", e.target.value)} />
              {vorlagen.length > 1 && (
                <span className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => onChange(verschiebeVorlage(vorlagen, i, -1))} disabled={i === 0}
                    aria-label="Nach oben" title="Nach oben"
                    className="btn-ghost text-xs !px-2 disabled:opacity-30">↑</button>
                  <button onClick={() => onChange(verschiebeVorlage(vorlagen, i, 1))} disabled={i === vorlagen.length - 1}
                    aria-label="Nach unten" title="Nach unten"
                    className="btn-ghost text-xs !px-2 disabled:opacity-30">↓</button>
                </span>
              )}
              {loeschen === i ? (
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[11px] text-coral">Wirklich?</span>
                  <button onClick={() => { setLoeschen(null); onChange(vorlagen.filter((_, j) => j !== i)); }}
                    className="btn-ghost text-xs text-coral border-coral/40">Ja</button>
                  <button onClick={() => setLoeschen(null)} className="btn-ghost text-xs">Nein</button>
                </span>
              ) : (
                <button onClick={() => setLoeschen(i)}
                  className="btn-ghost text-xs text-coral flex-shrink-0">Entfernen</button>
              )}
            </div>
            <input className="input !py-1.5 text-xs mb-2" placeholder="Betreff"
              value={v.betreff || ""} onChange={(e) => aendere(i, "betreff", e.target.value)} />
            <textarea className="input !py-1.5 text-xs" rows={7}
              placeholder={"Hallo {{name}},\n\naus unserem Gespräch: {{notiz}}\n\nViele Grüße\n{{vertriebler}}"}
              value={v.text || ""} onChange={(e) => aendere(i, "text", e.target.value)} />
            {(() => {
              // Was in Vorlage UND Signatur steht, kommt beim Kunden zweimal
              // an. Hier gesagt statt dort gesehen.
              const zweimal = doppelt(v.text || "", signatur);
              if (!zweimal.hatDoppeltes) return null;
              return (
                <p className="text-[11px] text-amber mt-1">
                  Steht doppelt: {zweimal.gruss ? "die Grussformel" : ""}
                  {zweimal.gruss && zweimal.platzhalter.length ? " und " : ""}
                  {zweimal.platzhalter.map((p) => `{{${p}}}`).join(", ")}
                  {" "}— das steht auch im Standardschluss und erscheint deshalb zweimal in der Mail.
                  Am besten hier weglassen: der Schluss gilt für alle Vorlagen.
                </p>
              );
            })()}
            {unbekannt.length > 0 && (
              <p className="text-[11px] text-coral mt-1">
                Unbekannte Platzhalter: {unbekannt.map((p) => `{{${p}}}`).join(", ")} — die stehen später
                wörtlich in der Mail beim Kunden.
              </p>
            )}
            {/* Feste Anhänge je Vorlage: "Erstinfo" soll immer dasselbe
                PDF mitschicken, ohne dass jemand daran denken muss. */}
            {anhaenge.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[11px] text-textMuted">Immer mitschicken:</span>
                {anhaenge.map((a) => {
                  const an = (v.anhaenge || []).includes(a.id);
                  return (
                    <button key={a.id}
                      onClick={() => aendere(i, "anhaenge", an
                        ? (v.anhaenge || []).filter((x) => x !== a.id)
                        : [...(v.anhaenge || []), a.id])}
                      className={`px-2 py-1 rounded-full text-[11px] border ${an ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                      {an ? "✓ " : ""}{a.name}
                    </button>
                  );
                })}
              </div>
            )}

            {!v.name?.trim() || !v.text?.trim() ? (
              <p className="text-[11px] text-textMuted mt-1">
                Ohne Name und Text wird diese Vorlage beim Speichern verworfen — eine leere Vorlage in der
                Auswahl liefert eine leere Mail.
              </p>
            ) : null}
          </div>
        );
      })}

      <button onClick={() => onChange([...vorlagen, { name: "", betreff: "", text: "" }])}
        className="btn-ghost text-xs">+ Vorlage</button>
      {/* Gesagt, statt hinterher gemerkt: entfernt ist eine Vorlage erst,
          wenn gespeichert wurde. Wer die Maske vorher schliesst, hat sie
          noch. */}
      <p className="text-[11px] text-textMuted mt-2">
        Änderungen und Löschungen gelten erst nach dem Speichern.
      </p>
    </>
  );
}
