import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Icon from "./Icon";
import { supabase } from "../lib/supabaseClient";

// Einmal je Seitenaufruf geladen und gemerkt: der Reiter "Betreiber" darf
// nur dem Plattform-Betreiber erscheinen, und diese Leiste steckt auf jeder
// Verwaltungsseite.
let betreiberGemerkt = null;

// Gemeinsame Unterseiten-Navigation für den Admin-Bereich — fasst die früher
// als einzelne Menüpunkte verstreuten Verwaltungsseiten unter einem Dach
// zusammen. Jede Seite bleibt technisch unverändert, nur die Navigation
// zwischen ihnen läuft jetzt über diese Reiterleiste statt über die Sidebar.
const ADMIN_TABS = [
  { key: "users", label: "Nutzer", route: "/admin", icon: "users" },
  { key: "organization", label: "Organisation", route: "/admin/organization", icon: "dashboard" },
  { key: "objections", label: "Eigene Einwände", route: "/admin/objections", icon: "flame" },
  { key: "activity", label: "Aktivitäten", route: "/admin/activity", icon: "chat" },
  { key: "insights", label: "Insights", route: "/admin/insights", icon: "award" },
  { key: "logins", label: "Login-Verlauf", route: "/admin/logins", icon: "logout" },
  { key: "content", label: "Inhalte", route: "/admin/content", icon: "book" },
  { key: "flashcards", label: "Flashcards", route: "/admin/flashcards", icon: "library" },
  { key: "lernpfade", label: "Lernpfade", route: "/admin/lernpfade", icon: "target" },
  { key: "suggestions", label: "Vorschläge", route: "/admin/suggestions", icon: "chat" },
  { key: "navigation", label: "Navigation", route: "/admin/navigation", icon: "dashboard" },
  { key: "status", label: "Systemstatus", route: "/admin/status", icon: "lock" },
];

// Getrennt gehalten: organisationsübergreifend, deshalb nur für den Betreiber.
const BETREIBER_TAB = { key: "betreiber", label: "Betreiber", route: "/admin/betreiber", icon: "users" };

export default function AdminTabs() {
  const router = useRouter();
  const [istBetreiber, setIstBetreiber] = useState(betreiberGemerkt ?? false);

  useEffect(() => {
    if (betreiberGemerkt !== null) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("profiles").select("is_platform_admin").eq("id", session.user.id).maybeSingle();
      betreiberGemerkt = !!data?.is_platform_admin;
      setIstBetreiber(betreiberGemerkt);
    })();
  }, []);

  const tabs = istBetreiber ? [...ADMIN_TABS, BETREIBER_TAB] : ADMIN_TABS;
  return (
    <div className="flex items-center gap-1.5 mb-5 flex-wrap overflow-x-auto pb-1">
      {tabs.map((t) => {
        const active = router.pathname === t.route;
        return (
          <button
            key={t.key}
            onClick={() => router.push(t.route)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 flex-shrink-0 transition ${active ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}
          >
            <Icon name={t.icon} size={12} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}
