import { callAI } from "./aiClient.js";
import { alleZeilen } from "./alleZeilen.js";
import { TERMIN_ARTEN, artVon, istKundeGeworden, rueckeVor } from "./terminArt.js";
import { bestaetigungsPatch, schrittFuer, meldeBestaetigung } from "./buddyBestaetigung.js";
import { berlinHeute, tagPlus, tagesBeginnZeitpunkt, zeitpunktInBerlin } from "./woche.js";
import { tagesName } from "./tagesauswertung.js";
import { inZone, deutscheZeit, DEUTSCHE_ZONE } from "./terminzeit.js";
import { sendePersoenlich } from "./telegramPersoenlich.js";
import { sendeTerminMeldung } from "./terminMeldungSenden.js";
import { quittiereKnopf, ersetzeNachricht } from "./telegramApi.js";
import { sendeAlarm } from "./alarm.js";
import { setzeModus, loescheModus } from "./buddyModus.js";

// Termin-Ergebnisse als freier Satz: "Müller: Kunde geworden" oder
// "Schneider – Closing am Donnerstag um 14 Uhr".
//
// Die KI liest aus dem Satz nur heraus, WER gemeint ist und WAS passiert
// ist. Eingetragen wird nichts, bevor die Person es bestätigt hat: Die
// Academy zeigt den Vorschlag mit dem gefundenen Termin, und erst ein
// Tippen auf "Ja, eintragen" schreibt ihn. Ein falsch verstandener Satz
// soll nie als Abschluss in den Zahlen des Teams landen.
//
// Gesucht wird nur unter den EIGENEN Terminen. Der Vorschlag wartet in
// telegram_verknuepfungen.modus_daten (migration_175) — die Knöpfe tragen
// nur "ja", "nein" oder die Nummer der Auswahl, keine Termin-Kennung.

export const VORSCHLAG_GUELTIG_MINUTEN = 60;
const MAX_AUSWAHL = 3;

export const ERGEBNISSE = {
  // Kein Ergebnis, sondern ein Haken vor dem Termin: die Bestätigung.
  // Der Patch hängt an der Stufe und entsteht deshalb erst in eintragPatch.
  bestaetigt: { label: "Termin bestätigt", bestaetigung: true, patch: {} },
  kunde: { label: "Kunde geworden", patch: { outcome: "kunde", status: "wahrgenommen" } },
  ueberlegt: { label: "Überlegt noch", patch: { outcome: "follow_up", status: "wahrgenommen" } },
  kein_abschluss: { label: "Kein Abschluss", patch: { outcome: "absage", status: "wahrgenommen" } },
  nicht_stattgefunden: { label: "Fand nicht statt / abgesagt", patch: { status: "abgesagt" } },
  stattgefunden: { label: "Hat stattgefunden", patch: { status: "wahrgenommen" } },
};

const ARTEN = TERMIN_ARTEN.map((a) => a.key);

/**
 * Lohnt es sich, die KI zu fragen? Nur wenn der Satz nach einem Termin
 * klingt — sonst kostete jede Plauderei eine Anfrage mehr.
 */
export function klingtNachErgebnis(text) {
  const t = String(text || "").toLowerCase();
  if (t.length > 600) return false;
  return /(kunde geworden|ist kunde|abgeschlossen|abschluss gemacht|unterschrieben|zugesagt|gekauft|abgesagt|abgesprungen|kein interesse|kein budget|nicht erschienen|nicht gekommen|no[- ]?show|closing|folgetermin|check-?in|setting|termin (mit|bei|am)|lief (gut|super|schlecht|mies)|überlegt|will (noch )?überlegen|verschoben|nächste[rn]? termin|meldet sich)/.test(t);
}

/** Die nächsten Tage mit Wochentag — damit "Donnerstag" ein Datum wird. */
export function kalenderZeilen(heute, tage = 14) {
  const zeilen = [];
  for (let i = 0; i <= tage; i += 1) {
    const t = tagPlus(heute, i);
    zeilen.push(`${tagesName(t)} = ${t}${i === 0 ? " (heute)" : i === 1 ? " (morgen)" : ""}`);
  }
  return zeilen;
}

export function leseAnweisung(heute) {
  return [
    "Du liest die Nachricht eines Vertrieblers und erkennst, ob er ein Ergebnis zu einem Kundentermin mitteilt oder einen nächsten Termin nennt.",
    `Heute ist ${tagesName(heute)}, ${heute}. Die nächsten Tage:`,
    ...kalenderZeilen(heute),
    "Antworte AUSSCHLIESSLICH mit diesem JSON, ohne Text davor oder danach:",
    '{"kunde": "<Name der Person oder Firma, genau wie geschrieben>" | null,',
    ' "ergebnis": "bestaetigt" | "kunde" | "ueberlegt" | "kein_abschluss" | "nicht_stattgefunden" | "stattgefunden" | null,',
    ' "naechster": {"art": "erstgespraech" | "folgetermin" | "closing" | "checkin", "datum": "JJJJ-MM-TT", "uhrzeit": "HH:MM" | null} | null,',
    ' "notiz": "<wichtige Zusatzinfo in einem kurzen Satz>" | null}',
    "Regeln:",
    "- \"bestaetigt\": Der Termin ist noch nicht gewesen, aber bestätigt — der Kunde hat zugesagt, dass er stattfindet.",
    "- \"kunde\" NUR bei einem klaren Abschluss (unterschrieben, zugesagt, gekauft, ist Kunde).",
    "- Ein vereinbarter Closing Call ist KEIN Abschluss: ergebnis \"stattgefunden\" und naechster mit art \"closing\".",
    "- Ein weiteres Gespräch, weil der Kunde noch überlegt: ergebnis \"ueberlegt\" und naechster mit art \"folgetermin\".",
    "- Nicht erschienen, abgesagt, nicht erreicht zum Termin: \"nicht_stattgefunden\".",
    "- Kein Budget, kein Interesse, hat sich dagegen entschieden: \"kein_abschluss\".",
    "- Wochentage und \"morgen\" rechnest du mit der Liste oben in ein Datum um, immer heute oder später.",
    "- Keine Uhrzeit genannt: \"uhrzeit\": null. Erfinde keine Uhrzeit.",
    "- Geht es um keinen Kundentermin, sind alle Felder null.",
  ].join("\n");
}

function jsonAus(roh) {
  const text = String(roh || "").replace(/```json|```/g, "").trim();
  const start = text.indexOf("{");
  const ende = text.lastIndexOf("}");
  if (start < 0 || ende <= start) return null;
  try { return JSON.parse(text.slice(start, ende + 1)); } catch (e) { return null; }
}

/**
 * Die Antwort der KI prüfen. Alles, was nicht genau passt, fällt weg —
 * lieber ein Vorschlag mit weniger als einer mit Erfundenem.
 */
export function leseVorschlag(roh, heute) {
  const d = typeof roh === "string" ? jsonAus(roh) : roh;
  if (!d || typeof d !== "object") return null;
  const kunde = typeof d.kunde === "string" ? d.kunde.trim().slice(0, 80) : "";
  if (!kunde) return null;

  const ergebnis = ERGEBNISSE[d.ergebnis] ? d.ergebnis : null;
  let naechster = null;
  const n = d.naechster;
  if (n && ARTEN.includes(n.art) && /^\d{4}-\d{2}-\d{2}$/.test(String(n.datum || ""))) {
    // Ein Datum in der Vergangenheit oder in einem halben Jahr ist ein
    // Lesefehler, kein Termin.
    if (n.datum >= heute && n.datum <= tagPlus(heute, 180)) {
      const uhrzeit = /^\d{1,2}:\d{2}$/.test(String(n.uhrzeit || "")) ? n.uhrzeit : null;
      naechster = { art: n.art, datum: n.datum, uhrzeit, zeitpunkt: uhrzeit ? zeitpunktInBerlin(n.datum, uhrzeit) : null };
    }
  }
  const notiz = typeof d.notiz === "string" && d.notiz.trim() ? d.notiz.trim().slice(0, 300) : null;
  if (!ergebnis && !naechster && !notiz) return null;
  return { kunde, ergebnis, naechster, notiz };
}

const normal = (t) => String(t || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const FUELLWORTE = new Set(["herr", "herrn", "frau", "firma", "gmbh", "ug", "ag", "kg", "und", "co", "der", "die", "das", "mit", "bei"]);

/**
 * Die Termine, die zum Namen passen — die nächstliegenden zuerst.
 * Ein ganzer Treffer (Name oder Firma) schlägt einen einzelnen Wortteil.
 */
export function passendeTermine(leads = [], suche = "", jetzt = new Date()) {
  const s = normal(suche);
  const worte = s.split(" ").filter((w) => w.length >= 3 && !FUELLWORTE.has(w));
  if (!s || !worte.length) return [];
  const bewertet = leads.map((l) => {
    const name = normal(l.name);
    const firma = normal(l.company);
    let punkte = 0;
    if (name === s || firma === s) punkte = 10;
    else if ((name && name.includes(s)) || (firma && firma.includes(s))) punkte = 6;
    else {
      const eigene = new Set(`${name} ${firma}`.split(" "));
      punkte = worte.filter((w) => eigene.has(w)).length * 3;
    }
    const abstand = Math.abs(new Date(l.appointment_at).getTime() - jetzt.getTime());
    return { l, punkte, abstand, vorbei: new Date(l.appointment_at).getTime() <= jetzt.getTime() };
  }).filter((b) => b.punkte > 0);
  const beste = Math.max(0, ...bewertet.map((b) => b.punkte));
  return bewertet
    .filter((b) => b.punkte === beste)
    // Vergangene Termine zuerst: über die meldet man ein Ergebnis.
    .sort((a, b) => (a.vorbei === b.vorbei ? a.abstand - b.abstand : a.vorbei ? -1 : 1))
    .map((b) => b.l);
}

/** Was in die Datenbank geht — dieselben Schritte wie auf der Termin-Seite. */
export function eintragPatch(lead, vorschlag, userId, heute = berlinHeute()) {
  let patch = { ...(ERGEBNISSE[vorschlag.ergebnis]?.patch || {}) };
  if (ERGEBNISSE[vorschlag.ergebnis]?.bestaetigung) {
    patch = { ...patch, ...(bestaetigungsPatch(lead, userId)?.patch || {}) };
  }
  // Erst das Ergebnis, dann das Weiterrücken: So steht das Ergebnis im
  // Verlauf bei der Stufe, zu der es gehört.
  if (vorschlag.naechster?.zeitpunkt) {
    patch = { ...patch, ...rueckeVor({ ...lead, ...patch }, vorschlag.naechster.art, vorschlag.naechster.zeitpunkt, userId) };
  }
  if (vorschlag.notiz) {
    const [, m, t] = heute.split("-").map(Number);
    patch.notes = [lead.notes, `${t}.${m}.: ${vorschlag.notiz}`].filter(Boolean).join("\n");
  }
  return patch;
}

const wann = (iso) => inZone(iso, DEUTSCHE_ZONE, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const stufe = (key) => TERMIN_ARTEN.find((a) => a.key === key)?.label || "Termin";
const wer = (lead) => `${lead.name}${lead.company ? ` (${lead.company})` : ""}`;

export function vorschlagText(lead, v) {
  const art = artVon(lead);
  const zeilen = [
    "📝 Soll ich das so eintragen?",
    "",
    `${wer(lead)} · ${art.key === "unbestimmt" ? "Termin" : art.label} ${wann(lead.appointment_at)}`,
  ];
  if (v.ergebnis === "bestaetigt") {
    const schritt = schrittFuer(lead);
    zeilen.push(schritt ? `• ${schritt.label}` : "• Für diese Stufe gibt es keinen Bestätigungs-Haken — ich trage nur die Notiz ein.");
  } else if (v.ergebnis) zeilen.push(`• Ergebnis: ${ERGEBNISSE[v.ergebnis].label}`);
  if (v.naechster?.zeitpunkt) zeilen.push(`• Nächster Termin: ${stufe(v.naechster.art)} ${wann(v.naechster.zeitpunkt)}`);
  if (v.notiz) zeilen.push(`• Notiz: ${v.notiz}`);
  if (v.naechster && !v.naechster.zeitpunkt) {
    const [, m, t] = v.naechster.datum.split("-").map(Number);
    zeilen.push("", `Den ${stufe(v.naechster.art)} am ${tagesName(v.naechster.datum)}, ${t}.${m}. trage ich nicht ein — die Uhrzeit fehlt. Schreib sie mir dazu, z. B. „${lead.name}: ${stufe(v.naechster.art)} ${tagesName(v.naechster.datum)} 14 Uhr“.`);
  }
  return zeilen.join("\n");
}

export function hatEtwasZuTun(v, lead = null) {
  // Eine Bestätigung ist nur dann etwas zu tun, wenn es zur Stufe einen
  // Haken gibt und er noch offen ist.
  if (v?.ergebnis === "bestaetigt" && lead && !bestaetigungsPatch(lead, "x")) {
    return !!(v?.naechster?.zeitpunkt || v?.notiz);
  }
  return !!(v?.ergebnis || v?.naechster?.zeitpunkt || v?.notiz);
}

export const JA_NEIN = { inline_keyboard: [[{ text: "✅ Ja, eintragen", callback_data: "b:j" }, { text: "✖️ Nein", callback_data: "b:n" }]] };

export function auswahlKnoepfe(leads) {
  return {
    inline_keyboard: [
      ...leads.map((l, i) => [{ text: `${l.name}${l.company ? `, ${l.company}` : ""} · ${inZone(l.appointment_at, DEUTSCHE_ZONE, { day: "numeric", month: "numeric" })}`.slice(0, 60), callback_data: `b:${i}` }]),
      [{ text: "Keiner davon", callback_data: "b:n" }],
    ],
  };
}

export function istAbgelaufen(seit, jetzt = new Date()) {
  return !seit || jetzt.getTime() - new Date(seit).getTime() > VORSCHLAG_GUELTIG_MINUTEN * 60000;
}

async function ladeEigeneTermine(admin, userId, jetzt) {
  const heute = berlinHeute(jetzt);
  const { data, error } = await alleZeilen(() => admin.from("leads")
    .select("id, name, company, created_by, organization_id, termin_art, status, outcome, appointment_at, notes, stufen_verlauf, kein_kundentermin")
    .eq("created_by", userId).is("geloescht_am", null).eq("kein_kundentermin", false)
    .gte("appointment_at", tagesBeginnZeitpunkt(tagPlus(heute, -21)))
    .lt("appointment_at", tagesBeginnZeitpunkt(tagPlus(heute, 61)))
    .order("id"));
  if (error) throw error;
  return data || [];
}

const merkeVorschlag = (admin, v, daten) => setzeModus(admin, v, "eintrag", daten);

const vergiss = (admin, userId) => loescheModus(admin, userId);

/**
 * Aus einem Satz einen Vorschlag machen.
 *
 * @returns true, wenn der Satz als Termin-Mitteilung behandelt wurde —
 *          false, wenn er ins normale Gespräch gehört.
 */
export async function versucheEintrag(admin, v, text, { jetzt = new Date(), ki = callAI } = {}) {
  if (!klingtNachErgebnis(text)) return false;
  const heute = berlinHeute(jetzt);
  let roh = "";
  try { roh = await ki(leseAnweisung(heute), [{ role: "user", content: text }], 250); } catch (e) {
    console.error("Vertriebsbuddy: Eintrag nicht gelesen:", e.message);
    return false;
  }
  const vorschlag = leseVorschlag(roh, heute);
  if (!vorschlag) return false;

  const treffer = passendeTermine(await ladeEigeneTermine(admin, v.user_id, jetzt), vorschlag.kunde, jetzt);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  if (!treffer.length) {
    // Nicht gefunden heisst oft: Der Kontakt ist noch gar nicht angelegt.
    // Dann gleich den Weg dorthin anbieten (lib/buddyNeuerTermin.js).
    await setzeModus(admin, v, "eintrag", {
      neuerName: vorschlag.kunde,
      neueZeit: vorschlag.naechster?.zeitpunkt ? vorschlag.naechster : null,
    });
    await sendePersoenlich(admin, v,
      `Zu „${vorschlag.kunde}“ finde ich bei deinen Terminen nichts. Soll ich den Kontakt neu anlegen?`,
      { reply_markup: { inline_keyboard: [[{ text: "➕ Neu anlegen", callback_data: "n:neu" }, { text: "✖️ Nein", callback_data: "b:n" }]] } });
    return true;
  }
  if (treffer.length > 1) {
    const auswahl = treffer.slice(0, MAX_AUSWAHL);
    if (!(await merkeVorschlag(admin, v, { vorschlag, kandidaten: auswahl.map((l) => l.id) }))) return false;
    await sendePersoenlich(admin, v, `Welcher Termin mit „${vorschlag.kunde}“ ist gemeint?`, { reply_markup: auswahlKnoepfe(auswahl) });
    return true;
  }
  const lead = treffer[0];
  if (!hatEtwasZuTun(vorschlag, lead)) {
    await sendePersoenlich(admin, v, vorschlagText(lead, vorschlag));
    return true;
  }
  if (!(await merkeVorschlag(admin, v, { vorschlag, leadId: lead.id }))) return false;
  await sendePersoenlich(admin, v, vorschlagText(lead, vorschlag), { reply_markup: JA_NEIN });
  return true;
}

/** Ein Tippen auf "Ja", "Nein" oder eine Auswahl. */
export async function bearbeiteEintragKnopf(admin, knopf, { jetzt = new Date() } = {}) {
  const wahl = String(knopf?.daten || "").match(/^b:([jn0-9])$/)?.[1];
  const { data: zeilen } = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, modus, modus_daten, modus_seit").eq("chat_id", String(knopf?.chat_id || "")).limit(1);
  const v = zeilen?.[0];
  const beende = async (hinweis, text) => {
    await quittiereKnopf(knopf.id, hinweis);
    if (knopf.nachricht_id && text) await ersetzeNachricht(knopf.chat_id, knopf.nachricht_id, text);
  };

  if (!wahl || !v) { await beende("Dieser Knopf gilt nicht mehr."); return { ok: false }; }
  if (v.modus !== "eintrag" || istAbgelaufen(v.modus_seit, jetzt)) {
    await beende("Dieser Vorschlag ist abgelaufen.", `${knopf.nachricht_text}\n\n⌛ Abgelaufen — schreib es mir einfach noch einmal.`);
    return { ok: false };
  }
  const daten = v.modus_daten || {};
  if (wahl === "n") {
    await vergiss(admin, v.user_id);
    await beende("Nicht eingetragen.", `${knopf.nachricht_text}\n\n✖️ Nicht eingetragen.`);
    return { ok: true, eingetragen: false };
  }

  // Eine Auswahl aus mehreren Terminen: jetzt den Vorschlag zeigen.
  if (/^\d$/.test(wahl)) {
    const leadId = (daten.kandidaten || [])[Number(wahl)];
    const { data: lead } = leadId
      ? await admin.from("leads").select("*").eq("id", leadId).is("geloescht_am", null).maybeSingle()
      : { data: null };
    if (!lead || lead.created_by !== v.user_id) { await beende("Diesen Termin finde ich nicht mehr."); return { ok: false }; }
    await beende("Ausgewählt", `${knopf.nachricht_text}\n\n→ ${wer(lead)}`);
    if (!hatEtwasZuTun(daten.vorschlag, lead)) {
      await vergiss(admin, v.user_id);
      await sendeAlarm(vorschlagText(lead, daten.vorschlag), knopf.chat_id);
      return { ok: true, eingetragen: false };
    }
    await merkeVorschlag(admin, v, { vorschlag: daten.vorschlag, leadId: lead.id });
    await sendeAlarm(vorschlagText(lead, daten.vorschlag), knopf.chat_id, { reply_markup: JA_NEIN });
    return { ok: true, auswahl: true };
  }

  // "Ja, eintragen".
  const { data: lead } = daten.leadId
    ? await admin.from("leads").select("*").eq("id", daten.leadId).is("geloescht_am", null).maybeSingle()
    : { data: null };
  // Nur eigene Termine — die Kennung stammt zwar aus der eigenen Suche,
  // geprüft wird trotzdem hier, wo geschrieben wird.
  if (!lead || lead.created_by !== v.user_id) { await vergiss(admin, v.user_id); await beende("Diesen Termin finde ich nicht mehr."); return { ok: false }; }

  const vorschlag = daten.vorschlag || {};
  const patch = eintragPatch(lead, vorschlag, v.user_id, berlinHeute(jetzt));
  const warSchonKunde = istKundeGeworden(lead);
  const { error } = await admin.from("leads").update(patch).eq("id", lead.id);
  if (error) {
    console.error("Eintrag aus Telegram nicht gespeichert:", error.message);
    await beende("Das hat nicht geklappt. Trag es bitte in der Academy ein.");
    return { ok: false, fehler: error.message };
  }
  await vergiss(admin, v.user_id);
  await beende("Eingetragen", `${String(knopf.nachricht_text || "").replace(/^📝 Soll ich das so eintragen\?\n\n/, "")}\n\n✅ Eingetragen.`);

  // Die Meldungen an die Gruppe — dieselben wie aus der Academy.
  const { data: profil } = await admin.from("profiles").select("full_name, organization_id").eq("id", v.user_id).maybeSingle();
  const basis = { orgId: lead.organization_id || profil?.organization_id, wer: profil?.full_name || "" };
  const neu = { ...lead, ...patch };
  if (vorschlag.ergebnis === "bestaetigt") {
    const schritt = schrittFuer(lead);
    if (schritt) await meldeBestaetigung(admin, { lead: neu, orgId: basis.orgId, schritt, name: basis.wer });
  }
  if (vorschlag.ergebnis === "kunde" && !warSchonKunde) {
    await sendeTerminMeldung(admin, { ...basis, lead: neu, grund: "kunde", ereignis: "ergebnis", beschreibung: "Ergebnis: Kunde geworden" });
  }
  if (vorschlag.naechster?.zeitpunkt) {
    await sendeTerminMeldung(admin, {
      ...basis, lead: neu, grund: "verschoben", ereignis: "bearbeitet",
      beschreibung: `${stufe(vorschlag.naechster.art)} mit ${lead.name} am ${deutscheZeit(vorschlag.naechster.zeitpunkt)} Uhr.`,
    });
  } else if (patch.status === "abgesagt" && new Date(lead.appointment_at).getTime() > jetzt.getTime()) {
    await sendeTerminMeldung(admin, { ...basis, lead: neu, grund: "abgesagt", ereignis: "status", beschreibung: "Der Termin wurde abgesagt." });
  }
  return { ok: true, eingetragen: true, patch };
}
