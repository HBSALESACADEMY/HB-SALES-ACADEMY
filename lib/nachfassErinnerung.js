import { brauchtNachfassen, liegtSeitTagen, NACHFASSEN_AB_TAGEN } from "./marketingVorlage.js";
import { sendeAlarm } from "./alarm.js";

// Erinnert daran, dass eine verschickte Mail ohne Antwort liegt.
//
// Läuft im Tagesbericht mit und nicht als eigener Auftrag: Vercel erlaubt im
// Hobby-Tarif nur zwei Cron-Läufe. Das ist keine Notlösung, sondern passt —
// beides ist derselbe Morgenblick auf das, was liegengeblieben ist.
//
// Erinnert wird EINMAL je Kontakt. Eine Erinnerung, die täglich erneut
// kommt, liest nach drei Tagen niemand mehr, und dann geht auch die erste
// unter, auf die es ankam.
export async function erinnereAnNachfassen(admin, jetzt = new Date()) {
  const { data: kontakte } = await admin.from("email_kontakte")
    .select("id, name, firma, email, organization_id, user_id, verschickt_am, status, erinnert_am")
    .eq("status", "verschickt").is("erinnert_am", null).limit(500);

  const faellig = (kontakte || []).filter((k) => brauchtNachfassen(k, jetzt));
  if (!faellig.length) return { erinnert: 0 };

  // Je Organisation eine Nachricht statt je Kontakt eine: fünf einzelne
  // Meldungen hintereinander liest niemand als Liste.
  const proOrg = new Map();
  faellig.forEach((k) => {
    if (!k.organization_id) return;
    if (!proOrg.has(k.organization_id)) proOrg.set(k.organization_id, []);
    proOrg.get(k.organization_id).push(k);
  });

  let erinnert = 0;
  for (const [orgId, liste] of proOrg) {
    const { data: org } = await admin.from("organizations")
      .select("telegram_chat_id, telegram_marketing_chat_id").eq("id", orgId).maybeSingle();
    const kanal = org?.telegram_marketing_chat_id || org?.telegram_chat_id;
    if (!kanal) continue;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const zeilen = liste.slice(0, 15).map((k) => {
      const tage = liegtSeitTagen(k.verschickt_am, jetzt);
      return `• ${k.name}${k.firma ? ` (${k.firma})` : ""} — seit ${tage} Tagen ohne Antwort`;
    });
    if (liste.length > 15) zeilen.push(`… und ${liste.length - 15} weitere`);

    await sendeAlarm([
      `📮 ${liste.length} ${liste.length === 1 ? "Kontakt wartet" : "Kontakte warten"} auf Nachfassen`,
      `Verschickt vor mindestens ${NACHFASSEN_AB_TAGEN} Tagen, ohne Ergebnis:`,
      ``,
      ...zeilen,
      appUrl ? `\n${appUrl}/email-marketing` : null,
    ].filter((z) => z !== null).join("\n"), kanal);

    // Erst nach dem Versand vermerken: bricht die Meldung ab, kommt sie
    // morgen noch einmal — das ist besser, als sie still zu verlieren.
    await admin.from("email_kontakte")
      .update({ erinnert_am: jetzt.toISOString() })
      .in("id", liste.map((k) => k.id));
    erinnert += liste.length;
  }

  return { erinnert };
}
