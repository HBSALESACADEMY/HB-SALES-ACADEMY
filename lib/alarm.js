// Störungsmeldungen an Telegram.
//
// Bewusst NICHT per E-Mail: der E-Mail-Versand ist selbst einer der
// überwachten Teile — eine Warnung darüber käme genau dann nicht an, wenn man
// sie am dringendsten braucht.
//
// Einrichtung (einmalig, siehe README): In Telegram den @BotFather anschreiben,
// mit /newbot einen Bot anlegen, den Schlüssel als TELEGRAM_BOT_TOKEN in
// Vercel hinterlegen. Dann dem eigenen Bot einmal schreiben und die eigene
// Chat-ID als TELEGRAM_CHAT_ID hinterlegen.
export async function sendeAlarm(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("Alarm übersprungen (Telegram nicht eingerichtet):", text);
    return { skipped: true };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_notification: false }),
    });
    if (!res.ok) {
      console.error("Alarm konnte nicht gesendet werden:", res.status, await res.text());
      return { error: true };
    }
    return { ok: true };
  } catch (e) {
    console.error("Alarm konnte nicht gesendet werden:", e.message);
    return { error: true };
  }
}
