import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { zustandFuer, istGescheitert } from "../../lib/zustellung";

// Rückmeldungen des Mailversands entgegennehmen.
//
// Diese Route ruft nicht die Academy auf, sondern der Versanddienst — jedes
// Mal, wenn eine Mail zugestellt wurde, zurückkam oder als Spam gemeldet
// wurde. Sie hat deshalb keine Anmeldung und muss sich anders schützen:
// über ein Geheimnis, das nur der Dienst kennt (RESEND_WEBHOOK_SECRET).
//
// Ohne Geheimnis in den Umgebungsvariablen nimmt sie gar nichts an. Eine
// offene Route, über die jeder den Zustand fremder Kontakte umschreiben
// könnte, wäre schlimmer als keine Rückmeldung.
export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const geheimnis = process.env.RESEND_WEBHOOK_SECRET;
  if (!geheimnis) return res.status(503).json({ error: "Nicht eingerichtet." });

  // Der Dienst schickt das Geheimnis mit — als Kopfzeile oder in der
  // Adresse, je nachdem, was sich dort einstellen lässt.
  const mitgeschickt = req.headers["x-academy-secret"] || req.query.secret;
  if (mitgeschickt !== geheimnis) return res.status(401).json({ error: "Nicht autorisiert." });

  const { type, data } = req.body || {};
  const zustand = zustandFuer(type);
  // Unbekannte Ereignisse werden freundlich quittiert, nicht abgelehnt:
  // sonst versucht der Dienst sie tagelang erneut zuzustellen.
  if (!zustand) return res.status(200).json({ ok: true, ignoriert: type || null });

  const versandId = data?.email_id || data?.id || null;
  const empfaenger = Array.isArray(data?.to) ? data.to[0] : data?.to;
  if (!versandId && !empfaenger) return res.status(200).json({ ok: true, ohneZuordnung: true });

  try {
    const admin = getAdminSupabase();

    // Über die Kennung zuordnen, nicht über die Adresse: Bei zwei Mails an
    // dieselbe Adresse bekäme sonst die falsche den Rückläufer.
    let abfrage = admin.from("email_kontakte").select("id, zustellung");
    abfrage = versandId ? abfrage.eq("versand_id", versandId) : abfrage.ilike("email", empfaenger);
    const { data: kontakt } = await abfrage.order("verschickt_am", { ascending: false }).limit(1).maybeSingle();
    if (!kontakt) return res.status(200).json({ ok: true, unbekannt: true });

    // "zugestellt" darf ein späteres "unzustellbar" nicht überschreiben —
    // die Reihenfolge der Rückmeldungen ist nicht garantiert.
    if (istGescheitert(kontakt.zustellung) && !istGescheitert(zustand)) {
      return res.status(200).json({ ok: true, unveraendert: true });
    }

    await admin.from("email_kontakte").update({
      zustellung: zustand,
      zustellung_am: new Date().toISOString(),
      zustellung_grund: data?.reason || data?.bounce?.message || null,
      // Eine unzustellbare Adresse braucht kein Nachfassen, sondern eine
      // Korrektur. Ohne das erinnert die Academy in fünf Tagen daran, einer
      // toten Adresse hinterherzutelefonieren.
      ...(istGescheitert(zustand) ? { erinnert_am: new Date().toISOString() } : {}),
    }).eq("id", kontakt.id);

    return res.status(200).json({ ok: true, zustand });
  } catch (e) {
    console.error("Versand-Rückmeldung fehlgeschlagen:", e.message);
    // Mit 200 quittieren: ein Fehler auf unserer Seite soll den Dienst
    // nicht in eine tagelange Wiederholschleife schicken.
    return res.status(200).json({ ok: false, fehler: e.message });
  }
}
