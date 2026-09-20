import { buddyErklaerung } from "./telegramPersoenlich.js";
import { sendePersoenlich } from "./telegramPersoenlich.js";
import { istFuehrungsrolle } from "./rollen.js";

// Die Erklärung des Vertriebsbuddys an alle, die sie noch nicht haben.
//
// Wer sich neu verbindet, bekommt sie direkt nach der Begrüssung
// (lib/telegramBegruessung.js). Alle, die schon vorher verbunden waren,
// haben eine Begrüssung von früher bekommen — darin gab es den Buddy in
// dieser Form noch nicht. Sie bekommen sie deshalb einmal nachgereicht.
//
// "Einmal" steht in der Datenbank, nicht im Code: erklaerung_am
// (migration_176). Ein zweiter Lauf schickt nichts mehr.

export function nachgereichtText(istLeitung = false) {
  return [
    "Kurz in eigener Sache: Ich kann inzwischen deutlich mehr als am Anfang.",
    "",
    buddyErklaerung({ istLeitung }),
  ].join("\n");
}

/**
 * @param orgId  nur an diese Organisation. Ohne Angabe: an alle — das darf
 *               ausschliesslich der Betreiber der Academy auslösen
 *               (pages/api/buddy.js).
 */
export async function sendeErklaerungen(admin, { nurFuer = null, orgId = null, erzwingen = false, hoechstens = 200 } = {}) {
  let abfrage = admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, erklaerung_am").not("chat_id", "is", null).limit(hoechstens);
  if (nurFuer) abfrage = abfrage.eq("user_id", nurFuer);
  const { data, error } = await abfrage;
  if (error) return { gesendet: 0, grund: error.message };

  let offen = (data || []).filter((v) => erzwingen || !v.erklaerung_am);
  if (!offen.length) return { gesendet: 0 };

  const { data: profile } = await admin.from("profiles")
    .select("id, role, is_admin, is_platform_admin, organization_id").in("id", offen.map((v) => v.user_id));
  const profilVon = new Map((profile || []).map((p) => [p.id, p]));
  // Die Leitung schickt an ihr eigenes Haus, nicht an fremde Organisationen.
  if (orgId) offen = offen.filter((v) => profilVon.get(v.user_id)?.organization_id === orgId);
  if (!offen.length) return { gesendet: 0 };

  let gesendet = 0;
  for (const v of offen) {
    const versand = await sendePersoenlich(admin, v, nachgereichtText(istFuehrungsrolle(profilVon.get(v.user_id))));
    if (!versand?.ok) continue;
    const { error: schreibFehler } = await admin.from("telegram_verknuepfungen")
      .update({ erklaerung_am: new Date().toISOString() }).eq("user_id", v.user_id);
    // Ohne die Spalte (migration_176) bekäme sonst jeden Morgen jeder
    // dieselbe Nachricht — dann lieber gar nicht weitermachen.
    if (schreibFehler) {
      console.error("Erklärung nicht vermerkt:", schreibFehler.message);
      return { gesendet: gesendet + 1, grund: schreibFehler.message, abgebrochen: true };
    }
    gesendet += 1;
  }
  return { gesendet };
}
