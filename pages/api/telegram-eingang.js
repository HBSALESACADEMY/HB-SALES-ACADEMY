import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { geheimnisPasst, leseUpdate, verbindungsCodeAus } from "../../lib/telegramWebhook";
import { codeGueltig } from "../../lib/telegramPersoenlich";
import { sendeBegruessung } from "../../lib/telegramBegruessung";
import { beantworteEingang, beantworteBefehl } from "../../lib/buddy";
import { leseBefehl } from "../../lib/buddyBefehle";
import { bearbeiteErgebnisKnopf } from "../../lib/buddyErgebnis";
import { bearbeiteEintragKnopf } from "../../lib/buddyEintrag";

// Der Eingang: Telegram meldet hier jede Nachricht, sobald sie geschrieben
// wird. Damit antwortet der Vertriebsbuddy in Sekunden, statt bis zum
// nächsten Öffnen der Academy zu warten.
//
// Diese Adresse ist öffentlich erreichbar — sie MUSS es sein, Telegram
// bringt keine Anmeldung mit. Der Ausweis ist das Geheimnis im Kopf
// "X-Telegram-Bot-Api-Secret-Token", das beim Einrichten mitgegeben wurde
// (lib/telegramWebhook.js). Ohne das Geheimnis: 401, und zwar bevor
// irgendetwas gelesen oder gespeichert wird.
//
// Antworten IMMER mit 200, sobald das Geheimnis stimmt. Ein Fehlercode
// lässt Telegram dieselbe Meldung minutenlang wiederholen — und am Ende
// stünde dieselbe Antwort fünfmal im Chat.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!geheimnisPasst(req.headers["x-telegram-bot-api-secret-token"])) {
    return res.status(401).json({ error: "Nicht autorisiert." });
  }

  const eingang = leseUpdate(req.body);
  if (!eingang) return res.status(200).json({ ok: true, ignoriert: true });

  try {
    const admin = getAdminSupabase();

    // Ablegen ist zugleich der Schutz gegen Doppelantworten: Kommt dieselbe
    // Meldung noch einmal (Telegram wiederholt bei Zeitüberschreitung),
    // scheitert das Einfügen am Primärschlüssel — und es passiert nichts.
    // Die Knopf-Angaben gehören nicht in die Ablage — nur die Spalten der Tabelle.
    const { knopf, ...zeile } = eingang;
    const { error } = await admin.from("telegram_updates").insert(zeile);
    if (error) {
      const schonBekannt = error.code === "23505";
      if (!schonBekannt) console.error("Telegram-Eingang nicht gespeichert:", error.message);
      return res.status(200).json({ ok: true, doppelt: schonBekannt });
    }

    // Ein Knopf: "b:…" bestätigt einen Eintrag aus einem freien Satz
    // (lib/buddyEintrag.js), alles andere ist ein Ergebnis-Knopf aus dem
    // Morgen-Briefing.
    if (knopf) {
      if (knopf.daten.startsWith("b:")) await bearbeiteEintragKnopf(admin, knopf);
      else await bearbeiteErgebnisKnopf(admin, knopf);
      return res.status(200).json({ ok: true, knopf: true });
    }

    if (eingang.chat_typ === "private" && eingang.text) {
      const code = verbindungsCodeAus(eingang.text);
      if (code) {
        await verbinde(admin, code, eingang);
        return res.status(200).json({ ok: true, verbunden: true });
      }
      // Ein Kurzbefehl wie /heute oder /rollenspiel.
      const befehl = leseBefehl(eingang.text);
      if (befehl) {
        await beantworteBefehl(admin, eingang, befehl);
        return res.status(200).json({ ok: true, befehl: befehl.befehl });
      }
      // Sonst ein Satz an den Buddy.
      await beantworteEingang(admin, eingang);
      return res.status(200).json({ ok: true, beantwortet: true });
    }

    // Gruppen und Kanäle: nur ablegen. Die Gruppensuche in den
    // Organisations-Einstellungen liest hier nach.
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Telegram-Eingang fehlgeschlagen:", e.message);
    // Trotzdem 200 — siehe oben.
    return res.status(200).json({ ok: true, fehler: true });
  }
}

/**
 * Jemand hat im Bot auf "Start" getippt: Das Konto zum Code bekommt diesen
 * Chat — und sofort die Begrüssung.
 *
 * Ohne gültigen Code passiert nichts. Wer den Code eines anderen abtippt,
 * kann damit nur dessen Verbindung auf den eigenen Chat legen, wenn er ihn
 * innerhalb von zehn Minuten erfährt — deshalb ist er zufällig, kurzlebig
 * und wird nach dem Verbinden gelöscht.
 */
async function verbinde(admin, code, eingang) {
  const { data: zeilen } = await admin.from("telegram_verknuepfungen")
    .select("user_id, code, code_seit").eq("code", code).limit(1);
  const zeile = zeilen?.[0];
  if (!zeile || !codeGueltig(zeile.code_seit)) return;

  const jetzt = new Date().toISOString();
  const { error } = await admin.from("telegram_verknuepfungen").update({
    chat_id: eingang.chat_id,
    chat_name: eingang.chat_name || "Telegram",
    verbunden_am: jetzt,
    code: null,
    code_seit: null,
    updated_at: jetzt,
  }).eq("user_id", zeile.user_id);
  if (error) { console.error("Verbinden über den Webhook fehlgeschlagen:", error.message); return; }

  await sendeBegruessung(admin, zeile.user_id, eingang.chat_id);
}
