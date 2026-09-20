import { maskiere } from "./htmlMail.js";
import { notifyOrgManagers } from "./notifyManagers.js";
import { sendEmail } from "./email.js";
import { sendeAlarm } from "./alarm.js";
import { deutscheZeit, terminText } from "./terminzeit.js";

// Die Benachrichtigungen, wenn ein Termin NEU angelegt wurde: Mail an die
// Leitung und die hinterlegten Zusatz-Adressen, dazu die Meldung in der
// Telegram-Gruppe der Organisation.
//
// An einer Stelle, weil zwei Wege einen Termin anlegen: die Academy
// (pages/api/lead-created.js) und der Vertriebsbuddy in Telegram
// (lib/buddyNeuerTermin.js). Ein Termin aus dem Chat soll dieselbe Meldung
// auslösen wie einer aus dem Formular — sonst wüsste das Team von der
// Hälfte der Termine nichts.
//
// Best-effort: Ein Fehler hier darf den gespeicherten Termin nie
// nachträglich scheitern lassen.
export async function meldeNeuenTermin(admin, { lead, orgId, name, phone, email, fields, appointmentAt, erfasser }) {
  if (!orgId) return { gemeldet: false };
  try {
    const { data: org } = await admin.from("organizations").select("name, telegram_chat_id").eq("id", orgId).maybeSingle();
    const orgName = org?.name || null;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const link = appUrl ? `${appUrl}/termine?leadId=${lead.id}` : null;

    // Zusatzfelder sind pro Organisation frei konfigurierbar (siehe
    // lib/leadFields.js) — die E-Mail baut sich generisch aus den
    // tatsächlich übermittelten Feldern samt ihrer (ggf. individuellen)
    // Labels auf, statt fest "Unternehmen"/"Webseite"/... anzunehmen.
    const fieldList = Array.isArray(fields) ? fields : [];
    const companyValue = (() => { const f = fieldList.find((x) => x?.key === "company"); return typeof f?.value === "string" ? f.value.trim() : ""; })();
    const notesValue = (() => { const f = fieldList.find((x) => x?.key === "notes"); return typeof f?.value === "string" ? f.value.trim() : ""; })();
    const extraLines = fieldList
      .filter((f) => f && f.key !== "company" && f.key !== "notes")
      .map((f) => {
        if (f.type === "checkbox") return f.value ? `${f.label}: Ja` : null;
        const v = typeof f.value === "string" ? f.value.trim() : f.value;
        return v ? `${f.label}: ${v}` : null;
      })
      .filter(Boolean);

    const htmlFuer = (empfaenger) =>
      `<p><strong>${maskiere(erfasser || "Ein/e Vertriebler:in")}</strong> hat einen neuen Termin erfasst${orgName ? ` bei ${maskiere(orgName)}` : ""}:</p>` +
      // Alles, was jemand eingetippt hat, geht maskiert ins HTML — sonst
      // wird aus einer Notiz mit "<a href=...>" ein Link in der Mail an
      // die Leitung.
      `<p><strong>${maskiere(name)}</strong>${companyValue ? ` (${maskiere(companyValue)})` : ""}<br/>` +
      `Termin: ${terminText(appointmentAt, empfaenger?.zeitzone)}` +
      // Telefon/E-Mail sind seit migration_81 pro Organisation optional —
      // leere Zeilen ("Telefon: ") wären sonst in jeder Mail zu sehen.
      (phone ? `<br/>Telefon: ${maskiere(phone)}` : "") +
      (email ? `<br/>E-Mail: ${maskiere(email)}` : "") +
      (extraLines.length ? `<br/>${extraLines.map((z) => maskiere(z)).join("<br/>")}` : "") +
      `</p>` +
      (notesValue ? `<p>${maskiere(notesValue).replace(/\n/g, "<br/>")}</p>` : "") +
      (link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Termin ansehen →</a></p>` : "");

    const subject = `Neuer Termin: ${name}`;
    const fromName = orgName || "HB Sales Academy";

    // Nur die Manager/Admins DIESER Organisation (bestehendes Muster,
    // siehe lib/notifyManagers.js) + deren frei konfigurierte
    // Zusatz-Adressen (notification_emails, verwaltbar auf der
    // Termine-Seite) — bewusst NICHT organisationsübergreifend an alle
    // Plattform-Admins, jede Organisation bekommt nur ihre eigenen
    // Termin-Benachrichtigungen. Das ist anders als bei den
    // Freischaltungs-Benachrichtigungen (notify-pending-approval.js),
    // wo der Plattform-Betreiber bewusst alles sehen soll.
    // Als Funktion: jede Mail nennt die deutsche Zeit und, falls die
    // empfangende Person anderswo sitzt, ihre Ortszeit dahinter.
    await notifyOrgManagers(admin, orgId, { subject, html: htmlFuer, fromName, art: "termine" });

    const { data: extra } = await admin.from("notification_emails").select("email").eq("organization_id", orgId);
    // Zusatz-Adressen haben kein Konto und damit keine Zeitzone —
    // dort steht die deutsche Zeit allein.
    const html = htmlFuer(null);
    const extraEmails = (extra || []).map((e) => e.email);
    // Einzeln statt als Sammel-Anfrage, siehe Kommentar in notifyManagers.js.
    await Promise.all(extraEmails.map((to) => sendEmail({ to, subject, html, fromName })));

    // Zusätzlich in den Telegram-Chat der Organisation, falls hinterlegt
    // (migration_84) — meist eine Gruppe des Vertriebsteams. Ergänzt die
    // E-Mail, ersetzt sie nicht: so kommt die Meldung auch dann an, wenn
    // der E-Mail-Versand (noch) nicht eingerichtet ist.
    if (org?.telegram_chat_id) {
      const text = [
        `📅 Neuer Termin: ${name}` + (companyValue ? ` (${companyValue})` : ""),
        `Erfasst von ${erfasser || "einem Teammitglied"}`,
        ``,
        `Termin: ${deutscheZeit(appointmentAt)} Uhr`,
        phone ? `Telefon: ${phone}` : null,
        email ? `E-Mail: ${email}` : null,
        ...extraLines,
        notesValue ? `\n${notesValue}` : null,
        link ? `\n${link}` : null,
      ].filter((z) => z !== null).join("\n");
      await sendeAlarm(text, org.telegram_chat_id);
    }
    return { gemeldet: true };
  } catch (e) {
    console.error("Termin-Benachrichtigung fehlgeschlagen:", e.message);
    return { gemeldet: false, grund: e.message };
  }
}
