import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { sendeAlarm } from "../../lib/alarm";
import { neuerVerbindungsCode, startLink, codeGueltig, findeStart, CODE_GUELTIG_MINUTEN } from "../../lib/telegramPersoenlich";
import { sendeBegruessung } from "../../lib/telegramBegruessung";
import { istFuehrungsrolle } from "../../lib/rollen";
import { webhookGeheimnis, webhookAdresse, stelleWebhookSicher } from "../../lib/telegramWebhook";
import { setzeBefehle } from "../../lib/telegramApi";
import { BEFEHLE } from "../../lib/buddyBefehle";

// Das eigene Konto mit dem eigenen Telegram verbinden.
//
// Alles läuft über die angemeldete Person selbst: Es gibt keinen Weg, eine
// Chat-Kennung von aussen mitzuschicken. Die Kennung kommt ausschliesslich
// aus Telegram — aus dem privaten Chat, in dem der Einmal-Code ankam.
export const config = { maxDuration: 20 };

const TABELLE_FEHLT = "In der Datenbank fehlt die Tabelle für die Telegram-Verbindung (migration_165).";
const UPDATES = encodeURIComponent(JSON.stringify(["message", "my_chat_member", "channel_post"]));

function lesbar(fehler) {
  return /telegram_verknuepfungen/.test(fehler?.message || "") ? TABELLE_FEHLT : (fehler?.message || "Unbekannter Fehler.");
}

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const userId = auth.user.id;
  const admin = getAdminSupabase();
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const { data: zeile, error: leseFehler } = await admin.from("telegram_verknuepfungen")
    .select("*").eq("user_id", userId).maybeSingle();
  if (leseFehler) return res.status(500).json({ error: lesbar(leseFehler) });

  if (req.method === "GET") {
    const { data: ich } = await admin.from("profiles")
      .select("role, is_admin, is_platform_admin").eq("id", userId).maybeSingle();
    // Die Kennung selbst geht nicht an den Browser — sie wird dort nicht
    // gebraucht.
    return res.status(200).json({
      plattformAdmin: !!ich?.is_platform_admin,
      eingerichtet: !!token,
      verbunden: !!zeile?.chat_id,
      chatName: zeile?.chat_name || null,
      verbundenAm: zeile?.verbunden_am || null,
      tagesauswertung: zeile ? zeile.tagesauswertung !== false : true,
      followups: zeile ? zeile.followups !== false : true,
      buddy: zeile ? zeile.buddy !== false : true,
      teamlage: zeile ? zeile.teamlage !== false : true,
      briefing: zeile ? zeile.briefing !== false : true,
      einwaende: zeile ? zeile.einwaende !== false : true,
      istLeitung: istFuehrungsrolle(ich),
      einwilligungAm: zeile?.einwilligung_am || null,
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!token) return res.status(503).json({ error: "Für diese Academy ist kein Telegram-Bot eingerichtet (TELEGRAM_BOT_TOKEN fehlt)." });

  const { aktion } = req.body || {};
  const jetzt = new Date().toISOString();
  async function speichere(felder) {
    const { error } = await admin.from("telegram_verknuepfungen")
      .upsert({ user_id: userId, ...felder, updated_at: jetzt }, { onConflict: "user_id" });
    if (error) throw error;
  }

  try {
    if (aktion === "code") {
      // Ohne bestätigte Einwilligung gibt es keinen Code — und ohne Code
      // keine Verbindung (Art. 7 Abs. 1 DSGVO, migration_173).
      if (req.body.einwilligung !== true) {
        return res.status(400).json({ error: "Bitte bestätige zuerst die Einwilligung zur Nutzung des Telegram-Bots." });
      }
      const antwort = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const bot = await antwort.json();
      if (!bot?.ok || !bot.result?.username) {
        return res.status(502).json({ error: bot?.description || "Der Telegram-Bot antwortet nicht." });
      }
      // Im selben Zug dafür sorgen, dass Telegram künftig von selbst meldet.
      // Steht es schon richtig, kostet das eine Anfrage und sonst nichts.
      const webhook = await stelleWebhookSicher();
      if (!webhook.aktiv) console.error("Webhook nicht eingerichtet:", webhook.grund);
      // Und die Kurzbefehle, die Telegram beim Tippen auf "/" anbietet.
      await setzeBefehle(BEFEHLE);

      const code = neuerVerbindungsCode();
      await speichere({ code, code_seit: jetzt, einwilligung_am: zeile?.einwilligung_am || jetzt });
      return res.status(200).json({ code, link: startLink(bot.result.username, code), botName: bot.result.username, gueltigMinuten: CODE_GUELTIG_MINUTEN });
    }

    if (aktion === "pruefen") {
      // Mit Webhook ist die Verbindung meist schon fertig, bevor hier
      // jemand klickt — der Bot hat den Start selbst verarbeitet.
      const { data: frisch } = await admin.from("telegram_verknuepfungen")
        .select("chat_id, chat_name").eq("user_id", userId).maybeSingle();
      if (frisch?.chat_id) return res.status(200).json({ verbunden: true, chatName: frisch.chat_name });

      if (!zeile?.code || !codeGueltig(zeile.code_seit)) {
        return res.status(400).json({ error: "Der Code ist abgelaufen. Tippe noch einmal auf „Telegram verbinden“." });
      }
      // offset=-100: die NEUESTEN hundert Meldungen. Ohne Angabe liefert
      // Telegram die ältesten — und bei viel Betrieb stünde der Start von
      // eben noch gar nicht darin.
      const antwort = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-100&allowed_updates=${UPDATES}`);
      const daten = await antwort.json();
      if (!daten?.ok) {
        // Läuft ein Webhook, gibt Telegram über diesen Weg nichts mehr
        // heraus (409). Dann erledigt der Eingang die Verbindung selbst.
        if (/webhook/i.test(daten?.description || "")) {
          return res.status(200).json({
            verbunden: false,
            hinweis: "Tippe im Bot auf „Start“ — die Verbindung stellt sich dann von selbst her. Danach hier noch einmal prüfen.",
          });
        }
        return res.status(502).json({ error: daten?.description || "Telegram hat die Anfrage abgelehnt." });
      }

      const treffer = findeStart(daten.result, zeile.code, zeile.code_seit);
      if (!treffer) {
        return res.status(200).json({
          verbunden: false,
          hinweis: "Noch nichts angekommen. Hast du im Bot auf „Start“ getippt? Dann ein paar Sekunden warten und noch einmal prüfen.",
        });
      }
      await speichere({ chat_id: treffer.chatId, chat_name: treffer.name, verbunden_am: jetzt, code: null, code_seit: null });
      await sendeBegruessung(admin, userId, treffer.chatId);
      return res.status(200).json({ verbunden: true, chatName: treffer.name });
    }

    if (aktion === "trennen") {
      await speichere({ chat_id: null, chat_name: null, verbunden_am: null, code: null, code_seit: null });
      return res.status(200).json({ verbunden: false });
    }

    if (aktion === "einstellung") {
      const felder = {};
      if (typeof req.body.tagesauswertung === "boolean") felder.tagesauswertung = req.body.tagesauswertung;
      if (typeof req.body.followups === "boolean") felder.followups = req.body.followups;
      if (typeof req.body.buddy === "boolean") felder.buddy = req.body.buddy;
      if (typeof req.body.teamlage === "boolean") felder.teamlage = req.body.teamlage;
      if (typeof req.body.briefing === "boolean") felder.briefing = req.body.briefing;
      if (typeof req.body.einwaende === "boolean") felder.einwaende = req.body.einwaende;
      if (!Object.keys(felder).length) return res.status(400).json({ error: "Keine Einstellung angegeben." });
      await speichere(felder);
      return res.status(200).json({ ok: true, ...felder });
    }

    // Der Webhook gilt für den ganzen Bot und damit für alle
    // Organisationen — deshalb nur für den Betreiber der Academy.
    if (aktion === "webhook-einrichten" || aktion === "webhook-status" || aktion === "webhook-aus") {
      const { data: ich } = await admin.from("profiles").select("is_platform_admin").eq("id", userId).maybeSingle();
      if (!ich?.is_platform_admin) return res.status(403).json({ error: "Das richtet der Betreiber der Academy ein." });

      const geheimnis = webhookGeheimnis();
      const adresse = webhookAdresse();
      if (aktion === "webhook-aus") {
        const r = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
        const d = await r.json();
        if (!d?.ok) return res.status(502).json({ error: d?.description || "Telegram hat die Anfrage abgelehnt." });
        return res.status(200).json({ ok: true, aktiv: false });
      }
      if (aktion === "webhook-einrichten") {
        if (!adresse) return res.status(400).json({ error: "In Vercel fehlt NEXT_PUBLIC_APP_URL mit der https-Adresse der Academy." });
        if (!geheimnis) return res.status(400).json({ error: "Auf dem Server fehlt der Service-Role-Schlüssel." });
        const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: adresse,
            secret_token: geheimnis,
            allowed_updates: ["message", "my_chat_member", "channel_post"],
            drop_pending_updates: true,
          }),
        });
        const d = await r.json();
        if (!d?.ok) return res.status(502).json({ error: d?.description || "Telegram hat die Anfrage abgelehnt." });
      }
      const info = await (await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json();
      return res.status(200).json({
        ok: true,
        aktiv: !!info?.result?.url,
        adresse: info?.result?.url || null,
        wartend: info?.result?.pending_update_count ?? null,
        letzterFehler: info?.result?.last_error_message || null,
      });
    }

    if (aktion === "test") {
      if (!zeile?.chat_id) return res.status(400).json({ error: "Dein Konto ist noch nicht mit Telegram verbunden." });
      const versand = await sendeAlarm("🔔 Test aus der HB Sales Academy — die Verbindung funktioniert.", zeile.chat_id);
      if (versand?.error) return res.status(502).json({ error: `Telegram hat die Nachricht abgelehnt: ${versand.meldung || "kein Grund angegeben"}` });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unbekannte Aktion." });
  } catch (e) {
    console.error("Telegram-Verbindung fehlgeschlagen:", e.message);
    return res.status(500).json({ error: lesbar(e) });
  }
}
