import { SCHRITTE, artVon, schrittErledigt, schrittPatch, istKundentermin } from "./terminArt.js";
import { schrittZurStufe, bestaetigungsText } from "./bestaetigung.js";
import { sendeAlarm } from "./alarm.js";
import { quittiereKnopf } from "./telegramApi.js";
import { alleZeilen } from "./alleZeilen.js";
import { berlinHeute, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";
import { nurUhrzeit, DEUTSCHE_ZONE, inZone } from "./terminzeit.js";
import { sendePersoenlich } from "./telegramPersoenlich.js";

// Einen Termin über den Bot bestätigen.
//
// Die Bestätigung vor dem Termin ist der billigste Schritt im Verkauf und
// der, der am häufigsten ausfällt. Im Morgen-Briefing steht ohnehin, welcher
// Termin sie noch braucht — dann soll ein Tippen genügen, statt die Academy
// zu öffnen.
//
// Gemeldet wird danach wie aus der Academy: in den Bestätigungs-Kanal der
// Organisation, mit demselben Text (lib/bestaetigung.js).

// Wie weit nach vorn geschaut wird, wenn jemand bestätigen will. Drei
// Wochen: weiter im Voraus bestätigt niemand.
const VORSCHAU_TAGE = 21;

/** Will jemand einen Termin bestätigen, ohne zu sagen welchen? */
export function willBestaetigen(text) {
  const t = String(text || "").toLowerCase();
  return /\bbest(ä|ae)tig/.test(t) && !/\bbest(ä|ae)tigung(s|en)?\s*(kanal|gruppe)/.test(t);
}

/** Nur die Stufe, von der die Rede ist — oder null für alle. */
export function gemeinteStufe(text) {
  const t = String(text || "").toLowerCase();
  if (/\bclosing\b|\babschlussgespr/.test(t)) return "closing";
  if (/\bsetting\b|\berstgespr/.test(t)) return "erstgespraech";
  return null;
}

/** Welcher Haken bei diesem Termin ansteht — oder null. */
export function offenerSchritt(lead) {
  if (!lead || !istKundentermin(lead)) return null;
  const schritt = schrittZurStufe(artVon(lead).key);
  if (!schritt) return null;
  return schrittErledigt(lead, schritt.key) ? null : schritt;
}

/** Der Haken, der zur Stufe gehört — auch wenn er schon gesetzt ist. */
export function schrittFuer(lead) {
  return istKundentermin(lead) ? schrittZurStufe(artVon(lead).key) : null;
}

export function bestaetigungsKnopf(lead) {
  return { text: `✔️ ${lead.name.slice(0, 24)} bestätigt`, callback_data: `s:${lead.id}` };
}

/** Die Knöpfe unter dem Morgen-Briefing — nur für das, was noch offen ist. */
export function bestaetigungsKnoepfe(leads = [], hoechstens = 4) {
  const offen = leads.filter((l) => offenerSchritt(l)).slice(0, hoechstens);
  if (!offen.length) return null;
  return { inline_keyboard: offen.map((l) => [bestaetigungsKnopf(l)]) };
}

export function leseBestaetigungsKnopf(daten) {
  const treffer = String(daten || "").match(/^s:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return treffer ? treffer[1].toLowerCase() : null;
}

/** Den Haken setzen — das Ergebnis ist der Patch für die Datenbank. */
export function bestaetigungsPatch(lead, userId) {
  const schritt = offenerSchritt(lead);
  if (!schritt) return null;
  return { schritt, patch: schrittPatch(lead, schritt.key, true, userId) };
}

/**
 * Die Meldung in den Bestätigungs-Kanal — wie aus der Academy
 * (pages/api/bestaetigung-melden.js).
 */
export async function meldeBestaetigung(admin, { lead, orgId, schritt, name = "" }) {
  if (!orgId || !SCHRITTE.find((s) => s.key === schritt?.key && s.meldet)) return { gemeldet: false };
  const { data: org } = await admin.from("organizations")
    .select("telegram_chat_id, telegram_bestaetigung_chat_id").eq("id", orgId).maybeSingle();
  const kanal = org?.telegram_bestaetigung_chat_id || org?.telegram_chat_id;
  if (!kanal) return { gemeldet: false };
  await sendeAlarm(bestaetigungsText(lead, name, schritt), kanal);
  return { gemeldet: true };
}

const werText = (lead) => `${lead.name}${lead.company ? ` (${lead.company})` : ""}`;

/**
 * Die eigenen Termine, bei denen die Bestätigung noch fehlt — zur Auswahl.
 *
 * Ohne KI: Wer "Setting Call bestätigen" schreibt, bekommt seine Termine
 * gezeigt und tippt den richtigen an. Steht ein Name in der Nachricht,
 * bleiben nur die Termine übrig, auf die er passt.
 */
export function auswahlListe(leads = [], text = "", stufe = null) {
  let offen = leads.filter((l) => offenerSchritt(l));
  if (stufe) offen = offen.filter((l) => artVon(l).key === stufe);
  const t = String(text || "").toLowerCase();
  const benannt = offen.filter((l) => (l.name && t.includes(String(l.name).toLowerCase().split(/\s+/).pop()))
    || (l.company && t.includes(String(l.company).toLowerCase().split(/\s+/)[0])));
  return (benannt.length ? benannt : offen)
    .sort((a, b) => String(a.appointment_at).localeCompare(String(b.appointment_at)));
}

export function auswahlText(leads = [], stufe = null) {
  if (!leads.length) {
    return stufe === "closing"
      ? "Bei deinen kommenden Closing Calls fehlt keine Bestätigung. 👍"
      : stufe === "erstgespraech"
        ? "Bei deinen kommenden Setting Calls fehlt keine Bestätigung. 👍"
        : "Bei deinen kommenden Terminen fehlt keine Bestätigung. 👍";
  }
  const zeilen = leads.map((l) => `• ${inZone(l.appointment_at, DEUTSCHE_ZONE, { weekday: "short", day: "numeric", month: "numeric" })}, ${nurUhrzeit(l.appointment_at, DEUTSCHE_ZONE)} · ${artVon(l).label} · ${werText(l)}`);
  return ["Welchen Termin willst du bestätigen?", "", ...zeilen].join("\n");
}

/** Die Auswahl verschicken — mit einem Knopf je Termin. */
export async function zeigeBestaetigungsAuswahl(admin, v, text, { jetzt = new Date() } = {}) {
  const heute = berlinHeute(jetzt);
  const { data, error } = await alleZeilen(() => admin.from("leads")
    .select("id, name, company, created_by, organization_id, termin_art, status, appointment_at, schritte, kein_kundentermin")
    .eq("created_by", v.user_id).is("geloescht_am", null).eq("status", "geplant")
    .gte("appointment_at", tagesBeginnZeitpunkt(heute))
    .lt("appointment_at", tagesBeginnZeitpunkt(tagPlus(heute, VORSCHAU_TAGE)))
    .order("id"));
  if (error) {
    console.error("Termine für die Bestätigung nicht ladbar:", error.message);
    return false;
  }
  const stufe = gemeinteStufe(text);
  const auswahl = auswahlListe(data || [], text, stufe).slice(0, 6);
  if (!auswahl.length) {
    await sendePersoenlich(admin, v, auswahlText([], stufe));
    return true;
  }
  await sendePersoenlich(admin, v, auswahlText(auswahl, stufe), {
    reply_markup: { inline_keyboard: auswahl.map((l) => [bestaetigungsKnopf(l)]) },
  });
  return true;
}

/** Ein Tippen auf "✔️ … bestätigt" unter dem Morgen-Briefing. */
export async function bearbeiteBestaetigungsKnopf(admin, knopf) {
  const leadId = leseBestaetigungsKnopf(knopf?.daten);
  if (!leadId) { await quittiereKnopf(knopf?.id, "Dieser Knopf gilt nicht mehr."); return { ok: false }; }

  const { data: zeilen } = await admin.from("telegram_verknuepfungen")
    .select("user_id").eq("chat_id", String(knopf.chat_id)).limit(1);
  const userId = zeilen?.[0]?.user_id;
  if (!userId) { await quittiereKnopf(knopf.id, "Dieser Chat ist nicht mehr mit der Academy verbunden."); return { ok: false }; }

  const { data: lead } = await admin.from("leads").select("*").eq("id", leadId).is("geloescht_am", null).maybeSingle();
  if (!lead) { await quittiereKnopf(knopf.id, "Diesen Termin gibt es nicht mehr."); return { ok: false }; }
  // Bestätigen darf, wem der Termin gehört — dieselbe Regel wie in der Academy.
  if (lead.created_by !== userId) { await quittiereKnopf(knopf.id, "Das ist nicht dein Termin."); return { ok: false }; }

  const bereit = bestaetigungsPatch(lead, userId);
  if (!bereit) { await quittiereKnopf(knopf.id, "Dieser Termin ist schon bestätigt."); return { ok: false }; }

  const { error } = await admin.from("leads").update(bereit.patch).eq("id", lead.id);
  if (error) {
    console.error("Bestätigung aus Telegram nicht gespeichert:", error.message);
    await quittiereKnopf(knopf.id, "Das hat nicht geklappt. Hak es bitte in der Academy ab.");
    return { ok: false, fehler: error.message };
  }

  // Die Briefing-Nachricht bleibt, wie sie ist: An ihr hängen die Knöpfe
  // der anderen Termine. Stattdessen eine kurze Quittung.
  await quittiereKnopf(knopf.id, `${bereit.schritt.label} ✓`);
  await sendeAlarm(`✅ ${bereit.schritt.label}: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`, knopf.chat_id);

  const { data: profil } = await admin.from("profiles").select("full_name, organization_id").eq("id", userId).maybeSingle();
  await meldeBestaetigung(admin, {
    lead: { ...lead, ...bereit.patch },
    orgId: lead.organization_id || profil?.organization_id,
    schritt: bereit.schritt,
    name: profil?.full_name || "",
  });
  return { ok: true, schritt: bereit.schritt.key };
}
