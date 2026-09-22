import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { sendeWochenimpulse, holeAntworten } from "../../lib/buddy";
import { sendeTeamlage } from "../../lib/teamlageVersand";
import { sendeBriefings } from "../../lib/buddyBriefing";
import { sendeErklaerungen } from "../../lib/buddyErklaerungVersand";
import { leseNachricht } from "../../lib/teamNachricht";
import { sendeTeamNachricht } from "../../lib/teamNachrichtVersand";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { stelleWebhookSicher } from "../../lib/telegramWebhook";
import { setzeBefehle } from "../../lib/telegramApi";
import { BEFEHLE } from "../../lib/buddyBefehle";
import { istFuehrungsrolle } from "../../lib/rollen";

// Der Vertriebsbuddy aus Sicht der angemeldeten Person.
//
// Fast jede Aktion betrifft ausschliesslich sie selbst: ihr eigenes
// Gespräch lesen, ihren eigenen Impuls testen, ihre eigene Einstellung
// ändern. Über diese Route kommt niemand an das Gespräch einer anderen
// Person.
//
// Zwei Aktionen verschicken an mehrere, und beide kann nur die Leitung
// auslösen, beide nur in die eigene Organisation: "erklaerung-an-alle"
// (fester Text) und "nachricht-an-team" (freier Text, mit dem Namen der
// Leitung darüber — siehe lib/teamNachricht.js).
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

    // Die Erklärung des Buddys an alle, die sie noch nicht haben.
    //
    // Nur der Betreiber der Academy: Es ist eine Nachricht an jede
    // verbundene Person, über alle Organisationen hinweg.
    if (aktion === "erklaerung-an-alle") {
      const { data: ich } = await admin.from("profiles")
        .select("role, is_admin, is_platform_admin, organization_id").eq("id", userId).maybeSingle();
      // Der Betreiber erreicht alle Organisationen, die Leitung nur ihre
      // eigene — an fremde Teams schreibt niemand.
      if (!ich?.is_platform_admin && !istFuehrungsrolle(ich)) {
        return res.status(403).json({ error: "Das verschickt die Vertriebsleitung." });
      }
      const orgId = ich?.is_platform_admin ? null : await aktiveOrgId(admin, ich, userId);
      if (!ich?.is_platform_admin && !orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });
      const ergebnis = await sendeErklaerungen(admin, { orgId, erzwingen: req.body.erneut === true });
      if (ergebnis.grund) {
        return res.status(200).json({
          ok: true, gesendet: ergebnis.gesendet || 0,
          hinweis: /erklaerung_am/.test(ergebnis.grund)
            ? "In der Datenbank fehlt noch eine Änderung (migration_176) — ohne sie käme die Erklärung jeden Tag erneut."
            : `Abgebrochen nach ${ergebnis.gesendet || 0}: ${ergebnis.grund}`,
        });
      }
      return res.status(200).json({
        ok: true, gesendet: ergebnis.gesendet || 0,
        hinweis: ergebnis.gesendet
          ? `Die Erklärung ist an ${ergebnis.gesendet} ${ergebnis.gesendet === 1 ? "Person" : "Personen"} raus.`
          : "Alle verbundenen Personen haben die Erklärung schon.",
      });
    }

    // Wer im eigenen Team überhaupt erreichbar ist — für die Auswahl beim
    // Schreiben. Heraus kommen nur Name und Kennung des Kontos, keine
    // Chat-Kennung und nichts aus einem Gespräch.
    if (aktion === "empfaenger") {
      const { data: ich } = await admin.from("profiles")
        .select("role, is_admin, is_platform_admin, organization_id").eq("id", userId).maybeSingle();
      if (!istFuehrungsrolle(ich)) return res.status(403).json({ error: "Das sieht die Leitung." });
      const orgId = await aktiveOrgId(admin, ich, userId);
      if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });
      const { data: mitglieder } = await admin.from("profiles")
        .select("id, full_name").eq("organization_id", orgId).eq("status", "approved");
      const ids = (mitglieder || []).map((m) => m.id);
      if (!ids.length) return res.status(200).json({ ok: true, empfaenger: [] });
      const { data: verknuepfungen } = await admin.from("telegram_verknuepfungen")
        .select("user_id, chat_id").in("user_id", ids).not("chat_id", "is", null);
      const verbunden = new Set((verknuepfungen || []).map((v) => v.user_id));
      return res.status(200).json({
        ok: true,
        empfaenger: (mitglieder || [])
          .filter((m) => verbunden.has(m.id))
          .map((m) => ({ id: m.id, name: m.full_name || "Unbenannt" }))
          .sort((a, b) => a.name.localeCompare(b.name, "de")),
      });
    }

    // Eine kurze Nachricht der Leitung an das eigene Team.
    //
    // Der einzige Weg, über den freier Text an mehrere Personen geht.
    // Deshalb: nur die Leitung, nur die eigene aktive Organisation, und
    // der Name der Leitung steht in der Nachricht (lib/teamNachricht.js).
    if (aktion === "nachricht-an-team") {
      const { data: ich } = await admin.from("profiles")
        .select("full_name, role, is_admin, is_platform_admin, organization_id").eq("id", userId).maybeSingle();
      if (!istFuehrungsrolle(ich)) {
        return res.status(403).json({ error: "Nachrichten an das Team verschickt die Vertriebsleitung." });
      }
      const gelesen = leseNachricht(req.body?.text);
      if (gelesen.fehler) return res.status(400).json({ error: gelesen.fehler });
      const orgId = await aktiveOrgId(admin, ich, userId);
      if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });
      // Eine einzelne Person ist erlaubt — aber nur eine aus dem eigenen
      // Haus. Die Prüfung dafür steckt in sendeTeamNachricht: Sie filtert
      // beide Wege über die Organisation.
      const nurFuer = typeof req.body?.nurFuer === "string" && req.body.nurFuer ? req.body.nurFuer : null;
      const ergebnis = await sendeTeamNachricht(admin, {
        text: gelesen.text, von: ich?.full_name || "", orgId, nurFuer,
      });
      if (ergebnis.grund) return res.status(200).json({ ok: true, gesendet: 0, hinweis: `Abgebrochen: ${ergebnis.grund}` });
      return res.status(200).json({
        ok: true, gesendet: ergebnis.gesendet || 0,
        hinweis: ergebnis.gesendet
          ? `Die Nachricht ist an ${ergebnis.gesendet} ${ergebnis.gesendet === 1 ? "Person" : "Personen"} raus.`
          : nurFuer
            ? "Diese Person hat Telegram nicht (mehr) verbunden — deshalb ging nichts raus."
            : "Niemand in deinem Team hat Telegram verbunden — deshalb ging nichts raus.",
      });
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
