import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { istFuehrungsrolle } from "../../../lib/rollen";
import { sendeAlarm } from "../../../lib/alarm";

// Eine Testnachricht in einen Telegram-Kanal.
//
// Eine falsch eingetragene Kennung merkt man sonst erst, wenn die erste
// echte Meldung ausbleibt — und weil eine ausbleibende Meldung wie "es gab
// nichts zu melden" aussieht, merkt man es womöglich nie.
//
// Der Text kommt vom Server. Herein kommt nur die Kennung des Chats, damit
// niemand über diese Route beliebige Nachrichten verschickt. Und der Bot
// kann ohnehin nur in Gruppen schreiben, in denen er Mitglied ist.
export const config = { maxDuration: 15 };

const NAMEN = {
  allgemein: "den allgemeinen Kanal",
  marketing: "den Kanal für E-Mail-Kontakte",
  bestaetigung: "den Kanal für Terminbestätigungen",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("full_name, role, is_admin, is_platform_admin").eq("id", auth.user.id).maybeSingle();
  if (!istFuehrungsrolle(profil)) {
    return res.status(403).json({ error: "Testnachrichten verschickt die Leitung." });
  }

  const chatId = String(req.body?.chatId || "").trim();
  const zweck = NAMEN[req.body?.zweck] || "diesen Kanal";
  if (!chatId) return res.status(400).json({ error: "Es ist keine Chat-ID eingetragen." });

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ error: "Für diese Academy ist kein Telegram-Bot eingerichtet (TELEGRAM_BOT_TOKEN fehlt)." });
  }

  const ergebnis = await sendeAlarm(
    `🔔 Testnachricht der HB Sales Academy für ${zweck}.\n`
    + `Ausgelöst von ${profil?.full_name || "der Leitung"}. Steht sie hier, ist die Chat-ID richtig.`,
    chatId,
  );

  // sendeAlarm meldet seinen Fehler zurück, statt zu werfen. Ihn hier zu
  // verschlucken hiesse: "verschickt" anzeigen, obwohl nichts ankam — und
  // genau dieser Fehler soll ja gefunden werden.
  if (ergebnis?.error || ergebnis?.ok === false) {
    return res.status(502).json({ error: ergebnis.meldung || ergebnis.error || "Telegram hat die Nachricht abgelehnt." });
  }
  if (ergebnis?.skipped) {
    return res.status(503).json({ error: "Telegram ist für diese Academy nicht eingerichtet." });
  }

  return res.status(200).json({ ok: true });
}
