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
  assert.match(lauf, /sendeBriefings\(admin\)/);
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
  assert.match(buddy, /Behaupte nie, etwas eingetragen/);
  // Auch die Ersatzantwort ohne KI sagt nicht "notiert".
  assert.doesNotMatch(antworte, /notiert\./);
});
