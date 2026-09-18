import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { apiGet } from "../lib/apiClient";
import { STIMMUNGEN } from "../lib/buddyRueckblick";
import { wochenName } from "../lib/wochenimpuls";
import { schulungVon } from "../lib/schulung";
import { vorTagen } from "../lib/teamlage";

// Was das Team gerade beschäftigt — aus den Wochengesprächen mit dem
// Vertriebsbuddy.
//
// Aufgebaut wie eine Übersicht, nicht wie ein Bericht: oben vier Zahlen,
// die man in zwei Sekunden liest, darunter Reiter für das, was man
// nachschlagen will. Vorher standen fünf Karten untereinander, und wer nur
// wissen wollte, wo es hakt, musste an der ganzen Verbindungsliste vorbei.
//
// Bewusst ohne Zitate: Hier stehen die Themen, nicht die Sätze. Der Chat
// selbst bleibt zwischen der Person und dem Buddy (siehe
// pages/api/herausforderungen.js).

const REITER = [
  { key: "ueberblick", label: "Überblick" },
  { key: "personen", label: "Personen" },
  { key: "verbindungen", label: "Verbindungen" },
];

// Schwere Wochen zuerst: Wer Hilfe braucht, soll nicht unten in der Liste stehen.
const STIMMUNGS_RANG = { schwer: 0, gemischt: 1, gut: 2 };

function Kachel({ label, children, hinweis }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5 min-w-0">
      <div className="text-[11px] text-textMuted mb-1">{label}</div>
      {children}
      {hinweis && <div className="text-[10px] text-textMuted mt-1 truncate">{hinweis}</div>}
    </div>
  );
}

function Stimmungsbalken({ bild }) {
  const summe = (bild?.gut || 0) + (bild?.gemischt || 0) + (bild?.schwer || 0);
  if (!summe) return <div className="h-2 rounded-full bg-surfaceRaised" />;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-surfaceRaised">
      {["gut", "gemischt", "schwer"].map((s) => (bild[s] > 0 ? (
        <div key={s} style={{ width: `${(bild[s] / summe) * 100}%`, background: STIMMUNGEN[s].farbe }} title={`${bild[s]} ${STIMMUNGEN[s].label}`} />
      ) : null))}
    </div>
  );
}

function StimmungsPunkt({ stimmung }) {
  const s = STIMMUNGEN[stimmung];
  if (!s) return <span className="text-[11px] text-textMuted whitespace-nowrap">keine Angabe</span>;
  return (
    <span className="text-[11px] inline-flex items-center gap-1 whitespace-nowrap" style={{ color: s.farbe }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: s.farbe }} />
      {s.label}
    </span>
  );
}

function Mengenbalken({ anteil, farbe = "var(--org-accent, #E9B44C)" }) {
  return (
    <div className="h-1.5 rounded-full bg-surfaceRaised overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round(anteil * 100))}%`, background: farbe }} />
    </div>
  );
}

function uebungsText(schulung) {
  if (!schulung) return null;
  if (schulung.erledigt === true) return "Übung gemacht";
  if (schulung.erledigt === false) return "Übung offen";
  return schulung.phase === "uebung" ? "Übung läuft" : "Lektion verschickt";
}

export default function HerausforderungenSeite() {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [wocheIndex, setWocheIndex] = useState(0);
  const [reiter, setReiter] = useState("ueberblick");
  const [filter, setFilter] = useState("alle");

  useEffect(() => {
    apiGet("/api/herausforderungen")
      .then(setDaten)
      .catch((e) => { setFehler(e.message); setDaten({ wochen: [] }); });
  }, []);

  const wochen = daten?.wochen || [];
  const woche = wochen[wocheIndex] || null;
  const verbindungen = daten?.verbindungen || { verbunden: [], offen: [], gesamt: 0 };

  const personen = useMemo(() => {
    const liste = [...(woche?.personen || [])].sort((a, b) =>
      (STIMMUNGS_RANG[a.stimmung] ?? 3) - (STIMMUNGS_RANG[b.stimmung] ?? 3) || a.name.localeCompare(b.name, "de"));
    if (filter === "schwer") return liste.filter((p) => p.stimmung === "schwer");
    if (filter === "training") return liste.filter((p) => p.schulung);
    return liste;
  }, [woche, filter]);

  if (!daten) return <Layout><p className="text-textMuted text-sm">Lädt…</p></Layout>;

  const topThema = woche?.haeufig?.[0] || null;
  const maxPersonen = Math.max(1, ...(woche?.haeufig || []).map((h) => h.personen));
  const uebungen = (woche?.themen || []).reduce((s, t) => ({ anzahl: s.anzahl + t.anzahl, erledigt: s.erledigt + t.erledigt }), { anzahl: 0, erledigt: 0 });
  const wochenLabel = (w) => (w.woche === daten.diese ? "Diese Woche" : `Woche ab ${wochenName(w.woche)}`);

  return (
    <Layout>
      <div className="max-w-4xl">
        <div className="flex items-end gap-3 flex-wrap mb-1">
          <h1 className="text-2xl font-display font-medium brand-text-gradient flex-1">Herausforderungen</h1>
          {wochen.length > 0 && (
            <select className="input !py-1.5 !text-xs w-auto" value={wocheIndex} onChange={(e) => setWocheIndex(Number(e.target.value))}>
              {wochen.map((w, i) => <option key={w.woche} value={i}>{wochenLabel(w)}</option>)}
            </select>
          )}
        </div>
        <p className="text-[11px] text-textMuted mb-4">
          🔒 Aus den Wochengesprächen mit dem Vertriebsbuddy — du siehst die Themen, nicht den Chat.
        </p>

        {fehler && <div className="card border-coral/40 text-coral text-sm mb-4">{fehler}</div>}
        {daten.hinweis && <div className="card border-amber/40 text-amber text-xs mb-4">{daten.hinweis}</div>}

        {/* Das Wichtigste auf einen Blick */}
        <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4 mb-5">
          <Kachel label="Mit dem Buddy verbunden"
            hinweis={verbindungen.offen.length ? `${verbindungen.offen.length} noch nicht verbunden` : "alle verbunden"}>
            <div className="text-xl font-semibold text-textMain">
              {verbindungen.verbunden.length}<span className="text-sm text-textMuted font-normal"> / {verbindungen.gesamt}</span>
            </div>
          </Kachel>
          <Kachel label="Stimmung"
            hinweis={woche ? ["gut", "gemischt", "schwer"].map((s) => `${woche.stimmung[s]} ${STIMMUNGEN[s].label}`).join(" · ") : "noch keine Rückblicke"}>
            <div className="pt-2"><Stimmungsbalken bild={woche?.stimmung} /></div>
          </Kachel>
          <Kachel label="Häufigstes Thema" hinweis={topThema ? `${topThema.personen} ${topThema.personen === 1 ? "Person" : "Personen"}` : null}>
            <div className="text-sm font-semibold text-textMain leading-snug line-clamp-2">{topThema ? topThema.text : "—"}</div>
          </Kachel>
          <Kachel label="Übungen gemacht" hinweis={uebungen.anzahl ? "aus den Mini-Schulungen" : "noch keine Schulung"}>
            <div className="text-xl font-semibold text-textMain">
              {uebungen.anzahl ? <>{uebungen.erledigt}<span className="text-sm text-textMuted font-normal"> / {uebungen.anzahl}</span></> : "—"}
            </div>
          </Kachel>
        </div>

        {/* Reiter */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {REITER.map((r) => {
            const an = r.key === reiter;
            const zahl = r.key === "personen" ? (woche?.personen?.length || 0)
              : r.key === "verbindungen" ? `${verbindungen.verbunden.length}/${verbindungen.gesamt}` : null;
            return (
              <button key={r.key} type="button" onClick={() => setReiter(r.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${an ? "border-amber text-textMain" : "border-transparent text-textMuted hover:text-textMain"}`}
                style={an ? { background: "color-mix(in srgb, var(--org-accent, #E9B44C) 14%, transparent)" } : undefined}>
                {r.label}
                {zahl !== null && <span className="ml-1.5 text-[10px] font-mono text-textMuted">{zahl}</span>}
              </button>
            );
          })}
        </div>

        {reiter === "ueberblick" && (
          !woche ? (
            <div className="card text-sm text-textMuted">
              Noch keine Rückblicke. Sie entstehen freitags aus den Gesprächen der Woche — sobald jemand dem Buddy
              geantwortet hat.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 items-start">
              <div className="card">
                <div className="font-semibold text-textMain text-sm mb-1">Woran es hakt</div>
                <p className="text-[11px] text-textMuted mb-3">
                  Was bei mehreren vorkommt, ist selten persönlich — meist fehlt eine Hilfe, ein Leitfaden oder Zeit.
                </p>
                {woche.haeufig.length ? (
                  <div className="flex flex-col gap-2.5">
                    {woche.haeufig.slice(0, 8).map((h) => (
                      <div key={h.text}>
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-sm text-textMain flex-1 min-w-0">{h.text}</span>
                          <span className="text-[11px] font-mono text-textMuted flex-shrink-0">{h.personen}</span>
                        </div>
                        <Mengenbalken anteil={h.personen / maxPersonen} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-textMuted">In dieser Woche wurde nichts genannt.</p>
                )}
              </div>

              <div className="card">
                <div className="font-semibold text-textMain text-sm mb-1">Im Training</div>
                <p className="text-[11px] text-textMuted mb-3">Woran der Buddy mit wem arbeitet — und ob die Übung gemacht wurde.</p>
                {woche.themen?.length ? (
                  <div className="flex flex-col gap-2.5">
                    {woche.themen.map((t) => (
                      <div key={t.thema}>
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-sm text-textMain flex-1 min-w-0">{schulungVon(t.thema)?.titel || t.thema}</span>
                          <span className="text-[11px] font-mono text-textMuted flex-shrink-0">{t.erledigt} / {t.anzahl} gemacht</span>
                        </div>
                        <Mengenbalken anteil={t.anzahl ? t.erledigt / t.anzahl : 0} farbe="#5FCF6B" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-textMuted">In dieser Woche läuft keine Schulung.</p>
                )}
              </div>
            </div>
          )
        )}

        {reiter === "personen" && (
          <div className="card !p-0 overflow-hidden">
            <div className="flex items-center gap-1.5 flex-wrap px-3 py-2.5 border-b border-line">
              {[["alle", "Alle"], ["schwer", "Stimmung schwer"], ["training", "Im Training"]].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFilter(key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] border ${filter === key ? "border-amber text-textMain" : "border-line text-textMuted hover:text-textMain"}`}>
                  {label}
                </button>
              ))}
            </div>
            {!woche ? (
              <p className="text-xs text-textMuted px-3 py-4">Noch keine Rückblicke für diese Woche.</p>
            ) : !personen.length ? (
              <p className="text-xs text-textMuted px-3 py-4">Niemand passt zu diesem Filter.</p>
            ) : (
              <div className="divide-y divide-line">
                {personen.map((p) => (
                  <div key={p.id} className="px-3 py-2.5 grid gap-1.5 md:grid-cols-[11rem_1fr_13rem] md:items-start">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-textMain truncate">{p.name}</span>
                      <StimmungsPunkt stimmung={p.stimmung} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 min-w-0">
                      {p.herausforderungen.length
                        ? p.herausforderungen.map((h) => (
                          <span key={h} className="text-[11px] text-textMain bg-surfaceRaised border border-line rounded-full px-2 py-0.5">{h}</span>
                        ))
                        : <span className="text-[11px] text-textMuted">nichts genannt</span>}
                      {p.vorhaben && <span className="text-[11px] text-textMuted w-full">Vorgenommen: {p.vorhaben}</span>}
                    </div>
                    <div className="text-[11px] text-textMuted md:text-right">
                      {p.schulung
                        ? <>{schulungVon(p.schulung.thema)?.titel || p.schulung.thema}<br />{uebungsText(p.schulung)}</>
                        : "kein Training"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {reiter === "verbindungen" && (
          <div className="grid gap-5 md:grid-cols-2 items-start">
            <div className="card !p-0 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-line text-sm font-semibold text-textMain">
                Verbunden <span className="text-[11px] font-mono text-textMuted">{verbindungen.verbunden.length}</span>
              </div>
              {verbindungen.verbunden.length ? (
                <div className="divide-y divide-line">
                  {verbindungen.verbunden.map((p) => (
                    <div key={p.id} className="px-3 py-2">
                      <div className="text-sm text-textMain">{p.name}</div>
                      <div className="text-[11px] text-textMuted">
                        {[
                          p.seit ? `seit ${new Date(p.seit).toLocaleDateString("de-DE")}` : null,
                          p.letzteAntwortTage === null ? "noch nicht geschrieben" : `zuletzt ${vorTagen(p.letzteAntwortTage)} geschrieben`,
                          p.buddy === false ? "Buddy aus" : null,
                          p.tagesauswertung === false ? "Auswertung aus" : null,
                        ].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-textMuted px-3 py-4">Noch niemand verbunden.</p>
              )}
            </div>

            <div className="card">
              <div className="text-sm font-semibold text-textMain mb-1">
                Noch nicht verbunden <span className="text-[11px] font-mono text-textMuted">{verbindungen.offen.length}</span>
              </div>
              <p className="text-[11px] text-textMuted mb-3">
                Verbinden kann sich jede Person selbst: Einstellungen → Telegram. Ohne Verbindung gibt es weder
                Auswertung noch Wochenimpuls.
              </p>
              {verbindungen.offen.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {verbindungen.offen.map((p) => (
                    <span key={p.id} className="text-[11px] text-textMain bg-surfaceRaised border border-line rounded-full px-2 py-0.5">{p.name}</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-teal">Alle sind verbunden.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
