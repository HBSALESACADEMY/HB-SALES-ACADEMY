import { SCHRITTE, artVon, darfSchritt, istKundeGeworden, schrittErledigt, schrittPatch, istKundentermin } from "./terminArt.js";
import { istFuehrungsrolle } from "./rollen.js";
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

// Kurzzeichen für die Knöpfe: In callback_data passen nur 64 Zeichen, und
// die Kennung des Termins braucht davon schon 36.
export const SCHRITT_CODES = {
  setting_bestaetigt: "sb", closing_bestaetigt: "cb", projektumsetzung: "pu", checkin_erledigt: "ci",
};

export function schrittVonCode(code) {
  const key = Object.keys(SCHRITT_CODES).find((k) => SCHRITT_CODES[k] === code);
  return SCHRITTE.find((s) => s.key === key) || null;
}

/**
 * Welcher Haken gemeint ist — oder null für "irgendeine Bestätigung".
 *
 * Die beiden Bestätigungen, der erledigte Check-in und die
 * Projektumsetzung: dieselben vier Haken wie auf der Termin-Seite.
 */
export function gemeinterSchritt(text) {
  const t = String(text || "").toLowerCase();
  if (/\bprojekt\w*\b/.test(t) && /\b(umgesetzt|fertig|erledigt|geliefert|steht|abgeschlossen|läuft)\b/.test(t)) return "projektumsetzung";
  if (/\bprojektumsetzung\b/.test(t)) return "projektumsetzung";
  if (/\bcheck-?in\b/.test(t) && /\b(erledigt|gemacht|durch|gelaufen|telefoniert)\b/.test(t)) return "checkin_erledigt";
  if (/\bclosing\b/.test(t) && /\bbest(ä|ae)tig/.test(t)) return "closing_bestaetigt";
  if (/\b(setting|erstgespr\w*)\b/.test(t) && /\bbest(ä|ae)tig/.test(t)) return "setting_bestaetigt";
  return null;
}

/** Will jemand einen Haken setzen, der keine Bestätigung ist? */
export function willHaken(text) {
  const key = gemeinterSchritt(text);
  return key === "projektumsetzung" || key === "checkin_erledigt" ? key : null;
}

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

export function bestaetigungsKnopf(lead, schrittKey = null) {
  const code = SCHRITT_CODES[schrittKey];
  const schritt = SCHRITTE.find((x) => x.key === schrittKey);
  const wort = schritt && !schritt.vorStufe ? schritt.label.toLowerCase() : "bestätigt";
  return { text: `✔️ ${lead.name.slice(0, 24)} ${wort}`, callback_data: code ? `s:${lead.id}:${code}` : `s:${lead.id}` };
}

/** Die Knöpfe unter dem Morgen-Briefing — nur für das, was noch offen ist. */
export function bestaetigungsKnoepfe(leads = [], hoechstens = 4) {
  const offen = leads.filter((l) => offenerSchritt(l)).slice(0, hoechstens);
  if (!offen.length) return null;
  return { inline_keyboard: offen.map((l) => [bestaetigungsKnopf(l)]) };
}

export function leseBestaetigungsKnopf(daten) {
  const treffer = String(daten || "").match(/^s:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?::([a-z]{2}))?$/i);
  if (!treffer) return null;
  return { leadId: treffer[1].toLowerCase(), schritt: treffer[2] ? schrittVonCode(treffer[2].toLowerCase()) : null };
}

/**
 * Darf diese Person diesen Haken an diesem Termin setzen?
 *
 * Wie in der Academy: Die Projektumsetzung gehört der Leitung, alles
 * andere dem, dem der Termin gehört. Die Leitung darf ausserdem in ihrer
 * eigenen Organisation abhaken.
 */
export function darfHaken(lead, profil, schritt) {
  if (!lead || !profil || !schritt) return false;
  const leitung = istFuehrungsrolle(profil);
  if (!darfSchritt(schritt, leitung)) return false;
  if (lead.created_by === profil.id) return true;
  return leitung && !!lead.organization_id && lead.organization_id === profil.organization_id;
}

/** Die Termine, an denen dieser Haken noch offen ist. */
export function kandidatenFuerSchritt(leads = [], schrittKey, profil = null) {
  const schritt = SCHRITTE.find((s) => s.key === schrittKey);
  if (!schritt) return [];
  return leads
    .filter((l) => istKundentermin(l) && !l.geloescht_am && !schrittErledigt(l, schritt.key))
    .filter((l) => {
      if (schritt.vorStufe) return artVon(l).key === schritt.vorStufe && l.status === "geplant";
      // Der Check-in wird abgehakt, wenn der Termin dazu steht.
      if (schritt.key === "checkin_erledigt") return artVon(l).key === "checkin";
      // Die Projektumsetzung erst, wenn jemand Kunde geworden ist.
      return istKundeGeworden(l);
    })
    .filter((l) => (profil ? darfHaken(l, profil, schritt) : true))
    .sort((a, b) => String(a.appointment_at).localeCompare(String(b.appointment_at)));
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
export function auswahlNachName(leads = [], text = "") {
  const t = String(text || "").toLowerCase();
  const benannt = leads.filter((l) => {
    const nachname = String(l.name || "").toLowerCase().split(/\s+/).pop();
    const firma = String(l.company || "").toLowerCase().split(/\s+/)[0];
    return (nachname && nachname.length > 2 && t.includes(nachname)) || (firma && firma.length > 2 && t.includes(firma));
  });
  return benannt.length ? benannt : leads;
}

export function auswahlListe(leads = [], text = "", stufe = null) {
  let offen = leads.filter((l) => offenerSchritt(l));
  if (stufe) offen = offen.filter((l) => artVon(l).key === stufe);
  return auswahlNachName(offen, text)
    .sort((a, b) => String(a.appointment_at).localeCompare(String(b.appointment_at)));
}

export function auswahlText(leads = [], stufe = null) {
  if (!leads.length) {
    return stufe === "closing"
      ? "Bei deinen kommenden Closing Calls fehlt keine Bestätigung. 👍"
      : stufe === "erstgespraech"
        ? "Bei deinen kommenden Setting Calls fehlt keine Bestätigung. 👍"
        : hakenText([], null);
  }
  return hakenText(leads, null);
}

/** Der Text über der Auswahl, je nach Haken. */
export function hakenText(leads = [], schrittKey = null) {
  const schritt = SCHRITTE.find((x) => x.key === schrittKey);
  if (!leads.length) {
    if (schrittKey === "projektumsetzung") return "Bei deinen Kunden steht keine Projektumsetzung offen. 👍";
    if (schrittKey === "checkin_erledigt") return "Es steht kein Check-in offen, der abgehakt werden müsste. 👍";
    return "Bei deinen kommenden Terminen fehlt keine Bestätigung. 👍";
  }
  const zeilen = leads.map((l) => `• ${inZone(l.appointment_at, DEUTSCHE_ZONE, { weekday: "short", day: "numeric", month: "numeric" })}, ${nurUhrzeit(l.appointment_at, DEUTSCHE_ZONE)} · ${artVon(l).label} · ${werText(l)}`);
  const frage = schritt && !schritt.vorStufe
    ? `Bei wem willst du „${schritt.label}“ abhaken?`
    : "Welchen Termin willst du bestätigen?";
  return [frage, "", ...zeilen].join("\n");
}

// Wie weit zurück und nach vorn gesucht wird — je nach Haken. Eine
// Projektumsetzung kann Monate nach dem Abschluss kommen.
const FENSTER = {
  projektumsetzung: [-180, 30],
  checkin_erledigt: [-60, 30],
  standard: [0, VORSCHAU_TAGE],
};

/**
 * Die Auswahl verschicken — mit einem Knopf je Termin.
 *
 * @param schrittKey  welcher Haken; null heisst "irgendeine Bestätigung"
 */
export async function zeigeHakenAuswahl(admin, v, profil, text, { schrittKey = null, jetzt = new Date() } = {}) {
  const key = schrittKey || gemeinterSchritt(text);
  const heute = berlinHeute(jetzt);
  const [zurueck, vor] = FENSTER[key] || FENSTER.standard;
  const leitung = istFuehrungsrolle(profil);

  const { data, error } = await alleZeilen(() => {
    const q = admin.from("leads")
      .select("id, name, company, created_by, organization_id, termin_art, status, outcome, appointment_at, schritte, stufen_verlauf, kein_kundentermin, geloescht_am")
      .is("geloescht_am", null)
      .gte("appointment_at", tagesBeginnZeitpunkt(tagPlus(heute, zurueck)))
      .lt("appointment_at", tagesBeginnZeitpunkt(tagPlus(heute, vor)))
      .order("id");
    // Die Leitung hakt auch bei ihren Leuten ab — die Projektumsetzung
    // gehört sogar ausschliesslich ihr.
    return leitung && profil?.organization_id ? q.eq("organization_id", profil.organization_id) : q.eq("created_by", v.user_id);
  });
  if (error) {
    console.error("Termine für den Haken nicht ladbar:", error.message);
    return false;
  }

  const stufe = gemeinteStufe(text);
  const offen = key
    ? kandidatenFuerSchritt(data || [], key, profil)
    : auswahlListe(data || [], text, stufe).filter((l) => darfHaken(l, profil, offenerSchritt(l)));
  // Steht ein Name im Satz, bleibt nur er übrig — auch bei den anderen Haken.
  const auswahl = (key ? auswahlNachName(offen, text) : offen).slice(0, 6);

  if (!auswahl.length) {
    await sendePersoenlich(admin, v, hakenText([], key));
    return true;
  }
  await sendePersoenlich(admin, v, hakenText(auswahl, key), {
    reply_markup: { inline_keyboard: auswahl.map((l) => [bestaetigungsKnopf(l, key)]) },
  });
  return true;
}

/** Die Bestätigung vor dem Termin — der häufigste Fall. */
export function zeigeBestaetigungsAuswahl(admin, v, profil, text, optionen = {}) {
  return zeigeHakenAuswahl(admin, v, profil, text, optionen);
}

/** Ein Tippen auf "✔️ … bestätigt" unter dem Morgen-Briefing. */
export async function bearbeiteBestaetigungsKnopf(admin, knopf) {
  const wahl = leseBestaetigungsKnopf(knopf?.daten);
  if (!wahl) { await quittiereKnopf(knopf?.id, "Dieser Knopf gilt nicht mehr."); return { ok: false }; }

  const { data: zeilen } = await admin.from("telegram_verknuepfungen")
    .select("user_id").eq("chat_id", String(knopf.chat_id)).limit(1);
  const userId = zeilen?.[0]?.user_id;
  if (!userId) { await quittiereKnopf(knopf.id, "Dieser Chat ist nicht mehr mit der Academy verbunden."); return { ok: false }; }

  const { data: lead } = await admin.from("leads").select("*").eq("id", wahl.leadId).is("geloescht_am", null).maybeSingle();
  if (!lead) { await quittiereKnopf(knopf.id, "Diesen Termin gibt es nicht mehr."); return { ok: false }; }

  const { data: profil } = await admin.from("profiles")
    .select("id, full_name, organization_id, role, is_admin, is_platform_admin").eq("id", userId).maybeSingle();
  // Abhaken darf, wem der Termin gehört, und die Leitung im eigenen Haus —
  // die Projektumsetzung nur sie (dieselbe Regel wie in der Academy).
  const schritt = wahl.schritt || offenerSchritt(lead);
  if (!schritt) { await quittiereKnopf(knopf.id, "An diesem Termin ist nichts offen."); return { ok: false }; }
  if (!darfHaken(lead, profil, schritt)) { await quittiereKnopf(knopf.id, "Das darfst du bei diesem Termin nicht abhaken."); return { ok: false }; }
  if (schrittErledigt(lead, schritt.key)) { await quittiereKnopf(knopf.id, `${schritt.label} ist schon abgehakt.`); return { ok: false }; }

  const bereit = { schritt, patch: schrittPatch(lead, schritt.key, true, userId) };

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

  await meldeBestaetigung(admin, {
    lead: { ...lead, ...bereit.patch },
    orgId: lead.organization_id || profil?.organization_id,
    schritt: bereit.schritt,
    name: profil?.full_name || "",
  });
  return { ok: true, schritt: bereit.schritt.key };
}
