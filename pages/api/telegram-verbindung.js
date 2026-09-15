import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { sendeAlarm } from "../../lib/alarm";
import { neuerVerbindungsCode, startLink, codeGueltig, findeStart, CODE_GUELTIG_MINUTEN } from "../../lib/telegramPersoenlich";

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
    // Die Kennung selbst geht nicht an den Browser — sie wird dort nicht
    // gebraucht.
    return res.status(200).json({
      eingerichtet: !!token,
      verbunden: !!zeile?.chat_id,
      chatName: zeile?.chat_name || null,
      verbundenAm: zeile?.verbunden_am || null,
      tagesauswertung: zeile ? zeile.tagesauswertung !== false : true,
      followups: zeile ? zeile.followups !== false : true,
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
      const antwort = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const bot = await antwort.json();
      if (!bot?.ok || !bot.result?.username) {
        return res.status(502).json({ error: bot?.description || "Der Telegram-Bot antwortet nicht." });
      }
      const code = neuerVerbindungsCode();
      await speichere({ code, code_seit: jetzt });
      return res.status(200).json({ code, link: startLink(bot.result.username, code), botName: bot.result.username, gueltigMinuten: CODE_GUELTIG_MINUTEN });
    }

    if (aktion === "pruefen") {
      if (!zeile?.code || !codeGueltig(zeile.code_seit)) {
        return res.status(400).json({ error: "Der Code ist abgelaufen. Tippe noch einmal auf „Telegram verbinden“." });
      }
      // offset=-100: die NEUESTEN hundert Meldungen. Ohne Angabe liefert
      // Telegram die ältesten — und bei viel Betrieb stünde der Start von
      // eben noch gar nicht darin.
      const antwort = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-100&allowed_updates=${UPDATES}`);
      const daten = await antwort.json();
      if (!daten?.ok) return res.status(502).json({ error: daten?.description || "Telegram hat die Anfrage abgelehnt." });

      const treffer = findeStart(daten.result, zeile.code, zeile.code_seit);
      if (!treffer) {
        return res.status(200).json({
          verbunden: false,
          hinweis: "Noch nichts angekommen. Hast du im Bot auf „Start“ getippt? Dann ein paar Sekunden warten und noch einmal prüfen.",
        });
      }
      await speichere({ chat_id: treffer.chatId, chat_name: treffer.name, verbunden_am: jetzt, code: null, code_seit: null });
      await sendeAlarm(
        "✅ Verbunden mit der HB Sales Academy.\n\n"
        + "Ab jetzt bekommst du hier deine Follow-up-Erinnerungen und jeden Werktag morgens deine persönliche Auswertung. "
        + "Nur du siehst diese Nachrichten.",
        treffer.chatId,
      );
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
      if (!Object.keys(felder).length) return res.status(400).json({ error: "Keine Einstellung angegeben." });
      await speichere(felder);
      return res.status(200).json({ ok: true, ...felder });
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
