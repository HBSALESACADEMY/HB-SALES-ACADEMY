import { tagPlus, tagesBeginnZeitpunkt } from "./woche.js";
import { auswertungsTage, zaehleTage, hatAktivitaet, platzEins, auswertungsText } from "./tagesauswertung.js";
import { sendePersoenlich } from "./telegramPersoenlich.js";
import { alleZeilen } from "./alleZeilen.js";

// Verschickt die persönliche Tagesauswertung an alle, die ihr Telegram
// verbunden und die Auswertung nicht abgeschaltet haben.
//
// Läuft im Tagesbericht mit (Vercel Hobby: nur zwei Cron-Läufe).

async function ladeTermine(admin, von) {
  // Welche Termine einen der beiden Tage betreffen können: deren Termin ab
  // dem Vergleichstag liegt (auch die weitergerückten — ihr neuer Termin
  // liegt später als der alte) oder die ab dann Kunde wurden.
  const mitKunde = await alleZeilen(() => admin.from("leads")
    .select("id, created_by, termin_art, status, appointment_at, stufen_verlauf, schritte, kein_kundentermin, kunde_am")
    .is("geloescht_am", null)
    .or(`appointment_at.gte.${von},kunde_am.gte.${von}`)
    .order("id"));
  if (!mitKunde.error) return mitKunde.data;

  // Ohne migration_165 gibt es kunde_am nicht. Dann eben ohne die neuen
  // Kunden — die übrigen Zahlen stimmen trotzdem.
  const ohne = await alleZeilen(() => admin.from("leads")
    .select("id, created_by, termin_art, status, appointment_at, stufen_verlauf, schritte, kein_kundentermin")
    .is("geloescht_am", null)
    .gte("appointment_at", von)
    .order("id"));
  return ohne.data || [];
}

export async function sendeTagesauswertungen(admin, jetzt = new Date(), { erneut = false } = {}) {
  const tage = auswertungsTage(jetzt);
  if (!tage) return { gesendet: 0, grund: "Wochenende" };
  const { berichtTag, vergleichTag } = tage;

  const { data: empfaenger, error } = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, tagesauswertung, auswertung_fuer")
    .not("chat_id", "is", null).eq("tagesauswertung", true);
  if (error) return { gesendet: 0, grund: error.message };
  const offen = (empfaenger || []).filter((e) => erneut || e.auswertung_fuer !== berichtTag);
  if (!offen.length) return { gesendet: 0, berichtTag };

  const von = tagesBeginnZeitpunkt(vergleichTag);
  const bis = tagesBeginnZeitpunkt(tagPlus(berichtTag, 1));

  const [anrufe, termine, mails, followUps] = await Promise.all([
    alleZeilen(() => admin.from("call_log_days").select("user_id, log_date, counts")
      .in("log_date", [berichtTag, vergleichTag]).order("user_id").order("log_date")),
    ladeTermine(admin, von),
    alleZeilen(() => admin.from("email_kontakte").select("id, user_id, verschickt_von, verschickt_am")
      .gte("verschickt_am", von).lt("verschickt_am", bis).order("id")),
    alleZeilen(() => admin.from("nachfass_termine").select("id, zustaendig, erledigt_am")
      .gte("erledigt_am", von).lt("erledigt_am", bis).order("id")),
  ]);

  const zaehlung = zaehleTage({
    anrufe: anrufe.data || [], termine, mails: mails.data || [], followUps: followUps.data || [],
  }, [berichtTag, vergleichTag]);
  const amBerichtTag = zaehlung.get(berichtTag);
  const amVergleichTag = zaehlung.get(vergleichTag);

  const ids = [...new Set([...amBerichtTag.keys(), ...offen.map((e) => e.user_id)])];
  const { data: profile } = await admin.from("profiles").select("id, full_name, organization_id").in("id", ids);
  const orgVon = new Map((profile || []).map((p) => [p.id, p.organization_id]));
  const nameVon = new Map((profile || []).map((p) => [p.id, p.full_name]));

  let gesendet = 0;
  for (const e of offen) {
    const heute = amBerichtTag.get(e.user_id);
    // Wer an dem Tag nichts eingetragen hat — Urlaub, krank, Aussendienst —
    // bekommt keine Nachricht. Eine Auswertung voller Nullen wäre kein Lob,
    // sondern ein Vorwurf.
    if (!hatAktivitaet(heute)) continue;

    const text = auswertungsText({
      name: nameVon.get(e.user_id),
      berichtTag,
      vergleichTag,
      heute,
      vorher: amVergleichTag.get(e.user_id),
      bestwerte: platzEins(e.user_id, amBerichtTag, orgVon),
    });
    const versand = await sendePersoenlich(admin, e, text);
    if (versand?.ok) {
      await admin.from("telegram_verknuepfungen").update({ auswertung_fuer: berichtTag }).eq("user_id", e.user_id);
      gesendet += 1;
    }
  }

  return { gesendet, berichtTag, vergleichTag };
}
