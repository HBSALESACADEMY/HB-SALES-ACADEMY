// Der Vertriebsbuddy im Arbeitsalltag: Morgen-Briefing, Ergebnis-Knöpfe,
// Kurzbefehle, Einwand-Hilfe, Rollenspiel, Gesprächsvorbereitung — und die
// Vorschau geteilter Links.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  briefingTermine, offeneErgebnisse, briefingText, ergebnisKnoepfe, leseKnopf, ergebnisFrage,
  briefingFenster, ERGEBNIS_AKTIONEN, MAX_FRAGEN,
} from "../lib/buddyBriefing.js";
import { darfEintragen, quittungsText, bearbeiteErgebnisKnopf } from "../lib/buddyErgebnis.js";
import { leseBefehl, hilfeText, heuteText, BEFEHLE } from "../lib/buddyBefehle.js";
import { passendeEinwaende, klingtNachEinwand, einwandOhneKI } from "../lib/buddyEinwand.js";
import { DEFAULT_OBJECTIONS } from "../lib/objections.js";
import { waehleSzenario, istAbgelaufen, alsNachrichten, SZENARIEN, ABLAUF_STUNDEN } from "../lib/buddyRollenspiel.js";
import { nameAusFrage, findePerson, vorbereitungsText, fragenOhneKI } from "../lib/buddyVorbereitung.js";
import { zielZeile } from "../lib/buddyZiele.js";
import { leseUpdate, stelleWebhookSicher, MELDUNGSARTEN } from "../lib/telegramWebhook.js";
import { leereZahlen } from "../lib/tagesauswertung.js";
import { SCHRITTE } from "../lib/terminArt.js";

const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");

const ICH = "11111111-1111-4111-8111-111111111111";
const ANDERE = "22222222-2222-4222-8222-222222222222";
const ORG = "33333333-3333-4333-8333-333333333333";
const LEAD = "44444444-4444-4444-8444-444444444444";

// Dienstag, 15. September 2026, 9 Uhr in Berlin (7 Uhr UTC).
const DIENSTAG = new Date("2026-09-15T07:00:00Z");

function termin(extra) {
  return {
    id: LEAD, name: "Max Muster", company: "Muster GmbH", created_by: ICH, organization_id: ORG,
    termin_art: "erstgespraech", status: "geplant", outcome: null, schritte: {}, kein_kundentermin: false,
    appointment_at: "2026-09-15T09:00:00Z", notes: "", call_notes: null, ...extra,
  };
}

test("Das Briefing nimmt die eigenen Termine von heute, ohne abgesagte, nach Uhrzeit", () => {
  const f = briefingFenster(DIENSTAG);
  const leads = [
    termin({ id: "b", appointment_at: "2026-09-15T12:00:00Z" }),
    termin({ id: "a", appointment_at: "2026-09-15T08:00:00Z" }),
    termin({ id: "abgesagt", status: "abgesagt" }),
    termin({ id: "fremd", created_by: ANDERE }),
    termin({ id: "morgen", appointment_at: "2026-09-16T08:00:00Z" }),
    // 23:30 Berliner Zeit am Vorabend liegt nicht im heutigen Tag.
    termin({ id: "vorabend", appointment_at: "2026-09-14T21:30:00Z" }),
  ];
  assert.deepEqual(briefingTermine(leads, ICH, f.heuteAb, f.heuteBis).map((l) => l.id), ["a", "b"]);
});

test("Nach dem Ergebnis gefragt wird nur, wo wirklich nichts eingetragen ist", () => {
  const f = briefingFenster(DIENSTAG);
  const gestern = "2026-09-14T12:00:00Z";
  const leads = [
    termin({ id: "offen", appointment_at: gestern }),
    termin({ id: "mitErgebnis", appointment_at: gestern, outcome: "absage" }),
    termin({ id: "wahrgenommen", appointment_at: gestern, status: "wahrgenommen" }),
    termin({ id: "rueckruf", appointment_at: gestern, kein_kundentermin: true }),
    termin({ id: "checkin", appointment_at: gestern, termin_art: "checkin" }),
    termin({ id: "heute", appointment_at: "2026-09-15T06:00:00Z" }),
  ];
  assert.deepEqual(offeneErgebnisse(leads, ICH, f.offenAb, f.heuteAb).map((l) => l.id), ["offen"]);

  // Montags gehören Freitag bis Sonntag dazu.
  const montag = briefingFenster(new Date("2026-09-14T07:00:00Z"));
  assert.equal(montag.offenAb, new Date("2026-09-10T22:00:00Z").toISOString());
  assert.ok(MAX_FRAGEN <= 5);
});

test("Das Briefing warnt vor unbestätigten Terminen und gibt den Tipp je Stufe nur einmal", () => {
  const text = briefingText({
    name: "Anna Schmidt",
    termine: [
      termin({ id: "1", notes: "Hat zwei Standorte" }),
      termin({ id: "2", schritte: { setting_bestaetigt: { am: "2026-09-14T10:00:00Z" } } }),
      termin({ id: "3", termin_art: "closing", call_notes: { einwaende: ["zu teuer"] } }),
    ],
    appUrl: "https://academy.example",
  });
  assert.match(text, /^☀️ Guten Morgen, Anna! Heute stehen 3 Termine an:/);
  assert.equal((text.match(/Noch nicht bestätigt/g) || []).length, 2);
  assert.equal((text.match(/💡 Setting Call:/g) || []).length, 1);
  assert.match(text, /💡 Closing Call:/);
  assert.match(text, /📝 Hat zwei Standorte/);
  assert.match(text, /🗣 Schon gefallen: zu teuer/);
  assert.match(text, /11:00 · Setting Call · Max Muster \(Muster GmbH\)/);
  assert.match(text, /termine\?leadId=1/);
  assert.equal(briefingText({ termine: [] }), null);
  // Ein eigener Eintrag heisst nicht "Ohne Stufe".
  assert.doesNotMatch(briefingText({ termine: [termin({ termin_art: null, kein_kundentermin: true })] }), /Ohne Stufe/);
});

test("Die Knöpfe passen in Telegrams 64 Zeichen, und fremde Knöpfe gelten nicht", () => {
  const knoepfe = ergebnisKnoepfe(LEAD).inline_keyboard.flat();
  assert.equal(knoepfe.length, Object.keys(ERGEBNIS_AKTIONEN).length);
  knoepfe.forEach((k) => {
    assert.ok(Buffer.byteLength(k.callback_data) <= 64, k.callback_data);
    assert.deepEqual(leseKnopf(k.callback_data).leadId, LEAD);
  });
  assert.equal(leseKnopf(`e:${LEAD}:z`), null);
  assert.equal(leseKnopf(`e:${LEAD}:k; drop table leads`), null);
  assert.equal(leseKnopf("e:keine-uuid:k"), null);
  assert.equal(leseKnopf(null), null);
  // "Fand nicht statt" ist kein Ergebnis, sondern ein Status.
  assert.deepEqual(ERGEBNIS_AKTIONEN.x.patch, { status: "abgesagt" });
  assert.equal(ERGEBNIS_AKTIONEN.k.patch.outcome, "kunde");
});

test("Ein Ergebnis per Knopf trägt nur ein, wer den Termin hat — oder die Leitung derselben Firma", () => {
  const lead = termin();
  assert.equal(darfEintragen(lead, { id: ICH, organization_id: ORG, role: "member" }), true);
  assert.equal(darfEintragen(lead, { id: ANDERE, organization_id: ORG, role: "member" }), false);
  assert.equal(darfEintragen(lead, { id: ANDERE, organization_id: ORG, role: "manager" }), true);
  assert.equal(darfEintragen(lead, { id: ANDERE, organization_id: "andere-org", role: "manager" }), false);
  assert.equal(darfEintragen(null, { id: ICH }), false);
  assert.equal(darfEintragen(lead, null), false);
});

// Eine kleine Nachbildung der Datenbank: merkt sich, was geändert wird.
function falscheDatenbank({ verknuepfung, profil, lead, org = {} }) {
  const aenderungen = [];
  const abfragen = [];
  const antwort = (tabelle) => {
    if (tabelle === "telegram_verknuepfungen") return verknuepfung ? [verknuepfung] : [];
    if (tabelle === "profiles") return profil;
    if (tabelle === "leads") return lead;
    if (tabelle === "organizations") return org;
    return null;
  };
  const kette = (tabelle) => {
    const k = {
      select: () => k, eq: () => k, is: () => k, limit: () => Promise.resolve({ data: antwort(tabelle), error: null }),
      maybeSingle: () => Promise.resolve({ data: antwort(tabelle), error: null }),
      update: (patch) => {
        aenderungen.push({ tabelle, patch });
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
    abfragen.push(tabelle);
    return k;
  };
  return { admin: { from: kette }, aenderungen, abfragen };
}

test("Der Knopf schreibt das Ergebnis — und bei einem Fremden nichts", async () => {
  const knopf = { id: "k1", daten: `e:${LEAD}:k`, chat_id: "555", nachricht_id: 9, nachricht_text: ergebnisFrage(termin()) };

  const erlaubt = falscheDatenbank({
    verknuepfung: { user_id: ICH }, profil: { id: ICH, organization_id: ORG, role: "member" }, lead: termin(),
  });
  const ergebnis = await bearbeiteErgebnisKnopf(erlaubt.admin, knopf);
  assert.equal(ergebnis.ok, true);
  assert.deepEqual(erlaubt.aenderungen.find((a) => a.tabelle === "leads").patch, { outcome: "kunde", status: "wahrgenommen" });
  // Der Abschluss geht an die Gruppe — dafür wird der Kanal der Firma gelesen.
  assert.ok(erlaubt.abfragen.includes("organizations"));

  const fremd = falscheDatenbank({
    verknuepfung: { user_id: ANDERE }, profil: { id: ANDERE, organization_id: ORG, role: "member" }, lead: termin(),
  });
  assert.equal((await bearbeiteErgebnisKnopf(fremd.admin, knopf)).ok, false);
  assert.equal(fremd.aenderungen.length, 0);

  // Wer schon Kunde ist, wird nicht noch einmal gefeiert.
  const schonKunde = falscheDatenbank({
    verknuepfung: { user_id: ICH }, profil: { id: ICH, organization_id: ORG, role: "member" },
    lead: termin({ stufen_verlauf: [{ ergebnis: "kunde" }] }),
  });
  await bearbeiteErgebnisKnopf(schonKunde.admin, knopf);
  assert.ok(!schonKunde.abfragen.includes("organizations"));

  // Ein nachgebauter Knopf ohne Verbindung ändert nichts.
  const ohneChat = falscheDatenbank({ verknuepfung: null, profil: null, lead: termin() });
  assert.equal((await bearbeiteErgebnisKnopf(ohneChat.admin, knopf)).ok, false);
  assert.equal(ohneChat.aenderungen.length, 0);

  assert.match(quittungsText(knopf.nachricht_text, "k"), /✅ Eingetragen: Kunde geworden$/);
  assert.doesNotMatch(quittungsText(knopf.nachricht_text, "k"), /Wie lief es/);
});

test("Kurzbefehle werden erkannt, auch mit Botnamen und Umlaut", () => {
  assert.deepEqual(leseBefehl("/heute"), { befehl: "heute", rest: "" });
  assert.deepEqual(leseBefehl("/heute@HBSalesAcademy_bot"), { befehl: "heute", rest: "" });
  assert.deepEqual(leseBefehl("/einwand Kunde sagt zu teuer"), { befehl: "einwand", rest: "Kunde sagt zu teuer" });
  assert.deepEqual(leseBefehl("/gespräch Anna Schmidt"), { befehl: "gespraech", rest: "Anna Schmidt" });
  assert.deepEqual(leseBefehl("/start"), { befehl: "hilfe", rest: "" });
  assert.equal(leseBefehl("Hallo"), null);
  // Telegram erlaubt in Befehlsnamen nur a-z, 0-9 und _.
  BEFEHLE.forEach((b) => assert.match(b.befehl, /^[a-z0-9_]{1,32}$/));
  BEFEHLE.forEach((b) => assert.ok(b.kurz.length <= 256));
});

test("Die Hilfe zeigt Vertrieblern keine Leitungsbefehle", () => {
  assert.doesNotMatch(hilfeText(false), /gespraech|\/team/);
  assert.match(hilfeText(true), /\/gespraech/);
  assert.match(hilfeText(true), /\/team/);
});

test("/heute nennt die Zahlen von heute und vergleicht mit dem letzten Arbeitstag", () => {
  const heute = { ...leereZahlen(), anwahlen: 12, terminiert: 1 };
  const vorher = { ...leereZahlen(), anwahlen: 30 };
  const text = heuteText({ heute, vorher, vergleichsTag: "2026-09-11" });
  assert.match(text, /Anwahlen: 12 \(Freitag: 30\)/);
  assert.match(text, /Terminiert: 1 \(Freitag: 0\)/);
  assert.doesNotMatch(text, /Neue Kunden/);
  assert.match(heuteText({ heute: leereZahlen(), vorher: leereZahlen(), vergleichsTag: "2026-09-11" }), /noch nichts eingetragen/);
});

test("Die Einwand-Hilfe findet den passenden Eintrag im Leitfaden", () => {
  const teuer = passendeEinwaende(DEFAULT_OBJECTIONS, "Der Kunde sagt, das ist ihm zu teuer");
  assert.ok(teuer.length >= 1);
  assert.equal(teuer[0].cat, "preis");
  const agentur = passendeEinwaende(DEFAULT_OBJECTIONS, "Er meint, sie haben schon eine Agentur");
  assert.ok(agentur.length >= 1);
  assert.equal(agentur[0].cat, "vorhanden");
  assert.deepEqual(passendeEinwaende(DEFAULT_OBJECTIONS, "Hallo"), []);

  // Eigene Einwände der Firma gehen vor, wenn sie gleich gut passen.
  const eigene = { cat: "preis", q_pro: "„Das ist mir zu teuer.“", a_pro: "Eigene Antwort", eigen: true };
  assert.equal(passendeEinwaende([...DEFAULT_OBJECTIONS, eigene], "zu teuer")[0].a_pro, "Eigene Antwort");

  assert.match(einwandOhneKI(teuer), /So antwortest du:/);
  assert.match(einwandOhneKI([]), /nichts gefunden/);
});

test("Nur Nachrichten, die nach Einwand klingen, holen den Leitfaden dazu", () => {
  assert.equal(klingtNachEinwand("Kunde sagt, er hat keine Zeit"), true);
  assert.equal(klingtNachEinwand("Was sag ich, wenn er nach dem Preis fragt?"), true);
  assert.equal(klingtNachEinwand("Hab einen Einwand, den ich nicht knacke"), true);
  assert.equal(klingtNachEinwand("War eine gute Woche"), false);
});

test("Das Rollenspiel wählt das Szenario nach den Worten und wiederholt sich nicht", () => {
  assert.equal(waehleSzenario("Rollenspiel Vorzimmer bitte").key, "vorzimmer");
  assert.equal(waehleSzenario("rollenspiel zu teuer").key, "zu_teuer");
  for (let i = 0; i < 20; i += 1) {
    assert.notEqual(waehleSzenario("rollenspiel", "vorzimmer", i / 20).key, "vorzimmer");
  }
  SZENARIEN.forEach((s) => assert.ok(s.start && s.rolle && s.titel));
  // Die Unterhaltung für die KI beginnt mit der Gegenseite.
  assert.equal(alsNachrichten([{ von: "kunde", text: "Hallo?" }])[0].role, "user");
  assert.equal(alsNachrichten([{ von: "kunde", text: "Hallo?" }])[1].role, "assistant");
  // Ein vergessenes Rollenspiel endet von selbst.
  const jetzt = new Date("2026-09-15T12:00:00Z");
  assert.equal(istAbgelaufen(new Date(jetzt - (ABLAUF_STUNDEN + 1) * 3600000).toISOString(), jetzt), true);
  assert.equal(istAbgelaufen(new Date(jetzt - 600000).toISOString(), jetzt), false);
  assert.equal(istAbgelaufen(null, jetzt), true);
});

test("Rollenspiel und Übungen landen nicht im Gesprächsverlauf des Buddys", () => {
  const buddy = lies("lib/buddy.js");
  const start = buddy.indexOf("export async function beantworteEingang");
  const ende = buddy.indexOf("export async function verknuepfungZumChat");
  const eingang = buddy.slice(start, ende);
  const rolle = eingang.indexOf("imRollenspiel(v)");
  const speichern = eingang.indexOf('from("buddy_nachrichten")');
  assert.ok(rolle > 0 && speichern > 0 && rolle < speichern);
  assert.ok(eingang.indexOf("starteRollenspiel") < speichern);
  assert.ok(eingang.indexOf("gespraechVorbereiten") < speichern);
  // Der Wortwechsel des Rollenspiels steht nicht in buddy_nachrichten.
  assert.doesNotMatch(lies("lib/buddyBefehle.js"), /buddy_nachrichten/);
});

test("Die Gesprächsvorbereitung versteht die Bitte — und hält Kundengespräche nicht dafür", () => {
  assert.equal(nameAusFrage("Bereite mein Gespräch mit Ernestine vor"), "Ernestine");
  assert.equal(nameAusFrage("Kannst du das 1:1 mit Anna Schmidt vorbereiten?"), "Anna Schmidt");
  assert.equal(nameAusFrage("Mitarbeitergespräch mit Herrn Weber"), "Weber");
  assert.equal(nameAusFrage("Das Gespräch mit Monoke lief gut"), null);
  assert.equal(nameAusFrage("Wie läuft es bei Ernestine?"), null);

  const team = [{ id: "1", full_name: "Anna Schmidt" }, { id: "2", full_name: "Anna Weber" }, { id: "3", full_name: "Ernestine Özdemir" }];
  assert.equal(findePerson(team, "ernestine").person.id, "3");
  assert.equal(findePerson(team, "Anna Weber").person.id, "2");
  assert.deepEqual(findePerson(team, "Anna").mehrdeutig, ["Anna Schmidt", "Anna Weber"]);
  assert.equal(findePerson(team, "Ozdemir").person.id, "3");
  assert.equal(findePerson(team, "Klaus"), null);
});

test("Die Gesprächsvorbereitung zeigt der Leitung nichts aus dem privaten Chat", () => {
  const quelle = lies("lib/buddyVorbereitung.js");
  assert.doesNotMatch(quelle, /buddy_nachrichten/);
  assert.ok(!/select\("[^"]*zusammenfassung/.test(quelle));
  // Nur für die Leitung, geprüft auf dem Server.
  const befehle = lies("lib/buddyBefehle.js");
  const stelle = befehle.indexOf("export async function gespraechVorbereiten");
  assert.match(befehle.slice(stelle, stelle + 900), /istFuehrungsrolle\(profil\)/);
  assert.match(befehle.slice(stelle, stelle + 1400), /\.eq\("organization_id", profil\.organization_id\)/);

  const daten = {
    name: "Ernestine Özdemir",
    wochen: [{ woche: "2026-08-24", zahlen: { ...leereZahlen(), anwahlen: 40 } }, { woche: "2026-08-31", zahlen: { ...leereZahlen(), anwahlen: 50 } },
      { woche: "2026-09-07", zahlen: { ...leereZahlen(), anwahlen: 60 } }, { woche: "2026-09-14", laufend: true, zahlen: leereZahlen() }],
    rueckblicke: [{ woche: "2026-09-07", stimmung: "schwer", herausforderungen: ["Vorzimmer"], vorhaben: "Früher anfangen" }],
    schulungen: [], offeneErgebnisse: 2, kommendeTermine: 3,
  };
  const text = vorbereitungsText(daten, "");
  assert.match(text, /ab 7\.9\.: 60 · 0 · 0 · 0 · 0/);
  assert.match(text, /ab 14\.9\. \(läuft\)/);
  assert.match(text, /Stimmung laut Wochenrückblick: schwer/);
  assert.match(text, /Themen: Vorzimmer/);
  assert.match(text, /Termine ohne Ergebnis \(letzte 14 Tage\): 2/);
  assert.match(text, /Was Ernestine mit dem Buddy schreibt, bleibt privat/);
  const fragen = fragenOhneKI(daten);
  assert.equal(fragen.length, 3);
  assert.match(fragen[0], /am meisten zu schaffen/);
});

test("Die Zielzeile rechnet Prozent und Resttage wie die Team-Seite", () => {
  const zeile = zielZeile({
    ziel: { title: "Anwahlen-Woche", metric: "anwahlen", target_count: 200, starts_on: "2026-09-14", ends_on: "2026-09-18" },
    fortschritt: 150, teamName: "Nord", beitrag: 40, heute: "2026-09-15",
  });
  assert.match(zeile, /150 von 200 .* \(75 %\) · noch 3 Tage/);
  assert.match(zeile, /Team Nord · dein Beitrag: 40/);
  const persoenlich = zielZeile({
    ziel: { title: "Mein Ziel", metric: "anwahlen", target_count: 10, starts_on: "2026-09-14", ends_on: "2026-09-15", user_id: ICH },
    fortschritt: 10, beitrag: 10, heute: "2026-09-15",
  });
  assert.match(persoenlich, /Mein Ziel ✅/);
  assert.match(persoenlich, /letzter Tag/);
  assert.match(persoenlich, /Dein persönliches Ziel$/);
});

test("Ein Knopfdruck kommt über den Webhook an und wird ohne Zusatzfelder abgelegt", () => {
  const update = leseUpdate({
    update_id: 7,
    callback_query: { id: "cb1", data: `e:${LEAD}:a`, message: { message_id: 3, text: "❓ Wie lief es?", chat: { id: 555, type: "private", first_name: "Anna" } } },
  });
  assert.equal(update.art, "callback_query");
  assert.equal(update.chat_id, "555");
  assert.equal(update.knopf.daten, `e:${LEAD}:a`);
  assert.equal(update.knopf.nachricht_id, 3);

  const route = lies("pages/api/telegram-eingang.js");
  assert.match(route, /const \{ knopf, \.\.\.zeile \} = eingang;/);
  assert.match(route, /insert\(zeile\)/);
  // Das Geheimnis wird geprüft, bevor irgendetwas passiert.
  assert.ok(route.indexOf("geheimnisPasst") < route.indexOf("bearbeiteErgebnisKnopf(admin"));
});

test("Ein alter Webhook ohne Knöpfe wird von selbst neu eingerichtet", async () => {
  assert.ok(MELDUNGSARTEN.includes("callback_query"));
  const aufrufe = [];
  const fetchFn = async (url, optionen) => {
    aufrufe.push(url);
    if (url.endsWith("/getWebhookInfo")) {
      return { json: async () => ({ ok: true, result: { url: "https://academy.example/api/telegram-eingang", allowed_updates: ["message", "my_chat_member", "channel_post"] } }) };
    }
    return { json: async () => ({ ok: true, gesendet: JSON.parse(optionen.body) }) };
  };
  const ergebnis = await stelleWebhookSicher({ token: "t", appUrl: "https://academy.example", geheimnis: "g", fetchFn });
  assert.equal(ergebnis.gesetzt, true);
  assert.ok(aufrufe.some((u) => u.endsWith("/setWebhook")));

  const schonRichtig = async (url) => ({
    json: async () => ({ ok: true, result: { url: "https://academy.example/api/telegram-eingang", allowed_updates: MELDUNGSARTEN } }),
  });
  assert.equal((await stelleWebhookSicher({ token: "t", appUrl: "https://academy.example", geheimnis: "g", fetchFn: schonRichtig })).schonGesetzt, true);
});

test("Morgen-Briefing und Befehlsliste laufen im Morgenlauf mit", () => {
  const lauf = lies("pages/api/cron/tagesbericht.js");
  assert.match(lauf, /briefingUmAcht\(admin\)/);
  assert.match(lauf, /setzeBefehle\(BEFEHLE\)/);
  const einstellungen = lies("pages/api/telegram-verbindung.js");
  assert.match(einstellungen, /felder\.briefing = req\.body\.briefing/);
  assert.match(lies("supabase/migration_175_buddy_alltag.sql"), /add column if not exists briefing boolean not null default true/);
});

test("Ein geteilter Link zeigt das Logo der Academy", () => {
  const dokument = lies("pages/_document.js");
  assert.match(dokument, /property="og:image" content=\{VORSCHAU_BILD\}/);
  assert.match(dokument, /property="og:title" content=\{VORSCHAU_TITEL\}/);
  assert.match(dokument, /VORSCHAU_TITEL = "HB Sales Academy"/);
  // WhatsApp lädt nur vollständige Adressen.
  assert.match(dokument, /const VORSCHAU_BILD = `\$\{APP_URL\}\/og-bild\.png/);
  assert.match(dokument, /NEXT_PUBLIC_APP_URL/);

  // Das Bild selbst: PNG in 1200 × 630, klein genug für WhatsApp (< 300 KB).
  const bild = readFileSync(new URL("../public/og-bild.png", import.meta.url));
  assert.equal(bild.toString("ascii", 1, 4), "PNG");
  assert.equal(bild.readUInt32BE(16), 1200);
  assert.equal(bild.readUInt32BE(20), 630);
  assert.ok(bild.length < 300 * 1024);
});

test("Ein liegen gebliebenes Rollenspiel wird im Morgenlauf gelöscht", () => {
  const befehle = lies("lib/buddyBefehle.js");
  const stelle = befehle.indexOf("export async function raeumeRollenspieleAuf");
  assert.ok(stelle > 0);
  assert.match(befehle.slice(stelle, stelle + 600), /modus_daten: null/);
  assert.match(lies("pages/api/cron/tagesbericht.js"), /raeumeRollenspieleAuf\(admin\)/);
});

test("Der Briefing-Testknopf richtet die Knöpfe sofort ein", () => {
  const route = lies("pages/api/buddy.js");
  const stelle = route.indexOf('aktion === "test-briefing"');
  const teil = route.slice(stelle, stelle + 900);
  assert.ok(teil.indexOf("stelleWebhookSicher()") > 0);
  assert.ok(teil.indexOf("stelleWebhookSicher()") < teil.indexOf("sendeBriefings("));
});

test("Der Buddy behauptet im Gespräch nie, etwas eingetragen zu haben", () => {
  const buddy = lies("lib/buddy.js");
  const stelle = buddy.indexOf("async function antworte(");
  const antworte = buddy.slice(stelle, buddy.indexOf("export async function beantworteEingang"));
  assert.match(antworte, /\.\.\.NICHTS_EINGETRAGEN/);
  assert.match(buddy, /Behaupte deshalb nie, etwas eingetragen/);
  // Auch die Ersatzantwort ohne KI sagt nicht "notiert".
  assert.doesNotMatch(antworte, /notiert\./);
});

// ---------------------------------------------------------------------------
// Ergebnisse als freier Satz

import {
  klingtNachErgebnis, leseVorschlag, passendeTermine, eintragPatch, vorschlagText, versucheEintrag,
  bearbeiteEintragKnopf, JA_NEIN, hatEtwasZuTun,
} from "../lib/buddyEintrag.js";
import { buddyErklaerung, willkommensText } from "../lib/telegramPersoenlich.js";

test("Nur Sätze über Termine gehen an die KI", () => {
  assert.equal(klingtNachErgebnis("Müller: Kunde geworden"), true);
  assert.equal(klingtNachErgebnis("Schneider – Closing am Donnerstag 14 Uhr"), true);
  assert.equal(klingtNachErgebnis("Weber ist nicht erschienen"), true);
  assert.equal(klingtNachErgebnis("Termin mit Hoffmann lief gut, will noch überlegen"), true);
  assert.equal(klingtNachErgebnis("Mir geht's heute nicht so gut"), false);
  assert.equal(klingtNachErgebnis("Wie geht Einwandbehandlung?"), false);
});

test("Der Vorschlag nimmt nur, was die KI sauber geliefert hat", () => {
  const heute = "2026-09-15";
  const voll = leseVorschlag('```json\n{"kunde":"Schneider","ergebnis":"stattgefunden","naechster":{"art":"closing","datum":"2026-09-17","uhrzeit":"14:00"},"notiz":"Budget kommt im Oktober"}\n```', heute);
  assert.equal(voll.kunde, "Schneider");
  assert.equal(voll.ergebnis, "stattgefunden");
  // 14 Uhr in Berlin ist im September 12 Uhr UTC.
  assert.equal(voll.naechster.zeitpunkt, "2026-09-17T12:00:00.000Z");
  assert.equal(voll.notiz, "Budget kommt im Oktober");

  // Ohne Uhrzeit kein Zeitpunkt — erfunden wird keine.
  assert.equal(leseVorschlag({ kunde: "X", naechster: { art: "closing", datum: "2026-09-17", uhrzeit: null } }, heute).naechster.zeitpunkt, null);
  // Vergangenheit, falsche Stufe, falsches Ergebnis: weg.
  assert.equal(leseVorschlag({ kunde: "X", naechster: { art: "closing", datum: "2026-09-01", uhrzeit: "10:00" } }, heute), null);
  assert.equal(leseVorschlag({ kunde: "X", naechster: { art: "party", datum: "2026-09-17", uhrzeit: "10:00" } }, heute), null);
  assert.equal(leseVorschlag({ kunde: "X", ergebnis: "gewonnen" }, heute), null);
  assert.equal(leseVorschlag({ kunde: null, ergebnis: "kunde" }, heute), null);
  assert.equal(leseVorschlag("keine Ahnung", heute), null);
  assert.equal(leseVorschlag({ kunde: "Müller", ergebnis: "kunde" }, heute).ergebnis, "kunde");
});

test("Der passende Termin: ganzer Name vor Wortteil, vergangene zuerst", () => {
  const jetzt = new Date("2026-09-15T10:00:00Z");
  const leads = [
    termin({ id: "zukunft", name: "Max Müller", appointment_at: "2026-09-16T10:00:00Z" }),
    termin({ id: "gestern", name: "Max Müller", appointment_at: "2026-09-14T10:00:00Z" }),
    termin({ id: "andere", name: "Anna Müllerschön", company: "Schön AG" }),
    termin({ id: "firma", name: "Petra Lang", company: "Schneider Bau" }),
  ];
  assert.deepEqual(passendeTermine(leads, "Herr Müller", jetzt).map((l) => l.id), ["gestern", "zukunft"]);
  assert.deepEqual(passendeTermine(leads, "Max Müller", jetzt).map((l) => l.id), ["gestern", "zukunft"]);
  assert.deepEqual(passendeTermine(leads, "Schneider", jetzt).map((l) => l.id), ["firma"]);
  assert.deepEqual(passendeTermine(leads, "Klaus", jetzt), []);
  assert.deepEqual(passendeTermine(leads, "", jetzt), []);
});

test("Eingetragen wird wie auf der Termin-Seite: Ergebnis zur alten Stufe, dann weiterrücken", () => {
  const lead = termin({ appointment_at: "2026-09-14T10:00:00Z", notes: "Zwei Standorte" });
  const kunde = eintragPatch(lead, { ergebnis: "kunde" }, ICH, "2026-09-15");
  assert.deepEqual(kunde, { outcome: "kunde", status: "wahrgenommen" });

  const weiter = eintragPatch(lead, {
    ergebnis: "ueberlegt", naechster: { art: "folgetermin", zeitpunkt: "2026-09-17T12:00:00.000Z" }, notiz: "Will mit Partner reden",
  }, ICH, "2026-09-15");
  assert.equal(weiter.termin_art, "folgetermin");
  assert.equal(weiter.appointment_at, "2026-09-17T12:00:00.000Z");
  assert.equal(weiter.status, "geplant");
  assert.equal(weiter.outcome, null);
  const zuletzt = weiter.stufen_verlauf[weiter.stufen_verlauf.length - 1];
  assert.equal(zuletzt.art, "erstgespraech");
  assert.equal(zuletzt.ergebnis, "follow_up");
  assert.equal(zuletzt.von, ICH);
  assert.equal(weiter.notes, "Zwei Standorte\n15.9.: Will mit Partner reden");

  // Ein Kunde bleibt Kunde, auch wenn der Check-in geplant wird.
  const checkin = eintragPatch(lead, { ergebnis: "kunde", naechster: { art: "checkin", zeitpunkt: "2026-10-15T08:00:00.000Z" } }, ICH);
  assert.equal(checkin.outcome, "kunde");
});

test("Der Vorschlag zeigt, was passiert — und sagt, wenn die Uhrzeit fehlt", () => {
  const lead = termin({ appointment_at: "2026-09-14T10:00:00Z" });
  const text = vorschlagText(lead, { ergebnis: "kunde", naechster: null, notiz: null });
  assert.match(text, /^📝 Soll ich das so eintragen\?/);
  assert.match(text, /Max Muster \(Muster GmbH\) · Setting Call Mo\., 14\.9\., 12:00/);
  assert.match(text, /• Ergebnis: Kunde geworden/);
  const ohneZeit = vorschlagText(lead, { ergebnis: null, naechster: { art: "closing", datum: "2026-09-17", uhrzeit: null, zeitpunkt: null }, notiz: null });
  assert.match(ohneZeit, /trage ich nicht ein — die Uhrzeit fehlt/);
  assert.equal(hatEtwasZuTun({ naechster: { zeitpunkt: null } }), false);
  assert.deepEqual(JA_NEIN.inline_keyboard[0].map((k) => k.callback_data), ["b:j", "b:n"]);
});

// Nachbildung für den Eintrag: Termine lesen (seitenweise), Vorschlag merken.
function eintragsDatenbank({ leads = [], verknuepfung = null, lead = null }) {
  const aenderungen = [];
  const kette = (tabelle) => {
    const k = {
      select: () => k, eq: () => k, is: () => k, gte: () => k, lt: () => k, in: () => k, order: () => k,
      range: () => Promise.resolve({ data: tabelle === "leads" ? leads : [], error: null }),
      limit: () => Promise.resolve({ data: verknuepfung ? [verknuepfung] : [], error: null }),
      maybeSingle: () => Promise.resolve({
        data: tabelle === "leads" ? lead
          : tabelle === "profiles" ? { id: verknuepfung?.user_id || ICH, full_name: "Anna", organization_id: ORG, role: "member" }
            : {},
        error: null,
      }),
      update: (patch) => {
        aenderungen.push({ tabelle, patch });
        const weiter = { eq: () => Promise.resolve({ error: null }) };
        return weiter;
      },
    };
    return k;
  };
  return { admin: { from: kette }, aenderungen };
}

test("Aus einem Satz wird ein Vorschlag — eingetragen wird noch nichts", async () => {
  const jetzt = new Date("2026-09-15T10:00:00Z");
  let gefragt = 0;
  const ki = async () => { gefragt += 1; return '{"kunde":"Muster","ergebnis":"kunde","naechster":null,"notiz":null}'; };
  const db = eintragsDatenbank({ leads: [termin({ appointment_at: "2026-09-14T10:00:00Z" })] });

  assert.equal(await versucheEintrag(db.admin, { user_id: ICH, chat_id: "1" }, "Hallo, wie geht's?", { jetzt, ki }), false);
  assert.equal(gefragt, 0);

  assert.equal(await versucheEintrag(db.admin, { user_id: ICH, chat_id: "1" }, "Muster ist Kunde geworden", { jetzt, ki }), true);
  assert.equal(gefragt, 1);
  // Nur der Vorschlag wird gemerkt — der Termin selbst bleibt unberührt.
  assert.ok(!db.aenderungen.some((a) => a.tabelle === "leads"));
  const gemerkt = db.aenderungen.find((a) => a.tabelle === "telegram_verknuepfungen").patch;
  assert.equal(gemerkt.modus, "eintrag");
  assert.equal(gemerkt.modus_daten.leadId, LEAD);
  assert.equal(gemerkt.modus_daten.vorschlag.ergebnis, "kunde");
});

test("Erst „Ja, eintragen“ schreibt — und nur in den eigenen, noch gültigen Vorschlag", async () => {
  const jetzt = new Date("2026-09-15T10:00:00Z");
  const vorschlag = { kunde: "Muster", ergebnis: "kunde", naechster: null, notiz: null };
  const knopf = (daten) => ({ id: "k", daten, chat_id: "1", nachricht_id: 5, nachricht_text: "📝 Soll ich das so eintragen?\n\nMax Muster" });
  const offen = { user_id: ICH, modus: "eintrag", modus_seit: "2026-09-15T09:50:00Z", modus_daten: { vorschlag, leadId: LEAD } };

  const ja = eintragsDatenbank({ verknuepfung: offen, lead: termin() });
  const ergebnis = await bearbeiteEintragKnopf(ja.admin, knopf("b:j"), { jetzt });
  assert.equal(ergebnis.eingetragen, true);
  assert.deepEqual(ja.aenderungen.find((a) => a.tabelle === "leads").patch, { outcome: "kunde", status: "wahrgenommen" });

  const nein = eintragsDatenbank({ verknuepfung: offen, lead: termin() });
  await bearbeiteEintragKnopf(nein.admin, knopf("b:n"), { jetzt });
  assert.ok(!nein.aenderungen.some((a) => a.tabelle === "leads"));

  // Ein fremder Termin — etwa über eine manipulierte Kennung.
  const fremd = eintragsDatenbank({ verknuepfung: offen, lead: termin({ created_by: ANDERE }) });
  assert.equal((await bearbeiteEintragKnopf(fremd.admin, knopf("b:j"), { jetzt })).ok, false);
  assert.ok(!fremd.aenderungen.some((a) => a.tabelle === "leads"));

  // Nach einer Stunde gilt der Vorschlag nicht mehr.
  const alt = eintragsDatenbank({ verknuepfung: { ...offen, modus_seit: "2026-09-15T08:30:00Z" }, lead: termin() });
  assert.equal((await bearbeiteEintragKnopf(alt.admin, knopf("b:j"), { jetzt })).ok, false);
  assert.ok(!alt.aenderungen.some((a) => a.tabelle === "leads"));

  // Ohne offenen Vorschlag ändert "Ja" nichts.
  const ohne = eintragsDatenbank({ verknuepfung: { ...offen, modus: null }, lead: termin() });
  assert.equal((await bearbeiteEintragKnopf(ohne.admin, knopf("b:j"), { jetzt })).ok, false);
  assert.ok(!ohne.aenderungen.some((a) => a.tabelle === "leads"));
});

test("Der Eintrags-Versuch kommt vor dem Gesprächsverlauf, und Knöpfe finden ihren Weg", () => {
  const buddy = lies("lib/buddy.js");
  const start = buddy.indexOf("export async function beantworteEingang");
  const eingang = buddy.slice(start, buddy.indexOf("export async function verknuepfungZumChat"));
  assert.ok(eingang.indexOf("versucheEintrag(") > 0);
  assert.ok(eingang.indexOf("versucheEintrag(") < eingang.indexOf('from("buddy_nachrichten")'));
  const route = lies("pages/api/telegram-eingang.js");
  assert.match(route, /knopf\.daten\.startsWith\("b:"\)\) await bearbeiteEintragKnopf/);
  assert.match(lies("lib/buddyBefehle.js"), /\.in\("modus", \["rollenspiel", "eintrag", "neuerTermin", "stufe"\]\)/);
});

test("Nach dem Verbinden erklärt eine zweite Nachricht, wie der Buddy funktioniert", () => {
  const text = buddyErklaerung({ istLeitung: false });
  assert.match(text, /^🤝 So funktioniert dein Vertriebsbuddy/);
  assert.match(text, /„Müller: Kunde geworden“/);
  assert.match(text, /Erst wenn du auf „Ja, eintragen“ tippst, steht es in der Academy/);
  assert.match(text, /\/rollenspiel/);
  assert.match(text, /\/heute · \/woche · \/ziel · \/termine/);
  assert.match(text, /Was du mir schreibst, sieht deine Leitung nicht/);
  assert.doesNotMatch(text, /gespraech|\/team/);
  assert.ok(text.length < 4000);

  const leitung = buddyErklaerung({ istLeitung: true });
  assert.match(leitung, /\/gespraech Anna/);
  assert.match(leitung, /\/team/);
  assert.match(leitung, /siehst auch du nicht/);
  assert.ok(leitung.length < 4000);

  // Die Begrüssung kündigt sie an und bleibt unter Telegrams Grenze.
  const willkommen = willkommensText({ organisation: "VolkWork", name: "Houman", appUrl: "https://academy.example", istLeitung: true, imOnboarding: true, tag: "2026-09-18" });
  assert.match(willkommen, /erkläre ich dir gleich in der nächsten Nachricht/);
  assert.ok(willkommen.length < 4000);

  // Beide Nachrichten gehen raus, in dieser Reihenfolge.
  const lib = lies("lib/telegramBegruessung.js");
  const stelle = lib.indexOf("export async function sendeBegruessung");
  const teil = lib.slice(stelle);
  assert.ok(teil.indexOf("willkommensText(") < teil.indexOf("buddyErklaerung("));
});

// ---------------------------------------------------------------------------
// Das Briefing um 8 Uhr, Sommer wie Winter

import { berlinStunde } from "../lib/woche.js";
import { briefingUmAcht, BRIEFING_STUNDE } from "../lib/buddyBriefing.js";

test("Das Briefing kommt um 8 Uhr Berliner Zeit — im Sommer und im Winter", async () => {
  assert.equal(BRIEFING_STUNDE, 8);
  const plan = JSON.parse(lies("vercel.json")).crons;
  const utcStunden = plan.map((c) => Number(c.schedule.split(" ")[1]));
  // Sommer (MESZ) und Winter (MEZ): Einer der beiden Läufe liegt jeweils um 8.
  for (const tag of ["2026-07-15", "2026-12-15"]) {
    const stunden = utcStunden.map((h) => berlinStunde(new Date(`${tag}T${String(h).padStart(2, "0")}:10:00Z`)));
    assert.ok(stunden.includes(8), `${tag}: ${stunden.join(", ")}`);
    // Und keiner davor verschickt etwas — sonst käme es im Winter um 7.
    assert.ok(stunden.every((s) => s >= 7));
  }
  // Beide Läufe fragen, ob es Zeit ist.
  assert.match(lies("pages/api/cron/cleanup-logs.js"), /briefingUmAcht\(admin\)/);
  assert.match(lies("pages/api/cron/tagesbericht.js"), /briefingUmAcht\(admin\)/);

  // Vor 8 Uhr geht nichts raus — die Datenbank wird gar nicht erst gefragt.
  let gefragt = false;
  const admin = { from: () => { gefragt = true; throw new Error("sollte nicht fragen"); } };
  const frueh = await briefingUmAcht(admin, { jetzt: new Date("2026-12-15T06:10:00Z") });
  assert.equal(frueh.gesendet, 0);
  assert.equal(gefragt, false);
  assert.equal(berlinStunde(new Date("2026-07-15T06:10:00Z")), 8);
  assert.equal(berlinStunde(new Date("2026-12-15T07:10:00Z")), 8);
});

import { gespraechsAnweisung, zahlenBlock } from "../lib/wochenimpuls.js";

test("Im Gespräch antwortet der Buddy auf die Frage, nicht auf die Zahlen", () => {
  const zahlen = { ...leereZahlen(), anwahlen: 40, terminiert: 3 };
  const anweisung = gespraechsAnweisung({ name: "Anna Muster", organisation: "VolkWork", zahlen, vorher: leereZahlen() });

  // Die fachliche Antwort steht vorn, die Zahlen ganz hinten.
  assert.ok(anweisung.indexOf("Antworte immer auf DAS, was gefragt ist") < anweisung.indexOf("Anwahlen: 40"));
  assert.match(anweisung, /Kein Rückgriff auf Zahlen, keine Überleitung dorthin/);
  assert.match(anweisung, /Diese Zahlen erwähnst du NICHT von dir aus/);
  assert.match(anweisung, /wörtlich sagen kann, in Anführungszeichen/);
  // Persönliches ohne Zahlen.
  assert.match(anweisung, /Geht es um Persönliches oder um Druck.*ohne Zahlen/);

  // Fehlende Kennzahlen werden zu 0, nicht zu "undefined".
  assert.deepEqual(zahlenBlock({ anwahlen: 5 }, {}), ["Anwahlen: 5 (Vorwoche: 0) ↑"]);
});

// ---------------------------------------------------------------------------
// Neuen Termin im Chat anlegen

import {
  willNeuenTermin, leseZeitpunkt, fragenFuer, naechsteFrage, leseAntwort, zusammenfassung,
  baueTermin, ANLEGEN_KNOEPFE,
} from "../lib/buddyNeuerTermin.js";

test("Der Buddy erkennt, dass ein neuer Termin gemeint ist", () => {
  assert.equal(willNeuenTermin("Ich will einen neuen Termin anlegen"), true);
  assert.equal(willNeuenTermin("neuer Kontakt bitte"), true);
  assert.equal(willNeuenTermin("Termin anlegen"), true);
  assert.equal(willNeuenTermin("Wie lief mein Termin gestern?"), false);
  assert.equal(willNeuenTermin("Müller: Kunde geworden"), false);
});

test("Datum und Uhrzeit rechnet die Academy, nicht die KI", () => {
  // Dienstag, 15. September 2026.
  const heute = "2026-09-15";
  assert.deepEqual(leseZeitpunkt("Montag 11 Uhr", heute), { datum: "2026-09-21", uhrzeit: "11:00", zeitpunkt: "2026-09-21T09:00:00.000Z" });
  assert.equal(leseZeitpunkt("morgen 9:30", heute).datum, "2026-09-16");
  assert.equal(leseZeitpunkt("heute um 17", heute).uhrzeit, "17:00");
  assert.equal(leseZeitpunkt("23.9. 14:00", heute).datum, "2026-09-23");
  assert.equal(leseZeitpunkt("23.09.2027 14 Uhr", heute).datum, "2027-09-23");
  // Ein Datum darf nie als Uhrzeit gelesen werden ("23.09" wäre 23:09).
  assert.equal(leseZeitpunkt("23.09.2027 14 Uhr", heute).uhrzeit, "14:00");
  assert.equal(leseZeitpunkt("1.10.2026 10.30 Uhr", heute).uhrzeit, "10:30");
  assert.equal(leseZeitpunkt("1.10.26 9 Uhr", heute).datum, "2026-10-01");
  // Ein Datum ohne Jahr, das schon vorbei ist, meint das nächste Jahr.
  assert.equal(leseZeitpunkt("3.2. 10:00", heute).datum, "2027-02-03");
  // Winterzeit: 11 Uhr in Berlin ist 10 Uhr UTC.
  assert.equal(leseZeitpunkt("15.12. 11:00", heute).zeitpunkt, "2026-12-15T10:00:00.000Z");
  // Ohne Uhrzeit kein Termin — und kein erfundener.
  assert.equal(leseZeitpunkt("Montag", heute), null);
  assert.equal(leseZeitpunkt("irgendwann", heute), null);
  assert.equal(leseZeitpunkt("Montag 25 Uhr", heute), null);
});

test("Gefragt wird genau das, was das Formular der Organisation verlangt", () => {
  // Standard: Telefon und E-Mail sind Pflicht, Firma und Notiz freiwillig.
  const standard = fragenFuer({});
  assert.deepEqual(standard.map((f) => f.key), ["name", "termin", "phone", "email", "company", "notes"]);
  assert.equal(standard.find((f) => f.key === "company").pflicht, false);

  // Ohne E-Mail-Pflicht fällt die Frage weg; eigene Pflichtfelder kommen dazu.
  const eigene = fragenFuer({
    lead_core_required: { phone: true, email: false },
    lead_field_config: [
      { key: "company", label: "Firma", type: "text", required: true },
      { key: "branche", label: "Branche", type: "text", required: true },
      { key: "is_decision_maker", label: "Ist Entscheider", type: "checkbox", required: true },
      { key: "website", label: "Webseite", type: "text" },
    ],
  });
  assert.deepEqual(eigene.map((f) => f.key), ["name", "termin", "phone", "company", "branche", "is_decision_maker"]);
  assert.match(eigene.find((f) => f.key === "is_decision_maker").frage, /ja oder nein/);

  const werte = { name: "Anna", termin: {} };
  assert.equal(naechsteFrage(eigene, werte).key, "phone");
  assert.equal(naechsteFrage(eigene, { name: "A", termin: {}, phone: "1", company: null, branche: "Bau", is_decision_maker: false }), null);
});

test("Antworten werden geprüft, Freiwilliges darf übersprungen werden", () => {
  const heute = "2026-09-15";
  const frage = (key, extra = {}) => ({ key, label: key, pflicht: true, ...extra });
  assert.equal(leseAntwort(frage("name"), "  Max Müller ").wert, "Max Müller");
  assert.match(leseAntwort(frage("termin"), "irgendwann", heute).fehler, /nicht als Zeitpunkt verstanden/);
  assert.equal(leseAntwort(frage("termin"), "Montag 11 Uhr", heute).wert.uhrzeit, "11:00");
  assert.match(leseAntwort(frage("email"), "keine-mail").fehler, /E-Mail-Adresse/);
  assert.equal(leseAntwort(frage("email"), "max@firma.de").wert, "max@firma.de");
  assert.match(leseAntwort(frage("phone"), "abc").fehler, /Telefonnummer/);
  assert.equal(leseAntwort(frage("is_decision_maker", { typ: "checkbox" }), "ja").wert, true);
  assert.equal(leseAntwort(frage("is_decision_maker", { typ: "checkbox" }), "nein").wert, false);
  assert.match(leseAntwort(frage("is_decision_maker", { typ: "checkbox" }), "vielleicht").fehler, /ja oder nein/);
  // Pflicht lässt sich nicht überspringen, Freiwilliges schon.
  assert.equal(leseAntwort(frage("company"), "–").wert, "–");
  assert.equal(leseAntwort({ key: "company", label: "Firma", pflicht: false }, "–").wert, null);
});

test("Erst die Zusammenfassung, dann der Knopf — und die Zeile für die Datenbank stimmt", () => {
  const fragen = fragenFuer({ lead_field_config: [{ key: "company", label: "Firma", type: "text" }, { key: "is_decision_maker", label: "Ist Entscheider", type: "checkbox", required: true }] });
  const werte = {
    name: "Max Müller",
    termin: { datum: "2026-09-21", uhrzeit: "11:00", zeitpunkt: "2026-09-21T09:00:00.000Z" },
    phone: "0170 1234567",
    email: "max@firma.de",
    company: "Müller Bau",
    is_decision_maker: true,
  };
  const text = zusammenfassung(fragen, werte);
  assert.match(text, /^📋 Soll ich diesen Termin anlegen\?/);
  assert.match(text, /• Termin: Montag, 21\.9\., 11:00 Uhr/);
  assert.match(text, /• Firma: Müller Bau/);
  assert.match(text, /• Ist Entscheider: Ja/);
  assert.match(text, /Stufe: Setting Call/);
  assert.deepEqual(ANLEGEN_KNOEPFE.inline_keyboard[0].map((k) => k.callback_data), ["n:j", "n:n"]);

  const { zeile, felder } = baueTermin(fragen, werte, { userId: ICH, orgId: ORG });
  assert.equal(zeile.created_by, ICH);
  assert.equal(zeile.organization_id, ORG);
  assert.equal(zeile.name, "Max Müller");
  assert.equal(zeile.appointment_at, "2026-09-21T09:00:00.000Z");
  assert.equal(zeile.termin_art, "erstgespraech");
  // Reservierte Felder gehen in ihre Spalte, alles andere in custom_fields.
  assert.equal(zeile.company, "Müller Bau");
  assert.equal(zeile.is_decision_maker, true);
  assert.deepEqual(zeile.custom_fields, {});
  assert.ok(felder.some((f) => f.key === "company" && f.value === "Müller Bau"));

  const mitEigenem = baueTermin(
    fragenFuer({ lead_field_config: [{ key: "branche", label: "Branche", type: "text", required: true }] }),
    { ...werte, branche: "Handwerk" }, { userId: ICH, orgId: ORG },
  );
  assert.deepEqual(mitEigenem.zeile.custom_fields, { branche: "Handwerk" });
});

test("Ein Termin aus dem Chat meldet sich wie einer aus der Academy", () => {
  // Mail an die Leitung und Meldung in die Gruppe stehen an einer Stelle.
  const gemeinsam = lies("lib/terminAngelegt.js");
  assert.match(gemeinsam, /notifyOrgManagers\(admin, orgId/);
  assert.match(gemeinsam, /org\?\.telegram_chat_id/);
  assert.match(lies("pages/api/lead-created.js"), /meldeNeuenTermin\(admin, \{/);
  assert.match(lies("lib/buddyNeuerTermin.js"), /await meldeNeuenTermin\(admin, \{/);
  // Der Dialog hängt am Eingang und am Befehl /neu.
  const buddy = lies("lib/buddy.js");
  assert.match(buddy, /v\.modus === "neuerTermin"/);
  assert.match(buddy, /willNeuenTermin\(text\)/);
  assert.match(lies("lib/buddyBefehle.js"), /case "termin":/);
  assert.match(lies("pages/api/telegram-eingang.js"), /startsWith\("n:"\)\) await bearbeiteNeuerTerminKnopf/);
});

test("Die Erklärung nennt auch den Weg zum neuen Termin", () => {
  const text = buddyErklaerung({ istLeitung: false });
  assert.match(text, /➕ Neuen Termin anlegen/);
  assert.match(text, /„neuer Termin“ oder \/termin/);
  assert.ok(text.length < 4000);
  assert.match(hilfeText(false), /\/termin — Neuen Termin anlegen \(ich frage alles ab\)/);
  // Im Menü stehen beide, und sie sagen, was sie tun.
  assert.match(hilfeText(false), /\/termine — Deine Termine heute/);
  assert.deepEqual(leseBefehl("/termin Berger").befehl, "termin");
  assert.deepEqual(leseBefehl("/termine").befehl, "termine");
  assert.deepEqual(leseBefehl("/neu").befehl, "termin");
});

// ---------------------------------------------------------------------------
// Termine über den Bot bestätigen

import {
  willBestaetigen, gemeinteStufe, offenerSchritt, bestaetigungsPatch, bestaetigungsKnoepfe,
  leseBestaetigungsKnopf, auswahlListe, auswahlText, bearbeiteBestaetigungsKnopf,
} from "../lib/buddyBestaetigung.js";

test("Der Bot erkennt, dass jemand bestätigen will — und welche Stufe", () => {
  assert.equal(willBestaetigen("Ich möchte einen Setting Call bestätigen"), true);
  assert.equal(willBestaetigen("Closing bestätigt"), true);
  assert.equal(willBestaetigen("Wie war meine Woche?"), false);
  assert.equal(gemeinteStufe("Ich möchte einen Setting Call bestätigen"), "erstgespraech");
  assert.equal(gemeinteStufe("Closing Call bestätigen"), "closing");
  assert.equal(gemeinteStufe("Termin bestätigen"), null);
});

test("Zur Auswahl stehen nur eigene Termine, denen die Bestätigung fehlt", () => {
  const leads = [
    termin({ id: "offen", name: "Max Müller", appointment_at: "2026-09-21T09:00:00Z" }),
    termin({ id: "schon", name: "Petra Lang", schritte: { setting_bestaetigt: { am: "2026-09-15T10:00:00Z" } } }),
    termin({ id: "closing", name: "Anna Weber", termin_art: "closing", appointment_at: "2026-09-22T09:00:00Z" }),
    termin({ id: "eigener", name: "Zahnarzt", kein_kundentermin: true }),
    termin({ id: "folge", name: "Hans Kunz", termin_art: "folgetermin" }),
  ];
  // Nach Zeitpunkt sortiert: der nächste zuerst.
  assert.deepEqual(auswahlListe(leads).map((l) => l.id), ["offen", "closing"]);
  assert.deepEqual(auswahlListe(leads, "", "closing").map((l) => l.id), ["closing"]);
  // Steht ein Name in der Nachricht, bleibt nur er übrig.
  assert.deepEqual(auswahlListe(leads, "Weber bestätigen").map((l) => l.id), ["closing"]);
  // Ein Folgetermin hat keinen Bestätigungs-Haken, ein eigener Eintrag auch nicht.
  assert.equal(offenerSchritt(leads.find((l) => l.id === "folge")), null);
  assert.equal(offenerSchritt(leads.find((l) => l.id === "eigener")), null);
  assert.equal(offenerSchritt(leads.find((l) => l.id === "schon")), null);
  assert.equal(offenerSchritt(leads.find((l) => l.id === "offen")).key, "setting_bestaetigt");

  const text = auswahlText(auswahlListe(leads));
  assert.match(text, /^Welchen Termin willst du bestätigen\?/);
  assert.match(text, /Setting Call · Max Müller \(Muster GmbH\)/);
  assert.match(auswahlText([], "erstgespraech"), /fehlt keine Bestätigung/);

  const knoepfe = bestaetigungsKnoepfe(leads);
  assert.equal(knoepfe.inline_keyboard.length, 2);
  assert.deepEqual(leseBestaetigungsKnopf(`s:${LEAD}`), { leadId: LEAD, schritt: null });
  assert.equal(leseBestaetigungsKnopf(`s:${LEAD}:pu`).schritt.key, "projektumsetzung");
  assert.equal(leseBestaetigungsKnopf("s:kaputt"), null);
});

test("Der Haken landet an der richtigen Stelle, und nur im eigenen Termin", async () => {
  const lead = termin();
  const { schritt, patch } = bestaetigungsPatch(lead, ICH);
  assert.equal(schritt.key, "setting_bestaetigt");
  assert.equal(patch.schritte.setting_bestaetigt.von, ICH);
  assert.ok(patch.schritte.setting_bestaetigt.am);
  // Ein Closing Call bekommt den Closing-Haken.
  assert.equal(bestaetigungsPatch(termin({ termin_art: "closing" }), ICH).schritt.key, "closing_bestaetigt");
  assert.equal(bestaetigungsPatch(termin({ schritte: { setting_bestaetigt: { am: "x" } } }), ICH), null);

  const knopf = { id: "k", daten: `s:${LEAD}`, chat_id: "1", nachricht_id: 3, nachricht_text: "☀️ Guten Morgen" };
  const eigen = eintragsDatenbank({ verknuepfung: { user_id: ICH }, lead: termin() });
  assert.equal((await bearbeiteBestaetigungsKnopf(eigen.admin, knopf)).ok, true);
  assert.ok(eigen.aenderungen.find((a) => a.tabelle === "leads").patch.schritte.setting_bestaetigt);

  const fremd = eintragsDatenbank({ verknuepfung: { user_id: ANDERE }, lead: termin() });
  assert.equal((await bearbeiteBestaetigungsKnopf(fremd.admin, knopf)).ok, false);
  assert.equal(fremd.aenderungen.length, 0);

  const schon = eintragsDatenbank({ verknuepfung: { user_id: ICH }, lead: termin({ schritte: { setting_bestaetigt: { am: "x" } } }) });
  assert.equal((await bearbeiteBestaetigungsKnopf(schon.admin, knopf)).ok, false);
  assert.equal(schon.aenderungen.length, 0);
});

test("Bestätigen geht auch als Satz — und meldet sich wie aus der Academy", () => {
  const lead = termin();
  const patch = eintragPatch(lead, { ergebnis: "bestaetigt" }, ICH, "2026-09-15");
  assert.ok(patch.schritte.setting_bestaetigt.am);
  // Kein Ergebnis und kein Statuswechsel: Der Termin steht ja noch aus.
  assert.equal(patch.outcome, undefined);
  assert.equal(patch.status, undefined);
  assert.match(vorschlagText(lead, { ergebnis: "bestaetigt" }), /• Setting Call bestätigt/);
  // Ein Folgetermin hat keinen Haken — dann gibt es nichts zu tun.
  assert.equal(hatEtwasZuTun({ ergebnis: "bestaetigt" }, termin({ termin_art: "folgetermin" })), false);
  assert.equal(hatEtwasZuTun({ ergebnis: "bestaetigt" }, lead), true);

  const quelle = lies("lib/buddyEintrag.js");
  assert.match(quelle, /bestaetigt.*Der Termin ist noch nicht gewesen/);
  assert.match(quelle, /meldeBestaetigung\(admin/);
  // Der Weg über den Satz und der über die Auswahl hängen am Eingang.
  assert.match(lies("lib/buddy.js"), /willBestaetigen\(text\) && await zeigeBestaetigungsAuswahl/);
  assert.match(lies("pages/api/telegram-eingang.js"), /startsWith\("s:"\)\) await bearbeiteBestaetigungsKnopf/);
  // Und das Briefing bietet die Knöpfe gleich mit an.
  assert.match(lies("lib/buddyBriefing.js"), /bestaetigungsKnoepfe\(heute\)/);
});

// ---------------------------------------------------------------------------
// Eine Stufe weiter, ohne den Namen zu tippen

import {
  willStufe, kandidaten, auswahlText as stufenAuswahlText, auswahlKnoepfe as stufenKnoepfe,
  leseStufenKnopf, bestaetigungsFrage, darfRuecken, bearbeiteStufenKnopf, ZIELE,
} from "../lib/buddyStufe.js";

test("„Closing Call ausgemacht“ meint die nächste Stufe — ein Bericht nicht", () => {
  assert.equal(willStufe("Closing Call ausgemacht"), "closing");
  assert.equal(willStufe("Hab mit Müller einen Folgetermin vereinbart"), "folgetermin");
  assert.equal(willStufe("Check-in geplant"), "checkin");
  assert.equal(willStufe("Setting Call ausgemacht"), "erstgespraech");
  // Ohne Vereinbarung ist es ein Bericht über ein Gespräch.
  assert.equal(willStufe("Der Closing Call lief gut"), null);
  assert.equal(willStufe("Wie bereite ich einen Closing Call vor?"), null);
});

test("Zur Auswahl steht, wofür dieser Schritt der nächste wäre", () => {
  const jetzt = new Date("2026-09-15T10:00:00Z");
  const leads = [
    termin({ id: "setting", name: "Max Müller", appointment_at: "2026-09-14T10:00:00Z" }),
    termin({ id: "folge", name: "Anna Weber", termin_art: "folgetermin", appointment_at: "2026-09-10T10:00:00Z" }),
    termin({ id: "closing", name: "Petra Lang", termin_art: "closing", appointment_at: "2026-09-12T10:00:00Z" }),
    termin({ id: "kunde", name: "Hans Kunz", termin_art: "closing", outcome: "kunde", appointment_at: "2026-09-11T10:00:00Z" }),
    termin({ id: "eigener", name: "Zahnarzt", kein_kundentermin: true }),
  ];
  // Für ein Closing kommen Setting Calls und Folgetermine infrage.
  assert.deepEqual(kandidaten(leads, "closing", "", jetzt).map((l) => l.id), ["setting", "folge"]);
  // Ein Check-in erst nach dem Abschluss.
  assert.deepEqual(kandidaten(leads, "checkin", "", jetzt).map((l) => l.id), ["kunde"]);
  // Der zuletzt geführte Termin steht oben.
  assert.equal(kandidaten(leads, "folgetermin", "", jetzt)[0].id, "setting");
  // Steht ein Name im Satz, bleibt nur er übrig.
  assert.deepEqual(kandidaten(leads, "closing", "Closing mit Weber ausgemacht", jetzt).map((l) => l.id), ["folge"]);
  // Eigene Einträge sind keine Kundentermine.
  assert.ok(!kandidaten(leads, "closing", "", jetzt).some((l) => l.id === "eigener"));

  const text = stufenAuswahlText("closing", kandidaten(leads, "closing", "", jetzt));
  assert.match(text, /^Für wen ist der Closing Call\?/);
  assert.match(text, /Setting Call 14\.9\., 12:00 · Max Müller/);
  assert.match(stufenAuswahlText("checkin", []), /keinen passenden Kontakt/);
  assert.equal(stufenKnoepfe([leads[0]]).inline_keyboard[0][0].callback_data, "w:setting");
  assert.deepEqual(leseStufenKnopf(`w:${LEAD}`), { leadId: LEAD });
  assert.deepEqual(leseStufenKnopf("w:j"), { antwort: "j" });
  assert.equal(leseStufenKnopf("w:irgendwas"), null);
});

test("Die Rückfrage zeigt alt und neu, und weiterrücken darf nur, wer darf", () => {
  const lead = termin({ appointment_at: "2026-09-14T10:00:00Z" });
  const frage = bestaetigungsFrage(lead, "closing", { zeitpunkt: "2026-09-24T12:00:00.000Z" });
  assert.match(frage, /• Bisher: Setting Call/);
  assert.match(frage, /• Neu: Closing Call/);

  assert.equal(darfRuecken(lead, { id: ICH, organization_id: ORG, role: "member" }), true);
  assert.equal(darfRuecken(lead, { id: ANDERE, organization_id: ORG, role: "member" }), false);
  // Die Leitung darf im eigenen Haus — wie beim Ergebnis.
  assert.equal(darfRuecken(lead, { id: ANDERE, organization_id: ORG, role: "manager" }), true);
  assert.equal(darfRuecken(lead, { id: ANDERE, organization_id: "fremd", role: "manager" }), false);
});

test("Erst nach dem Ja rückt der Termin weiter — mit Verlauf", async () => {
  const zeit = { datum: "2026-09-24", uhrzeit: "14:00", zeitpunkt: "2026-09-24T12:00:00.000Z" };
  const knopf = (daten) => ({ id: "k", daten, chat_id: "1", nachricht_id: 4, nachricht_text: "📋 Soll ich das so eintragen?" });
  const offen = { user_id: ICH, modus: "stufe", modus_seit: "2026-09-15T09:50:00Z", modus_daten: { ziel: "closing", leadId: LEAD, zeit } };

  const ja = eintragsDatenbank({ verknuepfung: offen, lead: termin({ appointment_at: "2026-09-14T10:00:00Z" }) });
  const ergebnis = await bearbeiteStufenKnopf(ja.admin, knopf("w:j"));
  assert.equal(ergebnis.eingetragen, true);
  const patch = ja.aenderungen.find((a) => a.tabelle === "leads").patch;
  assert.equal(patch.termin_art, "closing");
  assert.equal(patch.appointment_at, zeit.zeitpunkt);
  assert.equal(patch.status, "geplant");
  assert.equal(patch.stufen_verlauf[0].art, "erstgespraech");
  assert.equal(patch.stufen_verlauf[0].am, "2026-09-14T10:00:00Z");

  // Abbrechen ändert nichts.
  const nein = eintragsDatenbank({ verknuepfung: offen, lead: termin() });
  await bearbeiteStufenKnopf(nein.admin, knopf("w:n"));
  assert.ok(!nein.aenderungen.some((a) => a.tabelle === "leads"));

  // Fremder Termin ohne Führungsrolle: nichts.
  const fremd = eintragsDatenbank({ verknuepfung: offen, lead: termin({ created_by: ANDERE, organization_id: "fremd" }) });
  assert.equal((await bearbeiteStufenKnopf(fremd.admin, knopf("w:j"))).ok, false);
  assert.ok(!fremd.aenderungen.some((a) => a.tabelle === "leads"));

  // Ohne offenen Dialog passiert nichts.
  const ohne = eintragsDatenbank({ verknuepfung: { ...offen, modus: null }, lead: termin() });
  assert.equal((await bearbeiteStufenKnopf(ohne.admin, knopf("w:j"))).ok, false);
  assert.ok(!ohne.aenderungen.some((a) => a.tabelle === "leads"));

  // Und der Weg dorthin hängt am Eingang.
  assert.match(lies("lib/buddy.js"), /willStufe\(text\) && await zeigeStufenAuswahl/);
  assert.match(lies("lib/buddy.js"), /v\.modus === "stufe"/);
  assert.match(lies("pages/api/telegram-eingang.js"), /startsWith\("w:"\)\) await bearbeiteStufenKnopf/);
  assert.ok(Object.keys(ZIELE).length >= 4);
});

import { terminThema, BEIM_TERMIN_BLEIBEN } from "../lib/buddy.js";

test("Geht es um einen Termin, bleibt der Buddy beim Termin", () => {
  assert.equal(terminThema("Closing Call ausgemacht"), true);
  assert.equal(terminThema("Müller ist Kunde geworden"), true);
  assert.equal(terminThema("Setting Call bestätigen"), true);
  assert.equal(terminThema("neuer Termin"), true);
  assert.equal(terminThema("Wie komme ich am Vorzimmer vorbei?"), false);

  // Kein Anhängsel zur Übung und keine Wochenfrage.
  assert.match(BEIM_TERMIN_BLEIBEN.join(" "), /Keine Frage nach der Woche, keine Nachfrage zur Übung/);

  const buddy = lies("lib/buddy.js");
  // Die Schulung bleibt draussen, solange es um einen Termin geht.
  assert.match(buddy, /const schulungsZeilen = baustein && !umEinenTermin/);
  assert.match(buddy, /umEinenTermin \? \["", \.\.\.BEIM_TERMIN_BLEIBEN\] : \[\]/);
  // Und "übermittelt" ist genauso verboten wie "eingetragen".
  assert.match(buddy, /notiert, hinterlegt, übermittelt, weitergegeben,/);
  // Und er behauptet auch nicht das Gegenteil: dass nichts möglich sei.
  assert.match(buddy, /Sag aber auch NICHT, dass in der Academy nichts/);
});

// ---------------------------------------------------------------------------
// Jeder Schritt am Termin, auch im Chat

import {
  gemeinterSchritt, willHaken, kandidatenFuerSchritt, darfHaken, hakenText, SCHRITT_CODES, schrittVonCode,
} from "../lib/buddyBestaetigung.js";

test("Der Bot kennt alle vier Haken am Termin", () => {
  assert.equal(gemeinterSchritt("Setting Call bestätigt"), "setting_bestaetigt");
  assert.equal(gemeinterSchritt("Closing bestätigt"), "closing_bestaetigt");
  assert.equal(gemeinterSchritt("Check-in erledigt"), "checkin_erledigt");
  assert.equal(gemeinterSchritt("Projekt bei Müller umgesetzt"), "projektumsetzung");
  assert.equal(gemeinterSchritt("Termin bestätigen"), null);
  // Nur die beiden ohne Bestätigung laufen über den zweiten Weg.
  assert.equal(willHaken("Check-in erledigt"), "checkin_erledigt");
  assert.equal(willHaken("Setting Call bestätigen"), null);
  // Jeder Haken hat ein Kurzzeichen für den Knopf.
  Object.entries(SCHRITT_CODES).forEach(([key, code]) => assert.equal(schrittVonCode(code).key, key));
});

test("Zur Auswahl steht nur, wo der Haken wirklich ansteht", () => {
  const kunde = termin({ id: "kunde", name: "Hans Kunz", termin_art: "closing", outcome: "kunde" });
  const leads = [
    termin({ id: "setting", name: "Max Müller" }),
    termin({ id: "checkin", name: "Petra Lang", termin_art: "checkin", outcome: "kunde" }),
    kunde,
    termin({ id: "kein_kunde", name: "Anna Weber", termin_art: "closing" }),
    termin({ id: "erledigt", name: "Tom Ort", termin_art: "checkin", outcome: "kunde", schritte: { checkin_erledigt: { am: "x" } } }),
  ];
  const vertrieb = { id: ICH, organization_id: ORG, role: "member" };
  const leitung = { id: ANDERE, organization_id: ORG, role: "manager" };

  assert.deepEqual(kandidatenFuerSchritt(leads, "setting_bestaetigt", vertrieb).map((l) => l.id), ["setting"]);
  assert.deepEqual(kandidatenFuerSchritt(leads, "checkin_erledigt", vertrieb).map((l) => l.id), ["checkin"]);
  // Die Projektumsetzung gibt es nur bei Kunden — und nur für die Leitung.
  assert.deepEqual(kandidatenFuerSchritt(leads, "projektumsetzung", leitung).map((l) => l.id).sort(), ["checkin", "erledigt", "kunde"]);
  assert.deepEqual(kandidatenFuerSchritt(leads, "projektumsetzung", vertrieb), []);

  const schritt = (key) => SCHRITTE.find((s) => s.key === key);
  assert.equal(darfHaken(kunde, leitung, schritt("projektumsetzung")), true);
  assert.equal(darfHaken(kunde, vertrieb, schritt("projektumsetzung")), false);
  assert.equal(darfHaken(kunde, vertrieb, schritt("setting_bestaetigt")), true);
  assert.equal(darfHaken(kunde, { id: "x", organization_id: "fremd", role: "manager" }, schritt("projektumsetzung")), false);

  assert.match(hakenText([kunde], "projektumsetzung"), /Bei wem willst du „Projektumsetzung“ abhaken\?/);
  assert.match(hakenText([], "checkin_erledigt"), /kein Check-in offen/);
});

test("Ein Termin lässt sich auch nur verschieben", async () => {
  assert.equal(willStufe("Termin mit Müller verschoben"), "verschieben");
  assert.equal(willStufe("Closing Call verschoben"), "verschieben");
  const lead = termin({ termin_art: "closing", appointment_at: "2026-09-14T10:00:00Z" });
  assert.match(bestaetigungsFrage(lead, "verschieben", { zeitpunkt: "2026-09-24T12:00:00.000Z" }), /• Neu: Closing Call/);

  const zeit = { datum: "2026-09-24", uhrzeit: "14:00", zeitpunkt: "2026-09-24T12:00:00.000Z" };
  const db = eintragsDatenbank({
    verknuepfung: { user_id: ICH, modus: "stufe", modus_seit: "2026-09-15T09:50:00Z", modus_daten: { ziel: "verschieben", leadId: LEAD, zeit } },
    lead,
  });
  await bearbeiteStufenKnopf(db.admin, { id: "k", daten: "w:j", chat_id: "1", nachricht_id: 2, nachricht_text: "📋" });
  const patch = db.aenderungen.find((a) => a.tabelle === "leads").patch;
  // Gleiche Stufe, neuer Zeitpunkt — und kein zusätzlicher Verlaufseintrag.
  assert.equal(patch.appointment_at, zeit.zeitpunkt);
  assert.equal(patch.status, "geplant");
  assert.equal(patch.termin_art, undefined);
  assert.equal(patch.stufen_verlauf, undefined);
});

// ---------------------------------------------------------------------------
// Wenn etwas fehlt, sagt der Bot es

import { setzeModus, fehltMigration, MIGRATION_FEHLT } from "../lib/buddyModus.js";
import { stelleWebhookSicherEinmal, vergissWebhookPruefung } from "../lib/telegramWebhook.js";

test("Fehlt die Datenbank-Änderung, schweigt der Bot nicht", async () => {
  assert.equal(fehltMigration({ message: 'column leads.modus does not exist' }), true);
  assert.equal(fehltMigration({ message: "Netzwerkfehler" }), false);
  assert.match(MIGRATION_FEHLT, /migration_175/);

  // Schlägt das Speichern fehl, geht eine Erklärung in den Chat.
  const gesendet = [];
  const admin = {
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: { message: 'column "modus" does not exist' } }) }),
      select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
  };
  const v = { user_id: ICH, chat_id: null };
  // Ohne chat_id verschickt sendePersoenlich nichts — geprüft wird der Rückgabewert.
  assert.equal(await setzeModus(admin, v, "stufe", {}), false);
  assert.equal(gesendet.length, 0);

  // Kein Modul schreibt den Dialogstand noch an der gemeinsamen Stelle vorbei.
  ["lib/buddyStufe.js", "lib/buddyNeuerTermin.js", "lib/buddyBefehle.js", "lib/buddyEintrag.js"].forEach((datei) => {
    assert.ok(!/async function setzeModus/.test(lies(datei)), datei);
    assert.match(lies(datei), /from "\.\/buddyModus\.js"/, datei);
  });
});

test("Der Webhook zieht fehlende Meldungsarten von selbst nach", async () => {
  vergissWebhookPruefung();
  let aufrufe = 0;
  const fetchFn = async (url) => {
    aufrufe += 1;
    return { json: async () => ({ ok: true, result: { url: "https://academy.example/api/telegram-eingang", allowed_updates: MELDUNGSARTEN } }) };
  };
  const optionen = { token: "t", appUrl: "https://academy.example", geheimnis: "g", fetchFn };
  await stelleWebhookSicherEinmal(optionen);
  await stelleWebhookSicherEinmal(optionen);
  // Nur einmal je Instanz, nicht bei jeder Nachricht.
  assert.equal(aufrufe, 1);
  vergissWebhookPruefung();

  assert.match(lies("pages/api/telegram-eingang.js"), /eingang\.art === "message"\) await stelleWebhookSicherEinmal\(\)/);
});

test("Die Erklärung geht einmal an alle — und an niemanden zweimal", async () => {
  const { nachgereichtText, sendeErklaerungen } = await import("../lib/buddyErklaerungVersand.js");
  assert.match(nachgereichtText(false), /^Kurz in eigener Sache/);
  assert.match(nachgereichtText(false), /So funktioniert dein Vertriebsbuddy/);
  assert.match(nachgereichtText(true), /\/gespraech/);

  // Wer sie schon hat, bekommt nichts mehr.
  const zeilen = [
    { user_id: ICH, chat_id: null, erklaerung_am: null },
    { user_id: ANDERE, chat_id: null, erklaerung_am: "2026-09-18T07:00:00Z" },
  ];
  const gefragt = [];
  const admin = {
    from: (tabelle) => {
      const k = {
        select: () => k, not: () => k, eq: () => k, in: () => Promise.resolve({ data: [], error: null }),
        limit: () => Promise.resolve({ data: tabelle === "telegram_verknuepfungen" ? zeilen : [], error: null }),
        update: (patch) => { gefragt.push(patch); return { eq: () => Promise.resolve({ error: null }) }; },
      };
      return k;
    },
  };
  const ergebnis = await sendeErklaerungen(admin);
  // Ohne Telegram-Schlüssel geht nichts raus — gezählt wird trotzdem nichts Falsches.
  assert.equal(ergebnis.gesendet, 0);

  // Neu Verbundene bekommen sie mit der Begrüssung und werden vermerkt.
  const begruessung = lies("lib/telegramBegruessung.js");
  assert.match(begruessung, /erklaerung_am: new Date\(\)\.toISOString\(\)/);
  // Und der Morgenlauf reicht sie nach.
  assert.match(lies("pages/api/cron/tagesbericht.js"), /sendeErklaerungen\(admin\)/);
  assert.match(lies("supabase/migration_176_buddy_erklaerung.sql"), /add column if not exists erklaerung_am timestamptz/);
});

test("Greift kein Dialog, sagt der Buddy fest, dass nichts eingetragen wurde", async () => {
  const { terminAktion, terminHinweisText } = await import("../lib/buddy.js");
  // Klare Ansagen.
  assert.equal(terminAktion("Closing Call ausgemacht"), true);
  assert.equal(terminAktion("Setting Call bestätigen"), true);
  assert.equal(terminAktion("Müller ist Kunde geworden"), true);
  assert.equal(terminAktion("Termin mit Weber verschoben"), true);
  assert.equal(terminAktion("neuer Termin"), true);
  // Ein Bericht über ein Gespräch ist keine Ansage — da bleibt der Coach.
  assert.equal(terminAktion("Der Closing Call lief gut"), false);
  assert.equal(terminAktion("Wie bereite ich ein Closing vor?"), false);

  const text = terminHinweisText("https://academy.example");
  assert.match(text, /^Dazu habe ich keinen passenden Termin gefunden — eingetragen habe ich nichts\./);
  assert.match(text, /„Closing Call ausgemacht“/);
  assert.doesNotMatch(text, /hinterlegt|übermittelt/);

  // Der feste Hinweis kommt VOR der KI-Antwort.
  const buddy = lies("lib/buddy.js");
  const start = buddy.indexOf("export async function beantworteEingang");
  const eingang = buddy.slice(start, buddy.indexOf("export async function verknuepfungZumChat"));
  assert.ok(eingang.indexOf("terminAktion(text)") > 0);
  assert.ok(eingang.indexOf("terminAktion(text)") < eingang.indexOf("antworte(admin, v, profil, woche, text)"));
});

test("Die Erklärung an alle verschickt nur der Betreiber, und nur auf Knopfdruck", () => {
  const route = lies("pages/api/buddy.js");
  const stelle = route.indexOf('aktion === "erklaerung-an-alle"');
  assert.ok(stelle > 0);
  const teil = route.slice(stelle, stelle + 700);
  assert.match(teil, /is_platform_admin/);
  assert.ok(teil.indexOf("is_platform_admin") < teil.indexOf("sendeErklaerungen("));
  // In der Seite hängt sie hinter einer Rückfrage und ist nur für den Betreiber sichtbar.
  const seite = lies("pages/settings.js");
  assert.match(seite, /tg\.plattformAdmin && \(/);
  assert.match(seite, /window\.confirm\("Die Erklärung des Vertriebsbuddys an alle/);
});
