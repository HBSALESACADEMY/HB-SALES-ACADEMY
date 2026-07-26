import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import Icon from "./Icon";
import Avatar from "./Avatar";
import { quoteOfTheDay } from "../lib/quotes";
import ProfileModal from "./ProfileModal";

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
let cachedProfile = null;
let cachedNavItems = null;

export function patchCachedProfile(patch) {
  cachedProfile = cachedProfile ? { ...cachedProfile, ...patch } : patch;
}

export default function Layout({ children, fullBleed }) {
  const router = useRouter();
  const [profile, setProfile] = useState(cachedProfile);
  const [loadingAuth, setLoadingAuth] = useState(!cachedProfile);
  const [navItems, setNavItems] = useState(cachedNavItems || FALLBACK_NAV);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unreadCommunity, setUnreadCommunity] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [openProfileId, setOpenProfileId] = useState(null);

  useEffect(() => {
    function handler(e) { setOpenProfileId(e.detail); }
    window.addEventListener("hb:open-profile", handler);
    return () => window.removeEventListener("hb:open-profile", handler);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
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

      const { count: msgCount } = await supabase.from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", session.user.id).is("read_at", null);
      if (mounted) setUnreadMessages(msgCount || 0);

      const { data: me } = await supabase.from("profiles").select("role, last_seen_community_at").eq("id", session.user.id).maybeSingle();
      const since = me?.last_seen_community_at || new Date(0).toISOString();
      const [{ count: postCount }, { count: commentCount }] = await Promise.all([
        supabase.from("community_posts").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", session.user.id),
        supabase.from("community_comments").select("id", { count: "exact", head: true }).gt("created_at", since).neq("user_id", session.user.id),
      ]);
      if (mounted) setUnreadCommunity((postCount || 0) + (commentCount || 0));

      const { count: friendReqCount } = await supabase.from("friendships")
        .select("id", { count: "exact", head: true }).eq("addressee_id", session.user.id).eq("status", "pending");
      if (mounted) setPendingFriendRequests(friendReqCount || 0);

      if (me?.role === "manager") {
        const [{ count: approvalCount }, { count: suggestionCount }] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("kb_entries").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ]);
        if (mounted) { setPendingApprovals(approvalCount || 0); setPendingSuggestions(suggestionCount || 0); }
      }
    }
    loadUnread();
    const interval = setInterval(loadUnread, 20000);
    return () => { mounted = false; clearInterval(interval); };
  }, [router.asPath]);

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
        bg-gradient-to-b from-[#181A28] to-[#0A0C13] border-r border-line px-3.5 py-6 flex flex-col gap-1
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
        <div className="flex-1 overflow-y-auto flex flex-col gap-1">
          {navItems.filter((n) => !n.requires_manager || profile?.role === "manager").map((item) => {
            const route = item.is_builtin ? item.route : `/folder/${item.id}`;
            const badgeCount = item.key === "community" ? unreadCommunity
              : item.key === "messages" ? unreadMessages
              : item.key === "members" ? pendingFriendRequests
              : item.key === "admin" ? pendingApprovals
              : item.key === "admin-suggestions" ? pendingSuggestions
              : 0;
            return (
              <button
                key={item.id}
                onClick={() => router.push(route)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-medium text-left w-full ${
                  router.asPath === route ? "bg-gradient-to-r from-[#7B2FF7]/15 via-[#E8368F]/15 to-transparent text-amber shadow-[inset_2px_0_0_#E8368F]" : "text-[#9195A6] hover:bg-surfaceRaised hover:text-white"
                }`}
              >
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
    </div>
  );
}
