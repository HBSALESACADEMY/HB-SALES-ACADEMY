import { useState } from "react";
import MailVorschau from "./MailVorschau";
import { istHtmlVorlage, bereinigeHtml, fertigeHtmlMail, ersetzeFremdePlatzhalter } from "../lib/htmlMail";
import {
  BEISPIEL_KONTAKT, werteFuerKontakt, fertigeMail,
  PLATZHALTER, MARKEN_PLATZHALTER, verschiebeVorlage, nachNamen, nachErfolg,
} from "../lib/marketingVorlage";
import { vorlagenHinweise, ernsteHinweise } from "../lib/vorlagenHinweise";

// Die Mail-Vorlagen bearbeiten.
//
// Eine Komponente für zwei Orte: die Organisationsverwaltung (wo alle
// Einstellungen liegen) und den E-Mail-Marketing-Reiter (wo man merkt, dass
// eine Vorlage fehlt). Zwei getrennte Masken für dieselbe Sache wären der
// sichere Weg zu zwei verschiedenen Verhaltensweisen.
//
// Aufbau: eine Zeile je Vorlage, und immer nur EINE aufgeklappt. Vorher
// stand jede Vorlage vollständig untereinander — Quelltext, Vorschau und
// alle Hinweise. Bei drei HTML-Vorlagen war das eine Seite von mehreren
// Bildschirmhöhen, und die Vorlage, die man suchte, lag irgendwo darin.
//
// "marke": Name, Logo und Farben der Organisation — für die Vorschau.
export default function MailVorlagen({ vorlagen = [], onChange, anhaenge = [], signatur = "", erfolge = [], marke = {} }) {
  const [offen, setOffen] = useState(null);
  const [reiter, setReiter] = useState("inhalt");
  const [platzhalterOffen, setPlatzhalterOffen] = useState(false);
  // Eine Rückfrage vor dem Entfernen. Eine Vorlage ist Arbeit von einer
  // halben Stunde, und ein Fehlklick war sonst unbemerkt weg.
  const [loeschen, setLoeschen] = useState(null);

  function aendere(i, feld, wert) {
    onChange(vorlagen.map((v, j) => (j === i ? { ...v, [feld]: wert } : v)));
  }

  function oeffne(i) {
    setOffen(offen === i ? null : i);
    setReiter("inhalt");
    setLoeschen(null);
  }

  // Die aufgeklappte Vorlage wandert beim Verschieben mit — sonst stünde
  // nach einem Klick auf ↑ plötzlich die Nachbarin offen.
  function verschiebe(i, richtung) {
    const ziel = i + richtung;
    onChange(verschiebeVorlage(vorlagen, i, richtung));
    if (offen === i) setOffen(ziel);
    else if (offen === ziel) setOffen(i);
  }

  function entferne(i) {
    onChange(vorlagen.filter((_, j) => j !== i));
    setLoeschen(null);
    if (offen === i) setOffen(null);
    else if (offen !== null && offen > i) setOffen(offen - 1);
  }

  function neueVorlage() {
    onChange([...vorlagen, { name: "", betreff: "", text: "" }]);
    setOffen(vorlagen.length);
    setReiter("inhalt");
  }

  const beispielWerte = werteFuerKontakt(BEISPIEL_KONTAKT, {
    vertriebler: "Beispiel Vertrieblerin",
    organisation: marke.organisation || "Eure Organisation",
    logo: marke.logo, farbe: marke.farbe, farbe2: marke.farbe2,
  });

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {/* Die Platzhalter auf Anfrage statt als Absatz über allem: wer sie
            kennt, braucht sie nicht jedes Mal zu lesen. */}
        <button type="button" onClick={() => setPlatzhalterOffen((x) => !x)} className="btn-ghost text-[11px]">
          {platzhalterOffen ? "Platzhalter ausblenden" : "Platzhalter anzeigen"}
        </button>
        {/* Die Reihenfolge gilt überall: Übersicht, Schreibfeld, Call Tracker. */}
        {vorlagen.length > 1 && (
          <>
            <span className="text-[11px] text-textMuted ml-auto">Sortieren:</span>
            <button type="button" onClick={() => onChange(nachNamen(vorlagen))} className="btn-ghost text-[11px]">
              Nach Namen
            </button>
            {/* Nur wo Zahlen vorliegen — in der Verwaltung gibt es keine
                Kontakte, und ein Knopf, der dort nichts täte, wäre eine Lüge. */}
            {erfolge.length > 0 && (
              <button type="button" onClick={() => onChange(nachErfolg(vorlagen, erfolge))} className="btn-ghost text-[11px]"
                title="Die Vorlage mit der besten Terminquote nach oben.">
                Nach Erfolg
              </button>
            )}
          </>
        )}
      </div>

      {platzhalterOffen && (
        <div className="rounded-lg border border-line px-3 py-2 mb-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[...PLATZHALTER, ...MARKEN_PLATZHALTER].map((p) => (
              <span key={p.schluessel} title={p.label}
                className="px-2 py-0.5 rounded bg-surfaceRaised text-[11px] font-mono text-textMain">
                {`{{${p.schluessel}}}`}
              </span>
            ))}
          </div>
          <ul className="text-[11px] text-textMuted flex flex-col gap-0.5">
            {[...PLATZHALTER, ...MARKEN_PLATZHALTER].map((p) => (
              <li key={p.schluessel}><span className="font-mono text-textMain">{`{{${p.schluessel}}}`}</span> — {p.label}</li>
            ))}
          </ul>
          <p className="text-[11px] text-textMuted mt-2">
            In Text-Vorlagen fällt eine Zeile weg, deren einziger Platzhalter leer bleibt — sonst stünde beim Kunden
            „Firma:“ ohne Firma.
          </p>
        </div>
      )}

      {vorlagen.length === 0 && (
        <p className="text-xs text-textMuted mb-2">Noch keine Vorlage.</p>
      )}

      <div className="flex flex-col gap-1.5 mb-3">
        {vorlagen.map((v, i) => {
          const html = istHtmlVorlage(v);
          const hinweise = vorlagenHinweise(v, signatur);
          const ernst = ernsteHinweise(hinweise);
          const istOffen = offen === i;

          return (
            <div key={i} className={`rounded-lg border ${istOffen ? "border-amber/60" : "border-line"}`}>
              {/* Die Zeile: alles, was man zum Wiederfinden braucht, und die
                  Frage "ist mit dieser Vorlage etwas?" als eine Zahl. */}
              <div className="flex items-center gap-2 px-2.5 py-2">
                <span className="text-[11px] text-textMuted font-mono w-5 flex-shrink-0">{i + 1}.</span>
                <button type="button" onClick={() => oeffne(i)} className="flex-1 min-w-0 text-left">
                  <span className="flex items-center gap-2">
                    <span className={`text-sm truncate ${v.name?.trim() ? "text-textMain" : "text-textMuted italic"}`}>
                      {v.name?.trim() || "Ohne Namen"}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide rounded px-1.5 py-0.5 border border-line text-textMuted flex-shrink-0">
                      {html ? "HTML" : "Text"}
                    </span>
                    {ernst > 0 && (
                      <span title={`${ernst} ${ernst === 1 ? "Hinweis" : "Hinweise"}`}
                        className="text-[10px] rounded-full px-1.5 py-0.5 bg-amber/15 text-amber flex-shrink-0">
                        ⚠ {ernst}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-textMuted truncate">{v.betreff?.trim() || "Kein Betreff"}</span>
                </button>
                {vorlagen.length > 1 && (
                  <span className="flex items-center gap-0.5 flex-shrink-0">
                    <button type="button" onClick={() => verschiebe(i, -1)} disabled={i === 0}
                      aria-label="Nach oben" className="btn-ghost text-xs !px-1.5 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => verschiebe(i, 1)} disabled={i === vorlagen.length - 1}
                      aria-label="Nach unten" className="btn-ghost text-xs !px-1.5 disabled:opacity-30">↓</button>
                  </span>
                )}
                <button type="button" onClick={() => oeffne(i)} className="btn-ghost text-xs flex-shrink-0">
                  {istOffen ? "Schliessen" : "Bearbeiten"}
                </button>
                {loeschen === i ? (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" onClick={() => entferne(i)} className="btn-ghost text-xs text-coral border-coral/40">Ja, entfernen</button>
                    <button type="button" onClick={() => setLoeschen(null)} className="btn-ghost text-xs">Nein</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setLoeschen(i)} aria-label="Entfernen"
                    className="btn-ghost text-xs text-coral flex-shrink-0">×</button>
                )}
              </div>

              {istOffen && (
                <div className="border-t border-line px-3 py-3 flex flex-col gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
                    <input className="input !py-1.5 text-xs" placeholder="Name der Vorlage, z. B. Erstinfo"
                      value={v.name || ""} onChange={(e) => aendere(i, "name", e.target.value)} />
                    {/* Text oder gestaltete HTML-Mail. */}
                    <div className="flex items-center gap-1.5">
                      {[["text", "Text"], ["html", "HTML"]].map(([wert, label]) => (
                        <button key={wert} type="button" onClick={() => aendere(i, "format", wert)}
                          className={`px-2.5 py-1 rounded-full text-[11px] border ${(v.format || "text") === wert ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input className="input !py-1.5 text-xs" placeholder="Betreff"
                    value={v.betreff || ""} onChange={(e) => aendere(i, "betreff", e.target.value)} />

                  {/* Drei Reiter statt einer Wand: Inhalt, wie es aussieht, und
                      was auffällt. */}
                  <div className="flex items-center gap-1 border-b border-line">
                    {[
                      ["inhalt", "Inhalt"],
                      ["vorschau", "Vorschau"],
                      ["hinweise", hinweise.length ? `Hinweise (${hinweise.length})` : "Hinweise"],
                    ].map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setReiter(key)}
                        className={`px-2.5 py-1.5 text-xs -mb-px border-b-2 ${reiter === key ? "border-amber text-textMain" : "border-transparent text-textMuted hover:text-textMain"}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {reiter === "inhalt" && (
                    <>
                      {html ? (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Beim Einlesen wird bereinigt; was entfernt wurde,
                                steht unter "Hinweise". */}
                            <label className="btn-ghost text-xs cursor-pointer">
                              HTML-Datei laden
                              <input type="file" accept=".html,.htm,text/html" className="hidden"
                                onChange={async (e) => {
                                  const datei = e.target.files?.[0];
                                  e.target.value = "";
                                  if (!datei) return;
                                  const { html: sauber, entfernt } = bereinigeHtml(await datei.text());
                                  onChange(vorlagen.map((x, j) => (j === i ? { ...x, html: sauber, entfernt } : x)));
                                }} />
                            </label>
                            <span className="text-[11px] text-textMuted">oder den Quelltext einfügen</span>
                          </div>
                          <textarea className="input !py-1.5 text-[11px] font-mono" rows={10}
                            placeholder={"<table>…<p>Guten Tag {{anrede}} {{nachname}},</p>…</table>"}
                            value={v.html || ""}
                            onChange={(e) => onChange(vorlagen.map((x, j) => (j === i
                              ? { ...x, html: e.target.value, entfernt: bereinigeHtml(e.target.value).entfernt }
                              : x)))} />
                        </>
                      ) : (
                        <textarea className="input !py-1.5 text-xs" rows={8}
                          placeholder={"Guten Tag {{anrede}} {{nachname}},\n\naus unserem Gespräch: {{notiz}}\n\nViele Grüße\n{{vertriebler}}"}
                          value={v.text || ""} onChange={(e) => aendere(i, "text", e.target.value)} />
                      )}

                      {/* Feste Anhänge je Vorlage: "Erstinfo" soll immer
                          dasselbe PDF mitschicken, ohne dass jemand daran denkt. */}
                      {anhaenge.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-textMuted">Immer mitschicken:</span>
                          {anhaenge.map((a) => {
                            const an = (v.anhaenge || []).includes(a.id);
                            return (
                              <button key={a.id} type="button"
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
                    </>
                  )}

                  {reiter === "vorschau" && (
                    (html ? v.html?.trim() : v.text?.trim()) ? (
                      html ? (
                        <MailVorschau html={fertigeHtmlMail(v, beispielWerte, signatur).html} />
                      ) : (
                        <pre className="text-xs text-textMain whitespace-pre-wrap bg-surfaceRaised rounded-lg px-3 py-2">
                          {fertigeMail(v, beispielWerte, signatur).text}
                        </pre>
                      )
                    ) : (
                      <p className="text-xs text-textMuted">Noch kein Inhalt — erst unter „Inhalt“ etwas eintragen.</p>
                    )
                  )}

                  {reiter === "hinweise" && (
                    hinweise.length === 0 ? (
                      <p className="text-xs text-teal">Nichts aufgefallen.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {hinweise.map((h) => (
                          <li key={h.text}
                            className={`text-[11px] rounded-lg px-2.5 py-2 border ${h.art === "fehler" ? "border-coral/40 text-coral" : h.art === "warnung" ? "border-amber/40 text-amber" : "border-line text-textMuted"}`}>
                            {h.text}
                            {h.fremde?.length > 0 && (
                              <>
                                <ul className="text-textMuted mt-1">
                                  {h.fremde.map((f) => (
                                    <li key={f.fund}><code>{f.fund}</code> → <code>{f.vorschlag}</code></li>
                                  ))}
                                </ul>
                                <button type="button" className="btn-ghost text-[11px] mt-1.5"
                                  onClick={() => aendere(i, "html", ersetzeFremdePlatzhalter(v.html || ""))}>
                                  Alle ersetzen
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={neueVorlage} className="btn-ghost text-xs">+ Vorlage</button>
        {/* Gesagt, statt hinterher gemerkt: entfernt ist eine Vorlage erst,
            wenn gespeichert wurde. */}
        <span className="text-[11px] text-textMuted">Änderungen und Löschungen gelten erst nach dem Speichern.</span>
      </div>
    </>
  );
}
