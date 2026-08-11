import { getAdminSupabase } from "../../../lib/supabaseAdmin";

// DSGVO-Datenminimierung: reine Protokoll-/Telemetriedaten haben keinen
// dauerhaften Geschäftszweck (anders als z.B. Kundendaten/Leads, die aktiv
// von den Nutzer:innen verwaltet werden) und werden hier automatisch nach
// einer angemessenen Frist gelöscht. Läuft täglich per Vercel Cron
// (siehe vercel.json), abgesichert über CRON_SECRET (von Vercel automatisch
// als "Authorization: Bearer <CRON_SECRET>" mitgeschickt).
const RETENTION_DAYS = {
  login_events: 180,
  login_attempts: 180,
  page_views: 180,
  ai_request_log: 90,
};

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || req.headers.authorization !== expected) {
    return res.status(401).json({ error: "Nicht autorisiert." });
  }

  const admin = getAdminSupabase();
  const results = {};
  try {
    for (const [table, days] of Object.entries(RETENTION_DAYS)) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { error, count } = await admin.from(table).delete({ count: "exact" }).lt("created_at", cutoff);
      if (error) throw error;
      results[table] = count || 0;
    }
    return res.status(200).json({ ok: true, deleted: results });
  } catch (e) {
    console.error("cleanup-logs failed:", e.message);
    return res.status(500).json({ error: e.message, deleted: results });
  }
}
