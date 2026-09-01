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
import { buchungslink, kurzform } from "../lib/buchungslink";
import { meldeStoerung } from "../lib/fehlerMelden";
import { berlinHeute, tagPlus } from "../lib/woche";
import { ZEITRAEUME, zeitraumGrenzen, quartalsName } from "../lib/zeitraum";
import Kreisdiagramm from "../components/Kreisdiagramm";
import { feldFarbe, grundFarbe, paletteFarbe } from "../lib/diagrammFarben";
import { berechneQuoten, quotenText, QUOTEN_SPALTEN } from "../lib/quoten";
import Aufklapper from "../components/Aufklapper";
import { downloadCsv } from "../lib/csv";
import { resolveLeadFields, resolveCoreRequired, fehlendePflichtfelder } from "../lib/leadFields";
import {
  FIELDS, storagePrefix, dayKey, dateKeyOf,
  zeroCounts, zeroReasons, todayFullLabel,
  loadDay, saveDay, buildReport, alleGespeichertenTage, zaehlerZusammenfuehren,
  merkeSchritt, offenerSchritt,
} from "../lib/callTracker";

// Zwei Reiter: zählen und auswerten. "Woche"/"Monat" sind entfallen — sie
// rechneten nur mit dem, was auf DIESEM Gerät lag, und boten weder Quartal
// noch eigenen Zeitraum noch Diagramme. Die Statistiken können all das und
// lesen vom Server, sind also auf jedem Gerät gleich.
const VIEWS = [["today", "Heute"], ["statistik", "Statistiken"]];

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

  const [step, setStep] = useState("lead");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const [leadDraft, setLeadDraft] = useState({ name: "", phone: "", email: "", appointmentAt: "", fields: {} });
  const [leadFile, setLeadFile] = useState(null);
  const [leadSaving, setLeadSaving] = useState(false);
  const leadFileRef = useRef(null);

  const [teamState, setTeamState] = useState({ status: "idle", members: [], reasons: [] });
  const [teamZeitraum, setTeamZeitraum] = useState("woche");
  // Nur die Leitung sieht den Hinweis auf eigene Ablehnungsgründe.
  const [darfOrgVerwalten, setDarfOrgVerwalten] = useState(false);
  // Wurde ein angefangener Anruf wieder aufgenommen? Dann steht ein Hinweis
  // dabei, sonst wundert man sich, warum die Frage plötzlich da ist.
  const [wiederaufgenommen, setWiederaufgenommen] = useState(false);
  const [nachtragen, setNachtragen] = useState(null);
  // Buchungslink: der eigene, sonst der der Organisation (migration_123).
  const [meinProfil, setMeinProfil] = useState(null);
  const [linkKopiert, setLinkKopiert] = useState(false);
  // Der Raketenflug beim vereinbarten Termin. Als Zustand statt als
  // CSS-Klasse am Knopf: er soll auch dann fliegen, wenn der Termin unten im
  // Formular gespeichert wird, nicht nur beim Antippen.
  const [rakete, setRakete] = useState(false);
  const [eigenerZeitraum, setEigenerZeitraum] = useState({ von: "", bis: "" });

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

      // Für den Hinweis auf eigene Ablehnungsgründe (nur Leitung).
      const { data: meineRolle } = await supabase.from("profiles")
        .select("role, is_admin, is_platform_admin, booking_url").eq("id", session.user.id).maybeSingle();
      setDarfOrgVerwalten(istFuehrungsrolle(meineRolle));
      setMeinProfil(meineRolle);

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
      const prefixJetzt = storagePrefix(session.user.id);
      const loaded = loadDay(prefixJetzt, dayKey(), cats);

      // Der heutige Stand vom Server dazu — und zwar BEVOR hier irgendetwas
      // gezählt wird.
      //
      // Vorher kam der Tag ausschliesslich aus dem Speicher dieses Geräts.
      // Wer am Laptop 200 Anwahlen gezählt hatte und dann am Handy den Call
      // Tracker öffnete, startete dort bei null — und der erste Klick schrieb
      // diese Null über die 200. Genauso beim geleerten Browserspeicher oder
      // im privaten Fenster. Die Zahlen waren damit weg, ohne Warnung.
      //
      // Zusammengeführt wird nach dem höheren Wert je Zähler: zwei Geräte
      // können denselben Tag nicht doppelt zählen, aber auch nicht
      // gegenseitig löschen.
      let start = loaded;
      try {
        const { data: serverTag } = await supabase.from("call_log_days")
          .select("counts, reasons").eq("user_id", session.user.id).eq("log_date", dayKey()).maybeSingle();
        if (serverTag) {
          start = {
            counts: zaehlerZusammenfuehren(loaded.counts, serverTag.counts || {}),
            reasons: zaehlerZusammenfuehren(loaded.reasons, serverTag.reasons || {}),
          };
          saveDay(prefixJetzt, dayKey(), start.counts, start.reasons);
        }
      } catch (e) {
        // Kein Netz: mit dem lokalen Stand weiterarbeiten. Der Versand führt
        // später ohnehin noch einmal zusammen.
      }
      if (!mounted) return;
      setTodayCounts(start.counts);
      setTodayReasons(start.reasons);

      // Angefangenen Anruf wieder aufnehmen. Ohne das blieb "Erreicht"
      // gezählt und das Ergebnis für immer offen — der graue Rest in der
      // Auswertung (siehe lib/callTracker.js).
      const offen = offenerSchritt(prefixJetzt);
      if (offen) { setStep(offen); setWiederaufgenommen(true); }

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
  const letzterStand = useRef(null);
  const ersteAenderung = useRef(0);

  // Zahlen zum Server schicken. Getrennt vom Zählen, weil sie auch dann
  // hinaus müssen, wenn gerade nicht getippt wird: beim Verlassen der Seite.
  async function sendeZahlen({ erzwingen = false } = {}) {
    const stand = letzterStand.current;
    if (!userId || !stand) return;
    clearTimeout(syncTimer.current);
    ersteAenderung.current = 0;
    // Supabase WIRFT bei einer abgelehnten Anfrage nicht, es gibt sie als
    // Feld zurück. Nur try/catch hätte den Fehler nie gesehen — die Zahlen
    // blieben lokal richtig und tauchten in keiner Auswertung auf, ohne
    // dass irgendwo etwas stand.
    try {
      // Der Serverstand zuerst, dann das Maximum je Zähler. Ein blindes
      // Überschreiben hat schon einen ganzen Tag gekostet: das Gerät mit dem
      // kleineren Stand gewann, weil es zuletzt geschrieben hat.
      //
      // "erzwingen" gibt es nur für "Tag zurücksetzen" — das ist der einzige
      // Fall, in dem eine kleinere Zahl gewollt ist.
      let counts = stand.counts;
      let gruende = stand.reasons;
      if (!erzwingen) {
        const { data: serverTag } = await supabase.from("call_log_days")
          .select("counts, reasons").eq("user_id", userId).eq("log_date", dateKeyOf(new Date())).maybeSingle();
        if (serverTag) {
          counts = zaehlerZusammenfuehren(stand.counts, serverTag.counts || {});
          gruende = zaehlerZusammenfuehren(stand.reasons, serverTag.reasons || {});
        }
      }
      const { error } = await supabase.from("call_log_days").upsert({
        user_id: userId,
        // Derselbe Tagesschlüssel wie lokal (siehe lib/callTracker.js).
        // Mit UTC landeten die ersten Anrufe nach Mitternacht in der Zeile
        // des VORTAGS und überschrieben dessen Zahlen mit den frisch bei
        // null begonnenen Zählern.
        log_date: dateKeyOf(new Date()),
        counts,
        reasons: gruende,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (e) {
      meldeFehler("Deine Anrufzahlen konnten gerade nicht mit dem Team geteilt werden. Lokal sind sie gespeichert.", e);
      meldeStoerung("Call Tracker teilen", e?.message || String(e));
    }
  }

  function persist(counts, reasonCounts) {
    if (!userId) return;
    saveDay(prefix, dayKey(), counts, reasonCounts);
    letzterStand.current = { counts, reasons: reasonCounts };

    // Verzögert, damit nicht jeder Klick eine eigene Anfrage auslöst — aber
    // höchstens fünf Sekunden. Ohne diese Obergrenze schob jeder weitere
    // Klick den Versand erneut nach hinten: wer eine Stunde am Stück
    // telefoniert und dann den Tab schliesst, hatte nie etwas geschickt.
    const jetzt = Date.now();
    if (!ersteAenderung.current) ersteAenderung.current = jetzt;
    clearTimeout(syncTimer.current);
    if (jetzt - ersteAenderung.current >= 5000) { sendeZahlen(); return; }
    syncTimer.current = setTimeout(sendeZahlen, 900);
  }

  // Beim Verlassen oder Wegschalten der Seite alles Ausstehende noch
  // hinausschicken. Genau hier gingen Tage verloren: gezählt, Tab zu, weg.
  useEffect(() => {
    const beiVerlassen = () => { if (letzterStand.current) sendeZahlen(); };
    const beiWechsel = () => { if (document.hidden) beiVerlassen(); };
    window.addEventListener("pagehide", beiVerlassen);
    document.addEventListener("visibilitychange", beiWechsel);
    return () => {
      window.removeEventListener("pagehide", beiVerlassen);
      document.removeEventListener("visibilitychange", beiWechsel);
      beiVerlassen();
    };
  }, [userId]);

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

  // Lokal gezählte Tage nachträglich zum Server schicken.
  //
  // Nötig, weil der Versand früher aufgeschoben werden konnte, bis der Tab
  // zu war — dann standen die Zahlen richtig auf dem Gerät und fehlten in
  // jeder Auswertung. Zusammengeführt wird nach dem höheren Wert, damit
  // nichts überschrieben wird, was anderswo schon weiter gezählt war.
  async function trageNach() {
    if (!userId) return;
    setNachtragen("laeuft");
    try {
      const tage = alleGespeichertenTage(prefix, reasons);
      if (!tage.length) { setNachtragen("nichts"); return; }

      const { data: vorhanden } = await supabase.from("call_log_days")
        .select("log_date, counts, reasons").eq("user_id", userId)
        .in("log_date", tage.map((t) => t.tag));
      const serverNach = new Map((vorhanden || []).map((z) => [z.log_date, z]));

      const zeilen = tage.map((t) => {
        const alt = serverNach.get(t.tag);
        return {
          user_id: userId,
          log_date: t.tag,
          counts: zaehlerZusammenfuehren(t.counts, alt?.counts || {}),
          reasons: zaehlerZusammenfuehren(t.reasons, alt?.reasons || {}),
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase.from("call_log_days").upsert(zeilen);
      if (error) throw error;
      setNachtragen(`fertig:${zeilen.length}`);
      if (view === "statistik") loadTeam();
    } catch (e) {
      setNachtragen("fehler");
      meldeFehler("Die lokalen Zähler konnten nicht nachgetragen werden.", e);
      meldeStoerung("Call Tracker nachtragen", e?.message || String(e));
    }
  }

  async function switchView(next) {
    setView(next);
    if (next === "statistik") { loadTeam(); return; }
    setStep("lead");
  }

  // Wie weit die Team-Auswertung zurückschaut.
  function tageFuerZeitraum(z) {
    return z === "heute" ? 0 : z === "monat" ? 30 : 7;
  }

  async function loadTeam(art = teamZeitraum, eigen = eigenerZeitraum) {
    setTeamState({ status: "loading", members: [], reasons: [] });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setTeamState({ status: "error", members: [], reasons: [] }); return; }

      // Wer diese Auswertung sieht, folgt derselben Regel wie überall sonst:
      // eine Führungsrolle sieht ihre ganze Organisation, eine Teamleitung
      // ihr Team (siehe lib/rollen.js und call_log_days in der Datenbank).
      const { data: profil } = await supabase.from("profiles")
        .select("id, full_name, role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();

      // Der eigene Eintrag hiess "Ich". Wer mit einem zweiten Konto
      // hineinschaut, sucht in der Liste aber seinen NAMEN — und findet ihn
      // nicht, obwohl die Zahlen da sind. Deshalb steht überall der Name;
      // dass man selbst gemeint ist, sagt ein "(Du)" dahinter.
      const nameById = { [session.user.id]: profil?.full_name || "Ich" };
      let memberIds = [];
      let teams = [];

      if (istFuehrungsrolle(profil)) {
        const orgId = getActiveOrgId(profil);
        const [{ data: alle }, { data: orgTeams }] = await Promise.all([
          supabase.from("profiles").select("id, full_name").eq("organization_id", orgId),
          supabase.from("teams").select("id, name, created_by").eq("organization_id", orgId).order("name"),
        ]);
        (alle || []).forEach((p) => {
          if (p.id === session.user.id) return;
          memberIds.push(p.id);
          nameById[p.id] = p.full_name || "Unbenannt";
        });
        teams = orgTeams || [];
      } else {
        // Wer kein Team leitet, sieht seine eigenen Zahlen — früher stand hier
        // eine Absage, und die eigenen Zahlen lagen in "Woche"/"Monat", also
        // nur auf einem Gerät.
        const { data: myTeams } = await supabase.from("teams").select("id, name, created_by").eq("created_by", session.user.id);
        teams = myTeams || [];
        const { data: memberships } = teams.length
          ? await supabase.from("team_members").select("user_id, profiles:user_id(full_name)").in("team_id", teams.map((t) => t.id))
          : { data: [] };
        (memberships || []).forEach((m) => {
          if (m.user_id === session.user.id || nameById[m.user_id]) return;
          memberIds.push(m.user_id);
          nameById[m.user_id] = m.profiles?.full_name || "Unbenannt";
        });
      }
      const allIds = [session.user.id, ...memberIds];

      // Welche Person in welchem Team steckt — für den Team-Filter.
      const { data: zuordnung } = teams.length
        ? await supabase.from("team_members").select("team_id, user_id").in("team_id", teams.map((t) => t.id))
        : { data: [] };
      const teamsVonPerson = {};
      (zuordnung || []).forEach((z) => {
        (teamsVonPerson[z.user_id] = teamsVonPerson[z.user_id] || []).push(z.team_id);
      });
      // Die leitende Person gehört zu ihrem Team, auch ohne eigenen Eintrag
      // in team_members — sonst fiele sie beim Filtern heraus.
      teams.forEach((t) => {
        if (!t.created_by) return;
        (teamsVonPerson[t.created_by] = teamsVonPerson[t.created_by] || []).push(t.id);
      });

      // Zeitraum in deutschen Kalendertagen (siehe lib/zeitraum.js).
      const { von, bis } = zeitraumGrenzen(art, { von: eigen?.von, bis: eigen?.bis });
      // Die Obergrenze steht bewusst da: ohne sie gilt still die des
      // Servers, und bei einem grossen Team über ein Quartal fehlten
      // einfach Zeilen — ohne dass irgendwo stünde, dass etwas fehlt.
      const ZEILEN_GRENZE = 20000;
      const { data: logs } = await supabase.from("call_log_days")
        .select("user_id, log_date, counts, reasons")
        .in("user_id", allIds).gte("log_date", von).lte("log_date", bis)
        .limit(ZEILEN_GRENZE);

      setTeamState({
        status: "ok",
        // Roh statt vorverdichtet: die Filter nach Team, Person und die
        // Aufschlüsselung nach Tagen rechnen daraus alles selbst, ohne bei
        // jeder Auswahl neu beim Server nachzufragen.
        logs: logs || [],
        // Angeschnitten? Dann sagt die Auswertung das, statt zu wenig zu
        // zeigen und richtig auszusehen.
        angeschnitten: (logs || []).length >= ZEILEN_GRENZE,
        ichId: session.user.id,
        members: allIds.map((id) => ({ id, name: nameById[id] || "Unbenannt", teams: teamsVonPerson[id] || [] })),
        teams,
        reasons,
        zeitraum: { von, bis },
      });
    } catch (e) {
      setTeamState({ status: "error", members: [], reasons: [] });
    }
  }

  function zurueckZumStart() {
    setWiederaufgenommen(false);
    setStep("lead");
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
      starteRakete();
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
    const rangeLabel = todayFullLabel();
    const text = buildReport({ orgName: org?.name, rangeLabel, counts, reasonCounts, reasons });
    try {
      await navigator.clipboard.writeText(text);
      showToast("Bericht kopiert");
    } catch (e) { showToast("Kopieren nicht möglich"); }
  }

  // Startet den Flug. Der Zeitgeber räumt ihn wieder weg — bliebe das
  // Element stehen, käme beim nächsten Termin keine zweite Rakete.
  function starteRakete() {
    // Kurz abschalten, damit ein zweiter Termin die Bewegung neu startet,
    // statt am bereits gelaufenen Element hängen zu bleiben. Über einen
    // Zeitgeber statt requestAnimationFrame: der ruht in einem Tab, der
    // gerade nicht gezeichnet wird, und die Rakete käme dort nie.
    setRakete(false);
    setTimeout(() => {
      setRakete(true);
      setTimeout(() => setRakete(false), 3100);
    }, 20);
  }

  // Der einzige Fall, in dem eine kleinere Zahl gewollt ist. Deshalb geht
  // das Zurücksetzen direkt und erzwungen hinaus statt über den normalen,
  // zusammenführenden Versand — der würde die alten Zahlen sofort
  // zurückholen und das Zurücksetzen wirkungslos machen.
  async function resetDay() {
    if (!confirm("Wirklich alle heutigen Zähler und Einwand-Gründe auf 0 zurücksetzen? Das gilt für alle Geräte.")) return;
    const counts0 = zeroCounts();
    const reasons0 = zeroReasons(reasons);
    setTodayCounts(counts0);
    setTodayReasons(reasons0);
    saveDay(prefix, dayKey(), counts0, reasons0);
    letzterStand.current = { counts: counts0, reasons: reasons0 };
    setStep("lead");
    await sendeZahlen({ erzwingen: true });
    showToast("Tag zurückgesetzt");
  }

  // Der Schritt wird bei jeder Änderung festgehalten, damit ein
  // geschlossener Reiter den Anruf nicht verschluckt.
  useEffect(() => { if (userId) merkeSchritt(prefix, step); }, [step, userId, prefix]);

  // Der Gerätestand wird nur neu gelesen, wenn es einen Grund gibt: beim
  // Wechsel in die Statistik und nach einem Nachtragen. Bei jedem Render den
  // lokalen Speicher zu durchsuchen macht die Seite ohne Not langsam.
  const lokaleTage = useMemo(
    () => (ready && view === "statistik" ? alleGespeichertenTage(prefix, reasons) : []),
    [ready, view, prefix, reasons, nachtragen]
  );

  const isToday = view === "today";
  const counts = todayCounts;
  const reasonCounts = todayReasons;
  const reasonTotal = reasons.reduce((sum, r) => sum + (reasonCounts[r.key] || 0), 0);
  const reachRate = counts.anwahlen > 0 ? Math.round((counts.erreicht / counts.anwahlen) * 100) : 0;
  const closeRate = counts.anwahlen > 0 ? Math.round((counts.termin / counts.anwahlen) * 100) : 0;
  const dateLabel = todayFullLabel();

  if (!ready) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Call Tracker</h1>
      <div className="brand-stripe w-16 mb-4" />

      <InfoCard>
        Der Assistent führt dich Anruf für Anruf durch: <strong>Anwahl starten</strong> → erreicht oder nicht → Termin vereinbart oder
        nicht. Alles wird automatisch mitgezählt, du musst nichts selbst eintragen. Wird ein Termin vereinbart, landen die Kundendaten
        direkt unter <strong>Termine</strong>. Unter <strong>Statistiken</strong> siehst du deine eigenen Zahlen über jeden Zeitraum —
        wer ein Team leitet, kann dort zusätzlich nach Team und Personen filtern und vergleichen.
      </InfoCard>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {VIEWS.map(([key, label]) => (
          <button key={key} onClick={() => switchView(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${view === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "statistik" ? (
        <StatistikPanel
          state={teamState}
          zeitraum={teamZeitraum}
          eigener={eigenerZeitraum}
          lokaleTage={lokaleTage}
          nachtragen={nachtragen}
          onNachtragen={trageNach}
          onZeitraum={(z) => { setTeamZeitraum(z); loadTeam(z, eigenerZeitraum); }}
          onEigener={(e) => { setEigenerZeitraum(e); if (e.von && e.bis) loadTeam("eigen", e); }}
        />
      ) : (
        <>
          {isToday && wiederaufgenommen && step !== "lead" && (
            <div className="card mb-3 border-amber/40 text-sm text-amber">
              Hier war noch ein Anruf offen — bitte kurz zu Ende erfassen, dann stimmt die Auswertung.
            </div>
          )}

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
                    <button onClick={() => { bump("nicht"); showToast("Erfasst: Nicht erreicht"); zurueckZumStart(); }} className="btn-ghost text-sm px-4 py-2.5">Nicht erreicht</button>
                    <button onClick={() => { bump("erreicht"); setStep("wen"); }} className="btn">Erreicht</button>
                  </div>
                </>
              )}

              {/* Wen hatte man am Telefon? Steht zwischen "erreicht" und der
                  Termin-Frage: die Antwort ändert nichts am weiteren Ablauf,
                  aber ohne sie fehlt in der Auswertung, wie oft man
                  überhaupt bis zur Entscheidung durchkommt. */}
              {step === "wen" && (
                <>
                  <div className="text-3xl mb-1">🚪</div>
                  <div className="font-display font-semibold text-textMain text-lg mb-1">Wen hast du zuerst erreicht?</div>
                  <p className="text-textMuted text-xs mb-4">Einmal antippen, zählt automatisch mit</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button onClick={() => { bump("gatekeeper"); setStep("durchgestellt"); }}
                      className="btn-ghost text-sm px-4 py-2.5" style={{ borderColor: feldFarbe("gatekeeper"), color: feldFarbe("gatekeeper") }}>
                      Vorzimmer / Gatekeeper
                    </button>
                    <button onClick={() => { bump("entscheider"); setStep("callResult"); }}
                      className="btn-ghost text-sm px-4 py-2.5" style={{ borderColor: feldFarbe("entscheider"), color: feldFarbe("entscheider") }}>
                      Geschäftsführer
                    </button>
                  </div>
                </>
              )}

              {/* Nur nach einem Gatekeeper-Gespräch: kam man zur
                  Entscheidung durch? Bei "nein" gibt es keinen Termin — dann
                  direkt zur Grund-Auswahl statt eines überflüssigen Klicks. */}
              {step === "durchgestellt" && (
                <>
                  <div className="text-3xl mb-1">➡️</div>
                  <div className="font-display font-semibold text-textMain text-lg mb-4">Wurdest du zum Entscheider durchgestellt?</div>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button onClick={() => setStep("reason")} className="btn-ghost text-sm px-4 py-2.5 border-coral/40 text-coral">Nein</button>
                    <button onClick={() => { bump("weitergeleitet"); setStep("callResult"); }}
                      className="btn-ghost text-sm px-4 py-2.5" style={{ borderColor: feldFarbe("weitergeleitet"), color: feldFarbe("weitergeleitet") }}>
                      Ja, durchgestellt
                    </button>
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
                  {/* Der Weg zu eigenen Gründen gehört dorthin, wo die Gründe
                      stehen — sonst weiss niemand, dass es ihn gibt. */}
                  {darfOrgVerwalten && (
                    <div className="mt-3">
                      <a href="/admin/organization" className="text-[11px] text-textMuted underline">
                        Eigene Ablehnungsgründe festlegen (z. B. „Kein Interesse")
                      </a>
                    </div>
                  )}
                </>
              )}

              {step === "booking" && (
                <>
                  <div className="text-3xl mb-1">📅</div>
                  <div className="font-display font-semibold text-textMain text-lg mb-3">Termin vereinbaren</div>

                  {/* Der Buchungslink steht VOR der Anleitung und vor dem
                      Formular: mitten im Gespräch sucht man ihn sonst in
                      einem anderen Tab, während die Kundin wartet. */}
                  {(() => {
                    const link = buchungslink(meinProfil, org);
                    if (!link) {
                      return darfOrgVerwalten ? (
                        <p className="text-[11px] text-textMuted mb-4">
                          Noch kein Buchungslink hinterlegt —{" "}
                          <a href="/admin/organization" className="underline">unter Organisation → Call Tracker</a> eintragen,
                          persönlich unter <a href="/profile" className="underline">Mein Profil</a>.
                        </p>
                      ) : (
                        <p className="text-[11px] text-textMuted mb-4">
                          Eigenen Buchungslink hinterlegen: <a href="/profile" className="underline">Mein Profil</a>.
                        </p>
                      );
                    }
                    return (
                      <div className="card !py-3 mb-4 max-w-md mx-auto border-teal/40">
                        <div className="text-[10.5px] uppercase tracking-wide text-textMuted mb-2">Dein Buchungslink</div>
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                          <a href={link} target="_blank" rel="noopener noreferrer" className="btn text-sm">
                            <Icon name="calendar" size={14} /> Kalender öffnen
                          </a>
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(link).then(
                                () => { setLinkKopiert(true); setTimeout(() => setLinkKopiert(false), 2500); },
                                () => showToast("Kopieren nicht möglich")
                              );
                            }}
                            className="btn-ghost text-sm">
                            <Icon name="copy" size={14} /> {linkKopiert ? "Kopiert ✓" : "Link kopieren"}
                          </button>
                        </div>
                        <div className="text-[11px] text-textMuted mt-2 break-all">{kurzform(link)}</div>
                        <p className="text-[11px] text-textMuted mt-1">Zum Vorlesen oder direkt in den Chat schicken.</p>
                      </div>
                    );
                  })()}

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
                    {/* Als richtiger Knopf, nicht als kleiner Link: wer die
                        Kundendaten nicht erfassen will, verliess bisher das
                        Formular einfach — und dann fehlte der Termin in der
                        Auswertung ("Abgebrochen"). */}
                    <button onClick={() => { bump("termin"); resetLeadDraft(); starteRakete(); showToast("Termin gezählt"); setStep("breathe"); }} className="btn-ghost text-sm">
                      Nur zählen, ohne Daten
                    </button>
                  </div>
                </div>
              )}

              {step === "breathe" && (
                <>
                  <div className="text-3xl mb-1">🌬️</div>
                  <div className="font-display font-semibold text-textMain text-lg mb-1">Kurz durchatmen</div>
                  <p className="text-textMuted text-sm mb-4">Kurz Luft holen, dann geht's weiter.</p>
                  <button onClick={zurueckZumStart} className="btn">Weiter zum nächsten Anruf</button>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <span className="text-sm text-textMuted">{dateLabel}</span>
            <span className="text-sm text-textMuted">
              Anwahlen heute: <strong className="text-textMain">{counts.anwahlen}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
            {FIELDS.map((f) => (
              // Dieselbe Farbe wie im Diagramm: wer die Kachel gesehen hat,
              // findet den Wert im Kreis ohne Legende wieder.
              // Im Reiter "Heute" gibt es nichts aufzuschlüsseln — es IST ein
              // einzelner Tag. Die Aufschlüsselung steht in den Statistiken.
              <div key={f.key} className="card" style={{ borderColor: `color-mix(in srgb, ${feldFarbe(f.key)} 40%, transparent)` }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: feldFarbe(f.key) }} />
                  <span className="text-xs text-textMuted flex-1">{f.label}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-3xl font-display font-semibold" style={{ color: feldFarbe(f.key) }}>
                    {counts[f.key] || 0}
                  </span>
                  <button onClick={() => bump(f.key, -1)} title="Zähler korrigieren"
                    className="w-8 h-8 rounded-lg border border-line text-textMuted hover:text-textMain hover:border-amber flex items-center justify-center flex-shrink-0">
                    –
                  </button>
                </div>
                <div className="text-[10.5px] text-textMuted mt-1">Bei Fehlern: − zum Korrigieren</div>
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
            {/* Rettungsanker: was auf diesem Gerät gezählt wurde, aber nie
                beim Server ankam, lässt sich hier nachschicken. */}
            <button onClick={trageNach} disabled={nachtragen === "laeuft"} className="btn-ghost text-xs disabled:opacity-40">
              {nachtragen === "laeuft" ? "Trägt nach…"
                : nachtragen === "nichts" ? "Nichts nachzutragen"
                : nachtragen === "fehler" ? "Nachtragen fehlgeschlagen"
                : nachtragen?.startsWith("fertig") ? `${nachtragen.split(":")[1]} Tage nachgetragen ✓`
                : "Zahlen dieses Geräts nachtragen"}
            </button>
          </div>
        </>
      )}

      {rakete && <div className="rakete" aria-hidden="true"><span>🚀</span></div>}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-2.5 rounded-lg bg-surfaceRaised border border-line text-sm text-textMain shadow-lg">
          {toast}
        </div>
      )}
    </Layout>
  );
}

function StatistikPanel({ state, zeitraum, eigener, onZeitraum, onEigener, lokaleTage, nachtragen, onNachtragen }) {
  // Welche Kachel aufgeklappt ist. Immer nur eine: zwei offene Listen
  // untereinander vergleicht man ohnehin nicht.
  const [offeneKachel, setOffeneKachel] = useState(null);
  const [teamFilter, setTeamFilter] = useState("alle");
  // Mehrere Personen gleichzeitig: leer heisst "alle". Als Liste statt als
  // Klappliste, weil Vergleichen ein Nebeneinander ist — man will sehen, wer
  // gewählt ist, ohne ein Menü zu öffnen.
  const [auswahl, setAuswahl] = useState([]);

  if (state.status === "loading" || state.status === "idle") return <p className="text-textMuted text-sm">Lädt...</p>;
  if (state.status === "error") {
    return <div className="card border border-coral/40 text-coral text-sm">Die Statistiken konnten nicht geladen werden.</div>;
  }

  const alleMitglieder = state.members || [];
  const teams = state.teams || [];
  const reasons = state.reasons || [];

  // Team zuerst, Person darin: die Personenliste zeigt nur, wer im gewählten
  // Team ist — sonst wählt man jemanden aus und die Auswertung bleibt leer.
  const imTeam = teamFilter === "alle"
    ? alleMitglieder
    : alleMitglieder.filter((m) => (m.teams || []).includes(teamFilter));
  const gewaehlt = auswahl.filter((id) => imTeam.some((m) => m.id === id));
  const sichtbare = gewaehlt.length ? imTeam.filter((m) => gewaehlt.includes(m.id)) : imTeam;
  const sichtbareIds = new Set(sichtbare.map((m) => m.id));
  const zeilen = (state.logs || []).filter((l) => sichtbareIds.has(l.user_id));
  // Genau eine Person: dann ist der Verlauf nach Tagen die interessante
  // Frage. Ab zwei geht es ums Vergleichen, und dafür sagt der Kreis mehr.
  const einePerson = sichtbare.length === 1 && gewaehlt.length === 1 ? sichtbare[0] : null;
  const vergleich = gewaehlt.length > 1;

  // Summen, Zahlen je Person, Einwandgründe und der Verlauf nach Tagen —
  // alles aus denselben Rohdaten, damit Kacheln, Diagramme und Tabelle nie
  // auseinanderlaufen können.
  const gesamt = {};
  FIELDS.forEach((f) => { gesamt[f.key] = 0; });
  const gruendeGesamt = {};
  reasons.forEach((r) => { gruendeGesamt[r.key] = 0; });
  const proPerson = {};
  const proTag = {};
  zeilen.forEach((l) => {
    const p = proPerson[l.user_id] || (proPerson[l.user_id] = { zahlen: {}, gruende: {} });
    FIELDS.forEach((f) => {
      const wert = l.counts?.[f.key] || 0;
      gesamt[f.key] += wert;
      p.zahlen[f.key] = (p.zahlen[f.key] || 0) + wert;
      if (f.key === "anwahlen") proTag[l.log_date] = (proTag[l.log_date] || 0) + wert;
    });
    reasons.forEach((r) => {
      const wert = l.reasons?.[r.key] || 0;
      gruendeGesamt[r.key] += wert;
      p.gruende[r.key] = (p.gruende[r.key] || 0) + wert;
    });
  });

  // Der eigene Eintrag trägt seinen Namen und dahinter "(Du)". So findet
  // man sich in der Liste wieder, auch wenn man mit einem zweiten Konto
  // hineinschaut und nach dem eigenen Namen sucht.
  const zeigeName = (m) => (m.id === state.ichId ? `${m.name} (Du)` : m.name);

  const mitglieder = sichtbare
    .map((m) => ({
      ...m,
      value: proPerson[m.id]?.zahlen?.anwahlen || 0,
      zahlen: FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: proPerson[m.id]?.zahlen?.[f.key] || 0 }), {}),
      gruende: reasons.reduce((acc, r) => ({ ...acc, [r.key]: proPerson[m.id]?.gruende?.[r.key] || 0 }), {}),
      // Quoten je Person aus denselben Zahlen — nicht aus den Gesamtquoten
      // heruntergebrochen, das ginge bei ungleicher Anrufmenge schief.
      quoten: berechneQuoten(proPerson[m.id]?.zahlen || {}),
    }))
    .sort((a, b) => b.value - a.value);

  const anwahlen = gesamt.anwahlen || 0;
  const erreicht = gesamt.erreicht || 0;
  const nicht = gesamt.nicht || 0;
  const termin = gesamt.termin || 0;
  const negativ = gesamt.negativ || 0;

  // Farben kommen aus lib/diagrammFarben.js: "Terminiert" ist überall grün,
  // "Negativ" überall rot — in der Kachel, im Kreis und in der Tabelle.
  // Kreis und Kachel müssen dieselbe Zahl ergeben. Sie gehen auseinander,
  // wenn Zähler nachträglich von Hand korrigiert wurden: der Minus-Knopf
  // ändert "Anwahlen", ohne "erreicht" und "nicht erreicht" mitzuziehen.
  // Dann ist die Summe der Stücke grösser als die Zahl in der Kachel.
  //
  // Das wird jetzt benannt statt still geschluckt — vorher stand links 564
  // und im Kreis daneben 571, ohne dass irgendwo stand, warum.
  const ohneAngabe = Math.max(0, anwahlen - erreicht - nicht);
  const ueberhang = Math.max(0, erreicht + nicht - anwahlen);
  const verteilung = [
    { label: "Ans Telefon gegangen", value: erreicht, color: feldFarbe("erreicht") },
    { label: "Nicht erreicht", value: nicht, color: feldFarbe("nicht") },
    { label: "Ohne Angabe", value: ohneAngabe, color: "#5B6079" },
  ];
  // Wen man ZUERST am Telefon hatte — jeder erreichte Anruf zählt einmal.
  // Der Rest ist kein "ohne Angabe": seit der Umstellung fragt der Assistent
  // immer. Übrig bleiben nur Gespräche von VORHER, als es die Unterscheidung
  // noch nicht gab — und die soll man auch so nennen.
  const gatekeeperGesamt = gesamt.gatekeeper || 0;
  const entscheiderDirekt = gesamt.entscheider || 0;
  const durchgestellt = gesamt.weitergeleitet || 0;
  const vorDerUmstellung = Math.max(0, erreicht - gatekeeperGesamt - entscheiderDirekt);
  const wenErreicht = [
    { label: "Zuerst: Vorzimmer", value: gatekeeperGesamt, color: feldFarbe("gatekeeper") },
    { label: "Zuerst: Entscheider", value: entscheiderDirekt, color: feldFarbe("entscheider") },
    { label: "Früher erfasst", value: vorDerUmstellung, color: "#5B6079" },
  ];

  // Die Zahl, um die es beim Kaltakquise-Training eigentlich geht: wie oft
  // landet jemand bei der Entscheidung — direkt oder durchgekämpft.
  // Abgeleitet, nicht zusätzlich gebucht: sonst wäre die Summe der Zähler
  // grösser als "erreicht" und jedes Diagramm daneben falsch.
  const beiEntscheidung = entscheiderDirekt + durchgestellt;
  const quoten = berechneQuoten(gesamt);
  const durchstellQuote = quoten.durchstellQuote || 0;
  // Auch hier kein "ohne Angabe": der Assistent fragt immer nach dem
  // Ergebnis. Übrig bleibt nur, wer mittendrin abbricht — Seite geschlossen,
  // Reiter gewechselt, Formular verlassen. Das gehört benannt, nicht als
  // fehlende Angabe getarnt.
  const abgebrochen = Math.max(0, erreicht - termin - negativ);
  const ergebnisse = [
    { label: "Terminiert", value: termin, color: feldFarbe("termin") },
    { label: "Negativ verlaufen", value: negativ, color: feldFarbe("negativ") },
    { label: "Abgebrochen", value: abgebrochen, color: "#5B6079" },
  ];
  const gruendeDaten = reasons.map((r) => ({
    key: r.key, label: r.label, value: gruendeGesamt[r.key] || 0, color: grundFarbe(reasons, r.key),
  }));

  // Bei einer einzelnen Person sagt "Anwahlen pro Person" nichts mehr — ein
  // Kreis mit 100 %. Dann zählt der Verlauf: an welchen Tagen wurde
  // telefoniert.
  const tage = Object.entries(proTag).sort((a, b) => a[0].localeCompare(b[0]));

  // Zählt dieses Gerät mehr, als beim Server angekommen ist?
  //
  // Die Auswertung zeigt ausschliesslich, was in der Datenbank steht. Wenn
  // ein Versand fehlgeschlagen ist, stehen die Zahlen richtig auf dem Gerät
  // und fehlen in jeder Auswertung — sichtbar war das bisher nirgends, man
  // sah nur eine zu kleine Zahl. Der Vergleich läuft über die eigenen Tage
  // im gewählten Zeitraum.
  const meineServerTage = new Map(
    (state.logs || []).filter((l) => l.user_id === state.ichId).map((l) => [l.log_date, l.counts || {}])
  );
  const nachzutragen = (lokaleTage || []).reduce((summe, t) => {
    if (!state.zeitraum || t.tag < state.zeitraum.von || t.tag > state.zeitraum.bis) return summe;
    const beimServer = meineServerTage.get(t.tag)?.anwahlen || 0;
    return summe + Math.max(0, (t.counts?.anwahlen || 0) - beimServer);
  }, 0);

  const zeitraumText = state.zeitraum
    ? `${new Date(`${state.zeitraum.von}T12:00:00`).toLocaleDateString("de-DE")} – ${new Date(`${state.zeitraum.bis}T12:00:00`).toLocaleDateString("de-DE")}`
    : "";

  // Excel öffnet CSV mit Semikolon und BOM direkt richtig (siehe lib/csv.js)
  // — kein Zusatzprogramm, keine Fremdbibliothek, keine Import-Assistenten.
  // Ausgegeben wird genau das, was gerade gefiltert auf dem Bildschirm steht.
  function exportiereTeam() {
    const kopf = [
      "Person",
      ...FIELDS.map((f) => f.label),
      ...reasons.map((r) => `Einwand: ${r.label}`),
      ...QUOTEN_SPALTEN.map((s) => s.label),
    ];
    const datenZeilen = mitglieder.map((m) => [
      zeigeName(m),
      ...FIELDS.map((f) => m.zahlen[f.key] || 0),
      ...reasons.map((r) => m.gruende[r.key] || 0),
      ...QUOTEN_SPALTEN.map((s) => quotenText(m.quoten, s)),
    ]);
    datenZeilen.push([
      "Gesamt",
      ...FIELDS.map((f) => gesamt[f.key] || 0),
      ...reasons.map((r) => gruendeGesamt[r.key] || 0),
      ...QUOTEN_SPALTEN.map((s) => quotenText(quoten, s)),
    ]);
    const teil = [
      teamFilter === "alle" ? null : teams.find((t) => t.id === teamFilter)?.name,
      gewaehlt.length === 1 ? sichtbare[0]?.name : gewaehlt.length > 1 ? `vergleich-${gewaehlt.length}` : null,
    ].filter(Boolean).join("-") || "alle";
    downloadCsv(`call-tracker-${teil}-${state.zeitraum?.von}-bis-${state.zeitraum?.bis}.csv`.replace(/[^\w.-]+/g, "-"), kopf, datenZeilen);
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {ZEITRAEUME.map(([key, label]) => (
          <button key={key} onClick={() => onZeitraum(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${zeitraum === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {key === "quartal" ? quartalsName(berlinHeute()) : label}
          </button>
        ))}
      </div>

      {zeitraum === "eigen" && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <input type="date" className="input !w-auto !py-1.5 text-xs" value={eigener?.von || ""}
            onChange={(e) => onEigener({ ...eigener, von: e.target.value })} />
          <span className="text-xs text-textMuted">bis</span>
          <input type="date" className="input !w-auto !py-1.5 text-xs" value={eigener?.bis || ""}
            onChange={(e) => onEigener({ ...eigener, bis: e.target.value })} />
          {(!eigener?.von || !eigener?.bis) && (
            <span className="text-[11px] text-textMuted">Beide Daten wählen — dann wird ausgewertet.</span>
          )}
        </div>
      )}

      {/* Team und Person: der Team-Filter engt zuerst ein, die Personenliste
          zeigt danach nur noch, wer dort drin ist. Wer niemanden führt, sieht
          nur sich selbst — dann wäre jeder Filter ein Knopf ohne Wahl. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {teams.length > 0 && alleMitglieder.length > 1 && (
          <select className="input !w-auto !py-1.5 text-xs" value={teamFilter}
            onChange={(e) => { setTeamFilter(e.target.value); setAuswahl([]); setOffeneKachel(null); }}>
            <option value="alle">Alle Teams ({alleMitglieder.length})</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({alleMitglieder.filter((m) => (m.teams || []).includes(t.id)).length})
              </option>
            ))}
          </select>
        )}
        {(teamFilter !== "alle" || gewaehlt.length > 0) && (
          <button onClick={() => { setTeamFilter("alle"); setAuswahl([]); setOffeneKachel(null); }} className="btn-ghost text-xs">
            Filter zurücksetzen
          </button>
        )}
        {zeitraumText && <span className="text-[11px] text-textMuted ml-auto">{zeitraumText}</span>}
      </div>

      {/* Wenn Zahlen nur auf dem Gerät stehen, wird das gesagt — und zwar
          bevor jemand die zu kleine Zahl für die Wahrheit hält. */}
      {nachzutragen > 0 && (
        <div className="card mb-4 border-amber/50">
          <div className="text-sm text-textMain mb-1">
            Auf diesem Gerät sind {nachzutragen} Anwahlen mehr gezählt, als beim Server angekommen sind.
          </div>
          <p className="text-xs text-textMuted mb-3">
            Sie fehlen deshalb in dieser Auswertung und bei allen anderen. Nachtragen führt beide Stände
            zusammen — der höhere Wert je Tag gewinnt, es geht nichts verloren.
          </p>
          <button onClick={onNachtragen} disabled={nachtragen === "laeuft"} className="btn-ghost text-xs disabled:opacity-40">
            {nachtragen === "laeuft" ? "Trägt nach…"
              : nachtragen === "fehler" ? "Nachtragen fehlgeschlagen — nochmal versuchen"
              : nachtragen?.startsWith("fertig") ? `${nachtragen.split(":")[1]} Tage nachgetragen ✓`
              : "Zahlen dieses Geräts nachtragen"}
          </button>
        </div>
      )}

      {state.angeschnitten && (
        <div className="card mb-4 border-coral/50 text-xs text-coral">
          Es wurden sehr viele Tageszeilen gefunden — die Auswertung zeigt möglicherweise nicht alle.
          Bitte den Zeitraum verkleinern oder nach Team filtern.
        </div>
      )}

      {/* Personen zum Vergleichen: mehrere anwählbar, leer heisst alle. */}
      <div className={`flex items-center gap-1.5 mb-4 flex-wrap ${alleMitglieder.length > 1 ? "" : "hidden"}`}>
        <button onClick={() => { setAuswahl([]); setOffeneKachel(null); }}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${gewaehlt.length === 0 ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
          Alle ({imTeam.length})
        </button>
        {imTeam.map((m, i) => {
          const an = gewaehlt.includes(m.id);
          return (
            <button key={m.id}
              onClick={() => {
                setOffeneKachel(null);
                setAuswahl((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]));
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${an ? "text-textMain" : "border-line text-textMuted hover:text-textMain"}`}
              style={an ? { borderColor: paletteFarbe(i), background: `color-mix(in srgb, ${paletteFarbe(i)} 18%, transparent)` } : undefined}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: paletteFarbe(i) }} />
              {zeigeName(m)}
            </button>
          );
        })}
      </div>

      {vergleich && (
        <p className="text-[11px] text-textMuted mb-3">
          Vergleich von {sichtbare.length} Personen: {sichtbare.map(zeigeName).join(", ")}. Alle Zahlen und
          Diagramme unten zeigen ausschliesslich diese Auswahl.
        </p>
      )}

      {/* "davon" steht bewusst dabei: terminiert und negativ sind Ergebnisse
          bereits gezählter Gespräche, keine zusätzlichen Anrufe. */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
        {FIELDS.map((f) => {
          const offen = offeneKachel === f.key;
          return (
            <button key={f.key} onClick={() => setOffeneKachel(offen ? null : f.key)}
              aria-expanded={offen}
              className="card !py-3 text-left transition-transform hover:-translate-y-0.5"
              style={{ borderColor: `color-mix(in srgb, ${feldFarbe(f.key)} ${offen ? 90 : 40}%, transparent)` }}>
              <div className="text-xl font-display font-semibold" style={{ color: feldFarbe(f.key) }}>
                {gesamt[f.key] || 0}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: feldFarbe(f.key) }} />
                <span className="text-[11px] text-textMuted leading-tight flex-1">
                  {f.key === "termin" || f.key === "negativ" ? <span className="text-textMuted">davon </span> : null}
                  {f.label}
                </span>
                <span className={`text-textMuted text-[11px] transition-transform ${offen ? "rotate-90" : ""}`}>›</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Aufgeklappt: woher diese Zahl kommt. Unter den Kacheln statt in
          ihnen — in einer schmalen Kachel wären Namen und Zahlen nicht
          lesbar, und das Raster würde bei jedem Klick zerspringen. */}
      <Aufklapper offen={!!offeneKachel}>
        {offeneKachel && (() => {
          const feld = FIELDS.find((f) => f.key === offeneKachel);
          const liste = mitglieder
            .map((m) => ({ id: m.id, name: zeigeName(m), wert: m.zahlen[offeneKachel] || 0 }))
            .sort((a, b) => b.wert - a.wert);
          const summe = liste.reduce((s, z) => s + z.wert, 0);
          const groesster = Math.max(1, ...liste.map((z) => z.wert));
          return (
            <div className="card mb-4" style={{ borderColor: `color-mix(in srgb, ${feldFarbe(offeneKachel)} 45%, transparent)` }}>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: feldFarbe(offeneKachel) }} />
                <span className="font-semibold text-textMain text-sm">{feld?.label} — wer wie viel</span>
                <button onClick={() => setOffeneKachel(null)} className="btn-ghost text-xs ml-auto">Schliessen</button>
              </div>
              {summe === 0 ? (
                <p className="text-textMuted text-xs">Für „{feld?.label}“ ist in diesem Zeitraum nichts erfasst.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {liste.filter((z) => z.wert > 0).map((z) => (
                    <div key={z.id}>
                      <div className="flex items-center justify-between text-xs mb-1 gap-2">
                        <span className="text-textMain truncate">{z.name}</span>
                        <span className="text-textMuted flex-shrink-0">{z.wert} · {Math.round((z.wert / summe) * 100)} %</span>
                      </div>
                      <div className="h-2 rounded-full bg-surfaceRaised overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((z.wert / groesster) * 100)}%`, background: feldFarbe(offeneKachel) }} />
                      </div>
                    </div>
                  ))}
                  {liste.some((z) => z.wert === 0) && (
                    <p className="text-[11px] text-textMuted mt-1">
                      Ohne Eintrag: {liste.filter((z) => z.wert === 0).map((z) => z.name).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </Aufklapper>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card">
          {einePerson ? (
            <>
              <div className="font-semibold text-textMain text-sm mb-1">Verlauf nach Tagen</div>
              <p className="text-xs text-textMuted mb-3">Anwahlen von {zeigeName(einePerson)}</p>
              {tage.length === 0 ? (
                <p className="text-textMuted text-xs">In diesem Zeitraum wurden keine Anwahlen erfasst.</p>
              ) : (
                <div className="flex items-end gap-1.5 h-28">
                  {tage.map(([tag, wert]) => {
                    const groesster = Math.max(1, ...tage.map(([, w]) => w));
                    return (
                      <div key={tag} className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${wert} Anwahlen`}>
                        <span className="text-[10px] text-textMuted">{wert || ""}</span>
                        <div className="w-full rounded-t transition-all duration-300"
                          style={{ height: `${Math.max(2, Math.round((wert / groesster) * 70))}px`, background: feldFarbe("anwahlen") }} />
                        <span className="text-[9px] text-textMuted truncate w-full text-center">{tag.slice(8)}.{tag.slice(5, 7)}.</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="font-semibold text-textMain text-sm mb-1">Anwahlen pro Person</div>
              <p className="text-xs text-textMuted mb-3">Wer wie viel telefoniert hat</p>
              <Kreisdiagramm
                daten={mitglieder.map((m) => ({
                  label: zeigeName(m),
                  value: m.value,
                  // Dieselbe Farbe wie am Knopf oben — sonst müsste man die
                  // Zuordnung im Kopf neu herstellen.
                  color: paletteFarbe(imTeam.findIndex((x) => x.id === m.id)),
                }))}
                mitteText="Anwahlen"
                leerText="In diesem Zeitraum wurden keine Anwahlen erfasst."
              />
            </>
          )}
        </div>
        <div className="card">
          <div className="font-semibold text-textMain text-sm mb-1">Was aus den Anwahlen wurde</div>
          <p className="text-xs text-textMuted mb-3">
            {ueberhang > 0
              ? `${erreicht + nicht} Gespräche bei ${anwahlen} gezählten Anwahlen`
              : `Alle ${anwahlen} Anwahlen — erreicht oder nicht`}
          </p>
          <Kreisdiagramm daten={verteilung} mitteText="Gespräche" leerText="Noch keine Anwahlen erfasst." />
          {ueberhang > 0 && (
            <p className="text-[11px] text-textMuted mt-2">
              Das sind {ueberhang} mehr als die {anwahlen} gezählten Anwahlen. Das passiert, wenn der Zähler
              „Anwahlen“ nachträglich mit dem Minus-Knopf verringert wurde — „erreicht“ und „nicht erreicht“
              bleiben dabei stehen.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="font-semibold text-textMain text-sm mb-1">Wen hast du zuerst erreicht?</div>
          <p className="text-xs text-textMuted mb-3">
            Jeder Anruf zählt einmal — wer nach einer Weiterleitung beim Chef landet, steht unten im Trichter
            {vorDerUmstellung > 0 && " · „Früher erfasst“ sind Gespräche von vor dieser Unterscheidung"}
          </p>
          <Kreisdiagramm daten={wenErreicht} mitteText="erreicht" leerText="Noch keine Gespräche zustande gekommen." />
        </div>
        <div className="card">
          <div className="font-semibold text-textMain text-sm mb-1">Von den erreichten Gesprächen</div>
        <p className="text-xs text-textMuted mb-3">
          Terminiert und negativ sind Ergebnisse dieser {erreicht} Gespräche — keine zusätzlichen Anrufe.
          {abgebrochen > 0 && " „Abgebrochen“ heisst: der Assistent wurde nach „Erreicht“ nicht zu Ende geführt."}
        </p>
          <Kreisdiagramm daten={ergebnisse} mitteText="erreicht" leerText="Noch keine Gespräche zustande gekommen." />
        </div>
      </div>

      {/* Die Quoten rund um das Terminieren. Absolute Zahlen sagen, wie viel
          jemand gearbeitet hat — die Quoten sagen, wie gut. Ein Strich statt
          einer Zahl heisst: dafür fehlt noch die Grundlage (siehe quoten.js). */}
      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">Quoten rund um das Terminieren</div>
        <p className="text-xs text-textMuted mb-3">
          {termin > 0
            ? `${termin} Termine aus ${anwahlen} Anwahlen — was das je Schritt bedeutet`
            : "Sobald der erste Termin steht, füllen sich diese Zahlen."}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {QUOTEN_SPALTEN.map((spalte) => (
            <div key={spalte.key} className="rounded-xl border border-line px-3 py-2.5">
              <div className="text-lg font-display font-semibold text-textMain">{quotenText(quoten, spalte)}</div>
              <div className="text-[11px] text-textMain leading-tight">{spalte.label}</div>
              <div className="text-[10px] text-textMuted leading-tight mt-0.5">{spalte.hinweis}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Der Trichter: wie viele kommen bis zur Entscheidung durch. Bewusst
          als Reihe und nicht als Kreis — es ist ein Weg, keine Aufteilung. */}
      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">Weg bis zur Entscheidung</div>
        <p className="text-xs text-textMuted mb-3">
          Jeder Anruf zählt einmal. „Beim Entscheider gelandet“ fasst zusammen: direkt erreicht plus durchgestellt.
        </p>
        <div className="flex flex-col gap-2.5">
          {[
            { label: "Erreichte Gespräche", wert: erreicht, farbe: feldFarbe("erreicht") },
            { label: "Zuerst beim Vorzimmer", wert: gatekeeperGesamt, farbe: feldFarbe("gatekeeper") },
            { label: "Davon durchgestellt", wert: durchgestellt, farbe: feldFarbe("weitergeleitet"), zusatz: gatekeeperGesamt > 0 ? `${durchstellQuote} % des Vorzimmers` : null },
            { label: "Direkt beim Entscheider", wert: entscheiderDirekt, farbe: feldFarbe("entscheider") },
            { label: "Beim Entscheider gelandet", wert: beiEntscheidung, farbe: feldFarbe("termin"), stark: true,
              zusatz: erreicht > 0 ? `${Math.round((beiEntscheidung / erreicht) * 100)} % der Gespräche` : null },
          ].map((z) => (
            <div key={z.label}>
              <div className="flex items-center justify-between text-xs mb-1 gap-2">
                <span className={z.stark ? "text-textMain font-semibold" : "text-textMain"}>{z.label}</span>
                <span className="text-textMuted flex-shrink-0">
                  {z.wert}{z.zusatz ? ` · ${z.zusatz}` : ""}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surfaceRaised overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${erreicht > 0 ? Math.min(100, Math.round((z.wert / erreicht) * 100)) : 0}%`, background: z.farbe }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-4">
        <div className="font-semibold text-textMain text-sm mb-1">Warum negative Anrufe?</div>
        <p className="text-xs text-textMuted mb-3">Die Gründe im gewählten Zeitraum</p>
        <Kreisdiagramm daten={gruendeDaten} mitteText="Gründe" leerText="Noch keine negativen Anrufe mit Grund erfasst." />
      </div>

      {/* Die Tabelle bleibt: ein Kreisdiagramm zeigt Anteile, nicht die
          einzelnen Zahlen pro Person. */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="font-semibold text-textMain text-sm">Alle Zahlen pro Person</span>
          <button onClick={exportiereTeam} className="btn-ghost text-xs ml-auto">
            <Icon name="download" size={12} /> Für Excel herunterladen
          </button>
        </div>
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
                {reasons.map((r) => (
                  <th key={r.key} className="font-normal pb-2 px-2 text-right whitespace-nowrap">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: grundFarbe(reasons, r.key) }} />
                    {r.label}
                  </th>
                ))}
                {/* Quoten hinten, durch den Strich abgesetzt: links stehen
                    gezählte Ereignisse, rechts daraus gerechnete Verhältnisse. */}
                {QUOTEN_SPALTEN.map((spalte, i) => (
                  <th key={spalte.key} title={spalte.hinweis}
                    className={`font-normal pb-2 px-2 text-right whitespace-nowrap ${i === 0 ? "border-l border-line" : ""}`}>
                    {spalte.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mitglieder.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-textMain whitespace-nowrap">{zeigeName(m)}</td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className="py-1.5 px-2 text-right font-mono"
                      style={{ color: (m.zahlen[f.key] || 0) > 0 ? feldFarbe(f.key) : undefined }}>
                      {m.zahlen[f.key] || 0}
                    </td>
                  ))}
                  {reasons.map((r) => (
                    <td key={r.key} className="py-1.5 px-2 text-right font-mono text-textMuted">
                      {m.gruende[r.key] || 0}
                    </td>
                  ))}
                  {QUOTEN_SPALTEN.map((spalte, i) => (
                    <td key={spalte.key}
                      className={`py-1.5 px-2 text-right font-mono text-textMain ${i === 0 ? "border-l border-line" : ""}`}>
                      {quotenText(m.quoten, spalte)}
                    </td>
                  ))}
                </tr>
              ))}
              {mitglieder.length === 0 && (
                <tr><td colSpan={FIELDS.length + reasons.length + QUOTEN_SPALTEN.length + 1} className="py-2 text-textMuted">Niemand in dieser Auswahl.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
