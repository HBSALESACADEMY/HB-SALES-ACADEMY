import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { pruefeSystem } from "../../../lib/systemPruefung";
import { sendeAlarm } from "../../../lib/alarm";

// Prüft regelmässig die Kernfunktionen und meldet Störungen per Telegram.
// Läuft per Vercel Cron (siehe vercel.json), abgesichert über CRON_SECRET.
//
// Gemeldet wird nur der WECHSEL des Zustands — bei einer längeren Störung
// kommt sonst stündlich dieselbe Nachricht und man schaut irgendwann nicht
// mehr hin. Erholt sich das System, kommt eine Entwarnung.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const erwartet = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || req.headers.authorization !== erwartet) {
    return res.status(401).json({ error: "Nicht autorisiert." });
  }

  const admin = getAdminSupabase();
  const ergebnis = await pruefeSystem();

  const { data: vorher } = await admin.from("system_health").select("gesund").eq("id", true).maybeSingle();
  const warVorherGesund = vorher?.gesund;

  await admin.from("system_health").upsert({
    id: true, gesund: ergebnis.gesund, pruefungen: ergebnis.pruefungen, geprueft_at: ergebnis.zeitpunkt,
  });

  // Beim allerersten Lauf (vorher === undefined) nur melden, wenn etwas kaputt
  // ist — sonst bekäme man ohne Anlass eine Entwarnung.
  const zustandGewechselt = warVorherGesund !== undefined && warVorherGesund !== ergebnis.gesund;
  const ersterLaufMitProblem = warVorherGesund === undefined && !ergebnis.gesund;

  if (zustandGewechselt || ersterLaufMitProblem) {
    const probleme = ergebnis.pruefungen.filter((p) => !p.ok);
    const text = ergebnis.gesund
      ? "✅ HB Sales Academy: wieder alles in Ordnung."
      : "🔴 HB Sales Academy — Störung:\n\n" +
        probleme.map((p) => `• ${p.name}: ${p.hinweis}`).join("\n");
    await sendeAlarm(text);
  }

  return res.status(200).json(ergebnis);
}
