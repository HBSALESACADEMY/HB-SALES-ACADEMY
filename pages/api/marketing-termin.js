import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../lib/rollen";
import { notifyOrgManagers } from "../../lib/notifyManagers";
import { sendEmail } from "../../lib/email";
import { sendeAlarm } from "../../lib/alarm";
import { terminText, deutscheZeit } from "../../lib/terminzeit";
import { RESERVED_FIELD_COLUMNS, resolveLeadFields, fehlendePflichtfelder } from "../../lib/leadFields";

// Aus einem E-Mail-Kontakt wird ein Termin.
//
// Über eine Route und nicht aus dem Browser, weil drei Dinge dazugehören,
// die dort nicht hingehören: die Prüfung, dass wirklich eine Führungsrolle
// den Termin für jemand anderen anlegt; die Benachrichtigung an das Team;
// und vor allem der Umstand, dass der Termin einer ANDEREN Person gehört.
//
// Der Termin wird auf den Vertriebler geschrieben, der den Kontakt
// erarbeitet hat — nicht auf die Person, die ihn hier einträgt. Sonst
// stünde er in der Statistik der Führungskraft und fehlte in seiner
// eigenen, und im Kalender läge er bei der falschen Person.
export const config = { maxDuration: 25 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  const { kontaktId, zeitpunkt, trotzdem, daten } = req.body || {};
  if (!kontaktId || !zeitpunkt) return res.status(400).json({ error: "Kontakt und Zeitpunkt sind nötig." });

  const wann = new Date(zeitpunkt);
  if (Number.isNaN(wann.getTime())) return res.status(400).json({ error: "Der Zeitpunkt ist nicht lesbar." });

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("id, full_name, role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  if (!istFuehrungsrolle(profil)) {
    return res.status(403).json({ error: "Termine aus dem E-Mail-Marketing legt die Leitung an." });
  }
  const orgId = await aktiveOrgId(admin, profil, user.id);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  try {
    const { data: kontakt } = await admin.from("email_kontakte")
      .select("*").eq("id", kontaktId).eq("organization_id", orgId).maybeSingle();
    if (!kontakt) return res.status(404).json({ error: "Kontakt nicht gefunden." });

    // Zweimal geklickt heisst nicht zwei Termine. Der zweite fällt sonst
    // niemandem auf, bis der Kunde sich über die doppelte Einladung wundert.
    if (kontakt.lead_id) {
      return res.status(409).json({ error: "Zu diesem Kontakt gibt es bereits einen Termin.", leadId: kontakt.lead_id });
    }

    // Ein Termin in der Vergangenheit ist fast immer ein Tippfehler im
    // Datum. Gefragt statt stumm angelegt — nachträglich fällt es niemandem
    // mehr auf, weil vergangene Termine ohnehin unten in der Liste stehen.
    if (wann.getTime() < Date.now() - 60000 && !trotzdem) {
      return res.status(409).json({
        error: `Dieser Zeitpunkt liegt in der Vergangenheit (${deutscheZeit(wann.toISOString())} Uhr). Stimmt das Datum?`,
        rueckfrage: "vergangenheit",
      });
    }

    // Dieselben Pflichtfelder wie im Call Tracker: ein Termin aus dem
    // Marketing ist kein Termin zweiter Klasse. Sonst fehlen später
    // ausgerechnet dort die Angaben, die die Organisation für jeden anderen
    // Termin verlangt.
    const { data: orgFelder } = await admin.from("organizations").select("*").eq("id", orgId).maybeSingle();
    const eingabe = daten || {};
    const fehlt = fehlendePflichtfelder({
      name: eingabe.name ?? kontakt.name,
      phone: eingabe.phone ?? kontakt.telefon,
      email: eingabe.email ?? kontakt.email,
      appointmentAt: zeitpunkt,
      fields: eingabe.fields || {},
      org: orgFelder,
    });
    if (fehlt.length) {
      return res.status(400).json({ error: `Es fehlen noch: ${fehlt.join(", ")}.`, fehlt });
    }

    // Zusatzfelder wie im Call Tracker: manche haben eine eigene Spalte,
    // der Rest landet in custom_fields (siehe lib/leadFields.js).
    const spalten = {};
    const custom = {};
    resolveLeadFields(orgFelder).forEach((f) => {
      const wert = eingabe.fields?.[f.key];
      const spalte = RESERVED_FIELD_COLUMNS[f.key];
      if (spalte) spalten[spalte] = f.type === "checkbox" ? !!wert : (wert || null);
      else if (wert !== null && wert !== undefined && wert !== "") custom[f.key] = wert;
    });

    const { data: vertriebler } = await admin.from("profiles")
      .select("full_name").eq("id", kontakt.user_id).maybeSingle();
    const wer = profil?.full_name || "die Leitung";
    const fuerWen = vertriebler?.full_name || "den Vertriebler";

    // Woher der Termin kommt, gehört in den Termin selbst: sonst steht
    // jemand vor einem Termin, den er nie vereinbart hat, und weiss nicht,
    // wen er fragen soll.
    const herkunft = `Aus dem E-Mail-Marketing, eingetragen von ${wer} für ${fuerWen}.`;
    const notizen = kontakt.notiz ? `${herkunft}\n\nGesprächsnotiz: ${kontakt.notiz}` : herkunft;

    const { data: lead, error: insertErr } = await admin.from("leads").insert({
      created_by: kontakt.user_id,
      organization_id: kontakt.organization_id || orgId,
      name: eingabe.name || kontakt.name,
      email: eingabe.email || kontakt.email,
      phone: eingabe.phone || kontakt.telefon,
      // Erst die Eingabe, dann die Spalten-Zusatzfelder, dann der Kontakt:
      // was gerade getippt wurde, hat Vorrang vor dem, was beim Anruf
      // notiert war.
      company: spalten.company ?? kontakt.firma,
      // Ein Termin aus dem Marketing ist ein Erstgespräch — die Stufe wird
      // hier gesetzt und nicht später aus dem Fehlen einer Angabe geraten.
      termin_art: "erstgespraech",
      ...spalten,
      custom_fields: custom,
      notes: spalten.notes ? `${notizen}\n\n${spalten.notes}` : notizen,
      appointment_at: wann.toISOString(),
      status: "geplant",
    }).select().single();
    if (insertErr) throw insertErr;

    await admin.from("email_kontakte").update({
      lead_id: lead.id, status: "termin", ergebnis_am: new Date().toISOString(),
    }).eq("id", kontakt.id);

    // Der Vertriebler muss davon erfahren — der Termin liegt sonst in
    // seinem Kalender, ohne dass es ihm jemand sagt. Best effort: eine
    // fehlgeschlagene Meldung darf den Termin nicht rückgängig machen.
    try {
      const { data: org } = await admin.from("organizations")
        .select("name, telegram_chat_id").eq("id", orgId).maybeSingle();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      const link = appUrl ? `${appUrl}/termine?leadId=${lead.id}` : null;
      const betreff = `Neuer Termin für dich: ${kontakt.name}`;

      const html = (empfaenger) =>
        `<p><strong>${wer}</strong> hat aus dem E-Mail-Marketing einen Termin für <strong>${fuerWen}</strong> eingetragen:</p>` +
        `<p><strong>${kontakt.name}</strong>${kontakt.firma ? ` (${kontakt.firma})` : ""}<br/>` +
        `Termin: ${terminText(lead.appointment_at, empfaenger?.zeitzone)}<br/>` +
        `E-Mail: ${kontakt.email}` +
        (kontakt.telefon ? `<br/>Telefon: ${kontakt.telefon}` : "") +
        `</p>` +
        (kontakt.notiz ? `<p>Aus dem Gespräch: ${kontakt.notiz}</p>` : "") +
        (link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Termin ansehen →</a></p>` : "");

      // An die Leitung wie bei jedem neuen Termin — und ausdrücklich an die
      // Person, der er gehört. Die steht nicht zwangsläufig in der
      // Manager-Liste.
      await notifyOrgManagers(admin, orgId, { subject: betreff, html, fromName: org?.name || "HB Sales Academy", art: "termine" });

      const { data: konto } = await admin.auth.admin.getUserById(kontakt.user_id);
      const adresse = konto?.user?.email;
      if (adresse) {
        await sendEmail({ to: adresse, subject: betreff, html: html(null), fromName: org?.name || "HB Sales Academy" });
      }

      if (org?.telegram_chat_id) {
        await sendeAlarm([
          `📅 Termin aus dem E-Mail-Marketing: ${kontakt.name}${kontakt.firma ? ` (${kontakt.firma})` : ""}`,
          `Für ${fuerWen}, eingetragen von ${wer}`,
          ``,
          `Termin: ${deutscheZeit(lead.appointment_at)} Uhr`,
          link ? `\n${link}` : null,
        ].filter((z) => z !== null).join("\n"), org.telegram_chat_id);
      }
    } catch (e) {
      console.error("Marketing-Termin: Benachrichtigung fehlgeschlagen:", e.message);
    }

    return res.status(200).json({ lead });
  } catch (e) {
    console.error("Marketing-Termin fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Der Termin konnte nicht angelegt werden." });
  }
}
