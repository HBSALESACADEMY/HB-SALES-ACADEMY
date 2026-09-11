import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { istFuehrungsrolle } from "../../../lib/rollen";

// Welche Telegram-Gruppen der Bot kennt — samt ihrer Kennung.
//
// Der Grund für diese Route: Ohne sie lautet die Anleitung "ruf
// api.telegram.org/bot SCHLÜSSEL /getUpdates im Browser auf". Das heisst,
// den Bot-Schlüssel in eine Adresszeile zu tippen, wo er im Verlauf stehen
// bleibt. Für eine Kennung, die man einmal braucht, ist das ein
// schlechter Tausch.
//
// Der Schlüssel bleibt deshalb auf dem Server. Heraus kommen nur Name, Art
// und Kennung der Chats — niemals der Schlüssel selbst.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("role, is_admin, is_platform_admin").eq("id", auth.user.id).maybeSingle();
  if (!istFuehrungsrolle(profil)) {
    return res.status(403).json({ error: "Diese Suche ist der Leitung vorbehalten." });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(503).json({ error: "Für diese Academy ist kein Telegram-Bot eingerichtet (TELEGRAM_BOT_TOKEN fehlt)." });

  try {
    // my_chat_member ist der wichtigste Typ: er kommt, sobald der Bot einer
    // Gruppe HINZUGEFÜGT wird. Ohne ihn müsste erst jemand in der Gruppe
    // schreiben — und bei eingeschaltetem Datenschutz sieht der Bot davon
    // nur Nachrichten, die ihn erwähnen.
    const antwort = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates`
      + `?limit=100&allowed_updates=${encodeURIComponent(JSON.stringify(["message", "my_chat_member", "channel_post"]))}`,
    );
    const daten = await antwort.json();
    if (!daten?.ok) {
      return res.status(502).json({ error: daten?.description || "Telegram hat die Anfrage abgelehnt." });
    }

    const chats = new Map();
    (daten.result || []).forEach((u) => {
      const chat = u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat;
      if (!chat?.id) return;
      chats.set(String(chat.id), {
        id: String(chat.id),
        titel: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || "Ohne Namen",
        art: chat.type,
      });
    });

    return res.status(200).json({ chats: [...chats.values()] });
  } catch (e) {
    console.error("Telegram-Chats konnten nicht geladen werden:", e.message);
    return res.status(500).json({ error: e.message || "Die Suche ist fehlgeschlagen." });
  }
}
