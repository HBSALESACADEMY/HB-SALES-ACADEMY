import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import Icon from "./Icon";

const NAV = [
  { id: "/", label: "Dashboard", icon: "dashboard" },
  { id: "/courses", label: "Kurse", icon: "book" },
  { id: "/roleplay", label: "Rollenspiel", icon: "chat" },
  { id: "/call-tracker", label: "Call Tracker", icon: "target" },
  { id: "/einwand-trainer", label: "Einwand-Trainer", icon: "flame" },
  { id: "/knowledge", label: "Wissensdatenbank", icon: "library" },
  { id: "/manager", label: "Team (Manager)", icon: "users" },
  { id: "/admin", label: "Nutzerverwaltung", icon: "lock" },
];

export default function Layout({ children, fullBleed }) {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (mounted) {
        setProfile(data);
        setLoadingAuth(false);
      }
    }
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [router]);

  async function handleLogout() {
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
    <div className="flex h-screen border border-line rounded-none md:rounded-2xl overflow-hidden bg-bg">
      <aside className="w-[230px] flex-shrink-0 bg-gradient-to-b from-[#14161F] to-[#0F1117] border-r border-line px-3.5 py-6 flex flex-col gap-1">
        <div className="font-display text-base font-bold px-2.5 pb-1.5 text-white">
          HB Sales <span className="text-amber">Academy</span>
        </div>
        <div className="text-[11px] text-textMuted px-2.5 pb-5 uppercase tracking-wide">Vertriebspsychologie</div>
        {NAV.filter((n) => (n.id !== "/manager" && n.id !== "/admin") || profile?.role === "manager").map((item) => (
          <button
            key={item.id}
            onClick={() => router.push(item.id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-medium text-left w-full ${
              router.pathname === item.id ? "bg-gradient-to-r from-amber/15 to-transparent text-amber shadow-[inset_2px_0_0_#F0B23E]" : "text-[#9195A6] hover:bg-surfaceRaised hover:text-white"
            }`}
          >
            <Icon name={item.icon} /> {item.label}
          </button>
        ))}
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
      <main className={`flex-1 overflow-y-auto ${fullBleed ? "p-3" : "p-8"}`} style={{ background: "radial-gradient(600px 300px at 85% -5%, rgba(240,178,62,.06), transparent), radial-gradient(500px 260px at 0% 100%, rgba(63,191,166,.05), transparent)" }}>
        {typeof children === "function" ? children(profile) : children}
      </main>
    </div>
  );
}
