import { alleZeilen } from "./alleZeilen.js";
import { zaehleTage } from "./tagesauswertung.js";
import { tagPlus, tagesBeginnZeitpunkt } from "./woche.js";

// Die Tageszahlen je Person aus der Datenbank — für die tägliche Auswertung
// und für den Wochenimpuls des Vertriebsbuddys.
//
// An einer Stelle, weil beide dieselben Zahlen meinen. Zwei Ladewege hätten
// unweigerlich zwei verschiedene Wahrheiten ergeben: morgens "62 Anwahlen",
// freitags "58".

async function ladeTermine(admin, von) {
  // Welche Termine einen der Tage betreffen können: deren Termin ab dem
  // ersten Tag liegt (auch die weitergerückten — ihr neuer Termin liegt
  // später als der alte) oder die ab dann Kunde wurden.
  const mitKunde = await alleZeilen(() => admin.from("leads")
    .select("id, created_by, termin_art, status, appointment_at, stufen_verlauf, schritte, kein_kundentermin, kunde_am")
    .is("geloescht_am", null)
    .or(`appointment_at.gte.${von},kunde_am.gte.${von}`)
    .order("id"));
  if (!mitKunde.error) return mitKunde.data;

  // Ohne migration_165 gibt es kunde_am nicht. Dann eben ohne die neuen
  // Kunden — die übrigen Zahlen stimmen trotzdem.
  const ohne = await alleZeilen(() => admin.from("leads")
    .select("id, created_by, termin_art, status, appointment_at, stufen_verlauf, schritte, kein_kundentermin")
    .is("geloescht_am", null)
    .gte("appointment_at", von)
    .order("id"));
  return ohne.data || [];
}

/** @returns Map<tag, Map<userId, zahlen>> — für genau die übergebenen Tage. */
export async function zahlenFuerTage(admin, tage = []) {
  const sortiert = [...new Set(tage)].sort();
  if (!sortiert.length) return zaehleTage({}, []);

  const von = tagesBeginnZeitpunkt(sortiert[0]);
  const bis = tagesBeginnZeitpunkt(tagPlus(sortiert[sortiert.length - 1], 1));

  const [anrufe, termine, mails, followUps] = await Promise.all([
    alleZeilen(() => admin.from("call_log_days").select("user_id, log_date, counts")
      .in("log_date", sortiert).order("user_id").order("log_date")),
    ladeTermine(admin, von),
    alleZeilen(() => admin.from("email_kontakte").select("id, user_id, verschickt_von, verschickt_am")
      .gte("verschickt_am", von).lt("verschickt_am", bis).order("id")),
    alleZeilen(() => admin.from("nachfass_termine").select("id, zustaendig, erledigt_am")
      .gte("erledigt_am", von).lt("erledigt_am", bis).order("id")),
  ]);

  return zaehleTage({
    anrufe: anrufe.data || [], termine, mails: mails.data || [], followUps: followUps.data || [],
  }, sortiert);
}
