// Zentrale Streak-Logik. Es gibt keinen Hintergrund-Job, der abgelaufene
// Serien zurücksetzt — profiles.streak_count wird bisher nur beim
// TATSÄCHLICHEN Ausführen der Tages-Challenge neu berechnet. Ohne Aktivität
// blieb der Wert also beliebig lange stehen ("Streak in Gefahr" für immer,
// statt irgendwann auf 0 zu fallen). Lösung: bei jedem Login "nachholen"
// (lazy expiry) — siehe components/Layout.js, das den echten DB-Wert
// zurücksetzt und einen XP-Abzug verbucht. Für die Anzeige an anderer Stelle
// (Community-Kudos-Wall, fremde Profile) reicht die reine Berechnung, ohne
// zu schreiben — der echte Datenbank-Wert wird erst korrigiert, sobald die
// betroffene Person sich selbst wieder einloggt.

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

export function isStreakExpired(lastChallengeDate) {
  if (!lastChallengeDate) return false;
  return lastChallengeDate !== todayStr() && lastChallengeDate !== yesterdayStr();
}

// Für die Anzeige: abgelaufene Serien zeigen 0 statt eines veralteten Werts.
export function effectiveStreak(streakCount, lastChallengeDate) {
  if (!streakCount) return 0;
  return isStreakExpired(lastChallengeDate) ? 0 : streakCount;
}

// XP-Abzug beim Verlieren einer Serie — skaliert mit der verlorenen Länge,
// gedeckelt, damit ein Ausreißer nicht den ganzen XP-Stand auffrisst.
export function streakLossPenalty(streakCount) {
  return Math.min((streakCount || 0) * 5, 100);
}
