import { sendeAlarm } from "./alarm.js";
import { deutscheZeit } from "./terminzeit.js";
import { berlinHeute, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";

// Erinnert an fällige Nachfass-Termine.
//
// Läuft im Tagesbericht mit und nicht als eigener Auftrag: Vercel erlaubt
// im Hobby-Tarif nur zwei Cron-Läufe. Das passt auch inhaltlich — es ist
// derselbe Morgenblick auf das, was heute ansteht.
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
    .limit(500);

  if (!faellig?.length) return { erinnert: 0 };

  // Je Organisation eine Nachricht statt je Eintrag eine: fünf einzelne
  // Meldungen hintereinander liest niemand als Liste.
  const proOrg = new Map();
  faellig.forEach((n) => {
    if (!n.organization_id) return;
    if (!proOrg.has(n.organization_id)) proOrg.set(n.organization_id, []);
    proOrg.get(n.organization_id).push(n);
  });

  const namen = new Map();
  const ids = [...new Set(faellig.map((n) => n.zustaendig))];
  if (ids.length) {
    const { data: leute } = await admin.from("profiles").select("id, full_name").in("id", ids);
    (leute || []).forEach((p) => namen.set(p.id, p.full_name || "Unbenannt"));
  }

  let erinnert = 0;
  for (const [orgId, liste] of proOrg) {
    const { data: org } = await admin.from("organizations")
      .select("telegram_chat_id, telegram_marketing_chat_id").eq("id", orgId).maybeSingle();
    const kanal = org?.telegram_marketing_chat_id || org?.telegram_chat_id;
    if (!kanal) continue;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const zeilen = liste.slice(0, 15).map((n) =>
      `• ${n.titel} — ${deutscheZeit(n.faellig_am)} Uhr · ${namen.get(n.zustaendig) || "unbekannt"}`);
    if (liste.length > 15) zeilen.push(`… und ${liste.length - 15} weitere`);

    await sendeAlarm([
      `📌 ${liste.length} ${liste.length === 1 ? "Nachfassen ist" : "Nachfass-Termine sind"} fällig`,
      ``,
      ...zeilen,
      appUrl ? `\n${appUrl}/kalender` : null,
    ].filter((z) => z !== null).join("\n"), kanal);

    // Erst nach dem Versand vermerken: bricht die Meldung ab, kommt sie
    // morgen noch einmal — besser, als sie still zu verlieren.
    await admin.from("nachfass_termine")
      .update({ erinnert_am: jetzt.toISOString() })
      .in("id", liste.map((n) => n.id));
    erinnert += liste.length;
  }

  return { erinnert };
}
