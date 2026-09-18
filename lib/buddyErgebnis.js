import { ERGEBNIS_AKTIONEN, leseKnopf } from "./buddyBriefing.js";
import { istKundeGeworden } from "./terminArt.js";
import { istFuehrungsrolle } from "./rollen.js";
import { sendeTerminMeldung } from "./terminMeldungSenden.js";
import { quittiereKnopf, ersetzeNachricht } from "./telegramApi.js";
import { sendeAlarm } from "./alarm.js";

// Ein Tippen auf einen Ergebnis-Knopf unter der Frage des Vertriebsbuddys.
//
// Der Knopf trägt nur Termin und Ergebnis. Wer getippt hat, sagt der Chat —
// und darüber die Verknüpfung, nicht der Knopf. Einen Knopf nachzubauen
// hilft deshalb niemandem: eintragen darf nur, wer den Termin angelegt hat
// oder die Leitung derselben Organisation. Das ist dieselbe Regel, die in
// der Academy für das Ergebnis gilt.

/** Darf diese Person bei diesem Termin das Ergebnis eintragen? */
export function darfEintragen(lead, profil) {
  if (!lead || !profil) return false;
  if (lead.created_by === profil.id) return true;
  return istFuehrungsrolle(profil) && !!lead.organization_id && lead.organization_id === profil.organization_id;
}

/** Die Nachricht, die an die Stelle der Frage mit den Knöpfen tritt. */
export function quittungsText(frage, aktion) {
  const a = ERGEBNIS_AKTIONEN[aktion];
  return `${String(frage || "").replace(/^❓ Wie lief es\? /, "")}\n✅ Eingetragen: ${a.label}`;
}

/**
 * @param knopf { id, daten, chat_id, nachricht_id, nachricht_text }
 */
export async function bearbeiteErgebnisKnopf(admin, knopf) {
  const auswahl = leseKnopf(knopf?.daten);
  if (!auswahl) { await quittiereKnopf(knopf?.id, "Dieser Knopf ist nicht mehr gültig."); return { ok: false }; }
  const aktion = ERGEBNIS_AKTIONEN[auswahl.aktion];

  const { data: zeilen } = await admin.from("telegram_verknuepfungen")
    .select("user_id").eq("chat_id", String(knopf.chat_id)).limit(1);
  const userId = zeilen?.[0]?.user_id;
  if (!userId) { await quittiereKnopf(knopf.id, "Dieser Chat ist nicht mehr mit der Academy verbunden."); return { ok: false }; }

  const [{ data: profil }, { data: lead }] = await Promise.all([
    admin.from("profiles").select("id, full_name, organization_id, role, is_admin, is_platform_admin").eq("id", userId).maybeSingle(),
    admin.from("leads").select("*").eq("id", auswahl.leadId).is("geloescht_am", null).maybeSingle(),
  ]);
  if (!lead) { await quittiereKnopf(knopf.id, "Diesen Termin gibt es nicht mehr."); return { ok: false }; }
  if (!darfEintragen(lead, profil)) { await quittiereKnopf(knopf.id, "Bei diesem Termin darfst du kein Ergebnis eintragen."); return { ok: false }; }

  const warSchonKunde = istKundeGeworden(lead);
  const { error } = await admin.from("leads").update(aktion.patch).eq("id", lead.id);
  if (error) {
    console.error("Ergebnis aus Telegram nicht gespeichert:", error.message);
    await quittiereKnopf(knopf.id, "Das hat nicht geklappt. Trag es bitte in der Academy ein.");
    return { ok: false, fehler: error.message };
  }

  await quittiereKnopf(knopf.id, `Eingetragen: ${aktion.label}`);
  if (knopf.nachricht_id) await ersetzeNachricht(knopf.chat_id, knopf.nachricht_id, quittungsText(knopf.nachricht_text, auswahl.aktion));

  // Ein Abschluss geht an die Gruppe — wie aus der Academy. Nur beim ersten
  // Mal: zweimal "Kunde geworden" für denselben Kunden feiert niemand.
  if (aktion.meldet && !warSchonKunde) {
    await sendeTerminMeldung(admin, {
      orgId: lead.organization_id || profil?.organization_id,
      lead: { ...lead, ...aktion.patch },
      grund: "kunde",
      ereignis: "ergebnis",
      beschreibung: "Ergebnis: Kunde geworden",
      wer: profil?.full_name || "",
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  if (aktion.naechsterTermin && appUrl) {
    await sendeAlarm(`📅 Trag den nächsten Termin mit ${lead.name} gleich ein, dann steht er im Kalender:\n${appUrl}/termine?leadId=${lead.id}`, knopf.chat_id);
  } else if (auswahl.aktion === "k") {
    await sendeAlarm(`🎉 Glückwunsch zum Abschluss! Plan gleich den Check-in in einem Monat ein — der Anruf macht aus einem Kunden eine Empfehlung.${appUrl ? `\n${appUrl}/termine?leadId=${lead.id}` : ""}`, knopf.chat_id);
  }
  return { ok: true, aktion: auswahl.aktion };
}
