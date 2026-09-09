import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../lib/rollen";
import { sendEmail } from "../../lib/email";
import { gueltigeAdresse, bereinigeAdresse, fremdeZeichen } from "../../lib/emailKontakt";
import { alsHtml, fuelleVorlage, werteFuerKontakt, mitSchluss } from "../../lib/marketingVorlage";

// Die Marketing-Mail wirklich verschicken.
//
// Der Weg über einen mailto-Link hatte zwei Löcher: man landet im eigenen
// Mailprogramm (also ausserhalb jeder Nachvollziehbarkeit), und danach muss
// man daran denken, hier abzuhaken. Der vergessene Haken ist der Regelfall.
//
// Hier wird verschickt UND vermerkt, in einem Schritt. Was rausging, steht
// beim Kontakt — sonst weiss beim Nachfassen niemand mehr, was der Kunde
// eigentlich bekommen hat.
export const config = { maxDuration: 25 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  const { kontaktId, betreff, text, vorlage, anhaenge, anMichSelbst } = req.body || {};
  if (!kontaktId || !String(betreff || "").trim() || !String(text || "").trim()) {
    return res.status(400).json({ error: "Betreff und Text sind nötig." });
  }

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("id, full_name, role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();
  const leitung = istFuehrungsrolle(profil);

  const orgId = await aktiveOrgId(admin, profil, user.id);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  try {
    const { data: kontakt } = await admin.from("email_kontakte")
      .select("*").eq("id", kontaktId).eq("organization_id", orgId).maybeSingle();
    if (!kontakt) return res.status(404).json({ error: "Kontakt nicht gefunden." });

    // Wer nicht führt, darf nur an SEINE eigenen Kontakte schreiben — und
    // nur mit einer Vorlage der Organisation.
    //
    // Der zweite Teil ist der wichtigere: Was im Namen der Firma an einen
    // Kunden geht, legt die Leitung fest. Ohne diese Schranke schriebe jede
    // Person ihren eigenen Text nach draussen, und die erste unglückliche
    // Formulierung fällt erst auf, wenn sie beim Kunden liegt.
    if (!leitung) {
      if (kontakt.user_id !== user.id) {
        return res.status(403).json({ error: "Du kannst nur an deine eigenen Kontakte schreiben." });
      }
      const { data: orgVorlagen } = await admin.from("organizations")
        .select("email_vorlagen").eq("id", orgId).maybeSingle();
      const liste = Array.isArray(orgVorlagen?.email_vorlagen) ? orgVorlagen.email_vorlagen : [];
      if (!liste.length) {
        return res.status(403).json({ error: "Für eure Organisation ist noch keine Mail-Vorlage hinterlegt. Die Leitung legt sie unter Verwaltung → Organisation → E-Mail an." });
      }
      if (!vorlage || !liste.some((v) => v.name === vorlage)) {
        return res.status(403).json({ error: "Bitte eine Vorlage eurer Organisation verwenden." });
      }
    }
    // Die Adresse säubern, BEVOR sie zum Versanddienst geht — und die
    // Zeile gleich mit reparieren.
    //
    // Genau hier ist es schiefgegangen: eine kopierte Adresse trug ein
    // unsichtbares Zeichen, Resend antwortete "Invalid `to` field. The
    // email address contains non-ASCII characters", und gesucht wurde beim
    // Absender. Die Adresse sah ja richtig aus.
    const sauber = bereinigeAdresse(kontakt.email);
    if (!gueltigeAdresse(sauber)) {
      const fremd = fremdeZeichen(sauber);
      return res.status(400).json({
        error: fremd.length
          ? `Die Adresse "${kontakt.email}" enthält Zeichen, die kein Versanddienst annimmt (${fremd.join(", ")}). `
            + "Meist stammen sie aus dem Kopieren. Adresse beim Kontakt neu eintippen."
          : `Die Adresse "${kontakt.email}" ist keine gültige E-Mail-Adresse.`,
      });
    }
    if (sauber !== kontakt.email) {
      await admin.from("email_kontakte").update({ email: sauber }).eq("id", kontakt.id);
      kontakt.email = sauber;
    }

    const { data: org } = await admin.from("organizations")
      .select("name, email_absender, email_antwort_an, email_signatur").eq("id", orgId).maybeSingle();

    // Anhänge holt der Server aus dem Speicher; der Browser schickt nur die
    // Kennungen. Sonst liesse sich jede beliebige Datei über eure
    // Absenderadresse verschicken.
    const dateien = [];
    if (Array.isArray(anhaenge) && anhaenge.length) {
      const { data: eintraege } = await admin.from("email_anhaenge")
        .select("id, name, pfad").eq("organization_id", orgId).in("id", anhaenge.slice(0, 5));
      for (const e of eintraege || []) {
        const { data: datei } = await admin.storage.from("email-anhaenge").download(e.pfad);
        if (!datei) continue;
        dateien.push({
          filename: e.name,
          content: Buffer.from(await datei.arrayBuffer()).toString("base64"),
        });
      }
    }

    // Zeilenumbrüche werden zu Absätzen: der Text wird in einem Textfeld
    // geschrieben, und dort erwartet niemand, HTML tippen zu müssen.
    // Der Standardschluss der Organisation kommt unter jede Mail: Signatur,
    // Anschrift, Abmeldehinweis. An einer Stelle gepflegt statt in jeder
    // Vorlage wiederholt (migration_143).
    // Was im Entwurf noch an Platzhaltern steht, wird hier gefüllt.
    //
    // Wer im Textfeld selbst "{{vertriebler}}" tippt — oder eine Signatur
    // hineinkopiert — hatte das sonst wörtlich in der Mail stehen: die
    // Seite füllt nur beim Öffnen der Vorlage, danach nie wieder.
    const werte = werteFuerKontakt(kontakt, {
      vertriebler: profil?.full_name || "",
      organisation: org?.name || "",
    });
    const gefuellterText = fuelleVorlage(String(text), werte);
    const gefuellterBetreff = fuelleVorlage(String(betreff), werte);

    // Hängt den Standardschluss an — aber nur, wenn er nicht ohnehin schon
    // im Text steht (siehe lib/marketingVorlage.js).
    const html = alsHtml(mitSchluss(gefuellterText.trim(), org?.email_signatur || "", werte));

    // An sich selbst: dieselbe Mail, dieselbe Vorlage, derselbe Absender —
    // nur ein anderer Empfänger. Die Sicherheitsstufe vor dem Ernstfall.
    const empfaenger = anMichSelbst ? user.email : kontakt.email;
    if (!empfaenger) return res.status(400).json({ error: "Zu deinem Konto ist keine E-Mail-Adresse hinterlegt." });

    const versand = await sendEmail({
      to: empfaenger,
      subject: gefuellterBetreff.trim(),
      html,
      fromName: org?.name || "HB Sales Academy",
      fromEmail: org?.email_absender || null,
      // Damit die Antwort des Kontakts bei der Organisation ankommt und
      // nicht in einem Postfach, das niemand liest.
      replyTo: org?.email_antwort_an || null,
      attachments: dateien,
    });
    // Ohne diese Prüfung stünde "verschickt" auch dann da, wenn Resend die
    // Mail abgelehnt hat — etwa weil die Absenderdomain nicht verifiziert
    // ist. Genau dann fasst niemand nach, weil scheinbar alles lief.
    if (versand?.error) {
      // Den Wortlaut von Resend mitgeben, nicht nur die Vermutung.
      //
      // Vorher stand hier immer "Prüfe die Absenderadresse" — auch bei
      // einem abgelaufenen Schlüssel, einer gesperrten Empfängeradresse
      // oder einem zu grossen Anhang. Wer daraufhin die Domain prüft,
      // sucht dann stundenlang an der falschen Stelle. Resend schreibt
      // genau, was fehlt; das gehört auf den Bildschirm.
      return res.status(502).json({
        error: `Der Mailversand wurde abgelehnt${versand.status ? ` (${versand.status})` : ""}: `
          + `${versand.meldung || "kein Grund angegeben"}`
          + `\nAbsender war: ${versand.absender || "unbekannt"}.`
          // Der Hinweis auf die Absender-Freigabe nur dann, wenn es auch
          // darum geht. Sonst schickt er bei jedem anderen Grund auf die
          // falsche Fährte — so ist genau diese Suche entstanden.
          + (/domain|verif|from|sender/i.test(String(versand.meldung || ""))
            ? `\nDiese Adresse muss bei Resend verifiziert sein — sie steht unter Verwaltung → Organisation → E-Mail.`
            : ""),
      });
    }
    if (versand?.skipped) {
      return res.status(503).json({ error: "Für diese Academy ist kein Mailversand eingerichtet (RESEND_API_KEY fehlt)." });
    }

    // Erst nach dem erfolgreichen Versand vermerken. Andersherum stünde
    // "verschickt" bei einer Mail, die nie ankam — und niemand würde je
    // nachfassen.
    // Eine Probemail an sich selbst ändert am Kontakt nichts: sonst stünde
    // "verschickt", ohne dass der Kunde je etwas bekommen hat.
    if (anMichSelbst) return res.status(200).json({ ok: true, an: empfaenger, probe: true });

    const jetzt = new Date().toISOString();
    await admin.from("email_kontakte").update({
      status: "verschickt",
      verschickt_am: jetzt,
      verschickt_von: user.id,
      // Welche Vorlage benutzt wurde — Grundlage für die Frage, welche
      // Vorlage Termine bringt (migration_143).
      vorlage: vorlage || null,
      // Die Kennung des Versanddienstes — nur mit ihr lässt sich eine
      // spätere Rückmeldung dem richtigen Kontakt zuordnen (migration_152).
      versand_id: versand?.id || null,
      zustellung: "angenommen",
      zustellung_am: jetzt,
      zustellung_grund: null,
      // Der Betreff der letzten Mail — bewusst in einem eigenen Feld und
      // NICHT in der Gesprächsnotiz.
      //
      // Vorher wuchs die Notiz mit jedem Versand ("— Mail vom 8.9.: Test"),
      // und weil {{notiz}} in den Vorlagen steht, landete diese Historie in
      // der nächsten Mail beim Kunden. Nach drei Versuchen stand sie dort
      // dreimal.
      letzter_betreff: String(betreff).trim(),
      erinnert_am: null,
    }).eq("id", kontakt.id);

    return res.status(200).json({ ok: true, an: kontakt.email });
  } catch (e) {
    console.error("Marketing-Mail fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Die Mail konnte nicht verschickt werden." });
  }
}
