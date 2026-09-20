import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { baueTagesbericht } from "../../../lib/tagesbericht";
import { sendeAlarm } from "../../../lib/alarm";
import { erinnereAnNachfassen } from "../../../lib/nachfassErinnerung";
import { raeumeAufnahmenAuf } from "../../../lib/aufnahmenAufraeumen";
import { erinnereAnNachfassTermine } from "../../../lib/nachfassTermineErinnerung";
import { erinnereAnBestaetigungen } from "../../../lib/bestaetigungErinnerung";
import { sendeTagesauswertungen } from "../../../lib/tagesauswertungVersand";
import { erinnereAnOnboarding } from "../../../lib/onboardingErinnerung";
import { sendeWochenimpulse, holeAntworten, fasseWochenZusammen, schickeUebungen } from "../../../lib/buddy";
import { istImpulsTag } from "../../../lib/wochenimpuls";
import { stelleWebhookSicher } from "../../../lib/telegramWebhook";
import { sendeTeamlage } from "../../../lib/teamlageVersand";
import { briefingUmAcht } from "../../../lib/buddyBriefing";
import { berlinStunde } from "../../../lib/woche";
import { setzeBefehle } from "../../../lib/telegramApi";
import { sendeErklaerungen } from "../../../lib/buddyErklaerungVersand";
import { BEFEHLE, raeumeRollenspieleAuf } from "../../../lib/buddyBefehle";

// Täglicher Überblick um 9 Uhr per Telegram: was gestern in jeder
// Kundenorganisation passiert ist, plus eine Zeile zum Systemzustand.
//
// Erledigt zugleich die Systemprüfung und meldet Störungen — im
// Vercel-Hobby-Tarif sind nur zwei Cron-Aufträge erlaubt, die je einmal
// täglich laufen. Deshalb beides in einem Lauf statt getrennt.
//
// Zur Uhrzeit: Vercel arbeitet in UTC, Deutschland wechselt zwischen Sommer-
// und Winterzeit. Der Lauf um 7 Uhr UTC trifft im Sommer 9 Uhr, im Winter
// 8 Uhr deutscher Zeit — beides wird akzeptiert. Ein Lauf zu einer ganz
// anderen Stunde (versehentlicher Aufruf) sendet dagegen nicht.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const erwartet = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || req.headers.authorization !== erwartet) {
    return res.status(401).json({ error: "Nicht autorisiert." });
  }
  // "force" erlaubt einen Testlauf ausserhalb der 9 Uhr.
  const stunde = berlinStunde();
  if (stunde !== 8 && stunde !== 9 && req.query.force !== "1") {
    return res.status(200).json({ uebersprungen: true, grund: `Lauf um ${stunde} Uhr — Bericht geht nur morgens raus` });
  }

  const admin = getAdminSupabase();
  try {
    // Der Bericht selbst liegt in lib/tagesbericht.js — derselbe Text lässt
    // sich damit auch von Hand auf der Statusseite auslösen.
    const { text } = await baueTagesbericht(admin);
    await sendeAlarm(text);

    // Im selben Lauf: welche Marketing-Mails ohne Antwort liegen. Per Mail
    // an die Person, der der Kontakt gehört — nicht an Telegram. Ein Fehler
    // dabei darf den Bericht nicht nachträglich als gescheitert dastehen
    // lassen.
    let nachfassen = { erinnert: 0 };
    try {
      nachfassen = await erinnereAnNachfassen(admin);
    } catch (e) {
      console.error("Nachfass-Erinnerung fehlgeschlagen:", e.message);
    }

    // Und die eingetragenen Nachfass-Termine, die heute dran sind — per Mail
    // an die zuständige Person. Sie stehen zwar im Kalender, aber wer
    // morgens nicht hineinschaut, sieht sie erst abends.
    let nachfassTermine = { erinnert: 0 };
    try {
      nachfassTermine = await erinnereAnNachfassTermine(admin);
    } catch (e) {
      console.error("Nachfass-Termine melden fehlgeschlagen:", e.message);
    }

    // Und die Termine von MORGEN, die noch keine Bestätigung haben. Morgen
    // und nicht heute: wer erst am Terminmorgen erfährt, dass niemand
    // bestätigt hat, kann nichts mehr retten.
    let bestaetigungen = { gemeldet: 0 };
    try {
      bestaetigungen = await erinnereAnBestaetigungen(admin);
    } catch (e) {
      console.error("Bestätigungen melden fehlgeschlagen:", e.message);
    }

    // Die persönliche Auswertung vom letzten Arbeitstag — Montag bis
    // Freitag, an alle mit verbundenem Telegram (lib/tagesauswertungVersand.js).
    let tagesauswertungen = { gesendet: 0 };
    try {
      tagesauswertungen = await sendeTagesauswertungen(admin);
    } catch (e) {
      console.error("Tagesauswertungen fehlgeschlagen:", e.message);
    }

    // Das Morgen-Briefing soll um 8 Uhr da sein. Im Winter ist dieser Lauf
    // um 8 — dann geht es hier raus. Im Sommer ist er um 9, und der
    // Aufräum-Lauf hat es um 8 schon verschickt; hier kommt dann nur noch,
    // was dort liegen blieb (lib/buddyBriefing.js, briefingUmAcht).
    let briefings = { gesendet: 0 };
    try {
      briefings = await briefingUmAcht(admin);
    } catch (e) {
      console.error("Morgen-Briefing fehlgeschlagen:", e.message);
    }

    // Überfällige Onboarding-Schritte melden, fertige abschliessen
    // (lib/onboardingErinnerung.js).
    let onboarding = { erinnert: 0, fertig: 0 };
    try {
      onboarding = await erinnereAnOnboarding(admin);
    } catch (e) {
      console.error("Onboarding-Erinnerung fehlgeschlagen:", e.message);
    }

    // Freitags der Wochenimpuls des Vertriebsbuddys, und jeden Tag die
    // Antworten aus Telegram abholen und beantworten (lib/buddy.js).
    let buddy = { impulse: 0, antworten: 0 };
    try {
      // Sorgt dafür, dass Telegram von selbst meldet — auch wenn der Bot
      // gewechselt wurde oder die Adresse der Academy sich geändert hat.
      const webhook = await stelleWebhookSicher();
      buddy.webhook = webhook.aktiv ? (webhook.gesetzt ? "neu eingerichtet" : "läuft") : webhook.grund;
      // Die Kurzbefehle (/heute, /rollenspiel …) — falls sich die Liste geändert hat.
      await setzeBefehle(BEFEHLE);
      await raeumeRollenspieleAuf(admin);
      // Einmalig: Wer schon verbunden war, bevor es den Buddy in dieser
      // Form gab, bekommt seine Erklärung nachgereicht.
      const erklaerungen = await sendeErklaerungen(admin);
      buddy.erklaerungen = erklaerungen.gesendet || 0;
      if (istImpulsTag()) {
        // Erst das Gespräch der Woche auswerten, dann den neuen Impuls —
        // so kann er an die Vorwoche anknüpfen.
        const rueckblicke = await fasseWochenZusammen(admin);
        buddy.rueckblicke = rueckblicke.erstellt || 0;
        const impulse = await sendeWochenimpulse(admin);
        buddy.impulse = impulse.gesendet || 0;
        // Und für die Leitung die Lage im Team.
        const lage = await sendeTeamlage(admin);
        buddy.teamlage = lage.gesendet || 0;
      }
      // Die Übung kommt am Tag nach der Lektion — beides zusammen liest man
      // wie einen Artikel und macht es nicht.
      const uebungen = await schickeUebungen(admin);
      buddy.uebungen = uebungen.verschickt || 0;
      const antworten = await holeAntworten(admin, { erzwingen: true });
      buddy.antworten = antworten.neu || 0;
    } catch (e) {
      console.error("Vertriebsbuddy fehlgeschlagen:", e.message);
    }

    // Fällige Aufnahmen entfernen. Auch das darf den Bericht nicht
    // nachträglich als gescheitert dastehen lassen.
    let aufgeraeumt = { geloescht: 0 };
    try {
      aufgeraeumt = await raeumeAufnahmenAuf(admin);
    } catch (e) {
      console.error("Aufnahmen aufräumen fehlgeschlagen:", e.message);
    }

    return res.status(200).json({ ok: true, nachfassen, nachfassTermine, bestaetigungen, tagesauswertungen, briefings, onboarding, buddy, aufgeraeumt });
  } catch (e) {
    console.error("Tagesbericht fehlgeschlagen:", e.message);
    await sendeAlarm("⚠️ HB Sales Academy: Der Tagesbericht konnte nicht erstellt werden — " + e.message);
    return res.status(500).json({ error: e.message });
  }
}
