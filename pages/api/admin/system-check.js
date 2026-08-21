import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { baueTagesbericht } from "../../../lib/tagesbericht";
import { sendeAlarm } from "../../../lib/alarm";

// Prüfung und Bericht auf Knopfdruck — nur für den Plattform-Betreiber.
//
// Nötig, weil im Vercel-Hobby-Tarif nur EIN täglicher Lauf möglich ist: ohne
// diese Route steht auf der Statusseite bis zum nächsten Morgen gar nichts,
// und der Telegram-Bericht lässt sich nicht nachfordern.
//
// senden=true schickt denselben Text, den auch der tägliche Lauf verschickt.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const { data: me } = await auth.client.from("profiles").select("is_platform_admin").eq("id", auth.user.id).maybeSingle();
  if (!me?.is_platform_admin) return res.status(403).json({ error: "Nur für den Plattform-Betreiber." });

  try {
    const admin = getAdminSupabase();
    const { text, system, schreibFehler } = await baueTagesbericht(admin);

    let gesendet = false;
    if (req.body?.senden) {
      const ergebnis = await sendeAlarm(text);
      // sendeAlarm überspringt sich stillschweigend, wenn Telegram nicht
      // eingerichtet ist — das muss der Knopf zurückmelden, sonst meldet er
      // Erfolg, obwohl nichts ankam.
      if (ergebnis?.skipped) {
        return res.status(200).json({ ok: true, system, jetzt: new Date().toISOString(), gesendet: false, hinweis: "Telegram ist nicht eingerichtet (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID fehlen).", schreibFehler });
      }
      gesendet = true;
    }
    // Die Serverzeit mitgeben: das Alter der Messung darf nicht von der
    // Uhr des Geräts abhängen, die auch mal ein paar Minuten vorgeht.
    return res.status(200).json({ ok: true, system, jetzt: new Date().toISOString(), gesendet, vorschau: text, schreibFehler });
  } catch (e) {
    console.error("Systemprüfung fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
