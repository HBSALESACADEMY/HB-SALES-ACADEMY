// Skill-Badges: einfache, on-the-fly berechnete Meilensteine (keine eigene
// Datenbank-Tabelle nötig — die zugrunde liegenden Zahlen existieren bereits).
export const BADGE_DEFS = [
  { id: "first_roleplay", emoji: "🎬", label: "Erste Schritte", desc: "1 Rollenspiel abgeschlossen", check: (s) => s.roleplayCount >= 1 },
  { id: "roleplay_10", emoji: "🗣️", label: "Vielredner", desc: "10 Rollenspiele abgeschlossen", check: (s) => s.roleplayCount >= 10 },
  { id: "first_cert", emoji: "🎓", label: "Zertifiziert", desc: "Erstes Zertifikat erhalten", check: (s) => s.certCount >= 1 },
  { id: "all_certs", emoji: "🏆", label: "Vollprofi", desc: "Alle Kurse zertifiziert", check: (s) => s.totalCourses > 0 && s.certCount >= s.totalCourses },
  { id: "streak_7", emoji: "🔥", label: "Serientäter", desc: "7 Tage Serie", check: (s) => s.streak >= 7 },
  { id: "streak_30", emoji: "⚡", label: "Unaufhaltsam", desc: "30 Tage Serie", check: (s) => s.streak >= 30 },
  { id: "quiz_20", emoji: "🧠", label: "Quiz-Meister", desc: "20 Quiz abgeschlossen", check: (s) => s.quizCount >= 20 },
  { id: "kudos_5", emoji: "💛", label: "Teamplayer", desc: "5 Reaktionen erhalten", check: (s) => s.kudosReceived >= 5 },
  { id: "mentor", emoji: "🤝", label: "Mentor", desc: "Ist Mentor für mind. eine Person", check: (s) => s.isMentor },
];

export function computeBadges(stats) {
  return BADGE_DEFS.map((b) => ({ ...b, earned: b.check(stats) }));
}
