import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { sendEmail } from "../../lib/email";
import { willMeldung } from "../../lib/benachrichtigungen";

// Aufgabe zu einem Termin zuweisen + Best-effort-Benachrichtigung an die
// zugewiesene Person. Insert läuft über den RLS-gebundenen Client (siehe
// lead_tasks_insert_own, migration_67) — kein Bypass.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { leadId, assignedTo, title, dueDate } = req.body || {};
  if (!leadId || !assignedTo || !title?.trim()) return res.status(400).json({ error: "leadId, assignedTo und title sind erforderlich." });

  try {
    const { data: lead, error: leadErr } = await client.from("leads").select("id, name, created_by").eq("id", leadId).maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return res.status(404).json({ error: "Termin nicht gefunden — oder kein Zugriff." });

    const admin = getAdminSupabase();
    // Verhindert, dass eine beliebige userId (z.B. aus einer fremden
    // Organisation) als "assignedTo" untergeschoben wird — die zugewiesene
    // Person bekäme sonst über die leads-RLS (migration_77) vollen
    // Lesezugriff auf einen fremden Termin. Gleiche Prüfung wie bei
    // @Erwähnungen in lead-comment.js. Zusätzlich per RLS abgesichert
    // (migration_78), das hier ist nur für eine saubere Fehlermeldung.
    const { data: leadOwner } = await admin.from("profiles").select("organization_id").eq("id", lead.created_by).maybeSingle();
    const { data: assigneeProfile } = await admin.from("profiles").select("id, organization_id").eq("id", assignedTo).maybeSingle();
    if (!assigneeProfile || !leadOwner?.organization_id || assigneeProfile.organization_id !== leadOwner.organization_id) {
      return res.status(403).json({ error: "Die zugewiesene Person gehört nicht zur selben Organisation wie der Termin." });
    }

    const { data: task, error: insErr } = await client.from("lead_tasks").insert({
      lead_id: leadId, assigned_to: assignedTo, assigned_by: user.id, title: title.trim(), due_date: dueDate ? new Date(dueDate).toISOString() : null,
    }).select().single();
    if (insErr) throw insErr;

    try {
      if (assignedTo !== user.id) {
        const { data: me } = await client.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const emailById = new Map((authList?.users || []).map((u) => [u.id, u.email]));
        // Wer Aufgaben-Mails abbestellt hat, bekommt keine (migration_108).
        // Die Aufgabe selbst erscheint weiterhin im Dashboard — abbestellt
        // ist der Briefkasten, nicht der Vorgang.
        const { data: empfaenger } = await admin.from("profiles")
          .select("benachrichtigungen").eq("id", assignedTo).maybeSingle();
        const to = willMeldung(empfaenger, "aufgaben") ? emailById.get(assignedTo) : null;
        if (to) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
          const link = appUrl ? `${appUrl}/termine?leadId=${leadId}` : null;
          const subject = `Neue Aufgabe: ${title.trim()}`;
          const html =
            `<p><strong>${me?.full_name || "Jemand"}</strong> hat dir eine Aufgabe zum Termin mit <strong>${lead.name}</strong> zugewiesen:</p>` +
            `<p><strong>${title.trim()}</strong>${dueDate ? `<br/>Fällig: ${new Date(dueDate).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}` : ""}</p>` +
            (link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Termin ansehen →</a></p>` : "");
          await sendEmail({ to, subject, html });
        }
      }
    } catch (notifyErr) {
      console.error("Aufgaben-Benachrichtigung fehlgeschlagen:", notifyErr.message);
    }

    return res.status(200).json({ ok: true, task });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Aufgabe konnte nicht gespeichert werden." });
  }
}
