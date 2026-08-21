import { sendEmail } from "./email.js";
import { willMeldung } from "./benachrichtigungen.js";

// Ermittelt die E-Mail-Adressen aller Manager/Admins einer Organisation und
// verschickt eine E-Mail an alle. Best-effort — wirft nie, damit ein
// fehlgeschlagener E-Mail-Versand nie den eigentlichen Vorgang (Registrierung,
// Prüfungsergebnis) blockiert. "admin" muss der Service-Role-Client sein
// (lib/supabaseAdmin.js), da hier organisationsübergreifend auf profiles UND
// auth.users (E-Mail-Adressen) zugegriffen werden muss.
// "art" bestimmt, wen die Meldung erreicht: wer sie in den Einstellungen
// abbestellt hat, bekommt sie nicht (migration_108). Ohne Angabe geht sie
// wie bisher an alle.
export async function notifyOrgManagers(admin, organizationId, { subject, html, fromName, art }) {
  try {
    if (!organizationId) return;
    const { data: managers } = await admin.from("profiles").select("id, benachrichtigungen")
      .eq("organization_id", organizationId)
      .or("role.eq.manager,is_admin.eq.true");
    if (!managers?.length) return;

    const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const emailById = new Map((authList?.users || []).map((u) => [u.id, u.email]));
    const recipients = managers
      .filter((m) => !art || willMeldung(m, art))
      .map((m) => emailById.get(m.id))
      .filter(Boolean);
    if (!recipients.length) return;

    // Einzeln statt als eine Sammel-Anfrage verschicken: solange bei Resend
    // keine eigene Domain verifiziert ist, lehnt Resend jede Adresse außer
    // der eigenen Account-Adresse ab — bei einer Sammel-Anfrage würde eine
    // einzige ungültige/nicht erlaubte Adresse den kompletten Versand an
    // ALLE Empfänger blockieren.
    await Promise.all(recipients.map((to) => sendEmail({ to, subject, html, fromName })));
  } catch (e) {
    console.error("notifyOrgManagers fehlgeschlagen:", e.message);
  }
}

// Wie notifyOrgManagers, aber organisationsübergreifend an alle Plattform-
// Admin-Konten — für Ereignisse, die den Plattform-Betreiber selbst
// interessieren (z.B. neue Freischaltungen in JEDER Organisation), nicht
// nur die jeweilige Organisation.
export async function notifyPlatformAdmins(admin, { subject, html, fromName, art }) {
  try {
    const { data: admins } = await admin.from("profiles").select("id, benachrichtigungen").eq("is_platform_admin", true);
    if (!admins?.length) return;

    const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const emailById = new Map((authList?.users || []).map((u) => [u.id, u.email]));
    const recipients = admins
      .filter((a) => !art || willMeldung(a, art))
      .map((a) => emailById.get(a.id))
      .filter(Boolean);
    if (!recipients.length) return;

    // Siehe Kommentar in notifyOrgManagers: einzeln statt als Sammel-Anfrage.
    await Promise.all(recipients.map((to) => sendEmail({ to, subject, html, fromName })));
  } catch (e) {
    console.error("notifyPlatformAdmins fehlgeschlagen:", e.message);
  }
}
