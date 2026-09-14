import { brauchtNachfassen } from "./marketingVorlage.js";
import { sendEmail } from "./email.js";
import { willMeldung } from "./benachrichtigungen.js";
import { gruppiereNach, wartendeKontakteMail, empfaengerVon } from "./nachfassMail.js";

// Erinnert daran, dass eine verschickte Mail ohne Antwort liegt.
//
// Läuft im Tagesbericht mit und nicht als eigener Auftrag: Vercel erlaubt im
// Hobby-Tarif nur zwei Cron-Läufe. Das ist keine Notlösung, sondern passt —
// beides ist derselbe Morgenblick auf das, was liegengeblieben ist.
//
// Per Mail an die Person, der der Kontakt gehört, NICHT an Telegram: Das
// Follow-up aus dem E-Mail-Marketing macht eine Person, nicht die Gruppe.
//
// Erinnert wird EINMAL je Kontakt. Eine Erinnerung, die täglich erneut
// kommt, liest nach drei Tagen niemand mehr, und dann geht auch die erste
// unter, auf die es ankam.
export async function erinnereAnNachfassen(admin, jetzt = new Date()) {
  const { data: kontakte } = await admin.from("email_kontakte")
    .select("id, name, firma, email, organization_id, user_id, verschickt_am, status, erinnert_am")
    .eq("status", "verschickt").is("erinnert_am", null).limit(500);

  const offen = (kontakte || []).filter((k) => brauchtNachfassen(k, jetzt));
  if (!offen.length) return { erinnert: 0 };

  // Wer schon ein Nachfassen eingetragen hat, bekommt hier keine zweite
  // Mahnung (migration_156).
  //
  // Das ist der Kern: diese Meldung ist das Sicherheitsnetz für Kontakte,
  // um die sich niemand gekümmert hat. Steht der Rückruf im Kalender, hat
  // sich jemand gekümmert — dann ist die Meldung keine Hilfe mehr, sondern
  // die zweite Nachricht zur selben Sache. Und die eine Meldung, auf die
  // es ankommt, geht in solchem Rauschen unter.
  const { data: geplant } = await admin.from("nachfass_termine")
    .select("kontakt_id").is("erledigt_am", null)
    .in("kontakt_id", offen.map((k) => k.id));
  const versorgt = new Set((geplant || []).map((n) => n.kontakt_id));

  const faellig = offen.filter((k) => !versorgt.has(k.id));
  if (!faellig.length) return { erinnert: 0 };

  // Je Person eine Mail statt je Kontakt eine.
  const jePerson = gruppiereNach(faellig, "user_id");
  const { adressen, profile } = await empfaengerVon(admin, [...jePerson.keys()]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  let erinnert = 0;
  for (const [person, liste] of jePerson) {
    const adresse = adressen.get(person);
    if (adresse && willMeldung(profile.get(person), "aufgaben")) {
      const versand = await sendEmail({ to: adresse, ...wartendeKontakteMail(liste, jetzt, appUrl) });
      // Gescheitert: nicht vermerken, morgen noch einmal.
      if (versand?.error) continue;
    }

    await admin.from("email_kontakte")
      .update({ erinnert_am: jetzt.toISOString() })
      .in("id", liste.map((k) => k.id));
    erinnert += liste.length;
  }

  return { erinnert };
}
