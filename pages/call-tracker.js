import { useEffect, useMemo, useRef, useState } from "react";
import Layout, { getCachedOrg } from "../components/Layout";
import Icon from "../components/Icon";
import InfoCard from "../components/InfoCard";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { getActiveOrgId } from "../lib/activeOrg";
import { meldeFehler } from "../lib/errorBus";
import { resolveObjectionCategories } from "../lib/objectionCategories";
import { istFuehrungsrolle } from "../lib/rollen";
import { verstaendlicherSpeicherFehler } from "../lib/speicherFehler";
import { berlinHeute, tagPlus } from "../lib/woche";
import Kreisdiagramm from "../components/Kreisdiagramm";
import { feldFarbe, grundFarbe, paletteFarbe } from "../lib/diagrammFarben";
import { resolveLeadFields, resolveCoreRequired, fehlendePflichtfelder } from "../lib/leadFields";
import {
  FIELDS, storagePrefix, dayKey, dateKeyOf, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  zeroCounts, zeroReasons, todayFullLabel, weekLabel, monthLabel,
  loadDay, saveDay, aggregateRange, buildReport,
} from "../lib/callTracker";

const VIEWS = [["today", "Heute"], ["week", "Woche"], ["month", "Monat"], ["team", "Team"]];

const DEFAULT_BOOKING_STEPS = [
  "Terminoptionen im eigenen Buchungssystem raussuchen (idealerweise 2 Optionen)",
  "Fragen: „Passt es Ihnen/dir besser am Termin X oder Termin Y?“",
  "Termin im Kalender eintragen und bestätigen",
];

// Farben für die Team-Auswertung: erst der Marken-Verlauf der Organisation,
// dann neutrale Zusatztöne. Als CSS-Variablen, damit sie dem Branding und
// beiden Themes folgen.
export default function CallTracker() {
  const [view, setView] = useState("today");
  const [org, setOrg] = useState(getCachedOrg());
  const [userId, setUserId] = useState(null);
  const [ready, setReady] = useState(false);

  // "Heute" ist die einzige Ansicht, in der gezählt wird; Woche/Monat sind
  // reine Auswertungen aus den lokal gespeicherten Tagen.
  const [todayCounts, setTodayCounts] = useState(zeroCounts());
  const [todayReasons, setTodayReasons] = useState({});
  const [rangeData, setRangeData] = useState(null);

  const [step, setStep] = useState("lead");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const [leadDraft, setLeadDraft] = useState({ name: "", phone: "", email: "", appointmentAt: "", fields: {} });
  const [leadFile, setLeadFile] = useState(null);
  const [leadSaving, setLeadSaving] = useState(false);
  const leadFileRef = useRef(null);

  const [teamState, setTeamState] = useState({ status: "idle", members: [], reasons: [] });
  const [teamZeitraum, setTeamZeitraum] = useState("woche");

  const reasons = useMemo(() => resolveObjectionCategories(org), [org]);
  const leadFields = useMemo(() => resolveLeadFields(org), [org]);
  const coreRequired = useMemo(() => resolveCoreRequired(org), [org]);
  const bookingSteps = useMemo(() => {
    const raw = (org?.booking_instructions || "").split("\n").map((l) => l.trim()).filter(Boolean);
    return raw.length ? raw : DEFAULT_BOOKING_STEPS;
  }, [org]);
  const prefix = storagePrefix(userId);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !mounted) return;
      setUserId(session.user.id);

      let orgRow = getCachedOrg();
      if (!orgRow) {
        const { data: me } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
        const activeOrgId = getActiveOrgId(me);
        if (activeOrgId) {
          const { data } = await supabase.from("organizations").select("*").eq("id", activeOrgId).maybeSingle();
          orgRow = data;
        }
      }
      if (!mounted) return;
      if (orgRow) setOrg(orgRow);

      const cats = resolveObjectionCategories(orgRow);
      const loaded = loadDay(storagePrefix(session.user.id), dayKey(), cats);
      setTodayCounts(loaded.counts);
      setTodayReasons(loaded.reasons);
      setReady(true);
    })();
    return () => { mounted = false; };
  }, []);

  // Die Einwand-Kategorien stehen erst fest, wenn die Organisation geladen
  // ist — fehlende Schlüssel nachtragen, ohne bereits gezählte zu verlieren.
  useEffect(() => {
    if (!ready) return;
    setTodayReasons((prev) => {
      const next = { ...zeroReasons(reasons), ...prev };
      return next;
    });
  }, [reasons, ready]);

  const syncTimer = useRef(null);
  function persist(counts, reasonCounts) {
    if (!userId) return;
    saveDay(prefix, dayKey(), counts, reasonCounts);
    // Zentrale Team-Statistik — verzögert, damit nicht jeder Klick eine
    // eigene Anfrage auslöst. Schlägt der Sync fehl, zählt das Tool lokal
    // trotzdem normal weiter.
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        await supabase.from("call_log_days").upsert({
          user_id: userId,
          // Derselbe Tagesschlüssel wie lokal (siehe lib/callTracker.js).
          // Mit UTC landeten die ersten Anrufe nach Mitternacht in der Zeile
          // des VORTAGS und überschrieben dessen Zahlen mit den frisch bei
          // null begonnenen Zählern.
          log_date: dateKeyOf(new Date()),
          counts,
          reasons: reasonCounts,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        // Früher stumm verworfen: die Zahlen blieben lokal richtig, tauchten
        // aber nie in der Team-Auswertung auf — ohne jeden Hinweis.
        meldeFehler("Deine Anrufzahlen konnten gerade nicht mit dem Team geteilt werden. Lokal sind sie gespeichert.", e);
      }
    }, 900);
  }

  function bump(key, by = 1) {
    setTodayCounts((prev) => {
      const next = { ...prev, [key]: Math.max(0, (prev[key] || 0) + by) };
      persist(next, todayReasons);
      return next;
    });
  }

  function countReason(reasonKey) {
    setTodayReasons((prevReasons) => {
      const nextReasons = { ...prevReasons, [reasonKey]: (prevReasons[reasonKey] || 0) + 1 };
      setTodayCounts((prevCounts) => {
        const nextCounts = { ...prevCounts, negativ: (prevCounts.negativ || 0) + 1 };
        persist(nextCounts, nextReasons);
        return nextCounts;
      });
      return nextReasons;
    });
    setStep("lead");
  }

  async function switchView(next) {
    setView(next);
    if (next === "team") { loadTeam(); return; }
    if (next === "today") { setRangeData(null); setStep("lead"); return; }
    const now = new Date();
    const [from, to] = next === "week" ? [startOfWeek(now), endOfWeek(now)] : [startOfMonth(now), endOfMonth(now)];
    setRangeData(aggregateRange(prefix, from, to, reasons));
  }

  // Wie weit die Team-Auswertung zurückschaut.
  function tageFuerZeitraum(z) {
    return z === "heute" ? 0 : z === "monat" ? 30 : 7;
  }

  async function loadTeam(zeitraum = teamZeitraum) {
    setTeamState({ status: "loading", members: [], reasons: [] });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setTeamState({ status: "denied", members: [], reasons: [] }); return; }
      // Wer diese Auswertung sieht, folgt derselben Regel wie überall sonst:
      // eine Führungsrolle sieht ihre ganze Organisation, eine Teamleitung
      // ihr Team (siehe lib/rollen.js und call_log_days in der Datenbank).
      // Vorher hing es allein daran, wer das Team ANGELEGT hat — ein Manager,
      // der ein bestehendes Team übernimmt, stand vor einer leeren Seite.
      const { data: profil } = await supabase.from("profiles")
        .select("id, role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();

      const nameById = { [session.user.id]: "Ich" };
      let memberIds = [];

      if (istFuehrungsrolle(profil)) {
        const orgId = getActiveOrgId(profil);
        const { data: alle } = await supabase.from("profiles")
          .select("id, full_name").eq("organization_id", orgId);
        (alle || []).forEach((p) => {
          if (p.id === session.user.id) return;
          memberIds.push(p.id);
          nameById[p.id] = p.full_name || "Unbenannt";
        });
      } else {
        const { data: myTeams } = await supabase.from("teams").select("id").eq("created_by", session.user.id);
        const leadTeamIds = (myTeams || []).map((t) => t.id);
        if (!leadTeamIds.length) { setTeamState({ status: "denied", members: [], reasons: [] }); return; }
        const { data: memberships } = await supabase
          .from("team_members").select("user_id, profiles:user_id(full_name)").in("team_id", leadTeamIds);
        (memberships || []).forEach((m) => {
          if (m.user_id === session.user.id || nameById[m.user_id]) return;
          memberIds.push(m.user_id);
          nameById[m.user_id] = m.profiles?.full_name || "Unbenannt";
        });
      }
      const allIds = [session.user.id, ...memberIds];

      // Zeitraum in DEUTSCHER Rechnung statt "vor 7×24 Stunden in UTC":
      // sonst fällt je nach Uhrzeit ein Tag heraus oder einer zu viel hinein.
      const tage = tageFuerZeitraum(zeitraum);
      const von = tage === 0 ? berlinHeute() : tagPlus(berlinHeute(), -(tage - 1));
      const { data: logs } = await supabase.from("call_log_days").select("*").in("user_id", allIds).gte("log_date", von);

      // Bisher wurde nur "Anwahlen" ausgewertet — die übrigen Zähler standen
      // in derselben Zeile und wurden weggeworfen.
      const proPerson = {};
      const gesamt = {};
      FIELDS.forEach((f) => { gesamt[f.key] = 0; });
      const reasonTotals = zeroReasons(reasons);
      (logs || []).forEach((l) => {
        const p = proPerson[l.user_id] || (proPerson[l.user_id] = {});
        FIELDS.forEach((f) => {
          const wert = l.counts?.[f.key] || 0;
          p[f.key] = (p[f.key] || 0) + wert;
          gesamt[f.key] += wert;
        });
        reasons.forEach((r) => { reasonTotals[r.key] += l.reasons?.[r.key] || 0; });
      });

      setTeamState({
        status: "ok",
        members: allIds.map((id) => ({
          id,
          name: nameById[id] || "Unbenannt",
          value: proPerson[id]?.anwahlen || 0,
          zahlen: FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: proPerson[id]?.[f.key] || 0 }), {}),
        })).sort((a, b) => b.value - a.value),
        gesamt,
        reasons: reasons.map((r) => ({ key: r.key, label: r.label, value: reasonTotals[r.key] || 0 })),
      });
    } catch (e) {
      setTeamState({ status: "error", members: [], reasons: [] });
    }
  }

  function resetLeadDraft() {
    setLeadDraft({ name: "", phone: "", email: "", appointmentAt: "", fields: {} });
    setLeadFile(null);
    if (leadFileRef.current) leadFileRef.current.value = "";
  }

  async function submitLead() {
    // Welche Felder Pflicht sind, entscheidet die Organisation
    // (siehe lib/leadFields.js). Benannt wird nur, was tatsächlich fehlt.
    const missing = fehlendePflichtfelder({ ...leadDraft, org });
    if (missing.length) {
      showToast(`Bitte noch ausfüllen: ${missing.join(", ")}`);
      return;
    }
    setLeadSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Nicht angemeldet.");

      let recordingPath = null;
      if (leadFile) {
        const ext = leadFile.name.split(".").pop() || "webm";
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("lead-recordings").upload(path, leadFile);
        if (upErr) {
          // Früher nur in der Konsole: der Termin wurde ohne Aufnahme
          // gespeichert, es entstanden keine Notizen — und niemand erfuhr
          // warum. Genau das sah dann aus wie "die Notizen funktionieren nicht".
          meldeFehler("Die Aufnahme konnte nicht hochgeladen werden — der Termin wurde ohne sie gespeichert. " + verstaendlicherSpeicherFehler(upErr), upErr);
        } else recordingPath = path;
      }

      const { data: me } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const fields = leadFields.map((f) => {
        const raw = leadDraft.fields[f.key];
        return { key: f.key, label: f.label, type: f.type, value: f.type === "checkbox" ? !!raw : (typeof raw === "string" ? raw.trim() : "") };
      });
      // Über die Server-Route statt direktem Insert, damit die automatische
      // Termin-Benachrichtigung ausgelöst wird (siehe pages/api/lead-created.js).
      const { leadId } = await apiPost("/api/lead-created", {
        name: leadDraft.name.trim(),
        phone: leadDraft.phone.trim(),
        email: leadDraft.email.trim(),
        fields,
        recordingPath,
        appointmentAt: new Date(leadDraft.appointmentAt).toISOString(),
        activeOrgId: getActiveOrgId(me),
      });

      bump("termin");
      resetLeadDraft();
      showToast(recordingPath ? "Gespeichert — Notizen aus der Aufnahme werden erstellt" : "Termin & Kundendaten gespeichert");
      setStep("breathe");

      // Gesprächsnotizen laufen im Hintergrund weiter — die Auswertung einer
      // Aufnahme dauert, darauf soll niemand vor dem nächsten Anruf warten.
      if (recordingPath && leadId) {
        apiPost("/api/lead-call-notes", { leadId }).catch((e) =>
          meldeFehler("Die Gesprächsnotizen zur Aufnahme konnten nicht erstellt werden.", e));
      }
    } catch (e) {
      showToast("Speichern fehlgeschlagen: " + (e.message || "Unbekannter Fehler"));
    } finally {
      setLeadSaving(false);
    }
  }

  async function copyReport() {
    const rangeLabel = view === "today" ? todayFullLabel() : view === "week" ? weekLabel() : monthLabel();
    const text = buildReport({ orgName: org?.name, rangeLabel, counts, reasonCounts, reasons });
    try {
      await navigator.clipboard.writeText(text);
      showToast("Bericht kopiert");
    } catch (e) { showToast("Kopieren nicht möglich"); }
  }

  function resetDay() {
    if (!confirm("Wirklich alle heutigen Zähler und Einwand-Gründe auf 0 zurücksetzen?")) return;
    const counts0 = zeroCounts();
    const reasons0 = zeroReasons(reasons);
    setTodayCounts(counts0);
    setTodayReasons(reasons0);
    persist(counts0, reasons0);
    setStep("lead");
    showToast("Tag zurückgesetzt");
  }

  const isToday = view === "today";
  const counts = isToday ? todayCounts : (rangeData?.counts || zeroCounts());
  const reasonCounts = isToday ? todayReasons : (rangeData?.reasons || zeroReasons(reasons));
  const reasonTotal = reasons.reduce((sum, r) => sum + (reasonCounts[r.key] || 0), 0);
  const reachRate = counts.anwahlen > 0 ? Math.round((counts.erreicht / counts.anwahlen) * 100) : 0;
  const closeRate = counts.anwahlen > 0 ? Math.round((counts.termin / counts.anwahlen) * 100) : 0;
  const dateLabel = isToday ? todayFullLabel() : view === "week" ? weekLabel() : monthLabel();

  if (!ready) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Call Tracker</h1>
      <div className="brand-stripe w-16 mb-4" />

      <InfoCard>
        Der Assistent führt dich Anruf für Anruf durch: <strong>Anwahl starten</strong> → erreicht oder nicht → Termin vereinbart oder
        nicht. Alles wird automatisch mitgezählt, du musst nichts selbst eintragen. Wird ein Termin vereinbart, landen die Kundendaten
        direkt unter <strong>Termine</strong>. Unter <strong>Woche</strong> und <strong>Monat</strong> siehst du deine eigenen Zahlen,
        unter <strong>Team</strong> die deines Teams (nur für Team-Leitungen).
      </InfoCard>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {VIEWS.map(([key, label]) => (
          <button key={key} onClick={() => switchView(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${view === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "team" ? (
        <TeamPanel state={teamState} zeitraum={teamZeitraum} onZeitraum={(z) => { setTeamZeitraum(z); loadTeam(z); }} />
      ) : (
        <>
          {isToday && (
            <div className="card mb-5 text-center">
              {step === "lead" && (
                <>
                  <div className="text-3xl mb-1">📇</div>
                  <div className="font-display font-semibold text-textMain text-lg mb-1">Bereit für den nächsten Anruf?</div>
                  <p className="text-textMuted text-sm mb-4">Ein Klick startet die Anwahl.</p>
                  <button onClick={() => { bump("anwahlen"); setStep("outcome"); }} className="btn">Anwahl starten</button>
                </>
              )}

              {step === "outcome" && (
                <>
                  <div className="text-3xl mb-1">📞</div>
                  <div className="font-display font-semibold text-textMain text-lg mb-4">Wurde die Person erreicht?</div>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button onClick={() => { bump("nicht"); showToast("Erfasst: Nicht erreicht"); setStep("lead"); }} className="btn-ghost text-sm px-4 py-2.5">Nicht erreicht</button>
                    <button onClick={() => { bump("erreicht"); setStep("callResult"); }} className="btn">Erreicht</button>
                  </div>
                </>
              )}

              {step === "callResult" && (
                <>
                  <div className="text-3xl mb-1">💬</div>
                  <div className="font-display font-semibold text-textMain text-lg mb-4">Wurde ein Termin vereinbart?</div>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button onClick={() => setStep("reason")} className="btn-ghost text-sm px-4 py-2.5 border-coral/40 text-coral">Nein</button>
                    {/* "Terminiert" wird erst gezählt, wenn der Termin unten
                        tatsächlich gespeichert oder bestätigt wird. */}
                    <button onClick={() => { resetLeadDraft(); setStep("booking"); }} className="btn-ghost text-sm px-4 py-2.5 border-teal/40 text-teal">Ja, Termin vereinbaren</button>
                  </div>
                </>
              )}

              {step === "reason" && (
                <>
                  <div className="font-display font-semibold text-textMain text-lg mb-1">Was war der Grund?</div>
                  <p className="text-textMuted text-xs mb-4">Einmal antippen, zählt automatisch mit</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {reasons.map((r) => (
                      <button key={r.key} onClick={() => countReason(r.key)}
                        className="px-3 py-2.5 rounded-lg border border-line text-sm text-textMain hover:border-amber hover:text-amber transition">
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {/* Ohne Angabe: zählt auf die letzte Kategorie (Sammelpunkt). */}
                  <button onClick={() => countReason(reasons[reasons.length - 1].key)} className="text-textMuted text-xs underline">Ohne Angabe zählen</button>
                </>
              )}

              {step === "booking" && (
                <>
                  <div className="text-3xl mb-1">📅</div>
                  <div className="font-display font-semibold text-textMain text-lg mb-3">Termin vereinbaren</div>
                  <ul className="text-left text-sm text-textMain list-disc pl-6 mb-4 flex flex-col gap-1.5 max-w-md mx-auto">
                    {bookingSteps.map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                  <button onClick={() => setStep("leadForm")} className="btn">Erledigt, weiter</button>
                </>
              )}

              {step === "leadForm" && (
                <div className="text-left">
                  <div className="font-display font-semibold text-textMain text-lg mb-1 text-center">Termin erfasst 🎉</div>
                  <p className="text-textMuted text-xs mb-4 text-center">Kundendaten erfassen (empfohlen) — landet direkt unter „Termine" in der App</p>
                  {/* Jedes Feld bekommt eine eigene Beschriftung. Ein
                      Datum-/Uhrzeit-Feld kann keinen Platzhaltertext anzeigen
                      (dort steht immer "tt.mm.jjjj, --:--") — ohne Label war
                      nicht erkennbar, dass es ein Pflichtfeld ist. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-textMuted mb-1">Name *</label>
                      <input className="input !py-2 text-sm" placeholder="Vor- und Nachname" value={leadDraft.name} onChange={(e) => setLeadDraft((d) => ({ ...d, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-textMuted mb-1">Telefon{coreRequired.phone ? " *" : ""}</label>
                      <input className="input !py-2 text-sm" type="tel" value={leadDraft.phone} onChange={(e) => setLeadDraft((d) => ({ ...d, phone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-textMuted mb-1">E-Mail{coreRequired.email ? " *" : ""}</label>
                      <input className="input !py-2 text-sm" type="email" value={leadDraft.email} onChange={(e) => setLeadDraft((d) => ({ ...d, email: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-textMuted mb-1">Termin (Datum/Uhrzeit) *</label>
                      <input className="input !py-2 text-sm" type="datetime-local" value={leadDraft.appointmentAt} onChange={(e) => setLeadDraft((d) => ({ ...d, appointmentAt: e.target.value }))} />
                    </div>
                    {leadFields.filter((f) => f.type === "text" && !f.multiline).map((f) => (
                      <div key={f.key}>
                        <label className="block text-xs text-textMuted mb-1">{f.label}{f.required ? " *" : ""}</label>
                        <input className="input !py-2 text-sm"
                          value={leadDraft.fields[f.key] || ""}
                          onChange={(e) => setLeadDraft((d) => ({ ...d, fields: { ...d.fields, [f.key]: e.target.value } }))} />
                      </div>
                    ))}
                    {leadFields.filter((f) => f.type === "checkbox").map((f) => (
                      <label key={f.key} className="flex items-center gap-2 text-sm text-textMuted sm:self-end sm:pb-2">
                        <input type="checkbox" checked={!!leadDraft.fields[f.key]}
                          onChange={(e) => setLeadDraft((d) => ({ ...d, fields: { ...d.fields, [f.key]: e.target.checked } }))} /> {f.label}
                      </label>
                    ))}
                  </div>
                  {leadFields.filter((f) => f.multiline).map((f) => (
                    <div key={f.key} className="mb-3">
                      <label className="block text-xs text-textMuted mb-1">{f.label}</label>
                      <textarea className="input !py-2 text-sm" rows={2}
                        value={leadDraft.fields[f.key] || ""}
                        onChange={(e) => setLeadDraft((d) => ({ ...d, fields: { ...d.fields, [f.key]: e.target.value } }))} />
                    </div>
                  ))}
                  <label className="block text-xs text-textMuted mb-1.5">Aufnahme hochladen (optional)</label>
                  <input ref={leadFileRef} type="file" accept="audio/*,.mp3,.m4a,.mp4,.aac,.wav,.ogg,.opus,.amr,.3gp,.caf,.webm,.flac" onChange={(e) => setLeadFile(e.target.files[0] || null)}
                    className="text-xs text-textMuted mb-4 block w-full" />
                  <div className="flex items-center gap-3 flex-wrap">
                    <button disabled={leadSaving} onClick={submitLead} className="btn disabled:opacity-40">{leadSaving ? "Speichert..." : "Speichern"}</button>
                    <button onClick={() => { bump("termin"); resetLeadDraft(); showToast("Termin gezählt"); setStep("breathe"); }} className="text-textMuted text-xs underline">
                      Nur zählen, ohne Daten zu erfassen
                    </button>
                  </div>
                </div>
              )}

              {step === "breathe" && (
                <>
                  <div className="text-3xl mb-1">🌬️</div>
                  <div className="font-display font-semibold text-textMain text-lg mb-1">Kurz durchatmen</div>
                  <p className="text-textMuted text-sm mb-4">Kurz Luft holen, dann geht's weiter.</p>
                  <button onClick={() => setStep("lead")} className="btn">Weiter zum nächsten Anruf</button>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <span className="text-sm text-textMuted">{dateLabel}</span>
            <span className="text-sm text-textMuted">
              {isToday ? "Anwahlen heute: " : "Anwahlen gesamt: "}<strong className="text-textMain">{counts.anwahlen}</strong>
            </span>
          </div>
          {!isToday && (
            <p className="text-xs text-textMuted mb-3">Nur-Ansicht — gezählt wird über den Assistenten im Reiter „Heute".</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
            {FIELDS.map((f) => (
              // Dieselbe Farbe wie im Diagramm: wer die Kachel gesehen hat,
              // findet den Wert im Kreis ohne Legende wieder.
              <div key={f.key} className="card" style={{ borderColor: `color-mix(in srgb, ${feldFarbe(f.key)} 40%, transparent)` }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: feldFarbe(f.key) }} />
                  <span className="text-xs text-textMuted">{f.label}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-3xl font-display font-semibold" style={{ color: feldFarbe(f.key) }}>
                    {counts[f.key] || 0}
                  </span>
                  {isToday && (
                    <button onClick={() => bump(f.key, -1)} title="Zähler korrigieren"
                      className="w-8 h-8 rounded-lg border border-line text-textMuted hover:text-textMain hover:border-amber flex items-center justify-center flex-shrink-0">
                      –
                    </button>
                  )}
                </div>
                {isToday && <div className="text-[10.5px] text-textMuted mt-1">Bei Fehlern: − zum Korrigieren</div>}
              </div>
            ))}
          </div>

          <div className="card mb-5">
            <div className="font-semibold text-textMain text-sm mb-3">Zusammenfassung</div>
            <div className="flex items-center justify-between text-sm py-1.5 border-b border-line">
              <span className="text-textMuted">Erreichbarkeitsquote</span><span className="text-textMain font-semibold">{reachRate}%</span>
            </div>
            <div className="flex items-center justify-between text-sm py-1.5">
              <span className="text-textMuted">Abschlussquote (von Anrufen)</span><span className="text-textMain font-semibold">{closeRate}%</span>
            </div>
          </div>

          <div className="card mb-5">
            <div className="font-semibold text-textMain text-sm mb-1">Einwand-Verteilung</div>
            <p className="text-xs text-textMuted mb-3">Prozentualer Anteil der Gründe bei negativen Anrufen</p>
            {reasonTotal === 0 ? (
              <p className="text-textMuted text-sm">Noch keine negativen Anrufe mit Grund erfasst.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {[...reasons].sort((a, b) => (reasonCounts[b.key] || 0) - (reasonCounts[a.key] || 0)).map((r) => {
                  const n = reasonCounts[r.key] || 0;
                  const pct = Math.round((n / reasonTotal) * 100);
                  return (
                    <div key={r.key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-textMain">{r.label}</span>
                        <span className="text-textMuted">{n} · {pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-surfaceRaised overflow-hidden">
                        {/* Jeder Grund in seiner Farbe — dieselbe wie im
                            Kreisdiagramm der Team-Auswertung. */}
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: grundFarbe(reasons, r.key) }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={copyReport} className="btn-ghost text-xs"><Icon name="chat" size={12} /> Bericht kopieren</button>
            {isToday && <button onClick={resetDay} className="btn-ghost text-xs text-coral">Tag zurücksetzen</button>}
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-2.5 rounded-lg bg-surfaceRaised border border-line text-sm text-textMain shadow-lg">
          {toast}
        </div>
      )}
    </Layout>
  );
}

function TeamPanel({ state, zeitraum, onZeitraum }) {
  if (state.status === "loading" || state.status === "idle") return <p className="text-textMuted text-sm">Lädt...</p>;
  if (state.status === "denied") {
    return (
      <div className="card">
        <div className="font-semibold text-textMain text-sm mb-1">Team-Übersicht</div>
        <p className="text-textMuted text-sm">
          Diese Auswertung sehen Manager ihrer Organisation und alle, die ein Team leiten.
          Gehörst du zu einem Team, ohne es zu leiten, findest du deine eigenen Zahlen unter „Heute“, „Woche“ und „Monat“.
        </p>
      </div>
    );
  }
  if (state.status === "error") {
    return <div className="card border border-coral/40 text-coral text-sm">Team-Ansicht konnte nicht geladen werden.</div>;
  }

  const gesamt = state.gesamt || {};

  // Die Zähler bauen aufeinander auf, sie stehen NICHT nebeneinander:
  //
  //   Anwahlen = erreicht + nicht erreicht
  //   davon erreicht: terminiert, negativ, und der Rest ohne Ergebnis
  //
  // Vorher lagen alle vier in einem Kreis — bei 10 erreicht, 10 nicht
  // erreicht, 5 negativ und 15 terminiert kam ein Kreis mit 40 heraus,
  // obwohl es 20 Anwahlen waren. Ein negativer Anruf ist keine zusätzliche
  // Anwahl, sondern das Ergebnis einer schon gezählten.
  const anwahlen = gesamt.anwahlen || 0;
  const erreicht = gesamt.erreicht || 0;
  const nicht = gesamt.nicht || 0;
  const termin = gesamt.termin || 0;
  const negativ = gesamt.negativ || 0;

  // Farben kommen aus lib/diagrammFarben.js: "Terminiert" ist überall grün,
  // "Negativ" überall rot — in der Kachel, im Kreis und in der Tabelle.
  const verteilung = [
    { label: "Ans Telefon gegangen", value: erreicht, color: feldFarbe("erreicht") },
    { label: "Nicht erreicht", value: nicht, color: feldFarbe("nicht") },
    // Wer nur "Anwahl" tippt, ohne danach erreicht/nicht erreicht: sonst
    // stimmte die Mitte des Kreises nicht mit der Gesamtzahl überein.
    { label: "Ohne Angabe", value: Math.max(0, anwahlen - erreicht - nicht), color: "#5B6079" },
  ];
  const ergebnisse = [
    { label: "Terminiert", value: termin, color: feldFarbe("termin") },
    { label: "Negativ verlaufen", value: negativ, color: feldFarbe("negativ") },
    { label: "Ohne Ergebnis", value: Math.max(0, erreicht - termin - negativ), color: "#5B6079" },
  ];

  return (
    <>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[["heute", "Heute"], ["woche", "7 Tage"], ["monat", "30 Tage"]].map(([key, label]) => (
          <button key={key} onClick={() => onZeitraum(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${zeitraum === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Erst die Zahlen, dann ihre Verteilung: "wie viele" beantwortet ein
          Kreisdiagramm nicht, "woran liegt es" eine Zahlenreihe nicht. */}
      {/* "davon" steht bewusst dabei: terminiert und negativ sind Ergebnisse
          bereits gezählter Gespräche, keine zusätzlichen Anrufe. */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="card !py-3" style={{ borderColor: `color-mix(in srgb, ${feldFarbe(f.key)} 40%, transparent)` }}>
            <div className="text-xl font-display font-semibold" style={{ color: feldFarbe(f.key) }}>
              {gesamt[f.key] || 0}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: feldFarbe(f.key) }} />
              <span className="text-[11px] text-textMuted leading-tight">
                {f.key === "termin" || f.key === "negativ" ? <span className="text-textMuted">davon </span> : null}
                {f.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="font-semibold text-textMain text-sm mb-1">Anwahlen pro Person</div>
          <p className="text-xs text-textMuted mb-3">Wer wie viel telefoniert hat</p>
          <Kreisdiagramm
            daten={state.members.map((m, i) => ({ label: m.name, value: m.value, color: paletteFarbe(i) }))}
            leerText="In diesem Zeitraum wurden keine Anwahlen erfasst."
          />
        </div>
        <div className="card">
          <div className="font-semibold text-textMain text-sm mb-1">Was aus den Anwahlen wurde</div>
          <p className="text-xs text-textMuted mb-3">Alle {anwahlen} Anwahlen — erreicht oder nicht</p>
          <Kreisdiagramm daten={verteilung} mitteText="Anwahlen" leerText="Noch keine Anwahlen erfasst." />
        </div>
      </div>

      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">Von den erreichten Gesprächen</div>
        <p className="text-xs text-textMuted mb-3">
          Terminiert und negativ sind Ergebnisse dieser {erreicht} Gespräche — keine zusätzlichen Anrufe.
        </p>
        <Kreisdiagramm daten={ergebnisse} mitteText="erreicht" leerText="Noch keine Gespräche zustande gekommen." />
      </div>

      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">Warum negative Anrufe?</div>
        <p className="text-xs text-textMuted mb-3">Die Gründe im gewählten Zeitraum</p>
        <Kreisdiagramm
          daten={state.reasons.map((r) => ({ ...r, color: grundFarbe(state.reasons, r.key) }))}
          leerText="Noch keine negativen Anrufe mit Grund erfasst." />
      </div>

      {/* Die Tabelle bleibt: ein Kreisdiagramm zeigt Anteile, nicht die
          einzelnen Zahlen pro Person. */}
      <div className="card">
        <div className="font-semibold text-textMain text-sm mb-3">Alle Zahlen pro Person</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-textMuted text-left">
                <th className="font-normal pb-2 pr-3">Person</th>
                {FIELDS.map((f) => (
                  <th key={f.key} className="font-normal pb-2 px-2 text-right whitespace-nowrap">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: feldFarbe(f.key) }} />
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.members.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-textMain whitespace-nowrap">{m.name}</td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className="py-1.5 px-2 text-right font-mono"
                      style={{ color: (m.zahlen?.[f.key] || 0) > 0 ? feldFarbe(f.key) : undefined }}>
                      {m.zahlen?.[f.key] || 0}
                    </td>
                  ))}
                </tr>
              ))}
              {state.members.length === 0 && (
                <tr><td colSpan={FIELDS.length + 1} className="py-2 text-textMuted">Niemand im Team.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
