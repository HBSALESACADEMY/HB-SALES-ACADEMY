import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { sendeWochenimpulse, holeAntworten } from "../../lib/buddy";
import { sendeTeamlage } from "../../lib/teamlageVersand";
import { sendeBriefings } from "../../lib/buddyBriefing";
import { stelleWebhookSicher } from "../../lib/telegramWebhook";
import { setzeBefehle } from "../../lib/telegramApi";
import { BEFEHLE } from "../../lib/buddyBefehle";
import { istFuehrungsrolle } from "../../lib/rollen";

// Der Vertriebsbuddy aus Sicht der angemeldeten Person.
//
// Jede Aktion betrifft ausschliesslich sie selbst: ihr eigenes Gespräch
// lesen, ihren eigenen Impuls testen, ihre eigene Einstellung ändern. Es
// gibt keinen Weg, über diese Route den Buddy einer anderen Person
// anzustossen oder deren Gespräch zu sehen.
export const config = { maxDuration: 60 };

const MIGRATION_FEHLT = "In der Datenbank fehlen die Tabellen für den Vertriebsbuddy (migration_168).";
const lesbar = (e) => (/buddy_|impuls_fuer/.test(e?.message || "") ? MIGRATION_FEHLT : (e?.message || "Unbekannter Fehler."));

// Fehlt migration_175, heisst die Meldung "column briefing does not exist".
const lesbarBriefing = (grund) => (/briefing/.test(grund || "")
  ? "In der Datenbank fehlt noch eine Änderung (migration_175)." : grund);

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const userId = auth.user.id;
  const admin = getAdminSupabase();

  try {
    const { data: verknuepfung, error } = await admin.from("telegram_verknuepfungen")
      .select("user_id, chat_id, buddy, impuls_fuer").eq("user_id", userId).maybeSingle();
    if (error) return res.status(500).json({ error: lesbar(error) });
    const verbunden = !!verknuepfung?.chat_id;

    if (req.method === "GET") {
      const { data: verlauf } = await admin.from("buddy_nachrichten")
        .select("id, richtung, text, created_at").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(30);
      return res.status(200).json({
        verbunden,
        buddy: verknuepfung ? verknuepfung.buddy !== false : true,
        impulsFuer: verknuepfung?.impuls_fuer || null,
        verlauf: (verlauf || []).reverse(),
      });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { aktion } = req.body || {};

    if (aktion === "einstellung") {
      if (typeof req.body.buddy !== "boolean") return res.status(400).json({ error: "Keine Einstellung angegeben." });
      const { error: schreibFehler } = await admin.from("telegram_verknuepfungen")
        .upsert({ user_id: userId, buddy: req.body.buddy, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (schreibFehler) throw schreibFehler;
      return res.status(200).json({ ok: true, buddy: req.body.buddy });
    }

    if (aktion === "test-impuls") {
      if (!verbunden) return res.status(400).json({ error: "Dein Konto ist noch nicht mit Telegram verbunden." });
      // erzwingen: Der Testknopf soll auch dienstags gehen und auch dann,
      // wenn diese Woche schon ein Impuls raus ist.
      const ergebnis = await sendeWochenimpulse(admin, { nurFuer: userId, erzwingen: true });
      if (!ergebnis.gesendet) {
        return res.status(200).json({
          ok: true, gesendet: 0,
          hinweis: ergebnis.grund
            ? `Der Impuls ging nicht raus: ${ergebnis.grund}`
            : "Der Impuls ging nicht raus. Ist der Vertriebsbuddy eingeschaltet und die Telegram-Verbindung noch gültig?",
        });
      }
      return res.status(200).json({ ok: true, gesendet: ergebnis.gesendet, woche: ergebnis.woche });
    }

    if (aktion === "test-briefing") {
      if (!verbunden) return res.status(400).json({ error: "Dein Konto ist noch nicht mit Telegram verbunden." });
      // Die Knöpfe unter der Ergebnisfrage kommen nur an, wenn der Webhook
      // sie kennt — ein älterer kannte sie nicht. Beim Testen soll das nicht
      // bis zum nächsten Morgen warten.
      await stelleWebhookSicher();
      await setzeBefehle(BEFEHLE);
      // erzwingen: auch am Wochenende und auch, wenn es heute schon raus ist.
      const ergebnis = await sendeBriefings(admin, { nurFuer: userId, erzwingen: true });
      return res.status(200).json({
        ok: true, gesendet: ergebnis.gesendet || 0,
        hinweis: ergebnis.gesendet ? null
          : ergebnis.grund ? `Das Briefing ging nicht raus: ${lesbarBriefing(ergebnis.grund)}`
            : "Heute stehen bei dir keine Termine an, und beim letzten Arbeitstag fehlt kein Ergebnis — deshalb kam nichts.",
      });
    }

    if (aktion === "test-teamlage") {
      if (!verbunden) return res.status(400).json({ error: "Dein Konto ist noch nicht mit Telegram verbunden." });
      const { data: profil } = await admin.from("profiles")
        .select("role, is_admin, is_platform_admin").eq("id", userId).maybeSingle();
      if (!istFuehrungsrolle(profil)) return res.status(403).json({ error: "Die Teamlage bekommt die Leitung." });
      const ergebnis = await sendeTeamlage(admin, { nurFuer: userId, erzwingen: true });
      return res.status(200).json({
        ok: true, gesendet: ergebnis.gesendet || 0,
        hinweis: ergebnis.gesendet ? null : (ergebnis.grund || "Es gibt noch keine Zahlen für diese Woche."),
      });
    }

    if (aktion === "abholen") {
      // Vom Testknopf erzwungen, im Hintergrund gedrosselt: Telegram gibt
      // alle Chats auf einmal heraus, eine Abfrage je Seitenaufruf wäre
      // Verschwendung.
      const ergebnis = await holeAntworten(admin, { erzwingen: !!req.body.erzwingen });
      return res.status(200).json({ ok: true, ...ergebnis });
    }

    return res.status(400).json({ error: "Unbekannte Aktion." });
  } catch (e) {
    console.error("Vertriebsbuddy fehlgeschlagen:", e.message);
    return res.status(500).json({ error: lesbar(e) });
  }
}
