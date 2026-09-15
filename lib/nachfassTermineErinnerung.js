import { sendEmail } from "./email.js";
import { willMeldung } from "./benachrichtigungen.js";
import { berlinHeute, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";
import { gruppiereNach, faelligeFollowUpsMail, faelligeFollowUpsText, empfaengerVon } from "./nachfassMail.js";
import { ladeVerknuepfungen, sendePersoenlich } from "./telegramPersoenlich.js";

// Erinnert an fällige Nachfass-Termine.
//
// Läuft im Tagesbericht mit und nicht als eigener Auftrag: Vercel erlaubt
// im Hobby-Tarif nur zwei Cron-Läufe. Das passt auch inhaltlich — es ist
// derselbe Morgenblick auf das, was heute ansteht.
//
// An die zuständige Person — per Mail und, wer Telegram verbunden hat, als
// persönliche Nachricht. NICHT an eine Telegram-Gruppe: Ein Follow-up aus
// dem E-Mail-Marketing geht eine Person an, nicht das ganze Team.
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
  const telegram = await ladeVerknuepfungen(admin, [...jePerson.keys()]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  let erinnert = 0;
  for (const [person, liste] of jePerson) {
    // Wer beides abbestellt hat, bekommt nichts — der Eintrag gilt trotzdem
    // als erinnert, sonst käme beim Wiedereinschalten alles Liegengebliebene
    // auf einmal.
    let versucht = false;
    let angekommen = false;
    const adresse = adressen.get(person);
    if (adresse && willMeldung(profile.get(person), "aufgaben")) {
      versucht = true;
      const versand = await sendEmail({ to: adresse, ...faelligeFollowUpsMail(liste, appUrl) });
      if (!versand?.error) angekommen = true;
    }
    const chat = telegram.get(person);
    if (chat && chat.followups !== false) {
      versucht = true;
      const versand = await sendePersoenlich(admin, chat, faelligeFollowUpsText(liste, appUrl));
      if (!versand?.error) angekommen = true;
    }
    // Nirgends angekommen: nicht vermerken, morgen noch einmal — besser,
    // als die Erinnerung still zu verlieren.
    if (versucht && !angekommen) continue;

    await admin.from("nachfass_termine")
      .update({ erinnert_am: jetzt.toISOString() })
      .in("id", liste.map((n) => n.id));
    erinnert += liste.length;
  }

  return { erinnert };
}
