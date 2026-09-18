import { goalMetric, goalMetricLabel } from "./goalMetrics.js";
import { werteProPerson, summeFuer } from "./goalProgress.js";
import { berlinHeute, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";

// Der Stand der Team-Ziele für /ziel im Telegram-Chat.
//
// Gerechnet wird mit denselben Bausteinen wie auf der Seite "Mein Team"
// (pages/api/team-goals.js): werteProPerson je Kennzahl im Zeitraum des
// Ziels, summiert über das Team — oder nur über die Person, wenn es ein
// persönliches Ziel ist. Sonst stünde im Chat eine andere Zahl als in der
// Academy.

const bisVon = (z) => z.ends_on || tagPlus(z.starts_on || z.week_start, 6);
const vonVon = (z) => z.starts_on || z.week_start;

function tageBis(heute, bis) {
  return Math.round((new Date(`${bis}T00:00:00Z`) - new Date(`${heute}T00:00:00Z`)) / 86400000);
}

export function zielZeile({ ziel, fortschritt, teamName = "", beitrag = null, heute }) {
  const soll = Number(ziel.target_count) || 0;
  const prozent = soll ? Math.round((fortschritt / soll) * 100) : 0;
  const rest = tageBis(heute, bisVon(ziel));
  const noch = rest <= 0 ? "letzter Tag" : rest === 1 ? "noch 1 Tag" : `noch ${rest} Tage`;
  const haken = fortschritt >= soll && soll > 0 ? " ✅" : "";
  return [
    `🎯 ${ziel.title || goalMetricLabel(ziel.metric)}${haken}`,
    `   ${fortschritt} von ${soll} ${goalMetricLabel(ziel.metric)} (${prozent} %) · ${noch}`,
    `   ${ziel.user_id ? "Dein persönliches Ziel" : `Team ${teamName}`}${beitrag !== null && !ziel.user_id ? ` · dein Beitrag: ${beitrag}` : ""}`,
  ].join("\n");
}

export async function zielStand(admin, userId, { jetzt = new Date() } = {}) {
  const heute = berlinHeute(jetzt);
  const [{ data: mitglied }, { data: gefuehrt }] = await Promise.all([
    admin.from("team_members").select("team_id").eq("user_id", userId),
    admin.from("teams").select("id").eq("created_by", userId),
  ]);
  const teamIds = [...new Set([...(mitglied || []).map((m) => m.team_id), ...(gefuehrt || []).map((t) => t.id)])];
  if (!teamIds.length) return { zeilen: [], ohneTeam: true };

  const [{ data: teams }, { data: mitglieder }, { data: ziele }] = await Promise.all([
    admin.from("teams").select("id, name").in("id", teamIds),
    admin.from("team_members").select("team_id, user_id").in("team_id", teamIds),
    admin.from("team_goals").select("*").in("team_id", teamIds).order("starts_on", { ascending: false }).limit(100),
  ]);
  const nameVon = new Map((teams || []).map((t) => [t.id, t.name]));
  const idsVon = new Map();
  (mitglieder || []).forEach((m) => {
    if (!idsVon.has(m.team_id)) idsVon.set(m.team_id, []);
    idsVon.get(m.team_id).push(m.user_id);
  });

  // Laufend, und von den persönlichen nur die eigenen.
  const laufend = (ziele || [])
    .filter((z) => vonVon(z) && vonVon(z) <= heute && bisVon(z) >= heute)
    .filter((z) => !z.user_id || z.user_id === userId)
    .sort((a, b) => bisVon(a).localeCompare(bisVon(b)));

  const zeilen = [];
  for (const z of laufend) {
    const metrik = goalMetric(z.metric);
    if (!metrik) continue;
    const beteiligte = z.user_id ? [z.user_id] : (idsVon.get(z.team_id) || []);
    const von = vonVon(z);
    const bis = bisVon(z);
    const werte = await werteProPerson(admin, metrik, beteiligte, tagesBeginnZeitpunkt(von), von,
      tagesBeginnZeitpunkt(tagPlus(bis, 1)), bis);
    zeilen.push(zielZeile({
      ziel: z,
      fortschritt: summeFuer(werte, beteiligte),
      teamName: nameVon.get(z.team_id) || "",
      beitrag: beteiligte.includes(userId) ? (werte.get(userId) || 0) : null,
      heute,
    }));
  }
  return { zeilen, ohneTeam: false };
}
