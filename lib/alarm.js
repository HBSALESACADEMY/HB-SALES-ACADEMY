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
// zielChat: ohne Angabe geht die Nachricht an den Betreiber-Chat
// (TELEGRAM_CHAT_ID). Termin-Benachrichtigungen übergeben stattdessen den
// Chat der jeweiligen Organisation — die gehören dem Kunden, nicht uns.
function kurzeMeldung(rumpf) {
  try {
    const daten = JSON.parse(rumpf);
    return daten?.description || String(rumpf).slice(0, 300);
  } catch (e) {
    return String(rumpf || "").slice(0, 300);
  }
}

export async function sendeAlarm(text, zielChat) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = zielChat || process.env.TELEGRAM_CHAT_ID;
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
      const rumpf = await res.text();
      console.error("Alarm konnte nicht gesendet werden:", res.status, rumpf);
      // Den Wortlaut von Telegram mitgeben, nicht nur ein Fehler-Flag.
      // "chat not found" und "bot was kicked" sind verschiedene Probleme
      // mit verschiedenen Lösungen; ohne den Text sucht man an der
      // falschen Stelle.
      return { error: true, status: res.status, meldung: kurzeMeldung(rumpf) };
    }
    return { ok: true };
  } catch (e) {
    console.error("Alarm konnte nicht gesendet werden:", e.message);
    return { error: true, meldung: e.message };
  }
}
