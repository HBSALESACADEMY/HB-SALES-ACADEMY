import { useRouter } from "next/router";
import Icon from "./Icon";

// Reiterleiste innerhalb eines Bereichs — dasselbe Muster wie AdminTabs.
//
// Grund: die Navigation hatte 27 Punkte, darunter vier für "mit einer KI ein
// Gespräch üben" und drei für "Text nachschlagen oder erzeugen". Die Seiten
// bleiben technisch unverändert, nur der Wechsel zwischen ihnen läuft jetzt
// hier statt über je einen eigenen Eintrag in der Seitenleiste.
export const TRAINING = [
  { label: "Rollenspiel", route: "/roleplay", icon: "chat" },
  { label: "Szenario-Simulator", route: "/simulator", icon: "target" },
  { label: "Einwand-Trainer", route: "/einwand-trainer", icon: "flame" },
  { label: "Verlauf", route: "/roleplay-history", icon: "book" },
];

export const WISSEN = [
  { label: "Wissensdatenbank", route: "/knowledge", icon: "library" },
  { label: "Skript-Bibliothek", route: "/scripts", icon: "book" },
  { label: "Leitfaden-Generator", route: "/leitfaden-generator", icon: "target" },
];

export const UEBEN = [
  { label: "Flashcards", route: "/flashcards", icon: "library" },
  { label: "Tages-Challenge", route: "/daily-challenge", icon: "flame" },
  { label: "Quiz-Duell", route: "/duel", icon: "target" },
  { label: "Cold Call Bingo", route: "/bingo", icon: "target" },
];

export default function BereichsTabs({ tabs }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1.5 mb-5 flex-wrap overflow-x-auto pb-1">
      {tabs.map((t) => {
        const aktiv = router.pathname === t.route;
        return (
          <button
            key={t.route}
            onClick={() => router.push(t.route)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 flex-shrink-0 transition ${aktiv ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}
          >
            <Icon name={t.icon} size={12} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}
