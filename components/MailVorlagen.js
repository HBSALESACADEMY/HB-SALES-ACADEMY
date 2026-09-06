import { PLATZHALTER, unbekanntePlatzhalter } from "../lib/marketingVorlage";

// Die Mail-Vorlagen bearbeiten.
//
// Eine Komponente für zwei Orte: die Organisationsverwaltung (wo alle
// Einstellungen liegen) und den E-Mail-Marketing-Reiter (wo man merkt, dass
// eine Vorlage fehlt). Zwei getrennte Masken für dieselbe Sache wären der
// sichere Weg zu zwei verschiedenen Verhaltensweisen.
export default function MailVorlagen({ vorlagen = [], onChange }) {
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
              <input className="input !py-1.5 text-xs" placeholder="Name der Vorlage, z. B. Erstinfo"
                value={v.name || ""} onChange={(e) => aendere(i, "name", e.target.value)} />
              <button onClick={() => onChange(vorlagen.filter((_, j) => j !== i))}
                className="btn-ghost text-xs text-coral flex-shrink-0">Entfernen</button>
            </div>
            <input className="input !py-1.5 text-xs mb-2" placeholder="Betreff"
              value={v.betreff || ""} onChange={(e) => aendere(i, "betreff", e.target.value)} />
            <textarea className="input !py-1.5 text-xs" rows={7}
              placeholder={"Hallo {{name}},\n\naus unserem Gespräch: {{notiz}}\n\nViele Grüße\n{{vertriebler}}"}
              value={v.text || ""} onChange={(e) => aendere(i, "text", e.target.value)} />
            {unbekannt.length > 0 && (
              <p className="text-[11px] text-coral mt-1">
                Unbekannte Platzhalter: {unbekannt.map((p) => `{{${p}}}`).join(", ")} — die stehen später
                wörtlich in der Mail beim Kunden.
              </p>
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
    </>
  );
}
