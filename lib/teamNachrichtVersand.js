import { sendePersoenlich } from "./telegramPersoenlich.js";
import { leseNachricht, nachrichtText } from "./teamNachricht.js";

// Der Versand der Team-Nachricht. Das Prüfen und der Text stehen in
// lib/teamNachricht.js — die Einstellungen-Seite lädt nur den.

/**
 * Verschicken.
 *
 * @param orgId       Die aktive Organisation der Leitung. Ohne sie geht nichts
 *                    raus — eine Nachricht an alle Organisationen gibt es hier
 *                    nicht, auch nicht für den Betreiber.
 * @param nurFuer     Eine einzelne Person statt des ganzen Teams. Sie muss
 *                    trotzdem in dieser Organisation sein: Die Prüfung
 *                    darunter gilt für beide Wege.
 * @param hoechstens  Sicherheitsnetz gegen einen Versand, der ausser Kontrolle
 *                    läuft.
 */
export async function sendeTeamNachricht(admin, { text = "", von = "", orgId = null, nurFuer = null, hoechstens = 200 } = {}) {
  const gelesen = leseNachricht(text);
  if (gelesen.fehler) return { gesendet: 0, grund: gelesen.fehler };
  if (!orgId) return { gesendet: 0, grund: "Keine Organisation gefunden." };

  let abfrage = admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id").not("chat_id", "is", null).limit(hoechstens);
  if (nurFuer) abfrage = abfrage.eq("user_id", nurFuer);
  const { data, error } = await abfrage;
  if (error) return { gesendet: 0, grund: error.message };
  if (!(data || []).length) return { gesendet: 0 };

  const { data: profile } = await admin.from("profiles")
    .select("id, organization_id").in("id", data.map((v) => v.user_id));
  const orgVon = new Map((profile || []).map((p) => [p.id, p.organization_id]));
  const offen = data.filter((v) => orgVon.get(v.user_id) === orgId);
  if (!offen.length) return { gesendet: 0 };

  const fertig = nachrichtText({ text: gelesen.text, von });
  let gesendet = 0;
  for (const v of offen) {
    const versand = await sendePersoenlich(admin, v, fertig);
    if (versand?.ok) gesendet += 1;
  }
  return { gesendet, empfaenger: offen.length };
}
