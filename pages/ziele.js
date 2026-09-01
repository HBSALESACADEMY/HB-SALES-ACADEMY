import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Kreisdiagramm from "../components/Kreisdiagramm";
import LogoHintergrund from "../components/LogoHintergrund";
import { supabase } from "../lib/supabaseClient";
import { apiGet } from "../lib/apiClient";
import { getActiveOrgId } from "../lib/activeOrg";
import { goalMetric } from "../lib/goalMetrics";
import { werteZielAus, bilanz } from "../lib/zielAuswertung";
import { paletteFarbe, feldFarbe } from "../lib/diagrammFarben";
import { downloadCsv } from "../lib/csv";

// Auswertung der Ziele — Team-Ziele wie persönliche.
//
// Angelegt und abgehakt wurden Ziele schon vorher. Was fehlte, ist die
// Frage, die man mitten im Zeitraum stellt: reicht das Tempo noch? Und die
// Frage danach: sind unsere Ziele überhaupt realistisch gesetzt?
export default function Ziele() {
  const [daten, setDaten] = useState(null);
  const [selbst, setSelbst] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [teamFilter, setTeamFilter] = useState("alle");

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        setSelbst(session.user.id);
        const { data: me } = await supabase.from("profiles")
          .select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
        const oid = getActiveOrgId(me);
        setDaten(await apiGet("/api/team-goals" + (oid ? `?activeOrgId=${oid}` : "")));
      } catch (e) {
        setFehler(e.message || "Die Ziele konnten nicht geladen werden.");
      }
      setLaedt(false);
    })();
  }, []);

  const teams = (daten?.teams || []).filter((t) => teamFilter === "alle" || t.id === teamFilter);

  // Alle Ziele mit ihrer Auswertung, einmal aufbereitet: die Seite zeigt sie
  // dreimal in verschiedener Sortierung.
  const alle = teams.flatMap((t) => [...(t.ziele || []), ...(t.vergangeneZiele || [])].map((z) => ({
    ...z,
    teamName: t.name,
    mitglieder: t.mitglieder || [],
    auswertung: werteZielAus(z, z.fortschritt),
  })));

  const laufende = alle.filter((z) => z.auswertung.status !== "vorbei" && !z.user_id);
  const eigene = alle.filter((z) => z.user_id === selbst);
  const vergangene = alle.filter((z) => z.auswertung.status === "vorbei" && !z.user_id);
  const gesamtBilanz = bilanz(alle.filter((z) => !z.user_id).map((z) => z.auswertung));
  const eigeneBilanz = bilanz(eigene.map((z) => z.auswertung));

  function exportiere() {
    const kopf = ["Ziel", "Team", "Person", "Kennzahl", "Von", "Bis", "Ziel", "Erreicht", "Anteil %", "Status", "Hochrechnung"];
    const zeilen = alle.map((z) => [
      z.title, z.teamName, z.personName || "Team", goalMetric(z.metric)?.label || z.metric,
      z.von, z.bis, z.target_count, z.fortschritt,
      Math.round(z.auswertung.anteil * 100),
      z.auswertung.status === "vorbei" ? (z.auswertung.geschafft ? "erreicht" : "verfehlt") : (z.auswertung.aufKurs ? "auf Kurs" : "hinter Plan"),
      z.auswertung.hochrechnung,
    ]);
    downloadCsv(`ziele-${new Date().toISOString().slice(0, 10)}.csv`, kopf, zeilen);
  }

  if (laedt) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Ziele</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">
        Nicht nur „wie weit sind wir", sondern „reicht das Tempo" — und am Ende: waren die Ziele realistisch gesetzt.
      </p>

      {fehler && <div className="card border border-coral/40 text-coral text-sm mb-4">{fehler}</div>}

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {(daten?.teams || []).length > 1 && (
          <select className="input !w-auto !py-1.5 text-xs" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="alle">Alle Teams</option>
            {(daten?.teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {alle.length > 0 && (
          <button onClick={exportiere} className="btn-ghost text-xs ml-auto">
            <Icon name="download" size={12} /> Für Excel herunterladen
          </button>
        )}
      </div>

      {alle.length === 0 && (
        <div className="card">
          <p className="text-textMuted text-sm">
            Noch keine Ziele vorhanden. Angelegt werden sie unter <a href="/team" className="underline">Team</a> —
            für das ganze Team oder für einzelne Personen.
          </p>
        </div>
      )}

      {eigene.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wide text-textMuted mb-2">Deine eigenen Ziele</div>
          <div className="flex flex-col gap-3 mb-6">
            {eigene.map((z) => <ZielKarte key={z.id} ziel={z} />)}
          </div>
          {eigeneBilanz.anzahl > 0 && <BilanzKarte titel="Deine Bilanz" b={eigeneBilanz} />}
        </>
      )}

      {laufende.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wide text-textMuted mb-2 mt-2">Laufende Team-Ziele</div>
          <div className="flex flex-col gap-3 mb-6">
            {laufende.map((z) => <ZielKarte key={z.id} ziel={z} />)}
          </div>
        </>
      )}

      {gesamtBilanz.anzahl > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wide text-textMuted mb-2">Bilanz der abgelaufenen Ziele</div>
          <BilanzKarte titel="Team-Ziele insgesamt" b={gesamtBilanz} />
          <div className="flex flex-col gap-2 mb-6">
            {vergangene.map((z) => <VergangenesZiel key={z.id} ziel={z} />)}
          </div>
        </>
      )}
    </Layout>
  );
}

// Ein laufendes Ziel: Balken, Tempo, Hochrechnung — und wer beiträgt.
function ZielKarte({ ziel }) {
  const a = ziel.auswertung;
  const m = goalMetric(ziel.metric);
  const beitraege = ziel.beitraege
    ? Object.entries(ziel.beitraege).filter(([, w]) => w > 0)
      .map(([id, w], i) => ({
        label: (ziel.mitglieder.find((x) => x.id === id)?.name) || "Unbenannt",
        value: w, color: paletteFarbe(i),
      })).sort((x, y) => y.value - x.value)
    : null;
  const ohneBeitrag = ziel.beitraege
    ? Object.entries(ziel.beitraege).filter(([, w]) => !w)
      .map(([id]) => ziel.mitglieder.find((x) => x.id === id)?.name || "Unbenannt")
    : [];

  return (
    <div className="card relative overflow-hidden">
      <LogoHintergrund breite="w-1/3" hoehe="max-h-[70%]" />
      <div className="relative">
        <div className="flex items-start gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-textMain text-sm">{ziel.title}</span>
          <span className="text-[11px] text-textMuted">
            {m?.label || ziel.metric} · {ziel.teamName}{ziel.personName ? ` · ${ziel.personName}` : ""}
          </span>
          <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ml-auto ${a.aufKurs ? "text-teal border-teal/40" : "text-coral border-coral/40"}`}>
            {a.geschafft ? "geschafft" : a.aufKurs ? "auf Kurs" : "hinter Plan"}
          </span>
        </div>
        <div className="text-[11px] text-textMuted mb-2">
          {new Date(`${ziel.von}T12:00:00`).toLocaleDateString("de-DE")} – {new Date(`${ziel.bis}T12:00:00`).toLocaleDateString("de-DE")}
          {a.verbleibendeTage > 0 && ` · noch ${a.verbleibendeTage} ${a.verbleibendeTage === 1 ? "Tag" : "Tage"}`}
        </div>

        <div className="flex items-end gap-2 mb-1">
          <span className="text-2xl font-display font-semibold" style={{ color: a.aufKurs ? feldFarbe("termin") : feldFarbe("negativ") }}>
            {a.erreicht}
          </span>
          <span className="text-sm text-textMuted mb-0.5">von {a.ziel}</span>
          <span className="text-[11px] text-textMuted mb-1 ml-auto">{Math.round(a.anteil * 100)} %</span>
        </div>
        <div className="h-2.5 rounded-full bg-surfaceRaised overflow-hidden mb-2">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.round(a.anteil * 100)}%`, background: a.aufKurs ? feldFarbe("termin") : feldFarbe("negativ") }} />
        </div>

        {/* Die eigentliche Auskunft: reicht das Tempo? */}
        <p className="text-xs text-textMuted">
          {a.geschafft
            ? "Ziel erreicht."
            : a.status === "vorbei"
              ? `Verfehlt — es fehlten ${a.fehlt}.`
              : <>
                  Schnitt bisher <strong className="text-textMain">{a.tempo.toFixed(1)} pro Tag</strong> —
                  {" "}bei diesem Tempo endet ihr bei <strong className="text-textMain">{a.hochrechnung}</strong>.
                  {!a.aufKurs && <> Nötig wären ab jetzt <strong className="text-coral">{a.noetigProTag} pro Tag</strong>.</>}
                </>}
        </p>

        {beitraege && beitraege.length > 0 && (
          <div className="mt-3 pt-3 border-t border-line">
            <div className="text-[11px] uppercase tracking-wide text-textMuted mb-2">Wer trägt bei</div>
            <Kreisdiagramm daten={beitraege} groesse={120} mitteText={m?.label || "gesamt"} leerText="Noch niemand." />
            {ohneBeitrag.length > 0 && (
              <p className="text-[11px] text-textMuted mt-2">Noch ohne Beitrag: {ohneBeitrag.join(", ")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VergangenesZiel({ ziel }) {
  const a = ziel.auswertung;
  const m = goalMetric(ziel.metric);
  return (
    <div className="card !py-2.5 flex items-center gap-3 flex-wrap">
      <span className={`text-lg ${a.geschafft ? "" : "opacity-60"}`}>{a.geschafft ? "✅" : "❌"}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-textMain truncate">{ziel.title}</div>
        <div className="text-[11px] text-textMuted">
          {m?.label || ziel.metric} · {new Date(`${ziel.bis}T12:00:00`).toLocaleDateString("de-DE")} · {ziel.teamName}
        </div>
      </div>
      <span className="text-xs text-textMuted flex-shrink-0">
        {a.erreicht} von {a.ziel} · {Math.round(a.anteil * 100)} %
      </span>
    </div>
  );
}

// Die Bilanz beantwortet die unbequeme Frage: setzen wir die Ziele richtig?
function BilanzKarte({ titel, b }) {
  return (
    <div className="card mb-3">
      <div className="font-semibold text-textMain text-sm mb-3">{titel}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <Zahl wert={b.anzahl} label="abgelaufen" />
        <Zahl wert={b.geschafft} label="erreicht" farbe={feldFarbe("termin")} />
        <Zahl wert={b.verfehlt} label="verfehlt" farbe={feldFarbe("negativ")} />
        <Zahl wert={`${Math.round(b.quote * 100)} %`} label="Trefferquote" />
      </div>
      <p className="text-[11px] text-textMuted">
        Im Schnitt wurden <strong className="text-textMain">{Math.round(b.schnittErfuellung * 100)} %</strong> der
        gesetzten Ziele erfüllt.
        {b.anzahl >= 3 && b.quote < 0.34 && " Das spricht dafür, dass die Ziele zu hoch angesetzt sind — nicht dafür, dass zu wenig gearbeitet wird."}
        {b.anzahl >= 3 && b.quote > 0.9 && " Fast alles erreicht — die Ziele dürften etwas ehrgeiziger ausfallen."}
      </p>
    </div>
  );
}

function Zahl({ wert, label, farbe }) {
  return (
    <div>
      <div className="text-xl font-display font-semibold" style={farbe ? { color: farbe } : undefined}>{wert}</div>
      <div className="text-[11px] text-textMuted">{label}</div>
    </div>
  );
}
