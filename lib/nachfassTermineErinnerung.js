import { sendEmail } from "./email.js";
import { willMeldung } from "./benachrichtigungen.js";
import { berlinHeute, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";
import { gruppiereNach, faelligeFollowUpsMail, empfaengerVon } from "./nachfassMail.js";

// Erinnert an fällige Nachfass-Termine.
//
// Läuft im Tagesbericht mit und nicht als eigener Auftrag: Vercel erlaubt
// im Hobby-Tarif nur zwei Cron-Läufe. Das passt auch inhaltlich — es ist
// derselbe Morgenblick auf das, was heute ansteht.
//
// Per Mail an die zuständige Person, NICHT an Telegram: Ein Follow-up aus
// dem E-Mail-Marketing geht eine Person an, nicht die ganze Gruppe.
//
// Erinnert wird EINMAL je Eintrag. Eine Erinnerung, die täglich erneut
// kommt, liest nach drei Tagen niemand mehr, und dann geht auch die erste
// unter, auf die es ankam.
export async function erinnereAnNachfassTermine(admin, jetzt = new Date()) {
  // Bis zum Ende des heutigen Tages IN BERLIN: die Erinnerung läuft
  // morgens, und ein Rückruf um 15 Uhr soll nicht erst am Folgetag
  // gemeldet werden.
  //
  // Die Zone ist hier keine Feinheit. Der Server läuft in UTC (siehe
  // lib/woche.js); mit einem Tagesende nach Serverzeit fiele ein Rückruf,
  // der für 00:30 Berlin eingetragen ist, in der Sommerzeit auf den
  // Vortag — und würde einen Tag zu früh gemeldet.
  const bis = tagesBeginnZeitpunkt(tagPlus(berlinHeute(jetzt), 1));

  const { data: faellig } = await admin.from("nachfass_termine")
    .select("id, titel, faellig_am, zustaendig, organization_id")
    .is("erledigt_am", null).is("erinnert_am", null)
    .lt("faellig_am", bis)
    .order("faellig_am", { ascending: true })
    .limit(500);

  if (!faellig?.length) return { erinnert: 0 };

  // Je Person eine Mail statt je Eintrag eine: fünf einzelne Mails
  // hintereinander liest niemand als Liste.
  const jePerson = gruppiereNach(faellig, "zustaendig");
  const { adressen, profile } = await empfaengerVon(admin, [...jePerson.keys()]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  let erinnert = 0;
  for (const [person, liste] of jePerson) {
    const adresse = adressen.get(person);
    // Wer diese Mails abbestellt hat, bekommt keine — der Eintrag gilt
    // trotzdem als erinnert, sonst käme beim Wiedereinschalten alles
    // Liegengebliebene auf einmal.
    if (adresse && willMeldung(profile.get(person), "aufgaben")) {
      const versand = await sendEmail({ to: adresse, ...faelligeFollowUpsMail(liste, appUrl) });
      // Gescheitert: nicht vermerken, morgen noch einmal — besser, als die
      // Erinnerung still zu verlieren.
      if (versand?.error) continue;
    }

    await admin.from("nachfass_termine")
      .update({ erinnert_am: jetzt.toISOString() })
      .in("id", liste.map((n) => n.id));
    erinnert += liste.length;
  }

  return { erinnert };
}
