// Skill-Badges: einfache, on-the-fly berechnete Meilensteine (keine eigene
// Datenbank-Tabelle nötig — die zugrunde liegenden Zahlen existieren bereits).
//
// Jedes Abzeichen trägt ein Zeichen aus der eigenen Icon-Sammlung
// (components/Icon.js). Das Emoji bleibt als Rückfallebene für Stellen, die
// nur Text ausgeben können — etwa Telegram.
export const BADGE_DEFS = [
  { id: "first_roleplay", icon: "mic", emoji: "🎬", label: "Erste Schritte", desc: "1 Rollenspiel abgeschlossen", check: (s) => s.roleplayCount >= 1 },
  { id: "roleplay_10", icon: "chat", emoji: "🗣️", label: "Vielredner", desc: "10 Rollenspiele abgeschlossen", check: (s) => s.roleplayCount >= 10 },
  { id: "first_cert", icon: "award", emoji: "🎓", label: "Zertifiziert", desc: "Erstes Zertifikat erhalten", check: (s) => s.certCount >= 1 },
  { id: "all_certs", icon: "medal", emoji: "🏆", label: "Vollprofi", desc: "Alle Kurse zertifiziert", check: (s) => s.totalCourses > 0 && s.certCount >= s.totalCourses },
  { id: "streak_7", icon: "flame", emoji: "🔥", label: "Serientäter", desc: "7 Tage Serie", check: (s) => s.streak >= 7 },
  { id: "streak_30", icon: "flame", emoji: "⚡", label: "Unaufhaltsam", desc: "30 Tage Serie", check: (s) => s.streak >= 30 },
  { id: "quiz_20", icon: "book", emoji: "🧠", label: "Quiz-Meister", desc: "20 Quiz abgeschlossen", check: (s) => s.quizCount >= 20 },
  { id: "kudos_5", icon: "users", emoji: "💛", label: "Teamplayer", desc: "5 Reaktionen erhalten", check: (s) => s.kudosReceived >= 5 },
];

export function computeBadges(stats) {
  return BADGE_DEFS.map((b) => ({ ...b, earned: b.check(stats) }));
}
