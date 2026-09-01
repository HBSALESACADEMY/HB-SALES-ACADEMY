import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import LogoHintergrund from "../components/LogoHintergrund";
import Aufklapper from "../components/Aufklapper";
import Icon from "../components/Icon";
import Kreisdiagramm from "../components/Kreisdiagramm";
import { supabase } from "../lib/supabaseClient";
import { apiGet } from "../lib/apiClient";
import { istFuehrungsrolle } from "../lib/rollen";
import { ZEITRAEUME, zeitraumGrenzen, quartalsName } from "../lib/zeitraum";
import { berlinHeute } from "../lib/woche";
import { berechneQuoten, quotenText, QUOTEN_SPALTEN } from "../lib/quoten";
import {
  summiere, summiereGruende, trichter, engpass, benchmark, impactAnalyse, empfehlungen,
} from "../lib/auswertung";
import { feldFarbe, grundFarbe, paletteFarbe } from "../lib/diagrammFarben";
import { downloadCsv } from "../lib/csv";

// Die Management-Auswertung.
//
// Der Unterschied zu den Statistiken im Call Tracker: dort sieht man Zahlen,
// hier eine Einordnung. Jede Kennzahl steht neben einem Vergleichswert, der
// Trichter benennt den Engpass, und am Ende stehen Empfehlungen, die an
// jeweils eine Zahl gebunden sind.
//
// Wer sie sehen darf, entscheidet der Server (pages/api/auswertung.js). Die
// Prüfung hier blendet nur aus — sie schützt nichts.

const KPI_ZEILEN = [
  { key: "anwahlen", label: "Anwahlen", art: "zahl" },
  { key: "erreicht", label: "Erstgespräche", art: "zahl" },
  { key: "termin", label: "Termine", art: "zahl" },
  { key: "erreichbarkeit", label: "Erreichbarkeit", art: "quote" },
  { key: "terminJeGespraech", label: "Termine je Gespräch", art: "quote" },
  { key: "durchstellQuote", label: "Durchstell-Quote", art: "quote" },
  { key: "anwahlenProTermin", label: "Anwahlen je Termin", art: "quote" },
];

export default function AuswertungSeite() {
  const [darf, setDarf] = useState(null);
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [zeitraum, setZeitraum] = useState("woche");
  const [eigener, setEigener] = useState({ von: "", bis: "" });
  const [offen, setOffen] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setDarf(false); return; }
      const { data: p } = await supabase.from("profiles")
        .select("role, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle();
      setDarf(istFuehrungsrolle(p));
    })();
  }, []);

  useEffect(() => {
    if (!darf) return;
    if (zeitraum === "eigen" && (!eigener.von || !eigener.bis)) return;
    let aktiv = true;
    (async () => {
      setFehler(null);
      setDaten(null);
      const { von, bis } = zeitraumGrenzen(zeitraum, { von: eigener.von, bis: eigener.bis });
      try {
        const antwort = await apiGet(`/api/auswertung?von=${von}&bis=${bis}`);
        if (aktiv) setDaten(antwort);
      } catch (e) {
        if (aktiv) setFehler(e?.message || "Die Auswertung konnte nicht geladen werden.");
      }
    })();
    return () => { aktiv = false; };
  }, [darf, zeitraum, eigener.von, eigener.bis]);

  if (darf === null) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!darf) {
    return (
      <Layout>
        <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Auswertung</h1>
        <div className="brand-stripe w-16 mb-4" />
        <div className="card text-sm text-textMuted">
          Diese Auswertung ist Teamleitungen und der Vertriebsleitung vorbehalten. Deine eigenen Zahlen
          findest du im Call Tracker unter <strong>Statistiken</strong>.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <LogoHintergrund>
        <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Auswertung</h1>
        <div className="brand-stripe w-16 mb-4" />

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {ZEITRAEUME.map(([key, label]) => (
            <button key={key} onClick={() => setZeitraum(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${zeitraum === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
              {key === "quartal" ? quartalsName(berlinHeute()) : label}
            </button>
          ))}
        </div>

        {zeitraum === "eigen" && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input type="date" className="input !w-auto !py-1.5 text-xs" value={eigener.von}
              onChange={(e) => setEigener({ ...eigener, von: e.target.value })} />
            <span className="text-xs text-textMuted">bis</span>
            <input type="date" className="input !w-auto !py-1.5 text-xs" value={eigener.bis}
              onChange={(e) => setEigener({ ...eigener, bis: e.target.value })} />
          </div>
        )}

        {fehler && <div className="card border border-coral/40 text-coral text-sm mb-4">{fehler}</div>}
        {!daten && !fehler && <p className="text-textMuted text-sm">Zahlen werden zusammengestellt...</p>}
        {daten && <Bericht daten={daten} offen={offen} setOffen={setOffen} />}
      </LogoHintergrund>
    </Layout>
  );
}

function Bericht({ daten, offen, setOffen }) {
  const { personen = [], teams = [], zeilen = [], kategorien = [] } = daten;

  // Zahlen je Person, dann je Team. Beides aus denselben Zeilen, damit
  // Tabelle, Trichter und Empfehlungen nie auseinanderlaufen.
  const zeilenJePerson = {};
  zeilen.forEach((z) => { (zeilenJePerson[z.user_id] = zeilenJePerson[z.user_id] || []).push(z); });

  const mitZahlen = personen.map((p) => ({
    ...p,
    counts: summiere(zeilenJePerson[p.id] || []),
    gruende: summiereGruende(zeilenJePerson[p.id] || []),
  }));
  const aktive = mitZahlen.filter((p) => (p.counts.anwahlen || 0) > 0 || p.termine.gesamt > 0);

  const teamsMitZahlen = teams.map((t) => {
    const drin = mitZahlen.filter((p) => p.teams.includes(t.id));
    return {
      ...t,
      personen: drin,
      counts: summiere(drin.flatMap((p) => zeilenJePerson[p.id] || [])),
    };
  }).filter((t) => (t.counts.anwahlen || 0) > 0);

  const gesamt = summiere(zeilen);
  const gesamtQuoten = berechneQuoten(gesamt);
  const stufen = trichter(gesamt);
  const eng = engpass(stufen);
  const vergleich = benchmark(teamsMitZahlen);
  const impact = impactAnalyse(mitZahlen);

  const gruendeGesamt = summiereGruende(zeilen);
  const gruende = kategorien.map((k) => ({
    key: k.key, label: k.label, wert: gruendeGesamt[k.key] || 0, color: grundFarbe(kategorien, k.key),
  })).sort((a, b) => b.wert - a.wert);

  const rat = empfehlungen({
    teams: teamsMitZahlen,
    personen: aktive,
    gesamt,
    gruende: gruende.map((g) => ({ label: g.label, wert: g.wert })),
  });

  const termineGesamt = personen.reduce((s, p) => s + p.termine.gesamt, 0);
  const wahrgenommen = personen.reduce((s, p) => s + p.termine.wahrgenommen, 0);
  const kunden = personen.reduce((s, p) => s + p.termine.kunden, 0);

  function wert(counts, quoten, zeile) {
    if (zeile.art === "zahl") return String(counts[zeile.key] || 0);
    const spalte = QUOTEN_SPALTEN.find((s) => s.key === zeile.key);
    return spalte ? quotenText(quoten, spalte) : "—";
  }

  function exportiere() {
    const kopf = ["Person", "Team", "Anwahlen", "Erstgespräche", "Termine", ...QUOTEN_SPALTEN.map((s) => s.label),
      "Trainingseinheiten", "Termine wahrgenommen", "Kunden"];
    const zeilenCsv = aktive.map((p) => {
      const q = berechneQuoten(p.counts);
      return [
        p.name,
        p.teams.map((id) => teams.find((t) => t.id === id)?.name).filter(Boolean).join(" / ") || "—",
        p.counts.anwahlen || 0, p.counts.erreicht || 0, p.counts.termin || 0,
        ...QUOTEN_SPALTEN.map((s) => quotenText(q, s)),
        p.training, p.termine.wahrgenommen, p.termine.kunden,
      ];
    });
    downloadCsv(`auswertung-${daten.zeitraum?.von}-bis-${daten.zeitraum?.bis}.csv`, kopf, zeilenCsv);
  }

  return (
    <>
      {/* KPI zuerst, ohne Vorrede. */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="font-semibold text-textMain text-sm">KPI-Übersicht</span>
          <span className="text-[11px] text-textMuted">
            {new Date(`${daten.zeitraum.von}T12:00:00`).toLocaleDateString("de-DE")} – {new Date(`${daten.zeitraum.bis}T12:00:00`).toLocaleDateString("de-DE")}
          </span>
          <button onClick={exportiere} className="btn-ghost text-xs ml-auto">
            <Icon name="download" size={12} /> Für Excel herunterladen
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-textMuted text-left">
                <th className="font-normal pb-2 pr-3">Kennzahl</th>
                {teamsMitZahlen.map((t, i) => (
                  <th key={t.id} className="font-normal pb-2 px-2 text-right whitespace-nowrap">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: paletteFarbe(i) }} />
                    {t.name}
                  </th>
                ))}
                <th className="font-normal pb-2 px-2 text-right whitespace-nowrap border-l border-line">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {KPI_ZEILEN.map((zeile) => (
                <tr key={zeile.key} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-textMain whitespace-nowrap">{zeile.label}</td>
                  {teamsMitZahlen.map((t) => (
                    <td key={t.id} className="py-1.5 px-2 text-right font-mono text-textMain">
                      {wert(t.counts, berechneQuoten(t.counts), zeile)}
                    </td>
                  ))}
                  <td className="py-1.5 px-2 text-right font-mono font-semibold text-textMain border-l border-line">
                    {wert(gesamt, gesamtQuoten, zeile)}
                  </td>
                </tr>
              ))}
              {teamsMitZahlen.length === 0 && (
                <tr><td colSpan={2} className="py-2 text-textMuted">Keine Teams mit Aktivität in diesem Zeitraum.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-textMuted mt-2">
          „Gesamt“ ist der gewichtete Wert der ganzen Organisation, nicht der Mittelwert der Teamquoten — ein Team
          mit zehn Anrufen darf den Vergleichswert nicht so stark bewegen wie eines mit tausend.
        </p>
      </div>

      {/* Conversion — der Weg vom Anruf bis zum Kunden. */}
      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">Conversion-Tracking</div>
        <p className="text-xs text-textMuted mb-3">Jede Stufe mit dem Anteil, der von der vorigen hier ankommt.</p>
        <div className="flex flex-col gap-2.5">
          {stufen.map((s) => (
            <div key={s.key}>
              <div className="flex items-center justify-between text-xs mb-1 gap-2">
                <span className={eng && eng.key === s.key ? "text-coral font-semibold" : "text-textMain"}>
                  {s.label}{eng && eng.key === s.key ? " · Engpass" : ""}
                </span>
                <span className="text-textMuted flex-shrink-0">
                  {s.wert}{s.uebergang !== null ? ` · ${s.uebergang} % der vorigen Stufe` : ""}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-surfaceRaised overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${stufen[0].wert > 0 ? Math.max(1, Math.round((s.wert / stufen[0].wert) * 100)) : 0}%`,
                    background: eng && eng.key === s.key ? "#E86A6A" : feldFarbe(s.key === "beiEntscheidung" ? "entscheider" : s.key),
                  }} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { label: "Termine angelegt", wert: termineGesamt },
            { label: "Wahrgenommen", wert: wahrgenommen, zusatz: termineGesamt > 0 ? `${Math.round((wahrgenommen / termineGesamt) * 100)} %` : null },
            { label: "Kunden geworden", wert: kunden, zusatz: wahrgenommen > 0 ? `${Math.round((kunden / wahrgenommen) * 100)} % der wahrgenommenen` : null },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-line px-3 py-2.5">
              <div className="text-lg font-display font-semibold text-textMain">{k.wert}</div>
              <div className="text-[11px] text-textMain leading-tight">{k.label}</div>
              {k.zusatz && <div className="text-[10px] text-textMuted leading-tight mt-0.5">{k.zusatz}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Impact: wirkt Training auf die Terminquote? */}
      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">Academy-Impact</div>
        {!impact.belastbar ? (
          <p className="text-xs text-textMuted">
            {impact.grund} Für eine belastbare Aussage braucht es mindestens vier Personen mit je 20 Anwahlen im
            Zeitraum — darunter wäre der Vergleich Zufall, und ein Zufall, der wie eine Erkenntnis aussieht, ist
            schlimmer als keine.
          </p>
        ) : (
          <>
            <p className="text-xs text-textMuted mb-3">
              Die trainingsaktivere Hälfte gegen die weniger aktive — beide nur mit Personen, die im Zeitraum
              auch telefoniert haben.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-textMuted text-left">
                    <th className="font-normal pb-2 pr-3">Gruppe</th>
                    <th className="font-normal pb-2 px-2 text-right">Personen</th>
                    <th className="font-normal pb-2 px-2 text-right">Trainingseinheiten</th>
                    <th className="font-normal pb-2 px-2 text-right">Anwahlen</th>
                    <th className="font-normal pb-2 px-2 text-right">Termine je Gespräch</th>
                  </tr>
                </thead>
                <tbody>
                  {[["Trainingsaktive Hälfte", impact.aktiv], ["Weniger aktive Hälfte", impact.wenig]].map(([label, g]) => (
                    <tr key={label} className="border-t border-line">
                      <td className="py-1.5 pr-3 text-textMain whitespace-nowrap">{label}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{g.anzahl}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{g.training}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{g.counts.anwahlen || 0}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-textMain">
                        {g.quoten.terminJeGespraech === null ? "—" : `${g.quoten.terminJeGespraech} %`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {impact.unterschied !== null && (
              <p className="text-[11px] text-textMuted mt-2">
                Unterschied: <strong className="text-textMain">{impact.unterschied > 0 ? "+" : ""}{impact.unterschied} Prozentpunkte</strong> zugunsten
                der {impact.unterschied >= 0 ? "trainingsaktiveren" : "weniger aktiven"} Hälfte. Das ist ein
                Zusammenhang, kein Beweis einer Ursache — wer ohnehin gut verkauft, trainiert oft auch mehr.
              </p>
            )}
          </>
        )}
      </div>

      {/* Einwände */}
      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">Einwand- & Engpass-Analyse</div>
        <p className="text-xs text-textMuted mb-3">Woran die Gespräche scheitern, die nicht zum Termin führen.</p>
        <Kreisdiagramm daten={gruende} mitteText="Absagen" leerText="Keine negativen Anrufe mit Grund im Zeitraum." />
      </div>

      {/* Personen — aufklappbar, weil es die längste Tabelle ist. */}
      <div className="card mb-4">
        <button onClick={() => setOffen(offen === "personen" ? null : "personen")}
          aria-expanded={offen === "personen"}
          className="flex items-center gap-2 w-full text-left">
          <span className="font-semibold text-textMain text-sm flex-1">Mitarbeiter gegen Benchmark ({aktive.length})</span>
          <span className={`text-textMuted text-xs transition-transform ${offen === "personen" ? "rotate-90" : ""}`}>›</span>
        </button>
        <Aufklapper offen={offen === "personen"}>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-textMuted text-left">
                  <th className="font-normal pb-2 pr-3">Person</th>
                  <th className="font-normal pb-2 px-2 text-right">Anwahlen</th>
                  <th className="font-normal pb-2 px-2 text-right">Gespräche</th>
                  <th className="font-normal pb-2 px-2 text-right">Termine</th>
                  <th className="font-normal pb-2 px-2 text-right">Je Gespräch</th>
                  <th className="font-normal pb-2 px-2 text-right">Gegen Schnitt</th>
                  <th className="font-normal pb-2 px-2 text-right">Training</th>
                </tr>
              </thead>
              <tbody>
                {aktive.slice().sort((a, b) => (b.counts.anwahlen || 0) - (a.counts.anwahlen || 0)).map((p) => {
                  const q = berechneQuoten(p.counts);
                  const ab = q.terminJeGespraech !== null && gesamtQuoten.terminJeGespraech !== null
                    ? q.terminJeGespraech - gesamtQuoten.terminJeGespraech : null;
                  return (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-1.5 pr-3 text-textMain whitespace-nowrap">{p.name}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{p.counts.anwahlen || 0}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{p.counts.erreicht || 0}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{p.counts.termin || 0}</td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {q.terminJeGespraech === null ? "—" : `${q.terminJeGespraech} %`}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono"
                        style={{ color: ab === null ? undefined : ab >= 0 ? feldFarbe("termin") : feldFarbe("negativ") }}>
                        {ab === null ? "—" : `${ab > 0 ? "+" : ""}${ab} Pp.`}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-textMuted">{p.training}</td>
                    </tr>
                  );
                })}
                {aktive.length === 0 && (
                  <tr><td colSpan={7} className="py-2 text-textMuted">Keine Aktivität in diesem Zeitraum.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Aufklapper>
      </div>

      {/* Empfehlungen zum Schluss — jede an eine Zahl gebunden. */}
      <div className="card">
        <div className="font-semibold text-textMain text-sm mb-1">Handlungsempfehlungen</div>
        <p className="text-xs text-textMuted mb-3">
          Abgeleitet aus den Zahlen oben, sortiert nach Gewicht. Ohne belegende Zahl steht hier nichts.
        </p>
        {rat.length === 0 ? (
          <p className="text-xs text-textMuted">
            Für diesen Zeitraum gibt es zu wenig Bewegung, um etwas zu empfehlen, das über eine Vermutung
            hinausgeht.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {rat.map((r, i) => (
              <li key={r.titel} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-surfaceRaised text-textMuted text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm text-textMain font-semibold">{r.titel}</div>
                  <div className="text-xs text-textMuted">{r.text}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
