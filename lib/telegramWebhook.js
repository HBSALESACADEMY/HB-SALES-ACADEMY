import { createHash } from "node:crypto";

// Der Webhook: Telegram meldet jede Nachricht sofort bei der Academy.
//
// Das Geheimnis, mit dem sich Telegram ausweist, wird aus dem
// Service-Role-Schlüssel abgeleitet und nirgends abgetippt. Damit gibt es
// keine weitere Zugangsdatei, die jemand von Hand pflegen (und verlieren)
// müsste — und ohne den Serverschlüssel lässt es sich nicht erraten.
//
// Telegram schickt es bei jeder Meldung im Kopf
// "X-Telegram-Bot-Api-Secret-Token" mit; die Route vergleicht.

// Was Telegram melden soll. callback_query sind die Knöpfe unter der
// Ergebnisfrage des Morgen-Briefings (lib/buddyBriefing.js).
export const MELDUNGSARTEN = ["message", "my_chat_member", "channel_post", "callback_query"];

export function webhookGeheimnis(schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (!schluessel) return null;
  // Telegram erlaubt 1–256 Zeichen aus A-Z, a-z, 0-9, _ und -.
  return createHash("sha256").update(`telegram-webhook:${schluessel}`).digest("hex").slice(0, 48);
}

export function webhookAdresse(appUrl = process.env.NEXT_PUBLIC_APP_URL || "") {
  const basis = String(appUrl || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(basis)) return null;   // Telegram nimmt nur https
  return `${basis}/api/telegram-eingang`;
}

/** Stimmt das mitgeschickte Geheimnis? Vergleich in konstanter Zeit. */
export function geheimnisPasst(mitgeschickt, erwartet = webhookGeheimnis()) {
  const a = String(mitgeschickt || "");
  const b = String(erwartet || "");
  if (!b || a.length !== b.length) return false;
  let gleich = 0;
  for (let i = 0; i < a.length; i += 1) gleich |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return gleich === 0;
}

/**
 * Das Wesentliche einer Telegram-Meldung — für die Ablage und die weitere
 * Verarbeitung. Alles, was die Academy nicht braucht, bleibt draussen.
 */
export function leseUpdate(update) {
  // Ein Tippen auf einen Knopf unter einer Nachricht des Buddys. Der Chat
  // steht an der Nachricht, zu der der Knopf gehört.
  const knopf = update?.callback_query || null;
  if (knopf) {
    const chat = knopf.message?.chat;
    if (!update.update_id || !chat?.id) return null;
    return {
      update_id: update.update_id,
      art: "callback_query",
      chat_id: String(chat.id),
      chat_typ: chat.type || null,
      chat_name: [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.title || null,
      text: String(knopf.data || "").slice(0, 200) || null,
      gesendet_am: new Date().toISOString(),
      knopf: {
        id: knopf.id,
        daten: String(knopf.data || ""),
        chat_id: String(chat.id),
        nachricht_id: knopf.message?.message_id || null,
        nachricht_text: String(knopf.message?.text || ""),
      },
    };
  }

  const kern = update?.message || update?.channel_post || null;
  const mitglied = update?.my_chat_member || null;
  const chat = kern?.chat || mitglied?.chat || null;
  if (!update?.update_id || !chat?.id) return null;
  return {
    update_id: update.update_id,
    art: kern ? (update.message ? "message" : "channel_post") : "my_chat_member",
    chat_id: String(chat.id),
    chat_typ: chat.type || null,
    chat_name: chat.title
      || [chat.first_name, chat.last_name].filter(Boolean).join(" ")
      || chat.username
      || null,
    text: String(kern?.text || kern?.caption || "").slice(0, 4000) || null,
    gesendet_am: kern?.date ? new Date(kern.date * 1000).toISOString() : new Date().toISOString(),
  };
}

/**
 * Den Webhook einrichten, falls er nicht schon richtig steht.
 *
 * Läuft von selbst: beim ersten Verbinden und jeden Morgen im Tageslauf.
 * Niemand muss dafür einen Knopf finden, in Supabase etwas eintragen oder
 * Plattform-Admin sein — es ist eine technische Einstellung des Bots, keine
 * Entscheidung, die jemand treffen müsste.
 *
 * fetchFn nur zum Prüfen austauschbar.
 */
export async function stelleWebhookSicher({
  token = process.env.TELEGRAM_BOT_TOKEN,
  appUrl = process.env.NEXT_PUBLIC_APP_URL || "",
  geheimnis = webhookGeheimnis(),
  fetchFn = fetch,
} = {}) {
  const adresse = webhookAdresse(appUrl);
  if (!token) return { aktiv: false, grund: "Kein Telegram-Bot eingerichtet." };
  if (!adresse) return { aktiv: false, grund: "Es fehlt die https-Adresse der Academy (NEXT_PUBLIC_APP_URL)." };
  if (!geheimnis) return { aktiv: false, grund: "Auf dem Server fehlt der Service-Role-Schlüssel." };

  try {
    const info = await (await fetchFn(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json();
    // Richtig steht er erst, wenn auch alle Meldungsarten ankommen — ein
    // Webhook von früher kannte die Knöpfe (callback_query) noch nicht, und
    // ein Tippen darauf käme nie an.
    const arten = info?.result?.allowed_updates;
    const alleArten = !Array.isArray(arten) || !arten.length || MELDUNGSARTEN.every((a) => arten.includes(a));
    if (info?.result?.url === adresse && alleArten) return { aktiv: true, schonGesetzt: true, adresse };

    const antwort = await (await fetchFn(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: adresse,
        secret_token: geheimnis,
        allowed_updates: MELDUNGSARTEN,
        // Was liegen geblieben ist, ist alt — darauf antwortet niemand mehr.
        drop_pending_updates: true,
      }),
    })).json();
    if (!antwort?.ok) return { aktiv: false, grund: antwort?.description || "Telegram hat die Anfrage abgelehnt." };
    return { aktiv: true, gesetzt: true, adresse };
  } catch (e) {
    return { aktiv: false, grund: e.message };
  }
}

/** Steckt in der Nachricht ein Verbindungs-Code ("/start HB…" oder abgetippt)? */
export function verbindungsCodeAus(text) {
  const treffer = String(text || "").toUpperCase().match(/\bHB[A-HJ-NP-Z2-9]{8}\b/);
  return treffer ? treffer[0] : null;
}

// Einmal je laufender Instanz prüfen, ob der Webhook noch richtig steht.
//
// Anlass: Ein Webhook von vor den Knöpfen meldet nur Nachrichten. Tippt
// dann jemand auf "Ja, eintragen", kommt nichts an — der Knopf dreht sich
// ewig, und niemand sieht einen Fehler. Kommt eine Nachricht herein,
// funktioniert der Webhook grundsätzlich; hier wird nur nachgezogen, was
// ihm fehlt. Das kostet eine Anfrage je Instanz, nicht je Nachricht.
let geprueft = null;

export function stelleWebhookSicherEinmal(optionen) {
  if (!geprueft) {
    geprueft = stelleWebhookSicher(optionen).catch((e) => {
      console.error("Webhook-Prüfung fehlgeschlagen:", e.message);
      return { aktiv: false, grund: e.message };
    });
  }
  return geprueft;
}

/** Nur für Tests: die Erinnerung vergessen. */
export function vergissWebhookPruefung() {
  geprueft = null;
}
