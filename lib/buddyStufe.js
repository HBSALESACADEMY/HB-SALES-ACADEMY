import { alleZeilen } from "./alleZeilen.js";
import { TERMIN_ARTEN, artVon, istKundentermin, istKundeGeworden, rueckeVor } from "./terminArt.js";
import { istFuehrungsrolle } from "./rollen.js";
import { berlinHeute, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";
import { deutscheZeit, inZone, nurUhrzeit, DEUTSCHE_ZONE } from "./terminzeit.js";
import { leseZeitpunkt } from "./buddyNeuerTermin.js";
import { sendePersoenlich } from "./telegramPersoenlich.js";
import { sendeTerminMeldung } from "./terminMeldungSenden.js";
import { quittiereKnopf, ersetzeNachricht } from "./telegramApi.js";
import { sendeAlarm } from "./alarm.js";

// Einen Kontakt eine Stufe weiterrücken — ohne dass man den Namen tippen
// muss.
//
// "Closing Call ausgemacht" genügt: Die Academy zeigt die Termine, bei
// denen ein Closing Call der nächste Schritt wäre, man tippt den Kunden
// an, nennt Datum und Uhrzeit und bestätigt. Danach steht der Kontakt auf
// der neuen Stufe, der bisherige Termin steht im Verlauf, und der
// Fortschritt stimmt — genau wie auf der Termin-Seite (rueckeVor).
//
// Der Zeitpunkt wird gerechnet, nicht von der KI gelesen
// (lib/buddyNeuerTermin.js, leseZeitpunkt).

// Wie weit zurück ein Termin liegen darf, um noch zur Auswahl zu stehen.
const RUECKBLICK_TAGE = 45;
const VORSCHAU_TAGE = 60;
const MAX_AUSWAHL = 6;

export const ZIELE = {
  closing: {
    art: "closing",
    worte: /\b(closing|abschlussgespr\w*)\b/i,
    // Aus diesen Stufen heraus ist ein Closing Call der nächste Schritt.
    von: ["erstgespraech", "folgetermin", "unbestimmt"],
    frage: "Wann ist der Closing Call?",
  },
  folgetermin: {
    art: "folgetermin",
    worte: /\b(folgetermin|zweittermin|nachfasstermin|zweites gespr\w*)\b/i,
    von: ["erstgespraech", "folgetermin", "closing", "unbestimmt"],
    frage: "Wann ist der Folgetermin?",
  },
  checkin: {
    art: "checkin",
    worte: /\b(check-?in)\b/i,
    von: ["erstgespraech", "folgetermin", "closing"],
    nurKunden: true,
    frage: "Wann ist der Check-in?",
  },
  erstgespraech: {
    art: "erstgespraech",
    worte: /\b(setting call|erstgespr\w*)\b/i,
    von: ["unbestimmt"],
    frage: "Wann ist der Setting Call?",
  },
  // Kein Stufenwechsel: Derselbe Termin bekommt nur einen neuen Zeitpunkt.
  verschieben: {
    art: null,
    worte: /\b(verschoben|verschieben|umgelegt|umlegen|verlegt|verlegen|neuer termin(zeitpunkt)?)\b/i,
    von: ["erstgespraech", "folgetermin", "closing", "checkin", "unbestimmt"],
    frage: "Auf wann verschieben?",
    verschieben: true,
  },
};

const VEREINBART = /\b(ausgemacht|vereinbart|steht|angesetzt|terminiert|gelegt|geplant|festgemacht|klargemacht|abgemacht|verschoben|verschieben|umgelegt|umlegen|verlegt|verlegen)\b/i;

/**
 * Meint der Satz "wir haben die nächste Stufe vereinbart"?
 *
 * Bewusst eng: Ohne ein Wort wie "ausgemacht" ist "Der Closing Call lief
 * gut" ein Bericht über ein Gespräch, kein neuer Termin.
 */
export function willStufe(text) {
  const t = String(text || "");
  if (!VEREINBART.test(t)) return null;
  // Verschieben zuerst: "Closing Call verschoben" ist kein neuer Closing
  // Call, sondern ein anderer Zeitpunkt für denselben.
  if (ZIELE.verschieben.worte.test(t)) return "verschieben";
  const treffer = Object.entries(ZIELE).find(([key, z]) => key !== "verschieben" && z.worte.test(t));
  return treffer ? treffer[0] : null;
}

export function zielVon(key) {
  return ZIELE[key] || null;
}

const label = (art) => TERMIN_ARTEN.find((a) => a.key === art)?.label || "Termin";
const zielName = (ziel, lead = null) => (ziel.verschieben ? (lead ? artVon(lead).label : "Termin") : label(ziel.art));
const werText = (lead, nameVon) => `${lead.name}${lead.company ? ` (${lead.company})` : ""}`
  + (nameVon && nameVon(lead.created_by) ? ` — ${nameVon(lead.created_by)}` : "");

/** Die Termine, die zu diesem Schritt passen — die zuletzt geführten zuerst. */
export function kandidaten(leads = [], zielKey, text = "", jetzt = new Date()) {
  const ziel = zielVon(zielKey);
  if (!ziel) return [];
  const t = String(text || "").toLowerCase();
  const passend = leads.filter((l) => {
    if (!istKundentermin(l) || l.geloescht_am) return false;
    if (!ziel.von.includes(artVon(l).key)) return false;
    // Der Check-in kommt nach dem Abschluss — vorher ergibt er keinen Sinn.
    if (ziel.nurKunden && !istKundeGeworden(l)) return false;
    return true;
  });
  // Steht ein Name in der Nachricht, bleiben nur die Termine dazu.
  const benannt = passend.filter((l) => {
    const nachname = String(l.name || "").toLowerCase().split(/\s+/).pop();
    const firma = String(l.company || "").toLowerCase().split(/\s+/)[0];
    return (nachname && nachname.length > 2 && t.includes(nachname)) || (firma && firma.length > 2 && t.includes(firma));
  });
  const auswahl = benannt.length ? benannt : passend;
  // Der zuletzt geführte Termin zuerst: über den spricht man gerade.
  return auswahl.sort((a, b) => Math.abs(new Date(a.appointment_at) - jetzt) - Math.abs(new Date(b.appointment_at) - jetzt));
}

export function auswahlText(zielKey, leads = [], nameVon = null) {
  const ziel = zielVon(zielKey);
  if (!leads.length) {
    if (ziel.verschieben) return "Ich finde bei deinen Terminen gerade keinen, den du verschieben könntest.";
    return `Für einen ${label(ziel.art)} finde ich bei deinen Terminen gerade keinen passenden Kontakt.`
      + (zielKey === "checkin" ? " Ein Check-in kommt erst nach einem Abschluss." : "");
  }
  const zeilen = leads.map((l) => `• ${artVon(l).label} ${inZone(l.appointment_at, DEUTSCHE_ZONE, { day: "numeric", month: "numeric" })}, ${nurUhrzeit(l.appointment_at, DEUTSCHE_ZONE)} · ${werText(l, nameVon)}`);
  return [ziel.verschieben ? "Welchen Termin willst du verschieben?" : `Für wen ist der ${label(ziel.art)}?`, "", ...zeilen].join("\n");
}

export function auswahlKnoepfe(leads = []) {
  return {
    inline_keyboard: leads.map((l) => [{
      text: `${l.name}${l.company ? `, ${l.company}` : ""}`.slice(0, 60),
      callback_data: `w:${l.id}`,
    }]),
  };
}

export function leseStufenKnopf(daten) {
  const roh = String(daten || "");
  if (/^w:(j|n)$/.test(roh)) return { antwort: roh.slice(2) };
  const treffer = roh.match(/^w:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return treffer ? { leadId: treffer[1].toLowerCase() } : null;
}

export function bestaetigungsFrage(lead, zielKey, zeit) {
  const ziel = zielVon(zielKey);
  return [
    "📋 Soll ich das so eintragen?",
    "",
    `${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
    `• Bisher: ${artVon(lead).label} ${deutscheZeit(lead.appointment_at)} Uhr`,
    `• Neu: ${zielName(ziel, lead)} ${deutscheZeit(zeit.zeitpunkt)} Uhr`,
  ].join("\n");
}

export const JA_NEIN = {
  inline_keyboard: [[{ text: "✅ Ja, eintragen", callback_data: "w:j" }, { text: "✖️ Abbrechen", callback_data: "w:n" }]],
};

/** Darf diese Person den Termin weiterrücken? Wie in der Academy. */
export function darfRuecken(lead, profil) {
  if (!lead || !profil) return false;
  if (lead.created_by === profil.id) return true;
  return istFuehrungsrolle(profil) && !!lead.organization_id && lead.organization_id === profil.organization_id;
}

async function setzeModus(admin, userId, modus, daten = null) {
  const { error } = await admin.from("telegram_verknuepfungen").update({
    modus, modus_daten: daten, modus_seit: modus ? new Date().toISOString() : null,
  }).eq("user_id", userId);
  if (error) console.error("Vertriebsbuddy: Stufen-Dialog nicht gespeichert:", error.message);
  return !error;
}

async function ladeTermine(admin, profil, userId, jetzt) {
  const heute = berlinHeute(jetzt);
  const von = tagesBeginnZeitpunkt(tagPlus(heute, -RUECKBLICK_TAGE));
  const bis = tagesBeginnZeitpunkt(tagPlus(heute, VORSCHAU_TAGE));
  const spalten = "id, name, company, created_by, organization_id, termin_art, status, outcome, appointment_at, notes, stufen_verlauf, kein_kundentermin, geloescht_am";
  // Die Leitung sieht die Termine ihrer Organisation — dieselbe Regel wie
  // beim Eintragen eines Ergebnisses.
  const bauen = () => {
    const q = admin.from("leads").select(spalten).is("geloescht_am", null)
      .gte("appointment_at", von).lt("appointment_at", bis).order("id");
    return istFuehrungsrolle(profil) && profil?.organization_id
      ? q.eq("organization_id", profil.organization_id)
      : q.eq("created_by", userId);
  };
  const { data, error } = await alleZeilen(bauen);
  if (error) throw error;
  return data || [];
}

/**
 * "Closing Call ausgemacht" — die Auswahl zeigen.
 * @returns true, wenn der Satz hier behandelt wurde
 */
export async function zeigeStufenAuswahl(admin, v, profil, text, { jetzt = new Date() } = {}) {
  const zielKey = willStufe(text);
  if (!zielKey) return false;
  let termine = [];
  try {
    termine = await ladeTermine(admin, profil, v.user_id, jetzt);
  } catch (e) {
    console.error("Termine für die Stufe nicht ladbar:", e.message);
    return false;
  }
  const auswahl = kandidaten(termine, zielKey, text, jetzt).slice(0, MAX_AUSWAHL);
  // Namen der Kolleg:innen, wenn die Leitung fremde Termine sieht.
  let nameVon = null;
  if (istFuehrungsrolle(profil)) {
    const ids = [...new Set(auswahl.map((l) => l.created_by))];
    const { data: profile } = ids.length ? await admin.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    const karte = new Map((profile || []).map((p) => [p.id, p.full_name]));
    nameVon = (id) => (id === profil.id ? "" : karte.get(id) || "");
  }

  if (!auswahl.length) {
    await sendePersoenlich(admin, v, auswahlText(zielKey, [], nameVon));
    return true;
  }
  if (!(await setzeModus(admin, v.user_id, "stufe", { ziel: zielKey, kandidaten: auswahl.map((l) => l.id) }))) return false;
  await sendePersoenlich(admin, v, auswahlText(zielKey, auswahl, nameVon), { reply_markup: auswahlKnoepfe(auswahl) });
  return true;
}

/** Die Antwort auf "Wann ist der Closing Call?". */
export async function stufenAntwort(admin, v, text) {
  const daten = v.modus_daten || {};
  if (!daten.leadId || !daten.ziel) return false;
  if (/^(abbrechen|abbruch|stopp?|doch nicht)$/i.test(String(text).trim())) {
    await setzeModus(admin, v.user_id, null);
    await sendePersoenlich(admin, v, "Abgebrochen — es wurde nichts geändert.");
    return true;
  }
  const zeit = leseZeitpunkt(text);
  if (!zeit) {
    await sendePersoenlich(admin, v, "Das habe ich nicht als Zeitpunkt verstanden. Schreib es zum Beispiel so: „Donnerstag 14 Uhr“, „morgen 9:30“ oder „23.9. 14:00“.");
    return true;
  }
  const { data: lead } = await admin.from("leads").select("*").eq("id", daten.leadId).is("geloescht_am", null).maybeSingle();
  if (!lead) {
    await setzeModus(admin, v.user_id, null);
    await sendePersoenlich(admin, v, "Diesen Termin finde ich nicht mehr.");
    return true;
  }
  await setzeModus(admin, v.user_id, "stufe", { ...daten, zeit });
  await sendePersoenlich(admin, v, bestaetigungsFrage(lead, daten.ziel, zeit), { reply_markup: JA_NEIN });
  return true;
}

/** Ein Tippen: Kunde auswählen, oder "Ja, eintragen". */
export async function bearbeiteStufenKnopf(admin, knopf) {
  const wahl = leseStufenKnopf(knopf?.daten);
  const { data: zeilen } = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, modus, modus_daten, modus_seit").eq("chat_id", String(knopf?.chat_id || "")).limit(1);
  const v = zeilen?.[0];
  const beende = async (hinweis, text) => {
    await quittiereKnopf(knopf.id, hinweis);
    if (knopf.nachricht_id && text) await ersetzeNachricht(knopf.chat_id, knopf.nachricht_id, text);
  };
  if (!wahl || !v) { await beende("Dieser Knopf gilt nicht mehr."); return { ok: false }; }
  if (v.modus !== "stufe") { await beende("Dieser Vorschlag ist abgelaufen."); return { ok: false }; }

  const daten = v.modus_daten || {};
  const { data: profil } = await admin.from("profiles")
    .select("id, full_name, organization_id, role, is_admin, is_platform_admin").eq("id", v.user_id).maybeSingle();

  // Der Kunde wurde ausgewählt: jetzt nach dem Zeitpunkt fragen.
  if (wahl.leadId) {
    if (!(daten.kandidaten || []).includes(wahl.leadId)) { await beende("Diesen Termin finde ich nicht mehr."); return { ok: false }; }
    const { data: lead } = await admin.from("leads").select("*").eq("id", wahl.leadId).is("geloescht_am", null).maybeSingle();
    if (!lead || !darfRuecken(lead, profil)) { await beende("Diesen Termin darfst du nicht ändern."); return { ok: false }; }
    await setzeModus(admin, v.user_id, "stufe", { ziel: daten.ziel, leadId: lead.id });
    await beende("Ausgewählt", `${knopf.nachricht_text}\n\n→ ${lead.name}`);
    await sendeAlarm(`${zielVon(daten.ziel).frage} Zum Beispiel „Donnerstag 14 Uhr“ oder „23.9. 10:00“.`, knopf.chat_id);
    return { ok: true, gewaehlt: lead.id };
  }

  if (wahl.antwort === "n") {
    await setzeModus(admin, v.user_id, null);
    await beende("Abgebrochen.", `${knopf.nachricht_text}\n\n✖️ Nicht eingetragen.`);
    return { ok: true, eingetragen: false };
  }

  // "Ja, eintragen".
  const { data: lead } = daten.leadId
    ? await admin.from("leads").select("*").eq("id", daten.leadId).is("geloescht_am", null).maybeSingle()
    : { data: null };
  if (!lead || !darfRuecken(lead, profil) || !daten.zeit?.zeitpunkt) {
    await setzeModus(admin, v.user_id, null);
    await beende("Das hat nicht geklappt.");
    return { ok: false };
  }

  const ziel = zielVon(daten.ziel);
  // Verschieben heisst: neuer Zeitpunkt, gleiche Stufe. Der Verlauf bleibt
  // unberührt — es ist ja kein weiterer Schritt, sondern derselbe.
  const patch = ziel.verschieben
    ? { appointment_at: daten.zeit.zeitpunkt, status: "geplant" }
    : rueckeVor(lead, ziel.art, daten.zeit.zeitpunkt, v.user_id);
  const { error } = await admin.from("leads").update(patch).eq("id", lead.id);
  if (error) {
    console.error("Stufe aus Telegram nicht gespeichert:", error.message);
    await beende("Das hat nicht geklappt. Trag es bitte in der Academy ein.");
    return { ok: false, fehler: error.message };
  }
  await setzeModus(admin, v.user_id, null);
  await beende("Eingetragen", `${String(knopf.nachricht_text || "").replace("📋 Soll ich das so eintragen?", "📅 Eingetragen")}\n\n✅ Steht in der Academy.`);

  // Ein neuer Zeitpunkt im Kalender wird gemeldet — wie aus der Academy.
  await sendeTerminMeldung(admin, {
    orgId: lead.organization_id || profil?.organization_id,
    lead: { ...lead, ...patch },
    grund: "verschoben",
    ereignis: "bearbeitet",
    beschreibung: `${zielName(ziel, lead)} mit ${lead.name} am ${deutscheZeit(daten.zeit.zeitpunkt)} Uhr.`,
    wer: profil?.full_name || "",
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  if (appUrl) await sendeAlarm(`${appUrl}/termine?leadId=${lead.id}`, knopf.chat_id);
  return { ok: true, eingetragen: true, art: ziel.art };
}
