import { useEffect, useMemo, useRef, useState } from "react";
import Layout, { getCachedOrg } from "../components/Layout";
import Icon from "../components/Icon";
import InfoCard from "../components/InfoCard";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { getActiveOrgId } from "../lib/activeOrg";
import { meldeFehler } from "../lib/errorBus";
import { resolveObjectionCategories } from "../lib/objectionCategories";
import { resolveLeadFields, resolveCoreRequired, fehlendePflichtfelder } from "../lib/leadFields";
import {
  FIELDS, storagePrefix, dayKey, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
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
const BAR_COLORS = [
  "var(--org-color-1, #4C5DC9)", "var(--org-accent, #CE3A5C)", "var(--org-color-3, #B2314F)",
  "#3FBFA6", "#F0B23E", "#5FB8E8", "#8D90A6", "#9C3E6E",
];

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
          log_date: new Date().toISOString().slice(0, 10),
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

  async function loadTeam() {
    setTeamState({ status: "loading", members: [], reasons: [] });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setTeamState({ status: "denied", members: [], reasons: [] }); return; }
      // Zugriff nur für Team-Leitungen — Zugehörigkeit über teams/team_members
      // (wie in pages/manager.js), nicht über das veraltete profiles.manager_id.
      const { data: myTeams } = await supabase.from("teams").select("id").eq("created_by", session.user.id);
      const leadTeamIds = (myTeams || []).map((t) => t.id);
      if (!leadTeamIds.length) { setTeamState({ status: "denied", members: [], reasons: [] }); return; }

      const { data: memberships } = await supabase
        .from("team_members").select("user_id, profiles:user_id(full_name)").in("team_id", leadTeamIds);
      const nameById = { [session.user.id]: "Ich" };
      const memberIds = [];
      (memberships || []).forEach((m) => {
        if (m.user_id === session.user.id || nameById[m.user_id]) return;
        memberIds.push(m.user_id);
        nameById[m.user_id] = m.profiles?.full_name || "Unbenannt";
      });
      const allIds = [session.user.id, ...memberIds];

      const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const { data: logs } = await supabase.from("call_log_days").select("*").in("user_id", allIds).gte("log_date", since);

      const callsByUser = {};
      const reasonTotals = zeroReasons(reasons);
      (logs || []).forEach((l) => {
        callsByUser[l.user_id] = (callsByUser[l.user_id] || 0) + (l.counts?.anwahlen || 0);
        reasons.forEach((r) => { reasonTotals[r.key] += l.reasons?.[r.key] || 0; });
      });

      setTeamState({
        status: "ok",
        members: allIds.map((id) => ({ id, name: nameById[id] || "Unbenannt", value: callsByUser[id] || 0 })),
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
          meldeFehler("Die Aufnahme konnte nicht hochgeladen werden — der Termin wurde ohne sie gespeichert: " + upErr.message, upErr);
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
        <TeamPanel state={teamState} />
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
                  <input ref={leadFileRef} type="file" accept="audio/*" onChange={(e) => setLeadFile(e.target.files[0] || null)}
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
              <div key={f.key} className={`card ${f.kind === "positive" ? "border-teal/40" : f.kind === "negative" ? "border-coral/40" : ""}`}>
                <div className="text-xs text-textMuted mb-1">{f.label}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-3xl font-display font-semibold ${f.kind === "positive" ? "text-teal" : f.kind === "negative" ? "text-coral" : "text-textMain"}`}>
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
                        <div className="h-full brand-gradient rounded-full" style={{ width: `${pct}%` }} />
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

function BarList({ rows, emptyText }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.some((r) => r.value > 0)) return <p className="text-textMuted text-sm">{emptyText}</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row, i) => (
        <div key={row.key || row.id}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-textMain">{row.name || row.label}</span>
            <span className="text-textMuted">{row.value}</span>
          </div>
          <div className="h-2 rounded-full bg-surfaceRaised overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round((row.value / max) * 100)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamPanel({ state }) {
  if (state.status === "loading" || state.status === "idle") return <p className="text-textMuted text-sm">Lädt...</p>;
  if (state.status === "denied") {
    return (
      <div className="card">
        <div className="font-semibold text-textMain text-sm mb-1">Team-Übersicht</div>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur sichtbar, wenn du mindestens ein Team leitest (siehe „Team (Manager)" in der Sidebar).</p>
      </div>
    );
  }
  if (state.status === "error") {
    return <div className="card border border-coral/40 text-coral text-sm">Team-Ansicht konnte nicht geladen werden.</div>;
  }
  return (
    <>
      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">Anwahlen pro Teammitglied</div>
        <p className="text-xs text-textMuted mb-3">Letzte 7 Tage</p>
        <BarList rows={state.members} emptyText="In den letzten 7 Tagen wurden keine Anwahlen erfasst." />
      </div>
      <div className="card">
        <div className="font-semibold text-textMain text-sm mb-1">Warum negative Anrufe?</div>
        <p className="text-xs text-textMuted mb-3">Team, letzte 7 Tage</p>
        <BarList rows={state.reasons} emptyText="Noch keine negativen Anrufe mit Grund erfasst." />
      </div>
    </>
  );
}
