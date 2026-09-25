import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { baueTagesbericht } from "../../../lib/tagesbericht";
import { sendeAlarm } from "../../../lib/alarm";
import { erinnereAnNachfassen } from "../../../lib/nachfassErinnerung";
import { erinnereAnNachfassTermine } from "../../../lib/nachfassTermineErinnerung";
import { erinnereAnBestaetigungen } from "../../../lib/bestaetigungErinnerung";
import { sendeTagesauswertungen } from "../../../lib/tagesauswertungVersand";
import { erinnereAnOnboarding } from "../../../lib/onboardingErinnerung";
import { sendeWochenimpulse, holeAntworten, fasseWochenZusammen, schickeUebungen } from "../../../lib/buddy";
import { istImpulsTag } from "../../../lib/wochenimpuls";
import { sendeTeamlage } from "../../../lib/teamlageVersand";
import { briefingUmAcht } from "../../../lib/buddyBriefing";
import { berlinStunde, berlinHeute } from "../../../lib/woche";
import { darfSenden } from "../../../lib/tagesLauf";
import { letzterLauf, merkeLauf } from "../../../lib/tagesLaufSpeicher";
import { neuesBudget, laufeSchritte } from "../../../lib/zeitbudget";

// Der Morgenlauf: alles, was zwischen 8 und 9 Uhr deutscher Zeit raus muss.
//
// Zur Uhrzeit: Vercel garantiert im Hobby-Tarif nur die Stunde, nicht die
// Minute. Der Auftrag "0 7 * * *" lief am 24.09.2026 um 7:49 UTC, die
// Nachricht kam also um 9:49. Weil Vercel in UTC rechnet und Deutschland die
// Uhr umstellt, trifft dieselbe Einstellung im Sommer die 9 und im Winter
// die 8 — beide Stunden sind erlaubt (lib/tagesLauf.js).
//
// ZUR REIHENFOLGE, und das ist der wichtigste Teil dieser Datei:
//
// Am 25.09.2026 starb dieser Lauf um 9:49 nach 60 Sekunden mit einem 504.
// Die Guten-Morgen-Nachricht war da noch nicht raus — sie stand an fünfter
// Stelle, hinter dem Bericht an den Betreiber und drei Erinnerungen. Am Tag
// davor war sie um 9:49 gerade noch durchgekommen; der Lauf lag also längst
// am Limit, und niemand konnte es sehen.
//
// Deshalb stehen die Schritte jetzt nach einer Frage sortiert: Wen trifft
// es, wenn dieser Schritt ausfällt? Die Nachricht an zehn Vertriebler kommt
// vor dem Bericht an den Betreiber. Und die Wartungsarbeit — Webhook,
// Bot-Befehle, alte Rollenspiele, Aufnahmen — ist ganz aus diesem Lauf
// heraus: Sie liegt im Aufräumlauf um 6 Uhr UTC, der Zeit über hat.
//
// Der Lauf hört ausserdem von selbst auf, bevor Vercel ihn abschneidet: Ein
// geordneter Abbruch sagt in der Antwort und per Telegram, was offen blieb.
// Ein 504 sagt nichts.
export const config = { maxDuration: 60 };

// Die Sperre gilt NUR für den Bericht an den Betreiber. Alles andere in
// diesem Lauf merkt sich je Person, was schon raus ist (auswertung_fuer,
// briefing_fuer) — diese Schritte dürfen und sollen ein zweites Mal laufen,
// damit ein abgeschnittener Lauf nachgeholt werden kann. Eine Sperre über
// den ganzen Lauf hätte genau das verhindert.
const AUFTRAG = "tagesbericht";

export default async function handler(req, res) {
  const erwartet = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || req.headers.authorization !== erwartet) {
    return res.status(401).json({ error: "Nicht autorisiert." });
  }

  const admin = getAdminSupabase();
  const budget = neuesBudget();

  // "force" erlaubt einen Testlauf ausserhalb der Morgenstunden.
  const force = req.query.force === "1";
  const stunde = berlinStunde();
  const heute = berlinHeute();
  const { senden, grund } = darfSenden({ stunde, heute, force });
  if (!senden) return res.status(200).json({ uebersprungen: true, grund });

  // Kam der Bericht an den Betreiber heute schon raus? Der Zugriff darf den
  // Lauf nie aufhalten: Eine Vorsichtsmassnahme gegen doppelte Nachrichten
  // darf nicht zur Ursache für gar keine werden.
  let berichtSchonRaus = false;
  try {
    berichtSchonRaus = (await letzterLauf(admin, AUFTRAG)).tag === heute;
  } catch (e) {
    console.error("Cron-Sperre nicht lesbar, der Bericht geht trotzdem raus:", e.message);
  }

  const schritte = [
    // 1. Die Guten-Morgen-Nachricht mit den Zahlen von gestern. Sie geht an
    //    jede Person mit verbundenem Telegram und ist das, was am Morgen
    //    tatsächlich gelesen wird.
    { name: "tagesauswertungen", braucht: 12000, lauf: () => sendeTagesauswertungen(admin) },
    // 2. Die Termine des Tages und die offenen Ergebnisse von gestern.
    { name: "briefings", braucht: 10000, lauf: () => briefingUmAcht(admin) },
    // 3. Die Termine von MORGEN ohne Bestätigung. Morgen und nicht heute:
    //    wer erst am Terminmorgen erfährt, dass niemand bestätigt hat, kann
    //    nichts mehr retten.
    { name: "bestaetigungen", braucht: 6000, lauf: () => erinnereAnBestaetigungen(admin) },
    // 4. Nachfass-Termine, die heute dran sind — per Mail an die zuständige
    //    Person. Sie stehen im Kalender, aber wer morgens nicht hineinsieht,
    //    findet sie erst abends.
    { name: "nachfassTermine", braucht: 6000, lauf: () => erinnereAnNachfassTermine(admin) },
    // 5. Freitags: Rückblick auf die Woche, neuer Impuls, Lage im Team. An
    //    einen Tag gebunden — fällt es aus, ist es eine Woche weg.
    {
      name: "wochenimpuls", braucht: 14000, wenn: () => istImpulsTag(),
      lauf: async () => {
        // Erst die Woche auswerten, dann der neue Impuls: So kann er an die
        // Vorwoche anknüpfen.
        const rueckblicke = await fasseWochenZusammen(admin);
        const impulse = await sendeWochenimpulse(admin);
        const lage = await sendeTeamlage(admin);
        return { rueckblicke: rueckblicke.erstellt || 0, impulse: impulse.gesendet || 0, teamlage: lage.gesendet || 0 };
      },
    },
    // 6. Die Übung zur Lektion von gestern.
    { name: "uebungen", braucht: 6000, lauf: () => schickeUebungen(admin) },
    // 7. Welche Marketing-Mails ohne Antwort liegen.
    { name: "nachfassen", braucht: 6000, lauf: () => erinnereAnNachfassen(admin) },
    // 8. Der Bericht an den Betreiber. Erst hier, weil ihn eine Person liest
    //    und die Vertriebsnachrichten zehn — und weil er sich jederzeit auf
    //    der Statusseite von Hand auslösen lässt.
    {
      name: "tagesbericht", braucht: 8000, wenn: () => force || !berichtSchonRaus,
      lauf: async () => {
        const { text } = await baueTagesbericht(admin);
        await sendeAlarm(text);
        // Der Vermerk NACH dem Versand: Stirbt der Lauf davor, soll ein
        // zweiter Aufruf den Bericht nachholen können.
        if (!force) await merkeLauf(admin, AUFTRAG, heute);
        return { gesendet: true };
      },
    },
    // 9. Überfällige Onboarding-Schritte melden, fertige abschliessen.
    { name: "onboarding", braucht: 5000, lauf: () => erinnereAnOnboarding(admin) },
    // 10. Antworten aus Telegram nachholen. Im Normalfall kommen sie über
    //     den Webhook sofort an — das hier ist nur die Sicherheitsleine.
    { name: "antworten", braucht: 5000, lauf: () => holeAntworten(admin, { erzwingen: true }) },
  ];

  const { ergebnisse, offen, fehler, dauerMs } = await laufeSchritte(schritte, budget);

  // Blieb etwas liegen, muss es gemeldet werden — sonst fällt ein Schritt
  // wochenlang aus und niemand erfährt davon. Nicht bei einem Testlauf.
  if (offen.length && !force) {
    await sendeAlarm(`⚠️ Morgenlauf: Die Zeit reichte nicht für ${offen.join(", ")}. Gelaufen in ${Math.round(dauerMs / 1000)} s.`);
  }

  return res.status(200).json({ ok: true, dauerMs, offen, fehler, ...ergebnisse });
}
