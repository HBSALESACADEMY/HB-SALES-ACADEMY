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
// Die Verwaltung hatte dreizehn gleichrangige Reiter in einer Reihe. Man
// findet darin alles — wenn man schon weiss, wo es steht. Wer es nicht
// weiss, klickt sich durch, und weil "Aktivitäten", "Login-Verlauf" und
// "Insights" alle drei nach Beobachtung klingen, landet man dreimal falsch.
//
// Deshalb Bereiche: erst die Frage ("geht es um Menschen, um Inhalte oder
// um Einstellungen?"), dann die Seite. Jede Seite hat genau einen Ort — und
// einen Satz dazu, der sie von ihren Nachbarn abgrenzt.
//
// Die Vertriebsauswertung steht bewusst NICHT hier, sondern als eigener
// Reiter in der Sidebar: sie wird täglich gelesen, die Verwaltung betritt
// man selten.
//
// "Betrieb" steht abgetrennt und nur für den Plattform-Betreiber: das sind
// die Dinge, die über alle Organisationen hinweg gelten.
const BEREICHE = [
  {
    key: "menschen",
    label: "Menschen",
    seiten: [
      { key: "users", label: "Nutzer", route: "/admin", icon: "users",
        zweck: "Wer gehört dazu, wer wartet auf Freigabe, welche Rolle hat wer." },
      { key: "activity", label: "Aktivitäten", route: "/admin/activity", icon: "chat",
        zweck: "Was in der Academy passiert ist — gelernt, telefoniert, Termine erfasst." },
      { key: "logins", label: "Anmeldungen", route: "/admin/logins", icon: "logout",
        zweck: "Nur die Anmeldungen, mit Verlauf je Person." },
      // Der Lernfortschritt gehört zu den Menschen. Ein eigener Bereich nur
      // dafür wäre eine Überschrift über einer einzigen Seite — die
      // Vertriebsauswertung, die dort danebenstand, ist jetzt ein eigener
      // Reiter in der Sidebar.
      { key: "insights", label: "Lernfortschritt", route: "/admin/insights", icon: "award",
        zweck: "Wer wie weit ist: Kurse, Quiz, Rollenspiele, XP — über alle Teams." },
    ],
  },
  {
    key: "inhalte",
    label: "Inhalte",
    seiten: [
      { key: "content", label: "Kurse & Module", route: "/admin/content", icon: "book",
        zweck: "Eigene Kurse, Module und ihre Reihenfolge — und der Weg zu eigenen Ordnern in der Sidebar." },
      { key: "flashcards", label: "Flashcards", route: "/admin/flashcards", icon: "library",
        zweck: "Karten zum Auswendiglernen." },
      { key: "lernpfade", label: "Lernpfade", route: "/admin/lernpfade", icon: "target",
        zweck: "Welche Reihenfolge wer durchlaufen soll." },
      { key: "objections", label: "Einwände", route: "/admin/objections", icon: "flame",
        zweck: "Eigene Einwand-Szenarien und die Gründe, die aus dem Team kommen." },
      { key: "suggestions", label: "Wissens-Vorschläge", route: "/admin/suggestions", icon: "chat",
        zweck: "Was die KI aus Rollenspielen aufgeschnappt hat." },
    ],
  },
  {
    key: "einstellungen",
    label: "Einstellungen",
    seiten: [
      { key: "organization", label: "Organisation", route: "/admin/organization", icon: "dashboard",
        zweck: "Name, Logo, Farben, Firmencode, Einwand-Kategorien, Terminfelder." },
    ],
  },
];

// Nur für den Plattform-Betreiber: organisationsübergreifend, und deshalb
// bewusst nicht zwischen den Dingen, die eine Organisation selbst verwaltet.
const BETRIEB = {
  key: "betrieb",
  label: "Betrieb",
  nurBetreiber: true,
  seiten: [
    { key: "betreiber", label: "Organisationen", route: "/admin/betreiber", icon: "users",
      zweck: "Alle Organisationen der Plattform." },
    { key: "status", label: "Systemstatus", route: "/admin/status", icon: "lock",
      zweck: "Läuft alles: Datenbank, Schlüssel, Hintergrundläufe." },
  ],
};

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

  const bereiche = istBetreiber ? [...BEREICHE, BETRIEB] : BEREICHE;
  // Der Bereich der aktuellen Seite ist offen — nicht der zuletzt geklickte:
  // wer über einen Link hier landet, soll sehen, wo er steht.
  const aktiverBereich = bereiche.find((b) => b.seiten.some((s) => s.route === router.pathname)) || bereiche[0];
  const aktiveSeite = aktiverBereich.seiten.find((s) => s.route === router.pathname);

  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {bereiche.map((b) => {
          const an = b.key === aktiverBereich.key;
          return (
            <button key={b.key} onClick={() => router.push(b.seiten[0].route)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${an ? "border-amber text-textMain" : "border-transparent text-textMuted hover:text-textMain"} ${b.nurBetreiber ? "ml-auto" : ""}`}
              style={an ? { background: "color-mix(in srgb, var(--org-accent, #E9B44C) 14%, transparent)" } : undefined}>
              {b.nurBetreiber ? "🛠 " : ""}{b.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap overflow-x-auto pb-1">
        {aktiverBereich.seiten.map((t) => {
          const active = router.pathname === t.route;
          return (
            <button key={t.key} onClick={() => router.push(t.route)} title={t.zweck}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 flex-shrink-0 transition ${active ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
              <Icon name={t.icon} size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Was genau auf dieser Seite zu finden ist — und damit auch, was
          NICHT: die drei Beobachtungs-Seiten liessen sich sonst nur durch
          Ausprobieren auseinanderhalten. */}
      {aktiveSeite && (
        <p className="text-[11px] text-textMuted mt-2">{aktiveSeite.zweck}</p>
      )}
    </div>
  );
}
