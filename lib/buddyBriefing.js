import { alleZeilen } from "./alleZeilen.js";
import { SCHRITTE, artVon, istKundentermin, schrittErledigt } from "./terminArt.js";
import { berlinHeute, berlinStunde, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";
import { arbeitstagDavor, istWochenende, tagesName, berlinTagVon } from "./tagesauswertung.js";
import { nurUhrzeit, DEUTSCHE_ZONE } from "./terminzeit.js";
import { sendePersoenlich } from "./telegramPersoenlich.js";

// Das Morgen-Briefing des Vertriebsbuddys.
//
// Zwei Teile, beide aus den Terminen der Academy:
//   1. Die Termine von heute — mit dem, was man vor dem Gespräch wissen
//      sollte: ob er bestätigt ist, was in der Notiz steht, welche Einwände
//      schon gefallen sind, und ein Tipp zur Stufe.
//   2. Die Termine des letzten Arbeitstags, bei denen noch nichts
//      eingetragen ist — mit Knöpfen, damit das Ergebnis ein Tippen kostet
//      statt eines Umwegs über die Academy. Vergessene Ergebnisse sind das
//      grösste Loch in jeder Auswertung.
//
// Keine KI: Alles hier steht so in der Datenbank. Ein erfundenes Detail vor
// einem Kundengespräch wäre schlimmer als gar keins.

// Mehr Fragen am Morgen liest niemand. Der Rest steht in der Academy.
export const MAX_FRAGEN = 5;

// Ein Tipp je Stufe — kurz genug, um ihn vor dem Wählen zu lesen.
export const STUFEN_TIPPS = {
  erstgespraech: "Setting Call: Ziel ist nicht der Verkauf, sondern der nächste Termin. Frag nach dem grössten Engpass und hör zu, bis er ausgesprochen ist.",
  folgetermin: "Folgetermin: Er zögert. Frag direkt, was ihn noch hält — und wer ausser ihm mitentscheidet.",
  closing: "Closing Call: Fass am Anfang zusammen, welches Problem er beim letzten Mal genannt hat. Am Ende nicht „Was meinen Sie?“ fragen, sondern den nächsten Schritt vorschlagen.",
  checkin: "Check-in: Frag, was sich seit dem Start verändert hat — und ob er jemanden kennt, dem das auch helfen würde.",
};

const vorname = (name) => String(name || "").trim().split(/\s+/)[0] || "";
const kuerze = (text, n) => {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const wer = (lead) => `${lead.name}${lead.company ? ` (${lead.company})` : ""}`;

// "Ohne Stufe" ist eine Beschriftung für die Liste, kein Wort für eine
// Nachricht. Und ein eigener Eintrag (Rückruf, Erinnerung) ist kein
// Kundentermin.
function stufenName(lead) {
  if (!istKundentermin(lead)) return "📌 Eigener Eintrag";
  const art = artVon(lead);
  if (art.key === "unbestimmt") return "Termin";
  return `${art.symbol ? `${art.symbol} ` : ""}${art.label}`;
}

function imFenster(lead, von, bis) {
  const t = lead?.appointment_at ? new Date(lead.appointment_at).getTime() : NaN;
  return !Number.isNaN(t) && t >= new Date(von).getTime() && t < new Date(bis).getTime();
}

/** Die Termine einer Person in einem Zeitraum, die heute anstehen — ohne abgesagte. */
export function briefingTermine(leads = [], userId, von, bis) {
  return leads
    .filter((l) => l.created_by === userId && !l.geloescht_am && l.status !== "abgesagt" && imFenster(l, von, bis))
    .sort((a, b) => a.appointment_at.localeCompare(b.appointment_at));
}

/**
 * Termine, die vorbei sind und bei denen nichts eingetragen ist.
 *
 * "Nichts" heisst: weder wahrgenommen noch abgesagt, und kein Ergebnis.
 * Rückrufe ohne Kundentermin haben kein Ergebnis, der Check-in auch nicht
 * — der Kontakt ist da schon Kunde.
 */
export function offeneErgebnisse(leads = [], userId, von, bis) {
  return leads
    .filter((l) => l.created_by === userId && !l.geloescht_am && imFenster(l, von, bis))
    .filter((l) => l.status === "geplant" && !l.outcome && istKundentermin(l) && l.termin_art !== "checkin")
    .sort((a, b) => a.appointment_at.localeCompare(b.appointment_at));
}

/** Die Bestätigung, die vor dieser Stufe fällig ist — oder null. */
function faelligeBestaetigung(lead) {
  const art = artVon(lead).key;
  return SCHRITTE.find((s) => s.vorStufe === art && !schrittErledigt(lead, s.key)) || null;
}

function einwaendeAus(lead) {
  const liste = lead?.call_notes?.einwaende;
  return Array.isArray(liste) ? liste.filter((e) => typeof e === "string" && e.trim()).slice(0, 3) : [];
}

export function terminZeilen(lead, { appUrl = "", mitTipp = false } = {}) {
  const art = artVon(lead);
  const zeilen = [`🕐 ${nurUhrzeit(lead.appointment_at, DEUTSCHE_ZONE)} · ${stufenName(lead)} · ${wer(lead)}`];
  const offen = istKundentermin(lead) ? faelligeBestaetigung(lead) : null;
  if (offen) zeilen.push(`   ⚠️ Noch nicht bestätigt — kurz anrufen oder schreiben`);
  if (lead.notes) zeilen.push(`   📝 ${kuerze(lead.notes, 160)}`);
  const einwaende = einwaendeAus(lead);
  if (einwaende.length) zeilen.push(`   🗣 Schon gefallen: ${einwaende.map((e) => kuerze(e, 70)).join("; ")}`);
  if (mitTipp && istKundentermin(lead) && STUFEN_TIPPS[art.key]) zeilen.push(`   💡 ${STUFEN_TIPPS[art.key]}`);
  if (appUrl) zeilen.push(`   ${appUrl}/termine?leadId=${lead.id}`);
  return zeilen;
}

/** Die Nachricht mit den Terminen von heute — oder null, wenn keine anstehen. */
export function briefingText({ name = "", termine = [], appUrl = "" } = {}) {
  if (!termine.length) return null;
  const n = termine.length;
  // Der Tipp nur beim ersten Termin jeder Stufe: bei fünf Setting Calls
  // liest ihn sonst niemand mehr.
  const gezeigt = new Set();
  const bloecke = termine.map((l) => {
    const art = artVon(l).key;
    const mitTipp = !gezeigt.has(art);
    gezeigt.add(art);
    return terminZeilen(l, { appUrl, mitTipp }).join("\n");
  });
  return [
    `☀️ Guten Morgen${vorname(name) ? `, ${vorname(name)}` : ""}! Heute ${n === 1 ? "steht 1 Termin" : `stehen ${n} Termine`} an:`,
    "",
    bloecke.join("\n\n"),
    "",
    "Viel Erfolg heute! Mit /termine holst du diese Übersicht jederzeit wieder.",
  ].join("\n");
}

// Die Knöpfe unter der Ergebnisfrage. Der Buchstabe steht in den Daten des
// Knopfs (Telegram erlaubt dort nur 64 Zeichen) — die Bedeutung hier.
export const ERGEBNIS_AKTIONEN = {
  k: { label: "Kunde geworden", knopf: "🎉 Kunde geworden", patch: { outcome: "kunde", status: "wahrgenommen" }, meldet: true },
  u: { label: "Überlegt noch", knopf: "🤔 Überlegt noch", patch: { outcome: "follow_up", status: "wahrgenommen" }, naechsterTermin: true },
  n: { label: "Nächster Termin vereinbart", knopf: "📅 Nächster Termin steht", patch: { status: "wahrgenommen" }, naechsterTermin: true },
  a: { label: "Kein Abschluss", knopf: "❌ Kein Abschluss", patch: { outcome: "absage", status: "wahrgenommen" } },
  x: { label: "Fand nicht statt", knopf: "🚫 Fand nicht statt", patch: { status: "abgesagt" } },
};

export function ergebnisKnoepfe(leadId) {
  const k = (b) => ({ text: ERGEBNIS_AKTIONEN[b].knopf, callback_data: `e:${leadId}:${b}` });
  return { inline_keyboard: [[k("k"), k("u")], [k("n"), k("a")], [k("x")]] };
}

/** Was ein Knopf bedeutet — oder null bei allem, was nicht von hier stammt. */
export function leseKnopf(daten) {
  const treffer = String(daten || "").match(/^e:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([kunax])$/i);
  return treffer ? { leadId: treffer[1].toLowerCase(), aktion: treffer[2].toLowerCase() } : null;
}

export function ergebnisFrage(lead) {
  const tag = berlinTagVon(lead.appointment_at);
  return `❓ Wie lief es? ${tag ? `${tagesName(tag)}, ` : ""}${nurUhrzeit(lead.appointment_at, DEUTSCHE_ZONE)} · ${stufenName(lead)} mit ${wer(lead)}`;
}

/** Die Zeitfenster eines Morgens: heute, und der letzte Arbeitstag bis heute früh. */
export function briefingFenster(jetzt = new Date()) {
  const heute = berlinHeute(jetzt);
  return {
    heute,
    heuteAb: tagesBeginnZeitpunkt(heute),
    heuteBis: tagesBeginnZeitpunkt(tagPlus(heute, 1)),
    // Montags gehören Freitag bis Sonntag dazu — am Wochenende fragt niemand.
    offenAb: tagesBeginnZeitpunkt(arbeitstagDavor(heute)),
  };
}

async function ladeTermine(admin, ids, von, bis) {
  if (!ids.length) return [];
  const { data, error } = await alleZeilen(() => admin.from("leads")
    .select("id, name, company, created_by, organization_id, termin_art, status, outcome, appointment_at, notes, call_notes, schritte, kein_kundentermin, geloescht_am")
    .is("geloescht_am", null).in("created_by", ids)
    .gte("appointment_at", von).lt("appointment_at", bis)
    .order("id"));
  if (error) throw error;
  return data || [];
}

/**
 * Briefing und Ergebnisfragen an eine Person.
 *
 * @param termine  schon geladen (Morgenlauf für alle) — sonst wird geladen
 * @returns {termine, fragen} wie viele Termine und Fragen rausgingen
 */
export async function briefingFuerPerson(admin, verknuepfung, { name = "", jetzt = new Date(), termine = null, nurHeute = false } = {}) {
  const f = briefingFenster(jetzt);
  const alle = termine || await ladeTermine(admin, [verknuepfung.user_id], f.offenAb, f.heuteBis);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const heute = briefingTermine(alle, verknuepfung.user_id, f.heuteAb, f.heuteBis);
  const offen = offeneErgebnisse(alle, verknuepfung.user_id, f.offenAb, f.heuteAb);

  let gesendet = 0;
  const text = briefingText({ name, termine: heute, appUrl });
  if (text) {
    const versand = await sendePersoenlich(admin, verknuepfung, text);
    if (versand?.ok) gesendet += 1;
  }
  let fragen = 0;
  if (!nurHeute) {
    for (const lead of offen.slice(0, MAX_FRAGEN)) {
      const versand = await sendePersoenlich(admin, verknuepfung, ergebnisFrage(lead), { reply_markup: ergebnisKnoepfe(lead.id) });
      if (versand?.ok) fragen += 1;
    }
    if (offen.length > MAX_FRAGEN && appUrl) {
      await sendePersoenlich(admin, verknuepfung,
        `Dazu ${offen.length - MAX_FRAGEN} weitere Termine ohne Ergebnis — die trägst du hier nach:\n${appUrl}/termine`);
    }
  }
  return { termine: gesendet ? heute.length : 0, fragen, offen: offen.length };
}

/**
 * Das Briefing im Morgenlauf: an alle, die es eingeschaltet haben.
 *
 * Montag bis Freitag. Wer an einem Tag weder Termine noch offene
 * Ergebnisse hat, bekommt nichts — eine leere Übersicht wäre nur Lärm.
 */
export async function sendeBriefings(admin, { jetzt = new Date(), nurFuer = null, erzwingen = false } = {}) {
  const f = briefingFenster(jetzt);
  if (istWochenende(f.heute) && !erzwingen) return { gesendet: 0, grund: "Wochenende" };

  let abfrage = admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, briefing, briefing_fuer").not("chat_id", "is", null);
  if (nurFuer) abfrage = abfrage.eq("user_id", nurFuer);
  const { data, error } = await abfrage;
  if (error) return { gesendet: 0, grund: error.message };

  const offen = (data || []).filter((v) => v.briefing !== false && (erzwingen || v.briefing_fuer !== f.heute));
  if (!offen.length) return { gesendet: 0 };

  const ids = offen.map((v) => v.user_id);
  const [termine, { data: profile }] = await Promise.all([
    ladeTermine(admin, ids, f.offenAb, f.heuteBis),
    admin.from("profiles").select("id, full_name").in("id", ids),
  ]);
  const nameVon = new Map((profile || []).map((p) => [p.id, p.full_name]));

  let gesendet = 0;
  let fragen = 0;
  for (const v of offen) {
    const eigene = termine.filter((l) => l.created_by === v.user_id);
    if (!eigene.length) continue;
    const ergebnis = await briefingFuerPerson(admin, v, { name: nameVon.get(v.user_id), jetzt, termine: eigene });
    if (ergebnis.termine || ergebnis.fragen) {
      gesendet += 1;
      fragen += ergebnis.fragen;
      await admin.from("telegram_verknuepfungen").update({ briefing_fuer: f.heute }).eq("user_id", v.user_id);
    }
  }
  return { gesendet, fragen };
}

// Um diese Stunde (Berliner Zeit) soll das Briefing da sein.
export const BRIEFING_STUNDE = 8;

/**
 * Das Briefing, sobald es in Berlin 8 Uhr ist.
 *
 * Vercel Hobby kennt nur zwei tägliche Läufe, und beide laufen nach UTC.
 * 8 Uhr in Berlin ist im Sommer 6 Uhr UTC, im Winter 7 Uhr UTC. Deshalb
 * rufen BEIDE Läufe diese Funktion auf — der Aufräum-Lauf um 6 Uhr UTC und
 * der Tagesbericht um 7 Uhr UTC —, und verschickt wird nur ab 8 Uhr
 * Berliner Zeit. Im Winter ist der frühe Lauf um 7 und schickt nichts; im
 * Sommer schickt er um 8, und der spätere Lauf um 9 findet nur noch, was
 * liegen blieb. Doppelt kommt nichts: briefing_fuer merkt sich den Tag.
 */
export async function briefingUmAcht(admin, { jetzt = new Date() } = {}) {
  const stunde = berlinStunde(jetzt);
  if (stunde < BRIEFING_STUNDE) return { gesendet: 0, grund: `Erst um ${BRIEFING_STUNDE} Uhr (jetzt ${stunde} Uhr)` };
  return sendeBriefings(admin, { jetzt });
}
