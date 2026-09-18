import { willkommensText, buddyErklaerung } from "./telegramPersoenlich.js";
import { sendeAlarm } from "./alarm.js";
import { aktiveOrgId } from "./aktiveOrgServer.js";
import { istFuehrungsrolle } from "./rollen.js";

/**
 * Die Begrüssung zusammenstellen — mit dem Namen DER Organisation, in der
 * die Person gerade arbeitet (Firmencode, nicht Heimat-Organisation).
 *
 * Liegt hier und nicht in einer Route, weil zwei Wege zum Verbinden führen:
 * der Knopf in den Einstellungen und der Webhook, wenn jemand im Bot auf
 * "Start" tippt (pages/api/telegram-eingang.js). Beide sollen dieselbe
 * Nachricht schicken.
 *
 * Scheitert etwas davon, geht die Nachricht trotzdem raus: eine Begrüssung
 * ohne Firmennamen ist besser als gar keine.
 */
async function wer(admin, userId) {
  let organisation = "";
  let istLeitung = false;
  let imOnboarding = false;
  let name = "";
  try {
    const { data: profil } = await admin.from("profiles")
      .select("id, full_name, role, is_admin, is_platform_admin, organization_id").eq("id", userId).maybeSingle();
    name = profil?.full_name || "";
    istLeitung = istFuehrungsrolle(profil);
    const orgId = await aktiveOrgId(admin, profil, userId);
    if (orgId) {
      const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
      organisation = org?.name || "";
    }
    // limit(1) statt maybeSingle: Wer per Firmencode in zwei Organisationen
    // ein Onboarding hat, bekäme sonst einen Fehler statt einer Antwort.
    const { data: zuweisungen } = await admin.from("onboarding_zuweisungen")
      .select("id").eq("user_id", userId).is("abgeschlossen_am", null).limit(1);
    imOnboarding = !!zuweisungen?.length;
  } catch (e) {
    console.error("Begrüssung unvollständig:", e.message);
  }
  return { organisation, name, istLeitung, imOnboarding };
}

export async function begruessung(admin, userId) {
  const w = await wer(admin, userId);
  return willkommensText({ ...w, appUrl: process.env.NEXT_PUBLIC_APP_URL || "" });
}

/**
 * Begrüssung und direkt danach die Erklärung des Vertriebsbuddys —
 * zwei Nachrichten, in dieser Reihenfolge.
 */
export async function sendeBegruessung(admin, userId, chatId) {
  const w = await wer(admin, userId);
  const erste = await sendeAlarm(willkommensText({ ...w, appUrl: process.env.NEXT_PUBLIC_APP_URL || "" }), chatId);
  await sendeAlarm(buddyErklaerung({ istLeitung: w.istLeitung }), chatId);
  return erste;
}
