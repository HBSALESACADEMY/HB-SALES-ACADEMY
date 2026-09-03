import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import PersonenAuswahl from "../components/PersonenAuswahl";
import LogoHintergrund from "../components/LogoHintergrund";
import { supabase } from "../lib/supabaseClient";
import { apiGet, apiPost } from "../lib/apiClient";
import { getActiveOrgId } from "../lib/activeOrg";
import { openProfile } from "../lib/profileModalBus";
import { monatsRaster, istGleicherTag, startOfWeek, endOfWeek, tagesSchluessel } from "../lib/dateRange";
import { aendereGeprueft, loescheGeprueft } from "../lib/loeschen";
import { nurUhrzeit, deutscherTag, DEUTSCHE_ZONE } from "../lib/terminzeit";
import { terminAnzeige } from "../lib/zeit";
import { ladeIcsHerunter } from "../lib/ics";
import { zeitpunktInBerlin } from "../lib/woche";

// Firmenkalender: was die ganze Organisation angeht — Schulungen, Messen,
// Feiertage, Betriebsausflug. Dazu Geburtstage und Abwesenheiten, die sich
// aus den Profilen ergeben und niemand eigens eintragen muss.
//
// Die Vertriebstermine stehen mit drin, aber jede Person sieht nur die,
// die sie ohnehin sehen darf: sie kommen über den RLS-gebundenen Client
// (siehe pages/api/org-kalender.js), nicht über den Admin-Zugang.
const ARTEN = [
  { key: "meeting", label: "Besprechung", symbol: "🗓️" },
  { key: "schulung", label: "Schulung", symbol: "🎓" },
  { key: "messe", label: "Messe", symbol: "🏢" },
  { key: "feiertag", label: "Feiertag", symbol: "🎉" },
  { key: "urlaub", label: "Urlaub", symbol: "🌴" },
  { key: "sonstiges", label: "Sonstiges", symbol: "📌" },
];
const symbolFuer = (art) => ARTEN.find((a) => a.key === art)?.symbol || "📌";

const ANSICHTEN = [["tag", "Tag"], ["woche", "Woche"], ["monat", "Monat"]];
const STATUS_SYMBOL = { zugesagt: "✅", abgesagt: "❌", offen: "⏳" };

// Deutsche Uhrzeit ist massgeblich (siehe lib/terminzeit.js).
const uhrzeitDeutsch = (iso) => nurUhrzeit(iso, DEUTSCHE_ZONE);

export default function Kalender() {
  const [daten, setDaten] = useState(null);
  const [ansicht, setAnsicht] = useState("monat");
  const [anker, setAnker] = useState(() => new Date());
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  // Das Kalender-Abo: Link in den eigenen Kalender eintragen (migration_131).
  const [aboOffen, setAboOffen] = useState(false);
  const [abo, setAbo] = useState(null);
  const [aboBusy, setAboBusy] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const [formularOffen, setFormularOffen] = useState(false);
  const [entwurf, setEntwurf] = useState({ titel: "", art: "meeting", von: "", bis: "", uhrzeit: "", beschreibung: "" });
  const [busy, setBusy] = useState(false);
  const [gewaehlterTag, setGewaehlterTag] = useState(null);
  // Einladen: welcher Termin gerade offen ist, als "quelle:id".
  const [einladenFuer, setEinladenFuer] = useState(null);
  // Wer beim Anlegen gleich mit eingeladen wird.
  const [neueGaeste, setNeueGaeste] = useState([]);
  // Nachträglich bearbeiten: ein Tippfehler im Titel oder eine verschobene
  // Uhrzeit soll den Eintrag nicht kosten.
  const [bearbeitenId, setBearbeitenId] = useState(null);
  const [bearbeitenEntwurf, setBearbeitenEntwurf] = useState(null);

  const heute = tagesSchluessel();

  // Der geladene Zeitraum hängt an der Ansicht — die Wochenansicht reicht
  // über den Monatswechsel hinaus.
  const zeitraum = (() => {
    if (ansicht === "tag") return { von: tagesSchluessel(anker), bis: tagesSchluessel(anker) };
    if (ansicht === "woche") return { von: tagesSchluessel(startOfWeek(anker)), bis: tagesSchluessel(endOfWeek(anker)) };
    const erster = new Date(anker.getFullYear(), anker.getMonth(), 1);
    const letzter = new Date(anker.getFullYear(), anker.getMonth() + 1, 0);
    return { von: tagesSchluessel(erster), bis: tagesSchluessel(letzter) };
  })();

  // still: ohne Ladeanzeige. Nach einer eigenen Änderung soll die Seite
  // nicht kurz leer werden — man arbeitet gerade weiter.
  async function laden(still) {
    if (!still) setLaedt(true);
    try {
      setDaten(await apiGet(`/api/org-kalender?von=${zeitraum.von}&bis=${zeitraum.bis}`));
      setFehler("");
    } catch (e) {
      setFehler(e.message || "Der Kalender konnte nicht geladen werden.");
    }
    if (!still) setLaedt(false);
  }

  // Beim Blättern bleibt das Bisherige stehen, bis das Neue da ist —
  // eine leere Seite zwischendrin reisst aus dem Arbeiten heraus.
  useEffect(() => { laden(!!daten); }, [zeitraum.von, zeitraum.bis]);

  async function speichern() {
    if (!entwurf.titel.trim() || !entwurf.von) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: profil } = await supabase.from("profiles")
        .select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const orgId = getActiveOrgId(profil);
      const { data: angelegt, error } = await supabase.from("org_events").insert({
        organization_id: orgId,
        created_by: session.user.id,
        titel: entwurf.titel.trim(),
        beschreibung: entwurf.beschreibung.trim() || null,
        von: entwurf.von,
        bis: entwurf.bis || null,
        uhrzeit: entwurf.uhrzeit || null,
        art: entwurf.art,
      }).select().single();
      if (error) throw error;
      // Einladungen gleich mit — sonst müsste man den Eintrag erst suchen,
      // um die Leute nachträglich einzuladen.
      if (neueGaeste.length) {
        const { error: einladungsFehler } = await supabase.from("termin_einladungen").insert(
          neueGaeste.map((personId) => ({
            quelle: "org_event", ziel_id: angelegt.id, person_id: personId,
            eingeladen_von: session.user.id, organization_id: orgId,
          }))
        );
        if (einladungsFehler) throw einladungsFehler;
      }
      setFormularOffen(false);
      setNeueGaeste([]);
      setEntwurf({ titel: "", art: "meeting", von: "", bis: "", uhrzeit: "", beschreibung: "" });
      await laden(true);
    } catch (e) {
      setFehler(e.message || "Der Eintrag konnte nicht gespeichert werden.");
    }
    setBusy(false);
  }

  function bearbeitenStarten(e) {
    setBearbeitenId(e.id);
    setBearbeitenEntwurf({
      titel: e.titel || "", art: e.art || "meeting", von: e.von || "",
      bis: e.bis || "", uhrzeit: e.uhrzeit || "", beschreibung: e.beschreibung || "",
    });
  }

  async function bearbeitenSpeichern() {
    if (!bearbeitenEntwurf?.titel.trim() || !bearbeitenEntwurf.von) return;
    setBusy(true);
    const meldung = await aendereGeprueft(
      supabase.from("org_events").update({
        titel: bearbeitenEntwurf.titel.trim(),
        beschreibung: bearbeitenEntwurf.beschreibung.trim() || null,
        von: bearbeitenEntwurf.von,
        bis: bearbeitenEntwurf.bis || null,
        uhrzeit: bearbeitenEntwurf.uhrzeit || null,
        art: bearbeitenEntwurf.art,
      }).eq("id", bearbeitenId),
      "Ändern darf den Eintrag, wer ihn angelegt hat, oder eine Führungsrolle."
    );
    if (meldung) { setFehler(meldung); setBusy(false); return; }
    setBearbeitenId(null);
    setBearbeitenEntwurf(null);
    await laden(true);
    setBusy(false);
  }

  async function loeschen(id, titel) {
    if (!confirm(`„${titel}“ wirklich entfernen?`)) return;
    const meldung = await loescheGeprueft(
      supabase.from("org_events").delete().eq("id", id),
      "Das Entfernen wurde abgelehnt — eigene Einträge darf jede Person löschen, fremde nur eine Führungsrolle."
    );
    if (meldung) { setFehler(meldung); return; }
    await laden(true);
  }

  // --- Einladungen ---------------------------------------------------------

  async function einladen(quelle, zielId, personIds) {
    const liste = Array.isArray(personIds) ? personIds : [personIds];
    if (!liste.length) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: profil } = await supabase.from("profiles")
        .select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const orgId = getActiveOrgId(profil);
      const { error } = await supabase.from("termin_einladungen").insert(
        liste.map((personId) => ({
          quelle, ziel_id: zielId, person_id: personId,
          eingeladen_von: session.user.id, organization_id: orgId,
        }))
      );
      if (error) throw error;
      // Sofort anzeigen, statt auf die Antwort des Servers zu warten — das
      // Nachladen bestätigt es nur noch.
      const neu = liste.map((personId) => ({
        id: `neu-${zielId}-${personId}`, quelle, ziel_id: zielId, person_id: personId,
        eingeladen_von: session.user.id, status: "offen",
        name: (daten?.personen || []).find((p) => p.id === personId)?.name || "Unbenannt",
      }));
      setDaten((d) => (d ? { ...d, einladungen: [...(d.einladungen || []), ...neu] } : d));
      setEinladenFuer(null);
      await laden(true);
    } catch (e) {
      setFehler(e.message || "Die Einladung konnte nicht verschickt werden.");
    }
    setBusy(false);
  }

  async function antworten(einladungId, status) {
    setBusy(true);
    setDaten((d) => (d ? {
      ...d,
      offeneEinladungen: (d.offeneEinladungen || []).filter((e) => e.id !== einladungId),
      einladungen: (d.einladungen || []).map((e) => (e.id === einladungId ? { ...e, status } : e)),
    } : d));
    const meldung = await aendereGeprueft(
      supabase.from("termin_einladungen").update({ status, beantwortet_am: new Date().toISOString() }).eq("id", einladungId),
      "Nur die eingeladene Person selbst kann zu- oder absagen."
    );
    if (meldung) setFehler(meldung);
    await laden(true);
    setBusy(false);
  }

  async function einladungZuruecknehmen(einladungId) {
    const meldung = await loescheGeprueft(
      supabase.from("termin_einladungen").delete().eq("id", einladungId),
      "Zurücknehmen darf nur, wer eingeladen hat."
    );
    if (meldung) { setFehler(meldung); return; }
    await laden(true);
  }

  // Habe ICH zu diesem Termin zu- oder abgesagt? Steht in denselben Daten,
  // war aber bisher nur an der Einladungsliste im Tagesdetail zu sehen.
  function meinStatus(quelle, zielId) {
    const e = (daten?.einladungen || []).find(
      (x) => x.quelle === quelle && x.ziel_id === zielId && x.person_id === daten?.selbst
    );
    return e?.status || null;
  }

  function einladungenZu(quelle, zielId) {
    return (daten?.einladungen || []).filter((e) => e.quelle === quelle && e.ziel_id === zielId);
  }

  // --- Zusammenstellen -----------------------------------------------------

  function eintraegeAm(datum) {
    const leer = { eintraege: [], termine: [], geburtstage: [], abwesend: [] };
    if (!daten || !datum) return leer;
    const schluessel = tagesSchluessel(datum);
    return {
      eintraege: daten.eintraege.filter((e) => schluessel >= e.von && schluessel <= (e.bis || e.von)),
      // Nach deutscher Zeit einsortiert — sonst rutscht ein Abendtermin für
      // jemanden im Ausland auf den falschen Tag.
      termine: (daten.termine || []).filter((t) => deutscherTag(t.appointment_at) === schluessel),
      geburtstage: daten.geburtstage.filter((g) => g.tag === schluessel),
      abwesend: daten.abwesenheiten.filter((a) => schluessel >= a.von && schluessel <= a.bis),
    };
  }

  const wochenTage = (() => {
    const start = startOfWeek(anker);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  })();

  // Der Abo-Link wird erst beim Öffnen erzeugt: wer das Abo nie nutzt,
  // bekommt auch keinen Schlüssel, der irgendwo herumliegen könnte.
  async function oeffneAbo() {
    setAboOffen((v) => !v);
    if (abo) return;
    setAboBusy(true);
    try {
      setAbo(await apiGet("/api/kalender-abo-link"));
    } catch (e) {
      setFehler(e?.message || "Der Abo-Link konnte nicht erzeugt werden.");
    }
    setAboBusy(false);
  }

  // Neuer Schlüssel — der alte Link ist im selben Moment wertlos. Der Weg
  // für den Fall, dass jemand den Link versehentlich weitergegeben hat.
  async function aboNeu() {
    if (!confirm("Neuen Link erzeugen? Der bisherige hört sofort auf zu funktionieren — Kalender, die ihn schon eingetragen haben, zeigen dann nichts mehr an.")) return;
    setAboBusy(true);
    try {
      setAbo(await apiPost("/api/kalender-abo-link", { neu: true }));
      setKopiert(false);
    } catch (e) {
      setFehler(e?.message || "Der neue Link konnte nicht erzeugt werden.");
    }
    setAboBusy(false);
  }

  // Umfang umstellen. Der Link bleibt derselbe — es ändert sich nur, was
  // darüber ausgeliefert wird, und zwar sofort für alle Kalender, die ihn
  // schon eingetragen haben.
  async function setzeUmfang(umfang, personen) {
    setAboBusy(true);
    try {
      setAbo(await apiPost("/api/kalender-abo-link", {
        umfang,
        ...(personen ? { personen } : {}),
      }));
    } catch (e) {
      setFehler(e?.message || "Der Umfang konnte nicht geändert werden.");
    }
    setAboBusy(false);
  }

  async function kopiereAbo() {
    try {
      await navigator.clipboard.writeText(abo.url);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2500);
    } catch (e) {
      setFehler("Kopieren war nicht möglich — bitte den Link von Hand markieren.");
    }
  }

  function blaettern(richtung) {
    setGewaehlterTag(null);
    setAnker((d) => {
      const n = new Date(d);
      if (ansicht === "tag") n.setDate(n.getDate() + richtung);
      else if (ansicht === "woche") n.setDate(n.getDate() + 7 * richtung);
      else n.setMonth(n.getMonth() + richtung);
      return n;
    });
  }

  const titelZeile = ansicht === "tag"
    ? anker.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : ansicht === "woche"
      ? `${wochenTage[0].toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${wochenTage[6].toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`
      : anker.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const offeneEinladungen = daten?.offeneEinladungen || [];
  const detailTag = ansicht === "tag" ? anker : gewaehlterTag;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Kalender</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">
        Was die ganze Firma angeht — Besprechungen, Schulungen, Messen, Feiertage. Geburtstage,
        Abwesenheiten und deine Vertriebstermine stehen automatisch mit drin.
      </p>

      {fehler && <div className="card mb-4 border-coral/40 text-sm text-coral">{fehler}</div>}

      {/* Kalender-Abo: einmal eintragen, danach hält sich der eigene
          Kalender selbst auf dem Stand. Der Link ist ein Geheimnis — das
          steht ausdrücklich dabei, weil man ihn sonst arglos weiterschickt. */}
      {aboOffen && (
        <div className="card mb-4">
          <div className="font-semibold text-textMain text-sm mb-1">Termine im eigenen Kalender</div>
          <p className="text-xs text-textMuted mb-3">
            Diesen Link einmal in Apple-, Google- oder Outlook-Kalender eintragen. Danach stehen deine Termine
            dort automatisch drin: verschobene wandern mit, abgesagte werden durchgestrichen. Du musst nichts
            mehr einzeln exportieren.
          </p>

          {aboBusy && !abo && <p className="text-xs text-textMuted">Link wird erzeugt…</p>}

          {abo && (
            <>
              {abo.darfTeam && (
                <div className="mb-3">
                  <div className="text-xs text-textMain mb-1.5">Was soll im Kalender stehen?</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      ["eigene", "Nur meine Termine"],
                      ["team", "Mein ganzes Team"],
                      ["auswahl", "Bestimmte Personen"],
                    ].map(([key, label]) => (
                      <button key={key} onClick={() => setzeUmfang(key, key === "auswahl" ? abo.auswahl : null)} disabled={aboBusy}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border disabled:opacity-40 ${abo.umfang === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* "Mein ganzes Team" nimmt auch die mit, die morgen
                      dazukommen — bei einer festen Auswahl muss man nach
                      jeder Neueinstellung selbst daran denken. Das gehört
                      dazugeschrieben, sonst fehlt irgendwann jemand. */}
                  {abo.umfang === "team" && (
                    <p className="text-[11px] text-textMuted mt-1.5">
                      Auch neue Teammitglieder erscheinen automatisch — du musst die Liste nie nachziehen.
                    </p>
                  )}

                  {abo.umfang === "auswahl" && (
                    <div className="mt-2">
                      {abo.auswaehlbar?.length ? (
                        <>
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <button onClick={() => setzeUmfang("auswahl", abo.auswaehlbar.map((p) => p.id))}
                              disabled={aboBusy} className="btn-ghost text-xs disabled:opacity-40">Alle</button>
                            <button onClick={() => setzeUmfang("auswahl", [])}
                              disabled={aboBusy} className="btn-ghost text-xs disabled:opacity-40">Keine</button>
                            <span className="text-[11px] text-textMuted">
                              {abo.auswahl?.length || 0} von {abo.auswaehlbar.length} ausgewählt
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {abo.auswaehlbar.map((p) => {
                              const an = (abo.auswahl || []).includes(p.id);
                              return (
                                <button key={p.id} disabled={aboBusy}
                                  onClick={() => setzeUmfang("auswahl", an
                                    ? (abo.auswahl || []).filter((x) => x !== p.id)
                                    : [...(abo.auswahl || []), p.id])}
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border disabled:opacity-40 ${an ? "border-amber text-textMain" : "border-line text-textMuted hover:text-textMain"}`}
                                  style={an ? { background: "color-mix(in srgb, var(--org-accent, #E9B44C) 18%, transparent)" } : undefined}>
                                  {an ? "✓ " : ""}{p.name}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] text-textMuted">
                          Zu deinen Teams ist noch niemand zugeordnet — es gibt nichts auszuwählen.
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-textMuted mt-2">
                    Der Link bleibt derselbe — jede Umstellung wirkt sofort, auch in Kalendern, die ihn schon
                    eingetragen haben. Bei fremden Terminen steht der Name der Person hinter dem Termin.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap mb-3">
                <input readOnly value={abo.url} onFocus={(e) => e.target.select()}
                  className="input !py-1.5 text-xs flex-1 min-w-[240px] font-mono" />
                <button onClick={kopiereAbo} className="btn text-xs">{kopiert ? "Kopiert ✓" : "Link kopieren"}</button>
                {/* Apple und Outlook tragen den Kalender über webcal:// mit
                    einem Klick ein, statt die Datei herunterzuladen. */}
                <a href={abo.webcal} className="btn-ghost text-xs">Direkt eintragen (Apple / Outlook)</a>
              </div>

              <div className="text-xs text-textMuted leading-relaxed mb-3">
                <strong className="text-textMain">Google Kalender:</strong> Andere Kalender → Per URL hinzufügen → Link einfügen.<br />
                <strong className="text-textMain">Apple Kalender:</strong> Ablage → Neues Kalenderabonnement → Link einfügen.<br />
                <strong className="text-textMain">Outlook:</strong> Kalender hinzufügen → Aus dem Internet abonnieren.
              </div>

              <div className="rounded-xl border border-amber/40 px-3 py-2 mb-3">
                <div className="text-xs text-textMain mb-1">Der Link ist wie ein Schlüssel.</div>
                <p className="text-[11px] text-textMuted">
                  Wer ihn hat, sieht {abo.umfang === "team"
                    ? "die Termine deines ganzen Teams"
                    : abo.umfang === "auswahl" && abo.auswahl?.length
                      ? `deine Termine und die von ${abo.auswahl.length} weiteren Personen`
                      : "deine Termine"} —
                  ohne Anmeldung. Also nicht weitergeben und nicht in eine Gruppe posten. Ändern kannst du damit
                  nichts, es wird nur gelesen.
                  {(abo.umfang === "team" || (abo.umfang === "auswahl" && abo.auswahl?.length > 0))
                    && " Weil hier fremde Termine drinstehen, wiegt ein weitergegebener Link schwerer als sonst."}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={aboNeu} disabled={aboBusy} className="btn-ghost text-xs text-coral disabled:opacity-40">
                  {aboBusy ? "Erzeugt…" : "Neuen Link erzeugen"}
                </button>
                <span className="text-[11px] text-textMuted">Macht den bisherigen Link sofort wertlos.</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Offene Einladungen zuerst — unabhängig davon, welcher Zeitraum
          gerade angezeigt wird. */}
      {offeneEinladungen.length > 0 && (
        <div className="card mb-4 border-amber/40">
          <div className="text-sm font-semibold text-amber mb-2">
            {offeneEinladungen.length === 1 ? "Du bist eingeladen" : `${offeneEinladungen.length} Einladungen für dich`}
          </div>
          <div className="flex flex-col gap-2">
            {offeneEinladungen.map((e) => (
              <div key={e.id} className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-textMain">{e.titel}</span>
                <span className="text-xs text-textMuted">
                  {e.zeitpunkt ? `${terminAnzeige(e.zeitpunkt).haupt} Uhr` : `${e.tag.slice(8)}.${e.tag.slice(5, 7)}.${e.uhrzeit ? ` · ${e.uhrzeit}` : ""}`}
                  {" · von "}{e.von_name}
                </span>
                <span className="flex items-center gap-1.5 ml-auto">
                  <button disabled={busy} onClick={() => antworten(e.id, "zugesagt")} className="btn text-xs disabled:opacity-40">Zusagen</button>
                  <button disabled={busy} onClick={() => antworten(e.id, "abgesagt")} className="btn-ghost text-xs disabled:opacity-40">Absagen</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => blaettern(-1)} className="btn-ghost text-xs">‹ Zurück</button>
          <span className="font-display font-semibold text-textMain text-sm">{titelZeile}</span>
          <button onClick={() => blaettern(1)} className="btn-ghost text-xs">Weiter ›</button>
          <button onClick={() => { setAnker(new Date()); setGewaehlterTag(null); }} className="btn-ghost text-xs text-textMuted">Heute</button>
        </div>
        <div className="flex items-center gap-2">
          {ANSICHTEN.map(([key, label]) => (
            <button key={key} onClick={() => { setAnsicht(key); setGewaehlterTag(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${ansicht === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
              {label}
            </button>
          ))}
          <button onClick={oeffneAbo} className="btn-ghost text-xs" title="Termine im eigenen Kalender abonnieren">
            📆 Mit meinem Kalender verbinden
          </button>
          <button onClick={() => { setFormularOffen((v) => !v); setEntwurf((e) => ({ ...e, von: e.von || heute })); }} className="btn text-xs">
            {formularOffen ? "Abbrechen" : "+ Eintrag"}
          </button>
        </div>
      </div>

      {formularOffen && (
        <div className="card mb-4 flex flex-col gap-2">
          <input className="input" placeholder="Worum geht es?" value={entwurf.titel} maxLength={120}
            onChange={(e) => setEntwurf((z) => ({ ...z, titel: e.target.value }))} />
          <div className="flex items-center gap-2 flex-wrap">
            <select className="input !w-auto" value={entwurf.art} onChange={(e) => setEntwurf((z) => ({ ...z, art: e.target.value }))}>
              {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.symbol} {a.label}</option>)}
            </select>
            <input type="date" className="input !w-auto" value={entwurf.von} onChange={(e) => setEntwurf((z) => ({ ...z, von: e.target.value }))} />
            <span className="text-xs text-textMuted">bis</span>
            <input type="date" className="input !w-auto" value={entwurf.bis} onChange={(e) => setEntwurf((z) => ({ ...z, bis: e.target.value }))} />
            <input className="input !w-24" placeholder="14:00" maxLength={5} value={entwurf.uhrzeit}
              onChange={(e) => setEntwurf((z) => ({ ...z, uhrzeit: e.target.value }))} />
          </div>
          <textarea className="input" rows={2} placeholder="Ergänzung (optional)" value={entwurf.beschreibung} maxLength={500}
            onChange={(e) => setEntwurf((z) => ({ ...z, beschreibung: e.target.value }))} />
          <div>
            <div className="text-[11px] uppercase tracking-wide text-textMuted mb-1">Einladen (optional)</div>
            <PersonenAuswahl
              personen={(daten?.personen || []).filter((p) => p.id !== daten?.selbst)}
              ausgewaehlt={neueGaeste}
              onChange={setNeueGaeste}
            />
          </div>
          <div className="flex items-center gap-2">
            <button disabled={busy || !entwurf.titel.trim() || !entwurf.von} onClick={speichern} className="btn text-xs disabled:opacity-40">
              {busy ? "Speichert…" : "Eintragen"}
            </button>
            <span className="text-[11px] text-textMuted">Sichtbar für alle in deiner Organisation. „bis“ nur bei mehrtägigen Terminen.</span>
          </div>
        </div>
      )}

      {laedt ? (
        <p className="text-textMuted text-sm">Lädt…</p>
      ) : (
        <>
          {ansicht === "monat" && (
            /* Das Logo der eigenen Organisation liegt hinter dem Raster —
               blass genug, dass die Tage lesbar bleiben, und ohne Klickfläche,
               damit es die Tages-Knöpfe nicht abfängt. */
            <div className="card mb-4 relative overflow-hidden">
              <LogoHintergrund />
              <div className="relative grid grid-cols-7 gap-1 mb-1">
                {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((t) => (
                  <div key={t} className="text-[10px] uppercase tracking-wide text-textMuted text-center">{t}</div>
                ))}
              </div>
              <div className="relative grid grid-cols-7 gap-1">
                {monatsRaster(anker).map((tag, i) => {
                  if (!tag) return <div key={`leer-${i}`} />;
                  const inhalt = eintraegeAm(tag);
                  const anzahl = inhalt.eintraege.length + inhalt.geburtstage.length + inhalt.termine.length;
                  const istHeute = tagesSchluessel(tag) === heute;
                  const gewaehlt = gewaehlterTag && istGleicherTag(tag, gewaehlterTag);
                  return (
                    /* In der Kachel steht, WAS an dem Tag ist — ein Symbol
                       allein zwang dazu, jeden Tag einzeln anzutippen, nur um
                       herauszufinden, worum es geht. */
                    <button key={tag.toISOString()}
                      onClick={() => setGewaehlterTag(gewaehlt ? null : tag)}
                      className={`min-h-[5.5rem] rounded-lg border p-1 flex flex-col items-stretch text-left text-xs overflow-hidden
                        ${gewaehlt ? "border-amber bg-amber/10" : istHeute ? "border-amber/40" : "border-line"}
                        ${anzahl ? "text-textMain" : "text-textMuted"} hover:border-amber/60`}>
                      <span className={`px-0.5 ${istHeute ? "font-bold text-amber" : ""}`}>{tag.getDate()}</span>
                      <span className="flex flex-col gap-0.5 mt-0.5 leading-tight">
                        {zeilenFuerTag(inhalt, meinStatus).slice(0, 3).map((z, k) => (
                          <span key={k} title={z.titel} className="truncate text-[10px] px-0.5">
                            {z.symbol} {z.titel}
                          </span>
                        ))}
                        {zeilenFuerTag(inhalt, meinStatus).length > 3 && (
                          <span className="text-[10px] text-textMuted px-0.5">+{zeilenFuerTag(inhalt, meinStatus).length - 3} weitere</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {ansicht === "woche" && (
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 mb-4">
              {wochenTage.map((tag) => {
                const inhalt = eintraegeAm(tag);
                const istHeute = tagesSchluessel(tag) === heute;
                return (
                  <div key={tag.toISOString()} className={`card !p-2.5 ${istHeute ? "border-amber/40" : ""}`}>
                    <div className={`text-[11px] mb-1.5 ${istHeute ? "text-amber font-semibold" : "text-textMuted"}`}>
                      {tag.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    </div>
                    <TagesInhalt inhalt={inhalt} meinStatus={meinStatus} kompakt />
                  </div>
                );
              })}
            </div>
          )}

          {detailTag && (
            <div className="card mb-4">
              <div className="font-semibold text-textMain text-sm mb-2">
                {detailTag.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
              </div>
              <TagesInhalt
                inhalt={eintraegeAm(detailTag)}
                meinStatus={meinStatus}
                bearbeitenId={bearbeitenId}
                bearbeitenEntwurf={bearbeitenEntwurf}
                setBearbeitenEntwurf={setBearbeitenEntwurf}
                onBearbeiten={bearbeitenStarten}
                onBearbeitenSpeichern={bearbeitenSpeichern}
                onBearbeitenAbbrechen={() => { setBearbeitenId(null); setBearbeitenEntwurf(null); }}
                einladungenZu={einladungenZu}
                personen={daten?.personen || []}
                selbst={daten?.selbst}
                einladenFuer={einladenFuer}
                setEinladenFuer={setEinladenFuer}
                onEinladen={einladen}
                onZuruecknehmen={einladungZuruecknehmen}
                onLoeschen={loeschen}
                busy={busy}
              />
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

// Was in einer Tageskachel steht — Uhrzeit und Name statt bloss ein Symbol.
// Vertriebstermine zuerst: sie haben eine Uhrzeit und sind das, wonach im
// Kalender gesucht wird.
// Das eigene Ja oder Nein gehört in die Zeile: eine Zusage, die man nur in
// der Einladungsliste wiederfindet, sieht aus, als sei sie nie angekommen.
function zeilenFuerTag(inhalt, meinStatus) {
  const zeichen = (quelle, id, standard) => {
    const status = meinStatus ? meinStatus(quelle, id) : null;
    if (status === "zugesagt") return "✅";
    if (status === "abgesagt") return "❌";
    if (status === "offen") return "⏳";
    return standard;
  };
  return [
    ...inhalt.termine.map((t) => ({ symbol: zeichen("lead", t.id, "📞"), titel: `${uhrzeitDeutsch(t.appointment_at)} ${t.name}` })),
    ...inhalt.eintraege.map((e) => ({ symbol: zeichen("org_event", e.id, symbolFuer(e.art)), titel: e.uhrzeit ? `${e.uhrzeit} ${e.titel}` : e.titel })),
    ...inhalt.geburtstage.map((g) => ({ symbol: "🎂", titel: g.name })),
    ...inhalt.abwesend.map((a) => ({ symbol: "🌴", titel: `${a.name} abwesend` })),
  ];
}

// Der Inhalt eines Tages — in der Wochenansicht kompakt, in der Tagesansicht
// mit allem, was dazugehört: Beschreibung, Einladungen, Knöpfe.
function TagesInhalt({ inhalt, kompakt, einladungenZu, meinStatus, personen, selbst, einladenFuer, setEinladenFuer, onEinladen, onZuruecknehmen, onLoeschen, busy,
  bearbeitenId, bearbeitenEntwurf, setBearbeitenEntwurf, onBearbeiten, onBearbeitenSpeichern, onBearbeitenAbbrechen }) {
  const leer = inhalt.eintraege.length === 0 && inhalt.geburtstage.length === 0
    && inhalt.termine.length === 0 && inhalt.abwesend.length === 0;
  if (leer) return <p className="text-textMuted text-xs">{kompakt ? "—" : "Für diesen Tag ist nichts eingetragen."}</p>;

  return (
    <>
      {inhalt.geburtstage.map((g) => (
        <div key={`geb-${g.id}`} className="flex items-center gap-2 py-1 cursor-pointer" onClick={() => openProfile(g.id)}>
          <span>🎂</span>
          {!kompakt && <Avatar name={g.name} src={g.avatar_url} size={24} />}
          <span className={kompakt ? "text-[11px] text-textMain truncate" : "text-sm text-textMain"}>
            {kompakt ? g.name : `${g.name} hat Geburtstag`}
          </span>
        </div>
      ))}

      {inhalt.eintraege.map((e) => (bearbeitenId === e.id ? (
        <div key={e.id} className="flex flex-col gap-2 py-2 border-b border-line">
          <input className="input !py-1.5 text-xs" value={bearbeitenEntwurf.titel} maxLength={120}
            onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, titel: ev.target.value }))} />
          <div className="flex items-center gap-2 flex-wrap">
            <select className="input !w-auto !py-1.5 text-xs" value={bearbeitenEntwurf.art}
              onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, art: ev.target.value }))}>
              {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.symbol} {a.label}</option>)}
            </select>
            <input type="date" className="input !w-auto !py-1.5 text-xs" value={bearbeitenEntwurf.von}
              onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, von: ev.target.value }))} />
            <span className="text-xs text-textMuted">bis</span>
            <input type="date" className="input !w-auto !py-1.5 text-xs" value={bearbeitenEntwurf.bis || ""}
              onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, bis: ev.target.value }))} />
            <input className="input !w-24 !py-1.5 text-xs" placeholder="14:00" maxLength={5} value={bearbeitenEntwurf.uhrzeit || ""}
              onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, uhrzeit: ev.target.value }))} />
          </div>
          <textarea className="input !py-1.5 text-xs" rows={2} placeholder="Ergänzung (optional)" maxLength={500}
            value={bearbeitenEntwurf.beschreibung || ""}
            onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, beschreibung: ev.target.value }))} />
          <div className="flex items-center gap-2">
            <button disabled={busy || !bearbeitenEntwurf.titel.trim() || !bearbeitenEntwurf.von} onClick={onBearbeitenSpeichern} className="btn text-xs disabled:opacity-40">Speichern</button>
            <button disabled={busy} onClick={onBearbeitenAbbrechen} className="btn-ghost text-xs">Abbrechen</button>
          </div>
        </div>
      ) : (
        <div key={e.id} className="flex items-start gap-2 py-1">
          <span>{symbolFuer(e.art)}</span>
          <div className="flex-1 min-w-0">
            <div className={kompakt ? "text-[11px] text-textMain truncate" : "text-sm text-textMain"}>
              {e.titel}{e.uhrzeit && <span className="text-textMuted"> · {e.uhrzeit}</span>}
            </div>
            {!kompakt && (
              <>
                {e.beschreibung && <div className="text-[11px] text-textMuted">{e.beschreibung}</div>}
                <div className="text-[11px] text-textMuted">von {e.autor}</div>
                <Einladungsleiste
                  quelle="org_event" zielId={e.id}
                  einladungen={einladungenZu ? einladungenZu("org_event", e.id) : []}
                  personen={personen} selbst={selbst}
                  offen={einladenFuer === `org_event:${e.id}`}
                  setOffen={setEinladenFuer} onEinladen={onEinladen} onZuruecknehmen={onZuruecknehmen} busy={busy}
                />
              </>
            )}
          </div>
          {!kompakt && onLoeschen && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => eintragInEigenenKalender(e)} title="In den eigenen Kalender übernehmen" className="btn-ghost text-xs">📥 Übernehmen</button>
              <button onClick={() => onBearbeiten(e)} className="btn-ghost text-xs">Bearbeiten</button>
              <button onClick={() => onLoeschen(e.id, e.titel)} className="btn-ghost text-xs text-coral">Entfernen</button>
            </span>
          )}
        </div>
      )))}

      {inhalt.termine.map((t) => (
        <div key={`t-${t.id}`} className="flex items-start gap-2 py-1">
          <span>📞</span>
          <div className="flex-1 min-w-0">
            <div className={kompakt ? "text-[11px] text-textMain truncate" : "text-sm text-textMain"}>
              {t.name}{t.company ? <span className="text-textMuted"> · {t.company}</span> : null}
            </div>
            <div className="text-[11px] text-textMuted">
              {terminZeile(t.appointment_at, kompakt)}{!kompakt && ` · ${t.autor}`}
              {meinStatus && meinStatus("lead", t.id) === "zugesagt" && <span className="text-teal"> · du hast zugesagt</span>}
              {meinStatus && meinStatus("lead", t.id) === "abgesagt" && <span className="text-coral"> · du hast abgesagt</span>}
            </div>
            {!kompakt && (
              <button onClick={() => terminInEigenenKalender(t)} className="btn-ghost text-xs mt-1">📥 In meinen Kalender</button>
            )}
            {!kompakt && (
              <Einladungsleiste
                quelle="lead" zielId={t.id}
                einladungen={einladungenZu ? einladungenZu("lead", t.id) : []}
                personen={personen} selbst={selbst}
                offen={einladenFuer === `lead:${t.id}`}
                setOffen={setEinladenFuer} onEinladen={onEinladen} onZuruecknehmen={onZuruecknehmen} busy={busy}
              />
            )}
          </div>
        </div>
      ))}

      {inhalt.abwesend.map((a) => (
        <div key={`abw-${a.id}`} className="text-[11px] text-textMuted py-1">🌴 {a.name} ist abwesend</div>
      ))}
    </>
  );
}

function terminZeile(iso, kompakt) {
  if (kompakt) return `${uhrzeitDeutsch(iso)} Uhr`;
  const { haupt, zusatz } = terminAnzeige(iso);
  return zusatz ? `${haupt} Uhr (bei dir ${zusatz})` : `${haupt} Uhr`;
}

// Wer eingeladen ist und wie er geantwortet hat — plus die Auswahl, wen man
// noch einladen möchte. Zusagen kann nur die eingeladene Person selbst.
function Einladungsleiste({ quelle, zielId, einladungen, personen, selbst, offen, setOffen, onEinladen, onZuruecknehmen, busy }) {
  const [gewaehlte, setGewaehlte] = useState([]);
  const schonEingeladen = new Set(einladungen.map((e) => e.person_id));
  const auswahl = (personen || []).filter((p) => p.id !== selbst && !schonEingeladen.has(p.id));

  return (
    <div className="mt-1">
      {einladungen.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-textMuted">
          {einladungen.map((e) => (
            <span key={e.id} className="flex items-center gap-1">
              <span title={e.status}>{STATUS_SYMBOL[e.status] || "⏳"}</span>
              <button onClick={() => openProfile(e.person_id)} className="hover:text-textMain">{e.name}</button>
              {e.eingeladen_von === selbst && e.status === "offen" && (
                <button onClick={() => onZuruecknehmen(e.id)} className="text-coral hover:underline">×</button>
              )}
            </span>
          ))}
        </div>
      )}
      {offen ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <PersonenAuswahl personen={auswahl} ausgewaehlt={gewaehlte} onChange={setGewaehlte} />
          <div className="flex items-center gap-2">
            <button disabled={busy || !gewaehlte.length} onClick={() => onEinladen(quelle, zielId, gewaehlte)} className="btn text-xs disabled:opacity-40">
              {gewaehlte.length > 1 ? `${gewaehlte.length} einladen` : "Einladen"}
            </button>
            <button onClick={() => { setGewaehlte([]); setOffen(null); }} className="btn-ghost text-xs">Abbrechen</button>
          </div>
        </div>
      ) : (
        auswahl.length > 0 && (
          <button disabled={busy} onClick={() => setOffen(`${quelle}:${zielId}`)} className="btn-ghost text-xs mt-1 disabled:opacity-40">
            + Einladen
          </button>
        )
      )}
    </div>
  );
}

// Einen Eintrag an den Kalender des eigenen Geräts übergeben. Ohne Uhrzeit
// wird daraus ein ganztägiger Termin — so steht er dort, wo er hingehört,
// statt um Mitternacht (siehe lib/ics.js).
function eintragInEigenenKalender(e) {
  // Die eingetragene Uhrzeit ist deutsche Zeit — nicht die des Geräts, das
  // die Datei erzeugt (siehe lib/woche.js).
  const start = zeitpunktInBerlin(e.von, e.uhrzeit);
  ladeIcsHerunter(start
    ? {
        uid: `org-event-${e.id}@hb-sales-academy.de`,
        titel: e.titel,
        beschreibung: e.beschreibung || "",
        start,
        dauerMinuten: 60,
      }
    : {
        uid: `org-event-${e.id}@hb-sales-academy.de`,
        titel: e.titel,
        beschreibung: e.beschreibung || "",
        tagVon: e.von,
        tagBis: e.bis || e.von,
      });
}

function terminInEigenenKalender(t) {
  ladeIcsHerunter({
    uid: `lead-${t.id}@hb-sales-academy.de`,
    // Wer den Termin gelegt hat, steht im Titel — im fremden Kalender sieht
    // man oft nur diese eine Zeile.
    titel: `Termin: ${t.name}${t.autor ? ` von ${t.autor}` : ""}`,
    beschreibung: t.company ? `Firma: ${t.company}` : "",
    start: t.appointment_at,
    dauerMinuten: 60,
  });
}
