import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { apiGet } from "../lib/apiClient";
import { STIMMUNGEN } from "../lib/buddyRueckblick";
import { wochenName } from "../lib/wochenimpuls";
import { schulungVon } from "../lib/schulung";

// Was das Team gerade beschäftigt — aus den Wochengesprächen mit dem
// Vertriebsbuddy.
//
// Bewusst ohne Zitate: Hier stehen die Themen, nicht die Sätze. Der Chat
// selbst bleibt zwischen der Person und dem Buddy (siehe
// pages/api/herausforderungen.js).

function StimmungsPunkt({ stimmung }) {
  const s = STIMMUNGEN[stimmung];
  if (!s) return <span className="text-[11px] text-textMuted">ohne Angabe</span>;
  return (
    <span className="text-[11px] flex items-center gap-1" style={{ color: s.farbe }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: s.farbe }} />
      {s.label}
    </span>
  );
}

export default function HerausforderungenSeite() {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [offen, setOffen] = useState(0);

  useEffect(() => {
    apiGet("/api/herausforderungen").then(setDaten).catch((e) => { setFehler(e.message); setDaten({ wochen: [] }); });
  }, []);

  if (!daten) return <Layout><p className="text-textMuted text-sm">Lädt…</p></Layout>;

  const wochen = daten.wochen || [];
  const woche = wochen[offen] || null;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Herausforderungen</h1>
      <p className="text-sm text-textMuted mb-4">
        Woran es im Team hakt — herausgelesen aus den Wochengesprächen mit dem Vertriebsbuddy.
      </p>
      <div className="brand-stripe w-16 mb-5" />

      {fehler && <div className="card border-coral/40 text-coral text-sm mb-4 max-w-3xl">{fehler}</div>}

      <div className="card max-w-3xl mb-5 !py-2.5 flex items-start gap-2.5">
        <span className="text-sm flex-shrink-0">🔒</span>
        <p className="text-[11px] text-textMuted leading-relaxed">
          Du siehst hier die Themen, nicht den Chat. Was jemand dem Buddy schreibt, bleibt zwischen ihm und dem
          Buddy — sonst schreibt niemand ehrlich, und dann steht hier nichts Brauchbares mehr.
        </p>
      </div>

      {!wochen.length ? (
        <div className="card max-w-3xl text-sm text-textMuted">
          Noch keine Rückblicke. Sie entstehen freitags aus den Gesprächen der Woche — sobald jemand dem Buddy
          geantwortet hat.
        </div>
      ) : (
        <div className="max-w-3xl flex flex-col gap-5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {wochen.map((w, i) => (
              <button key={w.woche} type="button" onClick={() => setOffen(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${i === offen ? "border-amber text-textMain" : "border-transparent text-textMuted hover:text-textMain"}`}
                style={i === offen ? { background: "color-mix(in srgb, var(--org-accent, #E9B44C) 14%, transparent)" } : undefined}>
                {w.woche === daten.diese ? "Diese Woche" : `ab ${wochenName(w.woche)}`}
              </button>
            ))}
          </div>

          <div className="card">
            <div className="font-semibold text-textMain text-sm mb-1">Häufigste Themen</div>
            <p className="text-xs text-textMuted mb-3">
              Was mehrfach vorkommt, ist selten ein persönliches Problem — meist fehlt eine Hilfe, ein Leitfaden
              oder schlicht Zeit.
            </p>
            {woche.haeufig.length ? (
              <div className="flex flex-col">
                {woche.haeufig.map((h) => (
                  <div key={h.text} className="flex items-center gap-2 py-1.5 border-b border-line last:border-b-0">
                    <span className="text-sm text-textMain flex-1 min-w-0">{h.text}</span>
                    <span className="text-[11px] font-mono text-textMuted flex-shrink-0">
                      {h.personen} {h.personen === 1 ? "Person" : "Personen"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-textMuted">In dieser Woche wurde nichts genannt.</p>
            )}
            <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-line">
              <span className="text-[11px] text-textMuted">Stimmung:</span>
              {["gut", "gemischt", "schwer"].map((s) => (
                <span key={s} className="text-[11px] flex items-center gap-1" style={{ color: STIMMUNGEN[s].farbe }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: STIMMUNGEN[s].farbe }} />
                  {woche.stimmung[s]} {STIMMUNGEN[s].label}
                </span>
              ))}
              {woche.stimmung.ohne > 0 && <span className="text-[11px] text-textMuted">{woche.stimmung.ohne} ohne Angabe</span>}
            </div>
          </div>

          {woche.themen?.length > 0 && (
            <div className="card">
              <div className="font-semibold text-textMain text-sm mb-1">Im Training</div>
              <p className="text-xs text-textMuted mb-3">
                Woran der Vertriebsbuddy gerade mit wem arbeitet — und wie oft die Übung dazu auch gemacht wurde.
              </p>
              <div className="flex flex-col">
                {woche.themen.map((t) => (
                  <div key={t.thema} className="flex items-center gap-2 py-1.5 border-b border-line last:border-b-0">
                    <span className="text-sm text-textMain flex-1 min-w-0">{schulungVon(t.thema)?.titel || t.thema}</span>
                    <span className="text-[11px] font-mono text-textMuted flex-shrink-0">
                      {t.anzahl} {t.anzahl === 1 ? "Person" : "Personen"} · Übung gemacht: {t.erledigt}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="font-semibold text-textMain text-sm mb-3">Je Person</div>
            <div className="flex flex-col gap-3">
              {woche.personen.map((p) => (
                <div key={p.id} className="border border-line rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-semibold text-textMain flex-1 min-w-0 truncate">{p.name}</span>
                    <StimmungsPunkt stimmung={p.stimmung} />
                  </div>
                  {p.herausforderungen.length ? (
                    <ul className="text-xs text-textMuted flex flex-col gap-1">
                      {p.herausforderungen.map((h) => <li key={h}>• {h}</li>)}
                    </ul>
                  ) : (
                    <p className="text-xs text-textMuted">Nichts genannt.</p>
                  )}
                  {p.vorhaben && (
                    <p className="text-[11px] text-textMuted mt-1.5">
                      <span className="text-textMain">Vorgenommen:</span> {p.vorhaben}
                    </p>
                  )}
                  {p.schulung && (
                    <p className="text-[11px] text-textMuted mt-1">
                      <span className="text-textMain">Im Training:</span>{" "}
                      {schulungVon(p.schulung.thema)?.titel || p.schulung.thema}
                      {p.schulung.erledigt === true
                        ? " · Übung gemacht"
                        : p.schulung.erledigt === false
                          ? " · Übung offen"
                          : p.schulung.phase === "uebung" ? " · Übung läuft" : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
