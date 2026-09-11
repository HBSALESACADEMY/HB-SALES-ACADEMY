import { sendeAlarm } from "./alarm.js";
import { morgenlisteText } from "./bestaetigung.js";
import { berlinHeute, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";

// Erinnert morgens an die Termine von MORGEN, die noch keine Bestätigung
// haben.
//
// Morgen und nicht heute: Wer erst am Terminmorgen erfährt, dass nicht
// bestätigt wurde, kann nichts mehr retten. Ein Tag Vorlauf ist der ganze
// Sinn der Meldung.
//
// Läuft im Tagesbericht mit und nicht als eigener Auftrag: Vercel erlaubt
// im Hobby-Tarif nur zwei Cron-Läufe.
export async function erinnereAnBestaetigungen(admin, jetzt = new Date()) {
  const morgen = tagPlus(berlinHeute(jetzt), 1);
  const von = tagesBeginnZeitpunkt(morgen);
  const bis = tagesBeginnZeitpunkt(tagPlus(morgen, 1));

  const { data: termine } = await admin.from("leads")
    .select("id, name, company, appointment_at, status, termin_art, schritte, created_by, organization_id")
    .is("geloescht_am", null)
    .eq("status", "geplant")
    .gte("appointment_at", von).lt("appointment_at", bis)
    .limit(500);

  if (!termine?.length) return { gemeldet: 0 };

  const proOrg = new Map();
  termine.forEach((l) => {
    if (!l.organization_id) return;
    if (!proOrg.has(l.organization_id)) proOrg.set(l.organization_id, []);
    proOrg.get(l.organization_id).push(l);
  });

  // Die Namen der Vertriebler einmal für alle Organisationen holen: ohne
  // sie steht in der Liste nicht, wer anrufen muss.
  const namen = new Map();
  const ids = [...new Set(termine.map((l) => l.created_by).filter(Boolean))];
  if (ids.length) {
    const { data: leute } = await admin.from("profiles").select("id, full_name").in("id", ids);
    (leute || []).forEach((p) => namen.set(p.id, p.full_name || "Unbenannt"));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  let gemeldet = 0;
  for (const [orgId, liste] of proOrg) {
    const text = morgenlisteText(liste, (id) => namen.get(id) || "", appUrl);
    // Kein Text heisst: alles bestätigt. Dann kommt auch keine Nachricht —
    // eine tägliche "nichts zu tun"-Meldung wird nach einer Woche
    // weggewischt, und mit ihr die, auf die es ankommt.
    if (!text) continue;

    const { data: org } = await admin.from("organizations")
      .select("telegram_chat_id, telegram_bestaetigung_chat_id").eq("id", orgId).maybeSingle();
    const kanal = org?.telegram_bestaetigung_chat_id || org?.telegram_chat_id;
    if (!kanal) continue;

    await sendeAlarm(text, kanal);
    gemeldet += 1;
  }

  return { gemeldet };
}
