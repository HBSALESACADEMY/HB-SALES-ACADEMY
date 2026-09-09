import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import SeitenReiter from "../components/SeitenReiter";
import Icon from "../components/Icon";
import MehrfachAuswahl from "../components/MehrfachAuswahl";
import { supabase } from "../lib/supabaseClient";
import { istFuehrungsrolle } from "../lib/rollen";
import { getActiveOrgId } from "../lib/activeOrg";
import { aendereGeprueft } from "../lib/loeschen";
import { FOLLOW_KATEGORIEN, kategorieVon, liegtSeit, sortiereNachDringlichkeit } from "../lib/followUp";
import { deutscheZeit } from "../lib/terminzeit";
import { downloadCsv } from "../lib/csv";
import { feldFarbe } from "../lib/diagrammFarben";
import Fortschrittsbalken from "../components/Fortschrittsbalken";

// Follow-up: was nach dem Termin noch offen ist.
//
// Ein Termin ist mit dem Termin nicht zu Ende. Wahrgenommen ohne Ergebnis
// heisst, dass jemand nachfassen muss; abgesagt heisst, dass nur der
// Zeitpunkt weg ist, nicht der Kontakt. Beides verschwand bisher in der
// langen Terminliste zwischen den bevorstehenden Terminen — und damit aus
// dem Kopf.
const ERGEBNISSE = [
  { wert: "kunde", label: "Kunde geworden" },
  { wert: "follow_up", label: "Überlegt es sich" },
  { wert: "absage", label: "Absage" },
];

export default function FollowUp() {
  const [leads, setLeads] = useState([]);
  const [personen, setPersonen] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [reiter, setReiter] = useState("offen");
  const [wer, setWer] = useState([]);
  const [leitung, setLeitung] = useState(false);

  async function laden() {
    setLaedt(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLaedt(false); return; }

    const { data: profil } = await supabase.from("profiles")
      .select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
    const fuehrung = istFuehrungsrolle(profil);
    setLeitung(fuehrung);

    // Was jemand sieht, entscheiden die Zugriffsregeln: eine Vertriebsperson
    // ihre eigenen Termine, die Leitung die ihrer Organisation.
    const { data, error } = await supabase.from("leads")
      .select("*").is("geloescht_am", null)
      // Auch geplante: ein Kunde, dessen Check-in fällig ist, steht auf
      // "wahrgenommen" — aber der Abschluss selbst kann jeden Status haben.
      .in("status", ["wahrgenommen", "abgesagt", "geplant"])
      .order("appointment_at", { ascending: false }).limit(500);
    if (error) setFehler(error.message);
    setLeads(data || []);

    if (fuehrung) {
      const orgId = getActiveOrgId(profil);
      const { data: leute } = await supabase.from("profiles")
        .select("id, full_name").eq("organization_id", orgId);
      setPersonen((leute || []).map((p) => ({ id: p.id, name: p.full_name || "Unbenannt" })));
    }
    setLaedt(false);
  }

  useEffect(() => { laden(); }, []);

  async function setzeErgebnis(lead, outcome) {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, outcome } : l)));
    const err = await aendereGeprueft(
      supabase.from("leads").update({ outcome }).eq("id", lead.id),
      "Das Ergebnis konnte nicht gesetzt werden.");
    if (err) { setFehler(err); laden(); }
  }

  const nameVon = (id) => personen.find((p) => p.id === id)?.name || "";

  const gefiltert = sortiereNachDringlichkeit(
    leads.filter((l) => kategorieVon(l) === reiter && (!wer.length || wer.includes(l.created_by)))
  );

  function exportiere() {
    downloadCsv(
      `follow-up-${reiter}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Firma", "Telefon", "E-Mail", "Termin war", "Liegt seit (Tage)", "Von"],
      gefiltert.map((l) => [
        l.name, l.company || "", l.phone || "", l.email || "",
        l.appointment_at ? new Date(l.appointment_at).toLocaleDateString("de-DE") : "",
        liegtSeit(l) ?? "", nameVon(l.created_by),
      ])
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Follow-up</h1>
      <div className="brand-stripe w-16 mb-4" />

      <SeitenReiter
        reiter={FOLLOW_KATEGORIEN.map((k) => ({
          key: k.key,
          label: k.label,
          anzahl: leads.filter((l) => kategorieVon(l) === k.key).length,
        }))}
        aktiv={reiter}
        onWechsel={setReiter}
      />

      <div className="card mb-4">
        <p className="text-xs text-textMuted">
          {FOLLOW_KATEGORIEN.find((k) => k.key === reiter)?.hinweis}
          {" "}Das Älteste steht oben — was am längsten liegt, wird am ehesten vergessen.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {leitung && personen.length > 1 && (
          <>
            <span className="text-[11px] text-textMuted">Von:</span>
            <MehrfachAuswahl eintraege={personen} ausgewaehlt={wer} onChange={setWer} alleText="Alle" />
          </>
        )}
        {gefiltert.length > 0 && (
          <button onClick={exportiere} className="btn-ghost text-xs ml-auto">
            <Icon name="download" size={12} /> Für Excel
          </button>
        )}
      </div>

      {fehler && <div className="card mb-4 border-coral/40 text-sm text-coral">{fehler}</div>}
      {laedt && <p className="text-textMuted text-sm">Lädt...</p>}

      {!laedt && gefiltert.length === 0 && (
        <div className="card text-sm text-textMuted">
          Hier liegt gerade nichts. {reiter === "offen"
            ? "Sobald ein wahrgenommener Termin ohne Ergebnis dasteht, erscheint er hier."
            : "Das ist die gute Nachricht."}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {gefiltert.map((l) => {
          const tage = liegtSeit(l);
          return (
            <div key={l.id} className="card !py-2.5">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-textMain text-sm">{l.name}</span>
                {l.company && <span className="text-xs text-textMuted">{l.company}</span>}
                {/* Wie lange es liegt, in Tagen — ab zwei Wochen auffällig.
                    Ein Termin von gestern drängt anders als einer von vor
                    drei Wochen. */}
                {tage !== null && (
                  <span className={`text-[11px] ml-auto ${tage >= 14 ? "text-coral" : tage >= 7 ? "text-amber" : "text-textMuted"}`}>
                    seit {tage} {tage === 1 ? "Tag" : "Tagen"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap text-xs text-textMuted mb-2">
                {l.phone && <a href={`tel:${l.phone}`} className="text-amber hover:underline">{l.phone}</a>}
                {l.email && <a href={`mailto:${l.email}`} className="text-amber hover:underline">{l.email}</a>}
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
                  <button key={e.wert} onClick={() => setzeErgebnis(l, e.wert)}
                    className={`btn-ghost text-xs ${l.outcome === e.wert ? "text-textMain" : ""}`}
                    style={l.outcome === e.wert ? { borderColor: feldFarbe("termin") } : undefined}>
                    {e.label}
                  </button>
                ))}
                <a href={`/termine?leadId=${l.id}`} className="btn-ghost text-xs ml-auto">
                  Zum Termin →
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
