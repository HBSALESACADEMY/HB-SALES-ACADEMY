import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import Icon from "./Icon";
import Avatar from "./Avatar";
import { quoteOfTheDay } from "../lib/quotes";
import ProfileModal from "./ProfileModal";
import WelcomeModal from "./WelcomeModal";
import TutorialModal from "./TutorialModal";

// Fallback, nur falls migration_4_custom_nav.sql noch nicht ausgeführt wurde.
const FALLBACK_NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", route: "/", is_builtin: true, requires_manager: false },
  { id: "courses", label: "Kurse", icon: "book", route: "/courses", is_builtin: true, requires_manager: false },
  { id: "roleplay", label: "Rollenspiel", icon: "chat", route: "/roleplay", is_builtin: true, requires_manager: false },
  { id: "call-tracker", label: "Call Tracker", icon: "target", route: "/call-tracker", is_builtin: true, requires_manager: false },
  { id: "einwand-trainer", label: "Einwand-Trainer", icon: "flame", route: "/einwand-trainer", is_builtin: true, requires_manager: false },
  { id: "knowledge", label: "Wissensdatenbank", icon: "library", route: "/knowledge", is_builtin: true, requires_manager: false },
  { id: "manager", label: "Team (Manager)", icon: "users", route: "/manager", is_builtin: true, requires_manager: true },
  { id: "admin", label: "Nutzerverwaltung", icon: "lock", route: "/admin", is_builtin: true, requires_manager: true },
];

// Modul-Level-Cache: überlebt Seitenwechsel (Next.js Client-Navigation), nicht aber
// einen echten Browser-Reload. Verhindert, dass bei jedem Klick in der Sidebar die
// komplette Ansicht kurz durch einen Ladebildschirm ersetzt wird.
// Kategorie-Zuordnung für die Sidebar-Unterleisten. Rein visuell — beeinflusst
// nicht, wie Nutzer ihre Reihenfolge per Drag & Drop selbst festlegen können.
const NAV_GROUPS = {
  dashboard: "Start",
  courses: "Lernen", knowledge: "Lernen", roleplay: "Lernen", certificates: "Lernen", scripts: "Lernen", "roleplay-history": "Lernen",
  "daily-challenge": "Lernen", flashcards: "Lernen", simulator: "Lernen",
  "call-tracker": "Lernen", "einwand-trainer": "Lernen",
  community: "Team", members: "Team", messages: "Team", leaderboard: "Team", manager: "Team", team: "Team", duel: "Team", manager: "Team",
  admin: "Verwaltung", "admin-suggestions": "Verwaltung", "admin-logins": "Verwaltung", "admin-insights": "Verwaltung",
  "admin-activity": "Verwaltung", "admin-navigation": "Verwaltung", "admin-content": "Verwaltung",
};
function groupFor(item) {
  return NAV_GROUPS[item.key] || (item.is_builtin ? "Weiteres" : "Eigene Inhalte");
}

let cachedProfile = null;
let cachedNavItems = null;
let cachedBadges = null;

export function patchCachedProfile(patch) {
  cachedProfile = cachedProfile ? { ...cachedProfile, ...patch } : patch;
}

export default function Layout({ children, fullBleed }) {
  const router = useRouter();
  const [profile, setProfile] = useState(cachedProfile);
  const [loadingAuth, setLoadingAuth] = useState(!cachedProfile);
  const [navItems, setNavItems] = useState(cachedNavItems || FALLBACK_NAV);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      const { data: nav } = await supabase.from("nav_items").select("*").eq("visible", true).order("order_index");
      if (mounted) {
        setProfile(data);
        cachedProfile = data;
        if (data && data.status === "approved" && !data.welcome_seen) setShowWelcome(true);
        if (nav && nav.length) { setNavItems(nav); cachedNavItems = nav; }
        setLoadingAuth(false);
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

      const [{ data: myGroupMemberships }, { data: myReads }, { data: recentMsgs }] = await Promise.all([
        supabase.from("chat_group_members").select("group_id").eq("user_id", uid),
        supabase.from("conversation_reads").select("*").eq("user_id", uid),
        // Nur die letzten 30 Tage betrachten, reicht für ein Badge völlig und hält die Abfrage klein.
        supabase.from("direct_messages").select("sender_id, group_id, created_at")
          .or(`recipient_id.eq.${uid},group_id.not.is.null`)
          .gt("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
      ]);
      const myGroupIds = (myGroupMemberships || []).map((m) => m.group_id);
      const readByKey = {};
      (myReads || []).forEach((r) => { readByKey[`${r.is_group ? "g" : "d"}:${r.target_id}`] = r.last_read_at; });

      let msgCount = 0;
      (recentMsgs || []).forEach((m) => {
        if (m.sender_id === uid) return; // eigene Nachrichten zählen nie als ungelesen für einen selbst
        if (m.group_id && !myGroupIds.includes(m.group_id)) return; // fremde Gruppe, geht mich nichts an
        const key = m.group_id ? `g:${m.group_id}` : `d:${m.sender_id}`;
        const lastRead = readByKey[key] || "1970-01-01T00:00:00.000Z";
        if (new Date(m.created_at) > new Date(lastRead)) msgCount++;
      });
      if (mounted) setUnreadMessages(msgCount || 0);

      const { data: me } = { data: cachedProfile };
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
      if (me?.role === "manager") {
        const [a, s, t] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("kb_entries").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("team_requests").select("id", { count: "exact", head: true }).eq("manager_id", session.user.id).eq("status", "pending"),
        ]);
        approvalCount = a.count || 0; suggestionCount = s.count || 0; teamReqCount = t.count || 0;
        if (mounted) { setPendingApprovals(approvalCount); setPendingSuggestions(suggestionCount); setPendingTeamRequests(teamReqCount); }

        const isFirstCheck = prevApprovalCount.current === null;
        if (mounted && approvalCount > 0 && (isFirstCheck || approvalCount > prevApprovalCount.current)) {
          const { data: latest } = await supabase.from("profiles").select("full_name")
            .eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
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

  async function handleLogout() {
    cachedProfile = null;
    cachedNavItems = null;
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
          <div className="font-display text-lg font-bold text-white mb-2">Konto wartet auf Freigabe</div>
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
          <div className="font-display text-lg font-bold text-white mb-2">Zugang abgelehnt</div>
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
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-line bg-[#12141C] flex-shrink-0">
        <img src="/logo.svg" alt="HB Sales Academy" className="h-10 w-auto" />
        <button onClick={() => setMobileNavOpen(true)} className="text-white p-1.5 -mr-1.5" aria-label="Menü öffnen">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>
      </div>

      {/* Backdrop for mobile drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 w-[230px] flex-shrink-0
        bg-gradient-to-b from-[#1F1730] via-[#160F22] to-[#0A0C13] border-r border-line px-3.5 py-6 flex flex-col gap-1
        transition-transform duration-200 md:translate-x-0
        ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex items-center justify-between px-2 pb-4 pt-1">
          <img src="/logo.svg" alt="HB Sales Academy" className="h-[68px] w-auto" />
          <button onClick={() => setMobileNavOpen(false)} className="md:hidden text-textMuted p-1" aria-label="Menü schließen">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="px-2.5 pb-4">
          <p className="text-[11.5px] italic text-textMuted leading-snug">„{quoteOfTheDay().text}"</p>
          {quoteOfTheDay().author && <p className="text-[10px] text-[#5A5F72] mt-0.5">— {quoteOfTheDay().author}</p>}
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
          {(() => {
            const visibleItems = sortedNav(navItems.filter((n) => !n.requires_manager || profile?.role === "manager"));
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
                              router.asPath === route ? "bg-gradient-to-r from-[#7B2FF7]/15 via-[#E8368F]/15 to-transparent text-amber shadow-[inset_2px_0_0_#E8368F]" : "text-[#9195A6] hover:bg-surfaceRaised hover:text-white"
                            }`}
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
        </div>
        <button onClick={() => router.push("/profile")} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surfaceRaised text-left mb-1">
          <Avatar name={profile?.full_name || "?"} src={profile?.avatar_url} size={30} />
          <span className="text-[13px] font-medium text-white truncate flex-1">{profile?.full_name || "Mein Profil"}</span>
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
        <button onClick={handleLogout} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-textMuted hover:text-white hover:bg-surfaceRaised text-left">
          <Icon name="logout" size={15} /> Abmelden
        </button>
      </aside>
      <main key={router.asPath} className={`flex-1 overflow-y-auto animate-fadein ${fullBleed ? "p-3" : "p-4 md:p-8"}`} style={{ background: "radial-gradient(600px 300px at 85% -5%, rgba(232,54,143,.09), transparent), radial-gradient(500px 260px at 0% 100%, rgba(123,47,247,.07), transparent)" }}>
        {typeof children === "function" ? children(profile) : children}
      </main>
      {openProfileId && <ProfileModal userId={openProfileId} onClose={() => setOpenProfileId(null)} />}

      <button
        onClick={() => setQuickHelpOpen(true)}
        className="fixed bottom-5 right-5 z-[190] w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: "linear-gradient(120deg, #8B3EF7 0%, #E8368F 55%, #FF7A45 100%)", boxShadow: "0 4px 16px -4px rgba(232,54,143,.5)" }}
        title="Vertriebs-Buddy"
      >
        <span className="text-white text-lg">💬</span>
      </button>

      {quickHelpOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4" onClick={() => setQuickHelpOpen(false)}>
          <div className="card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-semibold text-white">💬 Vertriebs-Buddy</span>
              <button onClick={() => setQuickHelpOpen(false)} className="text-textMuted hover:text-white text-lg leading-none">×</button>
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
          <Icon name="lock" color="#E8368F" size={18} />
          <div className="text-left">
            <div className="text-sm font-semibold text-white">Neue Registrierung</div>
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
          <Icon name="users" color="#E8368F" size={18} />
          <div className="text-left">
            <div className="text-sm font-semibold text-white">Neue Freundschaftsanfrage</div>
            <div className="text-xs text-textMuted">{friendToast.name} möchte sich vernetzen</div>
          </div>
        </button>
      )}
    </div>
  );
}
