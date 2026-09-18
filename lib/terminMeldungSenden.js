import { sendeAlarm } from "./alarm.js";
import { deutscheZeit } from "./terminzeit.js";

// Die Meldung einer Termin-Änderung an die Telegram-Gruppe der Organisation.
//
// An einer Stelle, weil zwei Wege dahin führen: die Termin-Seite
// (pages/api/lead-notify.js) und die Knöpfe unter der Ergebnisfrage des
// Vertriebsbuddys (lib/buddyErgebnis.js). Ein "Kunde geworden" aus Telegram
// muss in der Gruppe genauso aussehen wie eines aus der Academy — und im
// selben Kanal landen.

export const TITEL = {
  status: "🔄 Termin-Status geändert",
  ergebnis: "🎯 Termin-Ergebnis eingetragen",
  folgetermin: "📅 Folgetermin angelegt",
  bearbeitet: "✏️ Termin bearbeitet",
  geloescht: "🗑️ Termin gelöscht",
};

// Überschrift nach dem GRUND der Meldung, nicht nach der Art der Änderung:
// "Termin abgesagt" sagt mehr als "Status geändert".
export const GRUND_TITEL = {
  verschoben: "🕐 Termin verschoben",
  abgesagt: "❌ Termin abgesagt",
  geloescht: "🗑️ Termin gelöscht",
  folgetermin: "📅 Folgetermin angelegt",
  kunde: "🎉 Kunde geworden",
};

export function terminMeldungText({ lead, grund, ereignis, beschreibung = "", wer = "", appUrl = "" }) {
  const terminDeutsch = lead.appointment_at ? `${deutscheZeit(lead.appointment_at)} Uhr` : "kein Zeitpunkt";
  // Nach dem Löschen führt der Link ins Leere — dann weglassen.
  const link = appUrl && ereignis !== "geloescht" ? `${appUrl}/termine?leadId=${lead.id}` : null;
  return [
    `${GRUND_TITEL[grund] || TITEL[ereignis]}: ${lead.name}` + (lead.company ? ` (${lead.company})` : ""),
    beschreibung || null,
    `Von ${wer || "Ein Teammitglied"}`,
    ``,
    `Termin: ${terminDeutsch}`,
    link ? `\n${link}` : null,
  ].filter((z) => z !== null).join("\n");
}

/**
 * Die Meldung verschicken.
 *
 * Ein Abschluss geht in den Abschluss-Kanal, wenn es einen gibt
 * (migration_160). Er lag vorher zwischen Verschiebungen und Absagen — die
 * einzige Meldung, auf die ein Vertriebsteam hinarbeitet, stand zwischen
 * lauter Organisatorischem.
 */
export async function sendeTerminMeldung(admin, { orgId, lead, grund, ereignis, beschreibung = "", wer = "" }) {
  if (!orgId || !lead) return { gemeldet: false };
  const { data: org } = await admin.from("organizations")
    .select("telegram_chat_id, telegram_abschluss_chat_id").eq("id", orgId).maybeSingle();
  const kanal = (grund === "kunde" && org?.telegram_abschluss_chat_id) || org?.telegram_chat_id;
  if (!kanal) return { gemeldet: false };
  const text = terminMeldungText({
    lead, grund, ereignis, beschreibung, wer, appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  });
  await sendeAlarm(text, kanal);
  return { gemeldet: true };
}
