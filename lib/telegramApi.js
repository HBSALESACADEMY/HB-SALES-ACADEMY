// Die wenigen Telegram-Aufrufe neben dem reinen Senden (lib/alarm.js):
// auf einen Knopfdruck antworten, eine Nachricht nachträglich ändern und die
// Befehlsliste des Bots setzen.
//
// Fehler werden nur protokolliert, nie geworfen: Eine Quittung, die nicht
// ankommt, darf das eingetragene Ergebnis nicht rückgängig machen.

async function rufe(methode, daten, fetchFn = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, grund: "Kein Telegram-Bot eingerichtet." };
  try {
    const antwort = await (await fetchFn(`https://api.telegram.org/bot${token}/${methode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(daten),
    })).json();
    if (!antwort?.ok) console.error(`Telegram ${methode} abgelehnt:`, antwort?.description);
    return antwort || { ok: false };
  } catch (e) {
    console.error(`Telegram ${methode} fehlgeschlagen:`, e.message);
    return { ok: false, grund: e.message };
  }
}

/** Den Ladekreis am Knopf beenden — mit einem kurzen Hinweis oben im Chat. */
export function quittiereKnopf(knopfId, text = "") {
  return rufe("answerCallbackQuery", { callback_query_id: knopfId, text: String(text).slice(0, 190) });
}

/** Eine verschickte Nachricht ersetzen — hier: die Knöpfe durch das Ergebnis. */
export function ersetzeNachricht(chatId, nachrichtId, text) {
  return rufe("editMessageText", {
    chat_id: chatId, message_id: nachrichtId, text, reply_markup: { inline_keyboard: [] },
  });
}

/** Die Befehle, die Telegram beim Tippen auf "/" anbietet. */
export function setzeBefehle(befehle, fetchFn = fetch) {
  return rufe("setMyCommands", {
    commands: befehle.map((b) => ({ command: b.befehl, description: b.kurz })),
    // Ohne Sprachkennung: sonst sähe sie nur, wer Telegram auf Deutsch
    // eingestellt hat.
    scope: { type: "all_private_chats" },
  }, fetchFn);
}
