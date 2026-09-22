import { auswertungsTage, hatAktivitaet, platzEins, auswertungsText } from "./tagesauswertung.js";
import { sendePersoenlich } from "./telegramPersoenlich.js";
import { zahlenFuerTage } from "./zahlenLaden.js";

// Verschickt die persönliche Tagesauswertung an alle, die ihr Telegram
// verbunden und die Auswertung nicht abgeschaltet haben.
//
// Läuft im Tagesbericht mit (Vercel Hobby: nur zwei Cron-Läufe).

export async function sendeTagesauswertungen(admin, jetzt = new Date(), { erneut = false } = {}) {
  const tage = auswertungsTage(jetzt);
  if (!tage) return { gesendet: 0, grund: "Wochenende" };
  const { heute: heuteTag, berichtTag, vergleichTag } = tage;

  const { data: empfaenger, error } = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, tagesauswertung, auswertung_fuer")
    .not("chat_id", "is", null).eq("tagesauswertung", true);
  if (error) return { gesendet: 0, grund: error.message };
  const offen = (empfaenger || []).filter((e) => erneut || e.auswertung_fuer !== berichtTag);
  if (!offen.length) return { gesendet: 0, berichtTag };

  const zaehlung = await zahlenFuerTage(admin, [berichtTag, vergleichTag]);

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
      heuteTag,
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
