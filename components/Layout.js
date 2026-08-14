import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { getUnreadMessageInfo } from "../lib/unreadMessages";
import { applyOrgBranding, resetOrgBranding } from "../lib/orgBranding";
import { isStreakExpired, streakLossPenalty } from "../lib/streak";
import { getActiveOrgId } from "../lib/activeOrg";
import Icon from "./Icon";
import IconPicker from "./IconPicker";
import AIBadge from "./AIBadge";
import Avatar from "./Avatar";
import { quoteOfTheDay } from "../lib/quotes";
import ProfileModal from "./ProfileModal";
import WelcomeModal from "./WelcomeModal";
import TutorialModal from "./TutorialModal";

// Fallback, nur falls migration_4_custom_nav.sql noch nicht ausgeführt wurde.
const FALLBACK_NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", route: "/", is_builtin: true, requires_manager: false },
  { id: "courses", label: "Kurse", icon: "book", route: "/courses", is_builtin: true, requires_manager: false },
  { id: "simulator", label: "Szenario-Simulator", icon: "chat", route: "/simulator", is_builtin: true, requires_manager: false },
  { id: "roleplay", label: "Rollenspiel", icon: "chat", route: "/roleplay", is_builtin: true, requires_manager: false },
  { id: "call-tracker", label: "Call Tracker", icon: "phone", route: "/call-tracker", is_builtin: true, requires_manager: false },
  { id: "einwand-trainer", label: "Einwand-Trainer", icon: "flame", route: "/einwand-trainer", is_builtin: true, requires_manager: false },
  { id: "knowledge", label: "Wissensdatenbank", icon: "library", route: "/knowledge", is_builtin: true, requires_manager: false },
  { id: "manager", label: "Team (Manager)", icon: "users", route: "/manager", is_builtin: true, requires_manager: true },
  { id: "admin", label: "Verwaltung", icon: "lock", route: "/admin", is_builtin: true, requires_manager: true },
];

// Modul-Level-Cache: überlebt Seitenwechsel (Next.js Client-Navigation), nicht aber
// einen echten Browser-Reload. Verhindert, dass bei jedem Klick in der Sidebar die
// komplette Ansicht kurz durch einen Ladebildschirm ersetzt wird.
// Kategorie-Zuordnung für die Sidebar-Unterleisten. Rein visuell — beeinflusst
// nicht, wie Nutzer ihre Reihenfolge per Drag & Drop selbst festlegen können.
const NAV_GROUPS = {
  dashboard: "Start",
  courses: "Lernen", knowledge: "Lernen", roleplay: "Lernen", certificates: "Lernen", scripts: "Lernen", "roleplay-history": "Lernen",
  "daily-challenge": "Lernen", flashcards: "Lernen", simulator: "Lernen", "leitfaden-generator": "Lernen",
  "einwand-trainer": "Lernen", lernpfad: "Lernen",
  community: "Team", members: "Team", messages: "Team", leaderboard: "Team", manager: "Team", team: "Team", duel: "Team", manager: "Team", termine: "Team", "call-tracker": "Team", kunden: "Team", recordings: "Team",
  einwandbehandlung: "Team",
  admin: "Verwaltung", "admin-suggestions": "Verwaltung", "admin-logins": "Verwaltung", "admin-insights": "Verwaltung",
  "admin-activity": "Verwaltung", "admin-navigation": "Verwaltung", "admin-content": "Verwaltung", "admin-flashcards": "Verwaltung",
  "admin-lernpfade": "Verwaltung",
};
function groupFor(item) {
  return NAV_GROUPS[item.key] || (item.is_builtin ? "Weiteres" : "Eigene Inhalte");
}

let cachedProfile = null;
let cachedNavItems = null;
let cachedBadges = null;
let cachedOrg = null;

export function patchCachedProfile(patch) {
  cachedProfile = cachedProfile ? { ...cachedProfile, ...patch } : patch;
}

// Erlaubt anderen Seiten (z.B. Zertifikat-Ansicht), das bereits geladene
// Organisations-Logo zu nutzen, ohne es erneut zu laden.
export function getCachedOrg() {
  return cachedOrg;
}

export default function Layout({ children, fullBleed }) {
  const router = useRouter();
  const [profile, setProfile] = useState(cachedProfile);
  const [loadingAuth, setLoadingAuth] = useState(!cachedProfile);
  const [navItems, setNavItems] = useState(cachedNavItems || FALLBACK_NAV);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showNewTabForm, setShowNewTabForm] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabIcon, setNewTabIcon] = useState("book");
  const [creatingTab, setCreatingTab] = useState(false);
  const [unreadCommunity, setUnreadCommunity] = useState(cachedBadges?.unreadCommunity ?? 0);
  const [unreadMessages, setUnreadMessages] = useState(cachedBadges?.unreadMessages ?? 0);
  const [pendingApprovals, setPendingApprovals] = useState(cachedBadges?.pendingApprovals ?? 0);
  const [pendingSuggestions, setPendingSuggestions] = useState(cachedBadges?.pendingSuggestions ?? 0);
  const [pendingTeamRequests, setPendingTeamRequests] = useState(cachedBadges?.pendingTeamRequests ?? 0);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(cachedBadges?.pendingFriendRequests ?? 0);
  const [friendToast, setFriendToast] = useState(null);
  const prevFriendReqCount = useRef(null);
  const [approvalToast, setApprovalToast] = useState(null);
  const prevApprovalCount = useRef(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  async function dismissWelcome() {
    setShowWelcome(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({ welcome_seen: true }).eq("id", session.user.id);
      patchCachedProfile({ welcome_seen: true });
      if (!cachedProfile?.tutorial_seen) setShowTutorial(true);
    }
  }

  async function dismissTutorial() {
    setShowTutorial(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({ tutorial_seen: true }).eq("id", session.user.id);
      patchCachedProfile({ tutorial_seen: true });
    }
  }
  const [openProfileId, setOpenProfileId] = useState(null);
  const [draggedNavId, setDraggedNavId] = useState(null);
  const [navOrderOverride, setNavOrderOverride] = useState(null);
  const [categoryOrderOverride, setCategoryOrderOverride] = useState(null);
  const [collapsedCategories, setCollapsedCategories] = useState(new Set());
  const [draggedCategory, setDraggedCategory] = useState(null);
  const [shineId, setShineId] = useState(null);
  const [quickHelpOpen, setQuickHelpOpen] = useState(false);
  const [quickHelpQuestion, setQuickHelpQuestion] = useState("");
  const [quickHelpAnswer, setQuickHelpAnswer] = useState("");
  const [quickHelpLoading, setQuickHelpLoading] = useState(false);

  async function askQuickHelp() {
    if (!quickHelpQuestion.trim()) return;
    setQuickHelpLoading(true);
    setQuickHelpAnswer("");
    try {
      const data = await apiPost("/api/quick-help", { question: quickHelpQuestion.trim() });
      setQuickHelpAnswer(data.answer);
    } catch (e) {
      setQuickHelpAnswer("Fehler: " + e.message);
    }
    setQuickHelpLoading(false);
  }
  const collapsedSynced = useRef(false);

  useEffect(() => {
    function handler(e) { setOpenProfileId(e.detail); }
    window.addEventListener("hb:open-profile", handler);
    return () => window.removeEventListener("hb:open-profile", handler);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    // Leichtgewichtiges Nutzungs-Tracking für die Admin-Insights ("was wird am
    // meisten genutzt") — nicht kritisch, daher bewusst ohne await/Fehlerbehandlung.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) supabase.from("page_views").insert({ user_id: session.user.id, path: router.asPath.split("?")[0] });
    })();
  }, [router.asPath]);

  const [org, setOrg] = useState(cachedOrg);
  const [activeOrgId, setActiveOrgId] = useState(null);

  // Sofort aus dem Cache anwenden (kein Flackern beim Seitenwechsel), bevor
  // load() unten die Organisation ggf. neu vom Server nachlädt.
  useEffect(() => { if (cachedOrg) applyOrgBranding(cachedOrg); }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      let { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();

      // Streak-Verfall: es gibt keinen Hintergrund-Job, der abgelaufene
      // Serien zurücksetzt — ohne Aktivität blieb streak_count sonst beliebig
      // lange stehen ("Streak in Gefahr" für immer). Beim Login nachholen:
      // Serie auf 0, plus XP-Abzug als Konsequenz (lib/streak.js).
      if (data && data.streak_count > 0 && isStreakExpired(data.last_challenge_date)) {
        const penalty = streakLossPenalty(data.streak_count);
        const { error: resetErr } = await supabase.from("profiles").update({ streak_count: 0 }).eq("id", data.id);
        // Nur bei erfolgreichem Reset auch den XP-Abzug anwenden — sonst
        // bliebe streak_count in der DB weiter "abgelaufen" und der Abzug
        // würde bei jedem künftigen Login erneut ausgeführt.
        if (!resetErr) {
          try { await supabase.rpc("increment_xp", { uid: data.id, amount: -penalty }); } catch (e) { console.error("streak XP penalty failed:", e.message); }
          data = { ...data, streak_count: 0, xp: Math.max(0, (data.xp || 0) - penalty) };
        } else {
          console.error("streak reset failed:", resetErr.message);
        }
      }

      // "Teamlead" ist keine gespeicherte Rolle, sondern die Tatsache,
      // mindestens ein Team gegründet zu haben — bestimmt u.a., ob die
      // Inhalte-Verwaltungsseiten (Skripte, eigene Kurse, Flashcards,
      // Wissensdatenbank) in der Sidebar sichtbar sind (siehe unten).
      if (data) {
        const { data: ownTeams } = await supabase.from("teams").select("id").eq("created_by", data.id).limit(1);
        data = { ...data, is_team_lead: (ownTeams || []).length > 0 };
      }

      const activeOrgId = getActiveOrgId(data);

      const { data: nav } = await supabase.from("nav_items").select("*").eq("visible", true).order("order_index");
      let effectiveNav = nav || [];
      // Eigene Ordner tragen jetzt ein explizites organization_id (siehe
      // migration_53) — direkt darauf eingrenzen, statt es (fehleranfällig)
      // aus der Heimat-Organisation des/der Erstellenden abzuleiten. Nötig
      // für Plattform-Admins, die per RLS alle Organisationen sehen dürfen,
      // aber in der Sidebar nur die gerade aktive angezeigt bekommen sollen.
      if (activeOrgId) {
        effectiveNav = effectiveNav.filter((n) => n.is_builtin || n.organization_id === activeOrgId);
      }

      if (mounted) {
        setProfile(data);
        cachedProfile = data;
        setActiveOrgId(activeOrgId);
        if (data && data.status === "approved" && !data.welcome_seen) setShowWelcome(true);
        if (effectiveNav.length) { setNavItems(effectiveNav); cachedNavItems = effectiveNav; }
        setLoadingAuth(false);
      }
      if (activeOrgId) {
        const { data: orgData } = await supabase.from("organizations").select("*").eq("id", activeOrgId).maybeSingle();
        if (mounted && orgData) {
          setOrg(orgData);
          cachedOrg = orgData;
          applyOrgBranding(orgData);
        } else if (mounted) {
          setOrg(null);
          cachedOrg = null;
          resetOrgBranding();
        }
      } else if (mounted) {
        setOrg(null);
        cachedOrg = null;
        resetOrgBranding();
      }
    }
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    let mounted = true;
    async function loadUnread() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const { total: msgCount } = await getUnreadMessageInfo(supabase, uid);
      if (mounted) setUnreadMessages(msgCount || 0);

      // Frisch aus der DB statt aus cachedProfile: dieser Effekt lauscht auch
      // auf Realtime-Änderungen an "profiles" — inklusive des eigenen Updates
      // von last_seen_community_at beim Besuch der Community-Seite. Mit dem
      // (evtl. noch nicht gepatchten) cachedProfile lief das in ein Rennen,
      // bei dem der Badge direkt nach dem "Gesehen"-Markieren wieder auftauchte.
      const { data: me } = await supabase.from("profiles").select("role, organization_id, is_platform_admin, last_seen_community_at").eq("id", uid).maybeSingle();
      const since = me?.last_seen_community_at || new Date(0).toISOString();
      const [{ count: postCount }, { count: commentCount }] = await Promise.all([
        supabase.from("community_posts").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", session.user.id),
        supabase.from("community_comments").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", session.user.id),
      ]);
      if (mounted) setUnreadCommunity((postCount || 0) + (commentCount || 0));

      const { count: friendReqCount } = await supabase.from("friendships")
        .select("id", { count: "exact", head: true }).eq("addressee_id", session.user.id).eq("status", "pending");
      if (mounted) {
        const newCount = friendReqCount || 0;
        if (prevFriendReqCount.current !== null && newCount > prevFriendReqCount.current) {
          const { data: latest } = await supabase.from("friendships").select("requester_id")
            .eq("addressee_id", session.user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (latest) {
            const { data: requester } = await supabase.from("profiles").select("full_name").eq("id", latest.requester_id).maybeSingle();
            setFriendToast({ name: requester?.full_name || "Jemand" });
            setTimeout(() => setFriendToast(null), 6000);
          }
        }
        prevFriendReqCount.current = newCount;
        setPendingFriendRequests(newCount);
      }

      let approvalCount = 0, suggestionCount = 0, teamReqCount = 0;
      // Nutzeranfragen (status='pending') darf sehen, wer sie auch genehmigen
      // kann: Org-Manager (nur eigene Organisation) und Plattform-Admins
      // (organisationsübergreifend) — is_platform_admin ist unabhängig vom
      // role-Feld, muss also separat geprüft werden, sonst verpasst ein
      // Plattform-Admin ohne role='manager' den Badge komplett.
      const isManager = me?.role === "manager";
      const canSeeApprovals = isManager || me?.is_platform_admin;
      if (isManager || me?.role === "trainer" || me?.is_platform_admin) {
        // Trainer sehen nur den Wissens-Vorschläge-Badge (Content-Verwaltung),
        // keine Nutzer-Freigaben/Team-Anfragen — die bleiben Manager-only.
        let approvalsQuery = null;
        if (canSeeApprovals) {
          approvalsQuery = supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending");
          if (!me?.is_platform_admin) approvalsQuery = approvalsQuery.eq("organization_id", me.organization_id);
        }
        const [a, s, t] = await Promise.all([
          approvalsQuery || Promise.resolve({ count: 0 }),
          supabase.from("kb_entries").select("id", { count: "exact", head: true }).eq("status", "pending"),
          isManager ? supabase.from("team_requests").select("id", { count: "exact", head: true }).eq("manager_id", session.user.id).eq("status", "pending") : Promise.resolve({ count: 0 }),
        ]);
        approvalCount = a.count || 0; suggestionCount = s.count || 0; teamReqCount = t.count || 0;
        if (mounted) { setPendingApprovals(approvalCount); setPendingSuggestions(suggestionCount); setPendingTeamRequests(teamReqCount); }

        const isFirstCheck = prevApprovalCount.current === null;
        if (mounted && canSeeApprovals && approvalCount > 0 && (isFirstCheck || approvalCount > prevApprovalCount.current)) {
          let latestQuery = supabase.from("profiles").select("full_name").eq("status", "pending");
          if (!me?.is_platform_admin) latestQuery = latestQuery.eq("organization_id", me.organization_id);
          const { data: latest } = await latestQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
          setApprovalToast({ name: latest?.full_name || "Jemand", count: approvalCount });
          setTimeout(() => setApprovalToast(null), 7000);
        }
        prevApprovalCount.current = approvalCount;
      }

      cachedBadges = {
        unreadMessages: msgCount || 0, unreadCommunity: (postCount || 0) + (commentCount || 0),
        pendingFriendRequests: friendReqCount || 0, pendingApprovals: approvalCount, pendingSuggestions: suggestionCount, pendingTeamRequests: teamReqCount,
      };
    }
    loadUnread();
    const interval = setInterval(loadUnread, 20000);

    // Echtzeit: sobald sich etwas Relevantes ändert (neue Nachricht, Freundschaftsanfrage,
    // neue Registrierung), sofort neu prüfen statt bis zu 20 Sekunden zu warten.
    const channel = supabase
      .channel("layout-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, loadUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads" }, loadUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, loadUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadUnread)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_posts" }, loadUnread)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_comments" }, loadUnread)
      .subscribe();

    return () => { mounted = false; clearInterval(interval); supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (profile?.sidebar_prefs?.order && !navOrderOverride) {
      setNavOrderOverride(profile.sidebar_prefs.order);
    }
    if (profile?.sidebar_prefs?.categoryOrder && !categoryOrderOverride) {
      setCategoryOrderOverride(profile.sidebar_prefs.categoryOrder);
    }
    if (profile?.sidebar_prefs?.collapsed && !collapsedSynced.current) {
      setCollapsedCategories(new Set(profile.sidebar_prefs.collapsed));
      collapsedSynced.current = true;
    }
  }, [profile]);

  function sortedNav(items) {
    const order = navOrderOverride;
    if (!order || !order.length) return items;
    const byId = new Map(items.map((it) => [it.id, it]));
    const ordered = order.map((id) => byId.get(id)).filter(Boolean);
    const remaining = items.filter((it) => !order.includes(it.id));
    return [...ordered, ...remaining];
  }

  function sortedCategories(categories) {
    const order = categoryOrderOverride;
    if (!order || !order.length) return categories;
    const ordered = order.filter((c) => categories.includes(c));
    const remaining = categories.filter((c) => !order.includes(c));
    return [...ordered, ...remaining];
  }

  async function persistSidebarPrefs(patch) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const current = cachedProfile?.sidebar_prefs || {};
    const sidebar_prefs = { ...current, ...patch };
    patchCachedProfile({ sidebar_prefs });
    await supabase.from("profiles").update({ sidebar_prefs }).eq("id", session.user.id);
  }

  function handleNavDrop(targetId, categoryItems, allItems) {
    if (!draggedNavId || draggedNavId === targetId) { setDraggedNavId(null); return; }
    const catIds = categoryItems.map((it) => it.id);
    const fromIdx = catIds.indexOf(draggedNavId);
    const toIdx = catIds.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggedNavId(null); return; }
    const reorderedCat = [...catIds];
    reorderedCat.splice(fromIdx, 1);
    reorderedCat.splice(toIdx, 0, draggedNavId);

    // Gesamt-Reihenfolge neu zusammensetzen: andere Kategorien bleiben unangetastet,
    // nur die Positionen innerhalb DIESER Kategorie werden ersetzt.
    let catPointer = 0;
    const fullOrder = allItems.map((it) => catIds.includes(it.id) ? reorderedCat[catPointer++] : it.id);

    setDraggedNavId(null);
    setNavOrderOverride(fullOrder);
    persistSidebarPrefs({ order: fullOrder });
  }

  function handleCategoryDrop(targetCategory, visibleCategories) {
    if (!draggedCategory || draggedCategory === targetCategory) { setDraggedCategory(null); return; }
    const fromIdx = visibleCategories.indexOf(draggedCategory);
    const toIdx = visibleCategories.indexOf(targetCategory);
    if (fromIdx === -1 || toIdx === -1) { setDraggedCategory(null); return; }
    const reordered = [...visibleCategories];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, draggedCategory);
    setDraggedCategory(null);
    setCategoryOrderOverride(reordered);
    persistSidebarPrefs({ categoryOrder: reordered });
  }

  function toggleCollapse(category) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category); else next.add(category);
      persistSidebarPrefs({ collapsed: Array.from(next) });
      return next;
    });
  }

  async function refreshNav() {
    const { data: nav } = await supabase.from("nav_items").select("*").eq("visible", true).order("order_index");
    // Dieselbe Eingrenzung auf die aktive Organisation wie im initialen Laden
    // oben — sonst würde ein gerade angelegter Reiter hier kurz erscheinen
    // und beim nächsten vollen Laden (z.B. Seitenwechsel) wieder verschwinden.
    let effectiveNav = nav || [];
    if (activeOrgId) effectiveNav = effectiveNav.filter((n) => n.is_builtin || n.organization_id === activeOrgId);
    if (effectiveNav.length) { setNavItems(effectiveNav); cachedNavItems = effectiveNav; }
  }

  // Schneller Weg für Manager/Admins, direkt aus der Sidebar heraus einen
  // neuen Reiter anzulegen — der bisherige Weg über "Navigation verwalten"
  // wurde als zu umständlich empfunden. Nutzt dieselbe Tabellen-Logik wie
  // dort (pages/admin/navigation.js), nur ohne Seitenwechsel.
  async function createNavTab() {
    if (!newTabName.trim()) return;
    setCreatingTab(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const key = "custom-" + Date.now();
      const maxOrder = navItems.reduce((m, i) => Math.max(m, i.order_index), 0);
      const { error } = await supabase.from("nav_items").insert({
        key, label: newTabName.trim(), icon: newTabIcon, is_builtin: false,
        requires_manager: false, order_index: maxOrder + 1, created_by: session.user.id,
        organization_id: activeOrgId,
      });
      if (error) throw error;
      setNewTabName("");
      setNewTabIcon("book");
      setShowNewTabForm(false);
      await refreshNav();
    } catch (e) {
      alert("Reiter konnte nicht angelegt werden: " + e.message);
    } finally {
      setCreatingTab(false);
    }
  }

  async function handleLogout() {
    // Alle organisationsbezogenen Caches leeren UND die angewendeten
    // Marken-CSS-Variablen zurücksetzen — sonst könnten Logo/Farben der
    // GERADE VERLASSENEN Organisation kurz sichtbar bleiben, falls sich im
    // selben Browser-Tab direkt danach jemand aus einer ANDEREN Organisation
    // anmeldet.
    cachedProfile = null;
    cachedNavItems = null;
    cachedBadges = null;
    cachedOrg = null;
    resetOrgBranding();
    sessionStorage.removeItem("hb_active_org_id");
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center text-textMuted text-sm">Lädt...</div>;
  }

  if (profile && profile.status === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card max-w-sm text-center">
          <div className="font-display text-lg font-bold text-textMain mb-2">Konto wartet auf Freigabe</div>
          <p className="text-textMuted text-sm mb-4">Ein Manager muss deine Registrierung erst bestätigen, bevor du die Academy nutzen kannst. Schau später nochmal vorbei.</p>
          <button onClick={handleLogout} className="btn-ghost text-xs">Abmelden</button>
        </div>
      </div>
    );
  }

  if (profile && profile.status === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card max-w-sm text-center">
          <div className="font-display text-lg font-bold text-textMain mb-2">Zugang abgelehnt</div>
          <p className="text-textMuted text-sm mb-4">Dein Konto wurde von einem Manager nicht freigegeben. Wende dich an deinen Ansprechpartner, falls das ein Irrtum ist.</p>
          <button onClick={handleLogout} className="btn-ghost text-xs">Abmelden</button>
        </div>
      </div>
    );
  }

  const level = Math.floor((profile?.xp || 0) / 150) + 1;
  const into = (profile?.xp || 0) % 150;

  return (
    <div className="flex flex-col md:flex-row h-screen border border-line rounded-none md:rounded-2xl overflow-hidden bg-bg">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-line bg-[var(--org-bg,#14151C)] flex-shrink-0">
        <img src={org?.logo_url || "/logo.svg"} alt={org?.name || "HB Sales Academy"} className="h-10 w-auto" />
        <button onClick={() => setMobileNavOpen(true)} className="text-textMain p-1.5 -mr-1.5" aria-label="Menü öffnen">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>
      </div>

      {/* Backdrop for mobile drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 w-[230px] flex-shrink-0
        bg-gradient-to-b from-[var(--org-sidebar-tint,#1A1D33)] via-[#17181F] to-[var(--org-bg,#14151C)] border-r border-line px-3.5 py-6 flex flex-col gap-1
        transition-transform duration-200 md:translate-x-0
        ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex items-center justify-between px-2 pb-4 pt-1">
          <img src={org?.logo_url || "/logo.svg"} alt={org?.name || "HB Sales Academy"} className="h-[68px] w-auto" />
          <button onClick={() => setMobileNavOpen(false)} className="md:hidden text-textMuted p-1" aria-label="Menü schließen">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="px-2.5 pb-4">
          <p className="text-[11.5px] italic text-textMuted leading-snug">„{quoteOfTheDay().text}"</p>
          {quoteOfTheDay().author && <p className="text-[10px] text-[#5B5E70] mt-0.5">— {quoteOfTheDay().author}</p>}
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
          {(() => {
            // Trainer sehen zusätzlich die Content-Verwaltungsseiten (siehe
            // pages/admin/{content,suggestions,navigation}.js), aber bewusst
            // NICHT Nutzerverwaltung/Team — die bleiben Managern vorbehalten.
            const TRAINER_NAV_IDS = ["admin-content", "admin-suggestions", "admin-navigation", "admin-flashcards"];
            // Teamleads und Org-/Plattform-Admins dürfen dieselben Inhalte
            // verwalten wie Manager/Trainer — siehe is_team_lead() in der
            // RLS-Policy (migration_52). "admin-navigation" bewusst NICHT
            // enthalten, das bleibt bei Manager/Trainer/Admin.
            const ELEVATED_NAV_IDS = ["admin-content", "admin-suggestions", "admin-flashcards", "scripts"];
            const isElevated = profile?.is_admin || profile?.is_platform_admin || profile?.is_team_lead;
            const visibleItems = sortedNav(navItems.filter((n) =>
              !n.requires_manager || profile?.role === "manager" ||
              (profile?.role === "trainer" && TRAINER_NAV_IDS.includes(n.key)) ||
              (isElevated && ELEVATED_NAV_IDS.includes(n.key))
            ));
            const byCategory = {};
            visibleItems.forEach((item) => {
              const g = groupFor(item);
              byCategory[g] = byCategory[g] || [];
              byCategory[g].push(item);
            });
            const categories = sortedCategories(Object.keys(byCategory));

            return categories.map((category) => {
              const items = byCategory[category];
              const isCollapsed = collapsedCategories.has(category);
              return (
                <div key={category} className="mb-1">
                  <div
                    draggable
                    onDragStart={() => setDraggedCategory(category)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleCategoryDrop(category, categories)}
                    onClick={() => {
                      toggleCollapse(category);
                      setShineId(`cat:${category}`);
                      setTimeout(() => setShineId((cur) => (cur === `cat:${category}` ? null : cur)), 700);
                    }}
                    className={`relative overflow-hidden group flex items-center gap-1.5 px-2.5 py-2 mx-1 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors ${draggedCategory === category ? "opacity-40 bg-surfaceRaised" : "hover:bg-surfaceRaised/70"}`}
                  >
                    {shineId === `cat:${category}` && <span className="hb-shine" />}
                    <span className="text-[10.5px] font-bold uppercase tracking-widest text-[#6B7086] flex-1">{category}</span>
                    <span className="text-[#3A3F55] opacity-0 group-hover:opacity-100 transition-opacity text-[10px] leading-none tracking-tighter">⠿</span>
                  </div>

                  <div className="grid transition-[grid-template-rows] duration-200 ease-out" style={{ gridTemplateRows: isCollapsed ? "0fr" : "1fr" }}>
                    <div className="overflow-hidden">
                      <div className="flex flex-col gap-0.5 mt-0.5 pl-1">
                      {items.map((item) => {
                        const route = item.is_builtin ? item.route : `/folder/${item.id}`;
                        const badgeCount = item.key === "community" ? unreadCommunity
                          : item.key === "messages" ? unreadMessages
                          : item.key === "members" ? pendingFriendRequests
                          : item.key === "admin" ? pendingApprovals
                          : item.key === "admin-suggestions" ? pendingSuggestions
                          : item.key === "manager" ? pendingTeamRequests
                          : 0;
                        return (
                          <button
                            key={item.id}
                            draggable
                            onDragStart={() => setDraggedNavId(item.id)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleNavDrop(item.id, items, visibleItems)}
                            onClick={() => {
                              router.push(route);
                              setShineId(item.id);
                              setTimeout(() => setShineId((cur) => (cur === item.id ? null : cur)), 700);
                            }}
                            className={`relative overflow-hidden flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-medium text-left w-full cursor-grab active:cursor-grabbing ${
                              draggedNavId === item.id ? "opacity-40" : ""
                            } ${
                              router.asPath === route ? "" : "text-[#9195A6] hover:bg-surfaceRaised hover:text-textMain"
                            }`}
                            style={router.asPath === route ? {
                              background: "linear-gradient(90deg, rgb(var(--org-color-1-rgb, 76 93 201) / .15), rgb(var(--org-accent-rgb, 206 58 92) / .15), transparent)",
                              boxShadow: "inset 2px 0 0 var(--org-accent, #CE3A5C)",
                              // Gegen den Sidebar-Hintergrund kontrastgeprüft (siehe
                              // lib/orgBranding.js setNavActiveTextVar) — nicht die
                              // rohe Akzentfarbe, damit ein sehr helles Branding hier
                              // nie unlesbar wird. Icon erbt automatisch (currentColor).
                              color: "var(--org-nav-active-text, #CE3A5C)",
                            } : undefined}
                          >
                            {shineId === item.id && <span className="hb-shine" />}
                            <Icon name={item.icon} /> <span className="flex-1">{item.label}</span>
                            {badgeCount > 0 && (
                              <span className="badge-count">
                                {badgeCount > 9 ? "9+" : badgeCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            });
          })()}

          {(profile?.role === "manager" || profile?.is_admin || profile?.is_platform_admin) && (
            <div className="px-1 pt-1">
              {!showNewTabForm ? (
                <button onClick={() => setShowNewTabForm(true)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-medium text-left w-full text-[#6B7086] hover:bg-surfaceRaised hover:text-textMain border border-dashed border-line">
                  + Neuer Reiter
                </button>
              ) : (
                <div className="card !p-2.5 flex flex-col gap-2">
                  <input
                    autoFocus className="input !py-1.5 text-xs" placeholder="Name (z.B. Produktschulungen)"
                    value={newTabName} onChange={(e) => setNewTabName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createNavTab()}
                  />
                  <IconPicker value={newTabIcon} onChange={setNewTabIcon} size={14} />
                  <div className="flex items-center gap-1.5">
                    <button disabled={creatingTab} onClick={() => { setShowNewTabForm(false); setNewTabName(""); }} className="btn-ghost text-xs flex-1 disabled:opacity-40">Abbrechen</button>
                    <button disabled={creatingTab || !newTabName.trim()} onClick={createNavTab} className="btn text-xs flex-1 justify-center disabled:opacity-40">{creatingTab ? "..." : "Anlegen"}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <button onClick={() => router.push("/profile")} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surfaceRaised text-left mb-1">
          <Avatar name={profile?.full_name || "?"} src={profile?.avatar_url} size={30} />
          <span className="text-[13px] font-medium text-textMain truncate flex-1">{profile?.full_name || "Mein Profil"}</span>
        </button>
        <div className="mt-auto flex flex-col gap-1.5 p-2.5 bg-surface border border-line rounded-lg text-xs">
          <div className="flex justify-between">
            <span>Level {level}</span>
            <span className="flex items-center gap-1"><Icon name="flame" size={13} />{profile?.xp || 0} XP</span>
          </div>
          <div className="w-full h-1.5 bg-line rounded-full overflow-hidden">
            <div className="h-full bg-amber" style={{ width: `${(into / 150) * 100}%` }} />
          </div>
          <span className="font-mono text-textMuted">{into}/150 bis Level {level + 1}</span>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-textMuted hover:text-textMain hover:bg-surfaceRaised text-left">
          <Icon name="logout" size={15} /> Abmelden
        </button>
      </aside>
      <main key={router.asPath} className={`flex-1 overflow-y-auto animate-fadein ${fullBleed ? "p-3" : "p-4 md:p-8"}`} style={{ background: "radial-gradient(600px 300px at 85% -5%, rgba(232,54,143,.09), transparent), radial-gradient(500px 260px at 0% 100%, rgba(123,47,247,.07), transparent)" }}>
        {typeof children === "function" ? children(profile) : children}
      </main>
      {openProfileId && <ProfileModal userId={openProfileId} onClose={() => setOpenProfileId(null)} />}

      {router.pathname !== "/messages" && (
        <button
          onClick={() => setQuickHelpOpen(true)}
          className="fixed bottom-5 right-5 z-[190] w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: "linear-gradient(120deg, var(--org-color-1, #4C5DC9) 0%, var(--org-accent, #CE3A5C) 55%, var(--org-color-3, #B2314F) 100%)", boxShadow: "0 4px 16px -4px rgb(var(--org-accent-rgb, 206 58 92) / .5)" }}
          title="Vertriebs-Buddy"
        >
          <span className="text-textMain text-lg">💬</span>
        </button>
      )}

      {quickHelpOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4" onClick={() => setQuickHelpOpen(false)}>
          <div className="card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-semibold text-textMain flex items-center gap-2">
                💬 Vertriebs-Buddy
                <AIBadge title="Du sprichst mit einer KI, keiner echten Person." />
              </span>
              <button onClick={() => setQuickHelpOpen(false)} className="text-textMuted hover:text-textMain text-lg leading-none">×</button>
            </div>
            <textarea className="input mb-2" rows={2} placeholder="Kurze Verkaufsfrage stellen..." value={quickHelpQuestion} onChange={(e) => setQuickHelpQuestion(e.target.value)} />
            <button onClick={askQuickHelp} disabled={quickHelpLoading || !quickHelpQuestion.trim()} className="btn text-xs w-full justify-center disabled:opacity-40 mb-3">
              {quickHelpLoading ? "Denkt nach..." : "Fragen"}
            </button>
            {quickHelpAnswer && <p className="text-sm text-textMuted whitespace-pre-wrap border-t border-line pt-3">{quickHelpAnswer}</p>}
          </div>
        </div>
      )}
      {showWelcome && <WelcomeModal onClose={dismissWelcome} />}
      {showTutorial && <TutorialModal onClose={dismissTutorial} />}
      {approvalToast && (
        <button
          onClick={() => { setApprovalToast(null); router.push("/admin"); }}
          className="fixed bottom-24 right-5 z-[210] card !py-3 !px-4 flex items-center gap-3 shadow-lg animate-fadein cursor-pointer"
          style={{ maxWidth: 300 }}
        >
          <Icon name="lock" color="var(--org-accent, #CE3A5C)" size={18} />
          <div className="text-left">
            <div className="text-sm font-semibold text-textMain">Neue Registrierung</div>
            <div className="text-xs text-textMuted">{approvalToast.name} wartet auf Freigabe{approvalToast.count > 1 ? ` — ${approvalToast.count} insgesamt offen` : ""}</div>
          </div>
        </button>
      )}
      {friendToast && (
        <button
          onClick={() => { setFriendToast(null); router.push("/members"); }}
          className="fixed bottom-5 right-5 z-[210] card !py-3 !px-4 flex items-center gap-3 shadow-lg animate-fadein cursor-pointer"
          style={{ maxWidth: 300 }}
        >
          <Icon name="users" color="var(--org-accent, #CE3A5C)" size={18} />
          <div className="text-left">
            <div className="text-sm font-semibold text-textMain">Neue Freundschaftsanfrage</div>
            <div className="text-xs text-textMuted">{friendToast.name} möchte sich vernetzen</div>
          </div>
        </button>
      )}
    </div>
  );
}
