import { resolveLeadFields, resolveCoreRequired, RESERVED_FIELD_COLUMNS } from "./leadFields.js";
import { berlinHeute, tagPlus, zeitpunktInBerlin } from "./woche.js";
import { tagesName } from "./tagesauswertung.js";
import { deutscheZeit } from "./terminzeit.js";
import { sendePersoenlich } from "./telegramPersoenlich.js";
import { meldeNeuenTermin } from "./terminAngelegt.js";
import { aktiveOrgId } from "./aktiveOrgServer.js";
import { quittiereKnopf, ersetzeNachricht } from "./telegramApi.js";
import { sendeAlarm } from "./alarm.js";
import { setzeModus } from "./buddyModus.js";

// Einen neuen Termin im Chat anlegen — der Buddy fragt der Reihe nach ab,
// was die Organisation verlangt.
//
// Gefragt wird genau das, was auch das Termin-Formular der Organisation
// verlangt (lib/leadFields.js): Name und Zeitpunkt immer, Telefon und
// E-Mail je nach Einstellung, dazu jedes eigene Pflichtfeld. Firma und
// Notiz kommen als freiwillige Fragen dazu, weil beides in jeder Meldung
// an das Team auftaucht.
//
// Eingetragen wird auch hier erst nach einer Bestätigung. Der Zeitpunkt
// wird NICHT von der KI gelesen, sondern hier gerechnet: "Montag 11 Uhr"
// darf nicht in einem anderen Monat landen.

const WOCHENTAGE = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 0,
  mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 0,
};

const ABBRUCH = /^(abbrechen|abbruch|stopp?|nein danke|doch nicht|vergiss es)$/i;
const UEBERSPRINGEN = /^(-|–|—|keine?|keins|nichts|weiter|skip|überspringen|uberspringen)$/i;

/** Will jemand einen neuen Termin anlegen? */
export function willNeuenTermin(text) {
  const t = String(text || "").toLowerCase();
  return /\b(neue[rn]?\s+(termin|kontakt|kunde|interessent|setting)|termin\s+(anlegen|erfassen|neu)|lead\s+anlegen|neuen\s+lead)\b/.test(t);
}

function wochentagsDatum(wort, heute) {
  const ziel = WOCHENTAGE[wort];
  if (ziel === undefined) return null;
  // Der NÄCHSTE Tag mit diesem Namen, heute eingeschlossen.
  for (let i = 0; i < 8; i += 1) {
    const tag = tagPlus(heute, i);
    if (new Date(`${tag}T12:00:00Z`).getUTCDay() === ziel) return tag;
  }
  return null;
}

/**
 * Datum und Uhrzeit aus einem Satz — ohne KI.
 *
 * Versteht "morgen 9:30", "Montag 11 Uhr", "23.9. 14:00", "23.09.2026 14 Uhr".
 * Ohne Uhrzeit gibt es kein Ergebnis: ein Termin ohne Uhrzeit ist keiner.
 */
export function leseZeitpunkt(text, heute = berlinHeute()) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return null;

  let datum = null;
  // Erst mit vierstelliger Jahreszahl ("23.09.2027"), sonst ohne. Eine
  // zweistellige Zahl dahinter wird nur dann als Jahr gelesen, wenn keine
  // Uhrzeit daraus wird: In "23.9. 14:00" ist die 14 die Stunde.
  const mitPunkt = t.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/)
    || t.match(/\b(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{2})(?!\s*[:.]?\d)(?!\s*uhr))?/);
  if (mitPunkt) {
    const [, tag, monat, jahrRoh] = mitPunkt;
    let jahr = jahrRoh ? Number(jahrRoh.length === 2 ? `20${jahrRoh}` : jahrRoh) : Number(heute.slice(0, 4));
    const kandidat = `${jahr}-${String(Number(monat)).padStart(2, "0")}-${String(Number(tag)).padStart(2, "0")}`;
    // Ohne Jahresangabe ist ein vergangenes Datum das nächste Jahr gemeint.
    datum = (!jahrRoh && kandidat < heute) ? `${jahr + 1}${kandidat.slice(4)}` : kandidat;
  } else if (/\bheute\b/.test(t)) datum = heute;
  else if (/\bmorgen\b/.test(t)) datum = tagPlus(heute, 1);
  else if (/\bübermorgen\b/.test(t)) datum = tagPlus(heute, 2);
  else {
    const wort = Object.keys(WOCHENTAGE).find((w) => new RegExp(`\\b${w}\\b`).test(t));
    if (wort) datum = wochentagsDatum(wort, heute);
  }
  if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  const [j, m, tg] = datum.split("-").map(Number);
  if (m < 1 || m > 12 || tg < 1 || tg > 31 || j < 2020 || j > 2100) return null;

  // Uhrzeit: "14:30", "14.30 Uhr", "14 Uhr", "um 9". Der Punkt zählt nur
  // mit "Uhr" dahinter — sonst würde aus dem Datum "23.09.2027" die
  // Uhrzeit 23:09.
  const zeit = t.match(/\b(\d{1,2}):(\d{2})\b/)
    || t.match(/\b(\d{1,2})\.(\d{2})\s*uhr\b/)
    || t.match(/\b(\d{1,2})\s*uhr\b/)
    || t.match(/\bum\s+(\d{1,2})\b/);
  if (!zeit) return null;
  const stunde = Number(zeit[1]);
  const minute = zeit[2] ? Number(zeit[2]) : 0;
  if (stunde > 23 || minute > 59) return null;
  const uhrzeit = `${String(stunde).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const zeitpunkt = zeitpunktInBerlin(datum, uhrzeit);
  return zeitpunkt ? { datum, uhrzeit, zeitpunkt } : null;
}

/** Welche Angaben diese Organisation braucht — in der Reihenfolge der Fragen. */
export function fragenFuer(org) {
  const core = resolveCoreRequired(org);
  const felder = resolveLeadFields(org);
  const fragen = [
    { key: "name", label: "Name", pflicht: true, frage: "Wie heisst die Person? (Vor- und Nachname)" },
    { key: "termin", label: "Termin", pflicht: true, frage: "Wann ist der Termin? Zum Beispiel „Montag 11 Uhr“, „morgen 9:30“ oder „23.9. 14:00“." },
  ];
  if (core.phone) fragen.push({ key: "phone", label: "Telefon", pflicht: true, frage: "Welche Telefonnummer?" });
  if (core.email) fragen.push({ key: "email", label: "E-Mail", pflicht: true, frage: "Welche E-Mail-Adresse?" });

  felder.forEach((f) => {
    if (f.key === "phone" || f.key === "email") return;
    // Freiwillig gefragt werden nur Firma und Notiz — sie stehen in jeder
    // Meldung an das Team. Alle anderen freiwilligen Felder würden den
    // Dialog länger machen als das Formular.
    const freiwillig = f.key === "company" || f.key === "notes";
    if (!f.required && !freiwillig) return;
    fragen.push({
      key: f.key,
      label: f.label,
      typ: f.type || "text",
      pflicht: !!f.required,
      frage: f.type === "checkbox"
        ? `${f.label}? (ja oder nein)`
        : `${f.label}?${f.required ? "" : " (oder „–“ zum Überspringen)"}`,
    });
  });
  return fragen;
}

export function naechsteFrage(fragen = [], werte = {}) {
  return fragen.find((f) => werte[f.key] === undefined) || null;
}

/** Eine Antwort prüfen: { wert } oder { fehler }. */
export function leseAntwort(frage, text, heute = berlinHeute()) {
  const roh = String(text || "").trim();
  if (!frage) return { fehler: "Da bin ich raus." };
  if (!frage.pflicht && UEBERSPRINGEN.test(roh)) return { wert: null };
  if (!roh) return { fehler: "Da stand nichts drin. Versuch es noch einmal." };

  if (frage.key === "termin") {
    const zeit = leseZeitpunkt(roh, heute);
    if (!zeit) return { fehler: "Das habe ich nicht als Zeitpunkt verstanden. Schreib es zum Beispiel so: „Montag 11 Uhr“, „morgen 9:30“ oder „23.9. 14:00“." };
    return { wert: zeit };
  }
  if (frage.typ === "checkbox") {
    if (/^(ja|j|yes|stimmt|richtig)$/i.test(roh)) return { wert: true };
    if (/^(nein|n|no|nicht)$/i.test(roh)) return { wert: false };
    return { fehler: "Bitte mit ja oder nein antworten." };
  }
  if (frage.key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(roh)) {
    return { fehler: "Das sieht nicht nach einer E-Mail-Adresse aus." };
  }
  if (frage.key === "phone" && (roh.replace(/\D/g, "").length < 5)) {
    return { fehler: "Das sieht nicht nach einer Telefonnummer aus." };
  }
  return { wert: roh.slice(0, 300) };
}

const zeitText = (zeit) => `${tagesName(zeit.datum)}, ${Number(zeit.datum.slice(8))}.${Number(zeit.datum.slice(5, 7))}., ${zeit.uhrzeit} Uhr`;

export function zusammenfassung(fragen, werte) {
  const zeilen = fragen.map((f) => {
    const wert = werte[f.key];
    if (wert === null || wert === undefined || wert === "") return null;
    if (f.key === "termin") return `• Termin: ${zeitText(wert)}`;
    if (f.typ === "checkbox") return `• ${f.label}: ${wert ? "Ja" : "Nein"}`;
    return `• ${f.label}: ${wert}`;
  }).filter(Boolean);
  return ["📋 Soll ich diesen Termin anlegen?", "", ...zeilen, "", "Stufe: Setting Call"].join("\n");
}

export const ANLEGEN_KNOEPFE = {
  inline_keyboard: [[{ text: "✅ Ja, anlegen", callback_data: "n:j" }, { text: "✖️ Abbrechen", callback_data: "n:n" }]],
};

/** Aus den Antworten die Zeile für die Datenbank und die Felder für die Meldung. */
export function baueTermin(fragen, werte, { userId, orgId }) {
  const spalten = {};
  const custom = {};
  const felder = [];
  fragen.forEach((f) => {
    if (["name", "termin", "phone", "email"].includes(f.key)) return;
    const wert = werte[f.key] === undefined ? null : werte[f.key];
    felder.push({ key: f.key, label: f.label, type: f.typ || "text", value: wert });
    const spalte = RESERVED_FIELD_COLUMNS[f.key];
    if (spalte) spalten[spalte] = f.typ === "checkbox" ? !!wert : (wert || null);
    else if (wert !== null && wert !== "") custom[f.key] = wert;
  });
  return {
    zeile: {
      created_by: userId,
      organization_id: orgId,
      name: werte.name,
      phone: werte.phone || null,
      email: werte.email || null,
      termin_art: "erstgespraech",
      ...spalten,
      custom_fields: custom,
      appointment_at: werte.termin.zeitpunkt,
    },
    felder,
  };
}

async function orgVon(admin, profil, userId) {
  const orgId = await aktiveOrgId(admin, profil, userId).catch(() => profil?.organization_id || null);
  if (!orgId) return { orgId: null, org: null };
  const { data: org } = await admin.from("organizations")
    .select("id, lead_field_config, lead_core_required").eq("id", orgId).maybeSingle();
  return { orgId, org: org || null };
}

/** Den Dialog beginnen — mit dem, was schon bekannt ist (Name, Zeitpunkt). */
export async function starteNeuenTermin(admin, v, profil, vorgabe = {}) {
  const { orgId, org } = await orgVon(admin, profil, v.user_id);
  if (!orgId) {
    return sendePersoenlich(admin, v, "Ich finde deine Organisation nicht — leg den Termin bitte in der Academy an.");
  }
  const fragen = fragenFuer(org);
  const werte = {};
  if (vorgabe.name) werte.name = String(vorgabe.name).slice(0, 120);
  if (vorgabe.zeit) werte.termin = vorgabe.zeit;

  // Scheitert das Speichern, hat setzeModus den Grund schon in den Chat
  // geschrieben.
  if (!(await setzeModus(admin, v, "neuerTermin", { werte, fragen }))) return false;
  const naechste = naechsteFrage(fragen, werte);
  if (!naechste) return zeigeZusammenfassung(admin, v, fragen, werte);
  return sendePersoenlich(admin, v, [
    "📋 Neuer Termin. Ich frage der Reihe nach — mit „abbrechen“ hörst du jederzeit auf.",
    "",
    naechste.frage,
  ].join("\n"));
}

function zeigeZusammenfassung(admin, v, fragen, werte) {
  return sendePersoenlich(admin, v, zusammenfassung(fragen, werte), { reply_markup: ANLEGEN_KNOEPFE });
}

/** Eine Antwort im laufenden Dialog. */
export async function neuerTerminAntwort(admin, v, text) {
  const daten = v.modus_daten || {};
  const fragen = Array.isArray(daten.fragen) ? daten.fragen : [];
  const werte = daten.werte || {};
  if (!fragen.length) { await setzeModus(admin, v, null); return false; }

  if (ABBRUCH.test(String(text).trim())) {
    await setzeModus(admin, v, null);
    return sendePersoenlich(admin, v, "Abgebrochen — es wurde nichts angelegt.");
  }

  const frage = naechsteFrage(fragen, werte);
  const antwort = leseAntwort(frage, text);
  if (antwort.fehler) return sendePersoenlich(admin, v, antwort.fehler);

  const neueWerte = { ...werte, [frage.key]: antwort.wert };
  await setzeModus(admin, v, "neuerTermin", { werte: neueWerte, fragen });
  const naechste = naechsteFrage(fragen, neueWerte);
  if (naechste) return sendePersoenlich(admin, v, naechste.frage);
  return zeigeZusammenfassung(admin, v, fragen, neueWerte);
}

/** "Ja, anlegen" oder "Abbrechen" — und der Weg aus dem Vorschlag "neu anlegen". */
export async function bearbeiteNeuerTerminKnopf(admin, knopf, { jetzt = new Date() } = {}) {
  const wahl = String(knopf?.daten || "").match(/^n:(j|n|neu)$/)?.[1];
  const { data: zeilen } = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, modus, modus_daten, modus_seit").eq("chat_id", String(knopf?.chat_id || "")).limit(1);
  const v = zeilen?.[0];
  const beende = async (hinweis, text) => {
    await quittiereKnopf(knopf.id, hinweis);
    if (knopf.nachricht_id && text) await ersetzeNachricht(knopf.chat_id, knopf.nachricht_id, text);
  };
  if (!wahl || !v) { await beende("Dieser Knopf gilt nicht mehr."); return { ok: false }; }

  const { data: profil } = await admin.from("profiles")
    .select("id, full_name, role, is_admin, is_platform_admin, organization_id").eq("id", v.user_id).maybeSingle();

  // Aus dem Eintrags-Vorschlag heraus: "Zu Berger finde ich nichts — neu anlegen?"
  if (wahl === "neu") {
    const daten = v.modus_daten || {};
    await beende("Los geht's", `${knopf.nachricht_text}\n\n➕ Neu anlegen …`);
    return starteNeuenTermin(admin, v, profil, { name: daten.neuerName || "", zeit: daten.neueZeit || null });
  }
  if (v.modus !== "neuerTermin") { await beende("Dieser Vorschlag ist abgelaufen."); return { ok: false }; }
  if (wahl === "n") {
    await setzeModus(admin, v, null);
    await beende("Abgebrochen.", `${knopf.nachricht_text}\n\n✖️ Nicht angelegt.`);
    return { ok: true, angelegt: false };
  }

  const daten = v.modus_daten || {};
  const fragen = Array.isArray(daten.fragen) ? daten.fragen : [];
  const werte = daten.werte || {};
  if (!werte.name || !werte.termin?.zeitpunkt) { await beende("Da fehlt noch etwas."); return { ok: false }; }

  const { orgId } = await orgVon(admin, profil, v.user_id);
  const { zeile, felder } = baueTermin(fragen, werte, { userId: v.user_id, orgId });
  const { data: lead, error } = await admin.from("leads").insert(zeile).select().single();
  if (error) {
    console.error("Termin aus Telegram nicht angelegt:", error.message);
    await beende("Das hat nicht geklappt. Leg ihn bitte in der Academy an.");
    return { ok: false, fehler: error.message };
  }
  await setzeModus(admin, v, null);
  await beende("Angelegt", `${zusammenfassung(fragen, werte).replace("📋 Soll ich diesen Termin anlegen?", "📅 Termin angelegt")}\n\n✅ Steht in der Academy.`);

  // Dieselben Meldungen wie aus dem Formular der Academy.
  await meldeNeuenTermin(admin, {
    lead, orgId, name: werte.name, phone: werte.phone || null, email: werte.email || null,
    fields: felder, appointmentAt: werte.termin.zeitpunkt, erfasser: profil?.full_name || "",
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  await sendeAlarm([
    `📅 ${werte.name} steht jetzt im Kalender: ${deutscheZeit(werte.termin.zeitpunkt)} Uhr.`,
    "Denk an die Bestätigung vor dem Termin — sie ist der billigste Schritt und der, der am häufigsten ausfällt.",
    appUrl ? `\n${appUrl}/termine?leadId=${lead.id}` : null,
  ].filter(Boolean).join("\n"), knopf.chat_id, {});
  return { ok: true, angelegt: true, leadId: lead.id };
}
