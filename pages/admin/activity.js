import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Avatar from "../../components/Avatar";
import Icon from "../../components/Icon";
import AdminTabs from "../../components/AdminTabs";
import { supabase } from "../../lib/supabaseClient";
import { openProfile } from "../../lib/profileModalBus";
import { ABSTAND } from "../../lib/autoRefresh";
import { getActiveOrgId } from "../../lib/activeOrg";
import { deutscherTag, nurUhrzeit, DEUTSCHE_ZONE } from "../../lib/terminzeit";
import { berlinHeute, tagPlus } from "../../lib/woche";
import { vorWieLange, istGeradeAktiv, AKTIV_FENSTER_MS } from "../../lib/relativeZeit";

// Zeiträume: eine ungefilterte Liste aus Monaten beantwortet keine Frage.
const ZEITRAEUME = [
  ["heute", "Heute", 0],
  ["woche", "7 Tage", 6],
  ["monat", "30 Tage", 29],
  ["alles", "Alles", null],
];

// Womit die Kopfzeile rechnet — nicht jede Aktivität ist gleich viel wert.
const LERNEN = ["quiz", "exam", "roleplay"];

const TYPE_META = {
  registered: { label: "Registriert", icon: "flame", color: "#F0B23E" },
  login: { label: "Login", icon: "logout", color: "#8D90A6" },
  quiz: { label: "Quiz abgeschlossen", icon: "book", color: "#00E5C7" },
  exam: { label: "Prüfung", icon: "award", color: "var(--org-accent, #CE3A5C)" },
  roleplay: { label: "Rollenspiel", icon: "chat", color: "var(--org-color-1, #4C5DC9)" },
  community_post: { label: "Community-Beitrag", icon: "users", color: "#F0B23E" },
  community_comment: { label: "Community-Kommentar", icon: "users", color: "#F0B23E" },
  lead: { label: "Termin erfasst", icon: "calendar", color: "#00E5C7" },
  lead_comment: { label: "Termin-Kommentar", icon: "chat", color: "var(--org-color-1, #4C5DC9)" },
  lead_task: { label: "Aufgabe zugewiesen", icon: "target", color: "var(--org-accent, #CE3A5C)" },
  // Nicht dasselbe wie "Anmeldung": wer schon angemeldet war, erzeugt keinen
  // Login-Eintrag mehr, hinterlässt aber weiter Seitenaufrufe.
  besuch: { label: "War in der Academy", icon: "users", color: "#8D90A6" },
  avatar: { label: "Profilbild hochgeladen", icon: "users", color: "#00E5C7" },
  profil: { label: "Profil bearbeitet", icon: "users", color: "#8D90A6" },
  skript: { label: "Skript hochgeladen", icon: "download", color: "var(--org-color-1, #4C5DC9)" },
  aufnahme: { label: "Aufnahme hochgeladen", icon: "mic", color: "var(--org-color-1, #4C5DC9)" },
  challenge: { label: "Tages-Challenge", icon: "flame", color: "#F0B23E" },
  kalender: { label: "Kalendereintrag", icon: "calendar", color: "#00E5C7" },
  leitfaden: { label: "Leitfaden erstellt", icon: "book", color: "var(--org-color-1, #4C5DC9)" },
  einladung: { label: "Termin beantwortet", icon: "calendar", color: "#F0B23E" },
};

export default function AdminActivity() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [filterUser, setFilterUser] = useState("");
  const [filterType, setFilterType] = useState("");
  const [zeitraum, setZeitraum] = useState("woche");
  const [suche, setSuche] = useState("");
  const [anzahlSichtbar, setAnzahlSichtbar] = useState(60);
  // Wer gerade da ist, steht in keiner Anmeldung: eine offene Sitzung
  // erzeugt keinen neuen Login-Eintrag. Dafür hinterlässt jeder Seitenaufruf
  // eine Spur (page_views, siehe components/Layout.js).
  const [zuletztAktiv, setZuletztAktiv] = useState({});
  const [stand, setStand] = useState(null);
  const [orgName, setOrgName] = useState("");

  async function load(silent) {
    if (!silent) setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
    if (!me || (me.role !== "manager" && !me.is_admin && !me.is_platform_admin)) { setIsAdmin(false); if (!silent) setLoading(false); return; }
    setIsPlatformAdmin(!!me.is_platform_admin);

    // Immer auf die AKTIVE Organisation begrenzt — auch für Plattform-Admins.
    // Früher entfiel der Filter für sie ganz und die Aktivitäten aller
    // Organisationen liefen in einer Liste zusammen.
    const activeOrgId = getActiveOrgId(me);
    // Welche Organisation hier gezeigt wird, gehört sichtbar auf die Seite:
    // sonst sucht man Anmeldungen, die es in einer anderen gab.
    const { data: orgRow } = activeOrgId
      ? await supabase.from("organizations").select("name").eq("id", activeOrgId).maybeSingle()
      : { data: null };
    setOrgName(orgRow?.name || "");
    const { data: profiles } = await supabase.from("profiles")
      .select("id, full_name, avatar_url, created_at, profil_geaendert_at, avatar_geaendert_at, zuletzt_aktiv_at")
      .eq("organization_id", activeOrgId);
    const orgUserIds = (profiles || []).map((p) => p.id);
    const scoped = (q, col = "user_id") => q.in(col, orgUserIds.length ? orgUserIds : ["00000000-0000-0000-0000-000000000000"]);

    const [
      { data: logins }, { data: quizzes }, { data: exams },
      { data: roleplays }, { data: posts }, { data: comments },
      { data: leadRows }, { data: leadComments }, { data: leadTasks },
      { data: skripte }, { data: aufnahmen }, { data: challenges },
      { data: kalenderEintraege }, { data: leitfaeden }, { data: einladungen },
    ] = await Promise.all([
      scoped(supabase.from("login_events").select("*").order("created_at", { ascending: false }).limit(150)),
      scoped(supabase.from("quiz_results").select("*").order("created_at", { ascending: false }).limit(150)),
      scoped(supabase.from("exam_results").select("*").order("created_at", { ascending: false }).limit(100)),
      scoped(supabase.from("roleplay_sessions").select("*").order("created_at", { ascending: false }).limit(100)),
      scoped(supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(100)),
      scoped(supabase.from("community_comments").select("*").order("created_at", { ascending: false }).limit(100)),
      scoped(supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(100), "created_by"),
      scoped(supabase.from("lead_comments").select("*").order("created_at", { ascending: false }).limit(100)),
      scoped(supabase.from("lead_tasks").select("*").order("created_at", { ascending: false }).limit(100), "assigned_by"),
      // Weitere Spuren, die es längst gibt und die bisher niemand ansah.
      scoped(supabase.from("scripts").select("id, title, created_at, created_by").order("created_at", { ascending: false }).limit(100), "created_by"),
      scoped(supabase.from("call_recordings").select("id, title, created_at, created_by").order("created_at", { ascending: false }).limit(100), "created_by"),
      scoped(supabase.from("daily_challenge_completions").select("user_id, correct, created_at").order("created_at", { ascending: false }).limit(100)),
      scoped(supabase.from("org_events").select("id, titel, created_at, created_by").order("created_at", { ascending: false }).limit(100), "created_by"),
      scoped(supabase.from("guides").select("id, title, created_at, created_by").order("created_at", { ascending: false }).limit(100), "created_by"),
      scoped(supabase.from("termin_einladungen").select("id, status, beantwortet_am, person_id").not("beantwortet_am", "is", null)
        .order("beantwortet_am", { ascending: false }).limit(100), "person_id"),
    ]);

    const map = {};
    (profiles || []).forEach((p) => { map[p.id] = p; });
    setProfileMap(map);

    // Termin-Namen für die Kommentar-/Aufgaben-Detailzeile nachladen — die
    // referenzierten Termine sind evtl. nicht (mehr) in den letzten 100
    // Zeilen von leadRows enthalten.
    const referencedLeadIds = [...new Set([...(leadComments || []).map((c) => c.lead_id), ...(leadTasks || []).map((t) => t.lead_id)])];
    const { data: referencedLeads } = referencedLeadIds.length
      ? await supabase.from("leads").select("id, name").in("id", referencedLeadIds)
      : { data: [] };
    const leadNameById = {};
    (referencedLeads || []).forEach((l) => { leadNameById[l.id] = l.name; });

    // Seitenaufrufe: daraus "wer ist gerade da" UND "wer war an welchem Tag
    // überhaupt in der Academy". Ohne das fehlt jede Person, die schon
    // angemeldet war — eine offene Sitzung erzeugt keinen Login-Eintrag.
    // 30 Tage, weil länger ohnehin nichts aufbewahrt wird (cleanup-logs).
    const seit = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: aufrufe } = await scoped(
      supabase.from("page_views").select("user_id, created_at").gt("created_at", seit)
        .order("created_at", { ascending: false }).limit(5000)
    );
    const letzte = {};
    (aufrufe || []).forEach((a) => { if (!letzte[a.user_id]) letzte[a.user_id] = a.created_at; });
    // Das Lebenszeichen zählt mehr als der letzte Seitenaufruf: es entsteht
    // auch, während jemand auf DERSELBEN Seite arbeitet (migration_119).
    // Seitenaufrufe bleiben als Rückfall für Konten, die die neue Fassung
    // noch nicht geladen haben.
    (profiles || []).forEach((p) => {
      if (!p.zuletzt_aktiv_at) return;
      if (!letzte[p.id] || p.zuletzt_aktiv_at > letzte[p.id]) letzte[p.id] = p.zuletzt_aktiv_at;
    });
    setZuletztAktiv(letzte);

    // Ein Eintrag je Person und Tag statt eines je Seitenaufruf: sonst
    // ersäuft die Liste in "hat eine Seite geöffnet".
    const besucheProTag = new Map();
    (aufrufe || []).forEach((a) => {
      const tag = deutscherTag(a.created_at);
      if (!tag) return;
      const schluessel = `${a.user_id}|${tag}`;
      const bisher = besucheProTag.get(schluessel);
      if (!bisher) besucheProTag.set(schluessel, { user_id: a.user_id, zuletzt: a.created_at, zuerst: a.created_at, anzahl: 1 });
      else {
        bisher.anzahl += 1;
        // Absteigend geladen: das zuletzt Gesehene ist das früheste.
        bisher.zuerst = a.created_at;
      }
    });
    const besuche = [...besucheProTag.values()].map((b) => ({
      type: "besuch",
      user_id: b.user_id,
      created_at: b.zuletzt,
      detail: `${b.anzahl} Seiten · ${nurUhrzeit(b.zuerst, DEUTSCHE_ZONE)}–${nurUhrzeit(b.zuletzt, DEUTSCHE_ZONE)} Uhr`,
    }));

    const combined = [
      ...(profiles || []).map((p) => ({ type: "registered", user_id: p.id, created_at: p.created_at, detail: null })),
      ...(logins || []).map((e) => ({ type: "login", user_id: e.user_id, created_at: e.created_at, detail: null })),
      ...(quizzes || []).map((e) => ({ type: "quiz", user_id: e.user_id, created_at: e.created_at, detail: e.mc_total ? `${e.mc_score}/${e.mc_total} richtig` : null })),
      ...(exams || []).map((e) => ({ type: "exam", user_id: e.user_id, created_at: e.created_at, detail: e.passed ? "bestanden" : "nicht bestanden" })),
      ...(roleplays || []).map((e) => ({ type: "roleplay", user_id: e.user_id, created_at: e.created_at, detail: e.evaluation_score != null ? `Score ${e.evaluation_score}` : null })),
      ...(posts || []).map((e) => ({ type: "community_post", user_id: e.user_id, created_at: e.created_at, detail: e.content?.slice(0, 60) })),
      ...(comments || []).map((e) => ({ type: "community_comment", user_id: e.user_id, created_at: e.created_at, detail: e.content?.slice(0, 60) })),
      ...(leadRows || []).map((l) => ({ type: "lead", user_id: l.created_by, created_at: l.created_at, detail: `${l.name}${l.company ? ` · ${l.company}` : ""}` })),
      ...(leadComments || []).map((c) => ({ type: "lead_comment", user_id: c.user_id, created_at: c.created_at, detail: `${leadNameById[c.lead_id] || "Termin"}: ${c.content?.slice(0, 60)}` })),
      ...(leadTasks || []).map((t) => ({ type: "lead_task", user_id: t.assigned_by, created_at: t.created_at, detail: `${t.title} → ${map[t.assigned_to]?.full_name || "Unbenannt"} (${leadNameById[t.lead_id] || "Termin"})` })),
      ...besuche,
      // Aus dem Profil selbst: ohne Zeitstempel gäbe es diese Ereignisse
      // nirgends (migration_118). Leer heisst "nicht bekannt".
      ...(profiles || []).filter((p) => p.avatar_geaendert_at)
        .map((p) => ({ type: "avatar", user_id: p.id, created_at: p.avatar_geaendert_at, detail: null })),
      ...(profiles || []).filter((p) => p.profil_geaendert_at)
        .map((p) => ({ type: "profil", user_id: p.id, created_at: p.profil_geaendert_at, detail: null })),
      ...(skripte || []).map((e) => ({ type: "skript", user_id: e.created_by, created_at: e.created_at, detail: e.title })),
      ...(aufnahmen || []).map((e) => ({ type: "aufnahme", user_id: e.created_by, created_at: e.created_at, detail: e.title })),
      ...(challenges || []).map((e) => ({ type: "challenge", user_id: e.user_id, created_at: e.created_at, detail: e.correct ? "richtig" : "falsch" })),
      ...(kalenderEintraege || []).map((e) => ({ type: "kalender", user_id: e.created_by, created_at: e.created_at, detail: e.titel })),
      ...(leitfaeden || []).map((e) => ({ type: "leitfaden", user_id: e.created_by, created_at: e.created_at, detail: e.title })),
      ...(einladungen || []).map((e) => ({
        type: "einladung", user_id: e.person_id, created_at: e.beantwortet_am,
        detail: e.status === "zugesagt" ? "zugesagt" : "abgesagt",
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    setEvents(combined);
    setStand(new Date().toISOString());
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    load();
    // Nur abfragen, wenn der Tab sichtbar ist; beim Zurückwechseln sofort.
    // Abstand: Auswertung.
    const interval = setInterval(() => { if (!document.hidden) (() => load(true))(); }, ABSTAND.GELEGENTLICH);
    const beiSichtbar = () => { if (!document.hidden) (() => load(true))(); };
    document.addEventListener("visibilitychange", beiSichtbar);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", beiSichtbar); };
  }, []);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isAdmin) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Aktivitäten</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Manager/Admin-Konten verfügbar.</p>
      </Layout>
    );
  }

  const uniqueUsers = Object.values(profileMap).filter((p) => events.some((e) => e.user_id === p.id));

  // Tagesgrenzen in DEUTSCHER Zeit: sonst zählt ein Gerät im Ausland die
  // Ereignisse des Abends schon zum nächsten Tag (siehe lib/terminzeit.js).
  const heuteTag = berlinHeute();
  const abTag = (() => {
    const tage = ZEITRAEUME.find((z) => z[0] === zeitraum)?.[2];
    return tage === null || tage === undefined ? null : tagPlus(heuteTag, -tage);
  })();

  const begriff = suche.trim().toLowerCase();
  const filtered = events.filter((e) => {
    if (filterUser && e.user_id !== filterUser) return false;
    if (filterType && e.type !== filterType) return false;
    if (abTag && (deutscherTag(e.created_at) || "") < abTag) return false;
    if (!begriff) return true;
    const name = profileMap[e.user_id]?.full_name || "";
    return `${name} ${e.detail || ""} ${TYPE_META[e.type]?.label || ""}`.toLowerCase().includes(begriff);
  });

  // Zahlen zuerst: "wie viel war los" beantwortet eine Liste aus 200 Zeilen
  // nicht, auch wenn alles darin steht.
  const kopfzahlen = [
    { label: "Aktive Personen", wert: new Set(filtered.map((e) => e.user_id)).size },
    { label: "Anmeldungen", wert: filtered.filter((e) => e.type === "login").length },
    { label: "Termine", wert: filtered.filter((e) => e.type === "lead").length },
    { label: "Gelernt", wert: filtered.filter((e) => LERNEN.includes(e.type)).length },
  ];

  // Nach Tagen gruppieren — eine Überschrift je Tag gibt der Liste den Halt,
  // den ein kleines Datum am rechten Rand nie hatte.
  const gruppen = [];
  filtered.slice(0, anzahlSichtbar).forEach((e) => {
    const tag = deutscherTag(e.created_at) || "unbekannt";
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.tag === tag) letzte.eintraege.push(e);
    else gruppen.push({ tag, eintraege: [e] });
  });

  function tagUeberschrift(tag) {
    if (tag === heuteTag) return "Heute";
    if (tag === tagPlus(heuteTag, -1)) return "Gestern";
    const d = new Date(`${tag}T12:00:00Z`);
    return d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Aktivitäten</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />
      <p className="text-textMuted text-sm mb-5">
        Wer war da, wer hat gelernt, wer hat Termine erfasst — in <strong className="text-textMain">{orgName || "deiner Organisation"}</strong>.
        Zeiten in deutscher Uhrzeit. „Anmeldung“ heisst: jemand hat sich neu angemeldet.
        Wer schon angemeldet war, erscheint als „War in der Academy“ — einmal pro Tag, mit Uhrzeitspanne.
      </p>

      {/* Wer gerade da ist. Eine offene Sitzung erzeugt keine neue Anmeldung
          — ohne diese Zeile sieht es aus, als wäre niemand unterwegs. */}
      {(() => {
        const jetzt = Date.now();
        const aktiv = Object.entries(zuletztAktiv)
          .filter(([, zeit]) => istGeradeAktiv(zeit, jetzt))
          .sort((a, b) => String(b[1]).localeCompare(String(a[1])));
        const heuteDa = Object.entries(zuletztAktiv)
          .filter(([, zeit]) => !istGeradeAktiv(zeit, jetzt))
          .sort((a, b) => String(b[1]).localeCompare(String(a[1])))
          .slice(0, 8);
        return (
          <div className="card mb-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm font-semibold text-textMain">
                {aktiv.length > 0 ? `${aktiv.length} gerade in der Academy` : "Gerade ist niemand da"}
              </span>
              <span className="text-[11px] text-textMuted">letzte {Math.round(AKTIV_FENSTER_MS / 60000)} Minuten</span>
              <button onClick={() => load()} className="btn-ghost text-xs ml-auto">Aktualisieren</button>
              {stand && <span className="text-[11px] text-textMuted">Stand: {nurUhrzeit(stand, DEUTSCHE_ZONE)} Uhr</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {aktiv.map(([id, zeit]) => (
                <button key={id} onClick={() => openProfile(id)} className="flex items-center gap-1.5 text-xs text-textMain hover:underline">
                  <Avatar name={profileMap[id]?.full_name || "?"} src={profileMap[id]?.avatar_url} size={20} />
                  {profileMap[id]?.full_name || "Unbenannt"}
                  <span className="text-textMuted">{vorWieLange(zeit)}</span>
                </button>
              ))}
            </div>
            {heuteDa.length > 0 && (
              <div className="text-[11px] text-textMuted mt-2">
                Zuletzt da: {heuteDa.map(([id, zeit]) => `${profileMap[id]?.full_name || "Unbenannt"} (${vorWieLange(zeit)})`).join(" · ")}
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {kopfzahlen.map((k) => (
          <div key={k.label} className="card !py-3">
            <div className="text-xl font-display font-semibold text-textMain">{k.wert}</div>
            <div className="text-[11px] text-textMuted">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {ZEITRAEUME.map(([key, label]) => (
          <button key={key} onClick={() => { setZeitraum(key); setAnzahlSichtbar(60); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${zeitraum === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="card flex items-center gap-2 !py-2 flex-1 min-w-[200px]">
          <Icon name="search" size={14} />
          <input className="bg-transparent border-none outline-none text-sm flex-1 text-textMain"
            placeholder="Nach Name oder Inhalt suchen..." value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>
        <select className="input !w-auto" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
          <option value="">Alle Personen</option>
          {uniqueUsers.map((p) => <option key={p.id} value={p.id}>{p.full_name || "Unbenannt"}</option>)}
        </select>
        <select className="input !w-auto" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Alle Aktivitäten</option>
          {Object.entries(TYPE_META).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
        </select>
        {(suche || filterUser || filterType || zeitraum !== "woche") && (
          <button onClick={() => { setSuche(""); setFilterUser(""); setFilterType(""); setZeitraum("woche"); }} className="btn-ghost text-xs">
            Filter zurücksetzen
          </button>
        )}
      </div>

      {gruppen.length === 0 && (
        <p className="text-textMuted text-sm">
          In diesem Zeitraum ist nichts passiert. Über die Knöpfe oben kannst du weiter zurückschauen.
        </p>
      )}

      {gruppen.map((gruppe) => (
        <div key={gruppe.tag} className="mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] uppercase tracking-wide text-textMuted">{tagUeberschrift(gruppe.tag)}</span>
            <span className="text-[11px] text-textMuted">· {gruppe.eintraege.length}</span>
            <span className="h-px bg-line flex-1" />
          </div>
          <div className="flex flex-col gap-1.5">
            {gruppe.eintraege.map((e, i) => {
              const p = profileMap[e.user_id];
              const meta = TYPE_META[e.type];
              return (
                <div key={`${gruppe.tag}-${i}`} className="card flex items-start gap-3 !py-2.5">
                  <button onClick={() => openProfile(p?.id)} className="flex-shrink-0 mt-0.5">
                    <Avatar name={p?.full_name || "?"} src={p?.avatar_url} size={30} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm text-textMain">{p?.full_name || "Unbekannt"}</span>
                      <Icon name={meta.icon} size={12} color={meta.color} />
                      <span className="text-xs" style={{ color: meta.color }}>{meta.label}</span>
                    </div>
                    {e.detail && <div className="text-xs text-textMuted break-words">{e.detail}</div>}
                  </div>
                  <span className="text-xs text-textMuted font-mono flex-shrink-0">{nurUhrzeit(e.created_at, DEUTSCHE_ZONE)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length > anzahlSichtbar && (
        <button onClick={() => setAnzahlSichtbar((n) => n + 60)} className="btn-ghost text-xs">
          Weitere anzeigen ({filtered.length - anzahlSichtbar})
        </button>
      )}
    </Layout>
  );
}
