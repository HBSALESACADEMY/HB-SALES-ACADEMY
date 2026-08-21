import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { sendEmail } from "../../lib/email";
import { willMeldung } from "../../lib/benachrichtigungen";

// Kommentar zu einem Termin + Best-effort-Benachrichtigung an @erwähnte
// Personen. Läuft über den RLS-gebundenen Client, damit die Berechtigung
// (leads_select-Sichtbarkeit, siehe migration_67) unverändert gilt — kein
// Bypass über den Service-Role-Client.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { leadId, content, mentionedIds } = req.body || {};
  if (!leadId || !content?.trim()) return res.status(400).json({ error: "Kommentar darf nicht leer sein." });

  try {
    const { data: lead, error: leadErr } = await client.from("leads").select("id, name, created_by").eq("id", leadId).maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return res.status(404).json({ error: "Termin nicht gefunden — oder kein Zugriff." });

    const { data: comment, error: insErr } = await client.from("lead_comments").insert({ lead_id: leadId, user_id: user.id, content: content.trim() }).select().single();
    if (insErr) throw insErr;

    try {
      const ids = [...new Set((mentionedIds || []).filter((id) => id && id !== user.id))];
      if (ids.length) {
        const admin = getAdminSupabase();
        const { data: leadOwner } = await admin.from("profiles").select("organization_id").eq("id", lead.created_by).maybeSingle();
        // Nur an Mitglieder derselben Organisation wie der Termin — verhindert,
        // dass beliebige userIds vom Client zum Verschicken von Mails an
        // Unbeteiligte missbraucht werden.
        const { data: eligible } = await admin.from("profiles").select("id").in("id", ids).eq("organization_id", leadOwner?.organization_id || null);
        const eligibleIds = (eligible || []).map((p) => p.id);
        if (eligibleIds.length) {
          // Persistiert (nicht nur E-Mail), damit die Erwähnung auch im
          // Dashboard auftaucht (siehe migration_68).
          await client.from("lead_mentions").insert(
            eligibleIds.map((uid) => ({ user_id: uid, actor_id: user.id, lead_id: leadId, comment_id: comment.id }))
          );

          const { data: me } = await client.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
          const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
          const emailById = new Map((authList?.users || []).map((u) => [u.id, u.email]));
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
          const link = appUrl ? `${appUrl}/termine?leadId=${leadId}` : null;
          const subject = `${me?.full_name || "Jemand"} hat dich erwähnt: Termin mit ${lead.name}`;
          const html =
            `<p><strong>${me?.full_name || "Jemand"}</strong> hat dich in einem Kommentar zum Termin mit <strong>${lead.name}</strong> erwähnt:</p>` +
            `<p>${content.trim()}</p>` +
            (link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Termin ansehen →</a></p>` : "");
          // Erwähnungs-Mails nur an die, die sie wollen (migration_108). Der
          // Eintrag in lead_mentions bleibt für alle — im Dashboard sieht man
          // die Erwähnung weiterhin.
          const { data: wuensche } = await admin.from("profiles")
            .select("id, benachrichtigungen").in("id", eligibleIds);
          const wahlVon = new Map((wuensche || []).map((p2) => [p2.id, p2]));
          const recipients = eligibleIds
            .filter((id) => willMeldung(wahlVon.get(id), "erwaehnungen"))
            .map((id) => emailById.get(id))
            .filter(Boolean);
          await Promise.all(recipients.map((to) => sendEmail({ to, subject, html })));
        }
      }
    } catch (notifyErr) {
      console.error("Kommentar-Erwähnung Benachrichtigung fehlgeschlagen:", notifyErr.message);
    }

    return res.status(200).json({ ok: true, comment });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Kommentar konnte nicht gespeichert werden." });
  }
}
