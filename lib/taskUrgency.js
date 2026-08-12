// Einheitliche Dringlichkeits-Einstufung für Aufgaben-Fälligkeiten — an einer
// Stelle berechnet, damit Dashboard und Termine-Seite exakt gleich anzeigen.
export function taskUrgency(dueDate, done) {
  if (!dueDate || done) return null;
  const diffMs = new Date(dueDate).getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const mins = Math.round(absMs / 60000);
  const hours = Math.round(absMs / 3600000);
  const days = Math.round(absMs / 86400000);
  const span = mins < 60 ? `${mins} Min.` : hours < 48 ? `${hours} Std.` : `${days} Tag${days === 1 ? "" : "e"}`;
  const countdown = diffMs < 0 ? `Überfällig seit ${span}` : `in ${span}`;

  let level;
  if (diffMs < 0) level = "overdue";
  else if (diffMs <= 24 * 3600000) level = "urgent";
  else if (diffMs <= 3 * 86400000) level = "soon";
  else level = "ok";

  return { level, countdown };
}

export const URGENCY_STYLES = {
  overdue: { text: "text-coral", border: "border-coral/60", bg: "bg-coral/10" },
  urgent: { text: "text-coral", border: "border-coral/40", bg: "bg-coral/5" },
  soon: { text: "text-amber", border: "border-amber/40", bg: "bg-amber/5" },
  ok: { text: "text-teal", border: "border-line", bg: "" },
};
