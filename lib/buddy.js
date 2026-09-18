import { sendePersoenlich } from "./telegramPersoenlich.js";
import { zahlenFuerTage } from "./zahlenLaden.js";
import { callAI } from "./aiClient.js";
import { berlinHeute, wochenStartTag, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";
import {
  impulsWochen, summiereTage, hatWochenaktivitaet, impulsFrage, impulsNachricht, impulsFallback,
  impulsAnweisung, gespraechsAnweisung, zahlenBlock,
} from "./wochenimpuls.js";
import { rueckblickAnweisung, leseRueckblick, anknuepfung, gedaechtnisZeilen } from "./buddyRueckblick.js";

// Der Vertriebsbuddy: Wochenimpuls verschicken und auf Antworten eingehen.
//
// Zwei Grundsätze:
//   1. Zahlen kommen aus der Datenbank, nie aus der KI. Die KI schreibt nur
//      die Einordnung. Eine erfundene Zahl in einer Motivationsnachricht
//      wäre schlimmer als gar keine Nachricht.
//   2. Antwortet die KI nicht (kein Schlüssel, Kontingent voll), geht
//      trotzdem etwas raus. Ein Buddy, der bei Gegenwind schweigt, ist keiner.

// Wie viele Nachrichten des Gesprächs die KI sieht. Genug für einen Faden,
// wenig genug, dass es bezahlbar und schnell bleibt.
const VERLAUF = 12;

// Ältere Nachrichten beantwortet der Buddy nicht mehr. getUpdates gibt bis
// zu 24 Stunden alles heraus; ohne diese Grenze würde beim Einschalten
// plötzlich auf tagealte Sätze geantwortet.
const HOECHSTALTER_STUNDEN = 24;

async function kiSatz(anweisung, nachrichten, maxTokens = 400) {
  try {
    const text = await callAI(anweisung, nachrichten, maxTokens);
    return String(text || "").trim();
  } catch (e) {
    console.error("Vertriebsbuddy: KI nicht erreichbar:", e.message);
    return "";
  }
}

async function merke(admin, eintrag) {
  const { error } = await admin.from("buddy_nachrichten").insert(eintrag);
  if (error) console.error("Vertriebsbuddy: Nachricht nicht gespeichert:", error.message);
}

async function personen(admin, ids) {
  const { data: profile } = await admin.from("profiles").select("id, full_name, organization_id").in("id", ids);
  const orgIds = [...new Set((profile || []).map((p) => p.organization_id).filter(Boolean))];
  const { data: orgs } = orgIds.length
    ? await admin.from("organizations").select("id, name").in("id", orgIds)
    : { data: [] };
  const namen = new Map((orgs || []).map((o) => [o.id, o.name]));
  return new Map((profile || []).map((p) => [p.id, { ...p, organisation: namen.get(p.organization_id) || "" }]));
}

/**
 * Den Rückblick auf eine Woche erstellen: woran es hakte, wie die Stimmung
 * war, was sich die Person vorgenommen hat.
 *
 * Läuft vor dem neuen Impuls. Nur wo die Person selbst geschrieben hat —
 * aus einem Monolog des Buddys lässt sich nichts herauslesen.
 */
export async function fasseWochenZusammen(admin, { jetzt = new Date(), nurFuer = null, erzwingen = false } = {}) {
  const { woche } = impulsWochen(jetzt);
  const ab = tagesBeginnZeitpunkt(woche);

  let abfrage = admin.from("buddy_nachrichten")
    .select("user_id, richtung, text, created_at, organization_id").gte("created_at", ab).order("created_at");
  if (nurFuer) abfrage = abfrage.eq("user_id", nurFuer);
  const { data: nachrichten, error } = await abfrage;
  if (error) return { erstellt: 0, grund: error.message };

  const jePerson = new Map();
  (nachrichten || []).forEach((n) => {
    if (!jePerson.has(n.user_id)) jePerson.set(n.user_id, []);
    jePerson.get(n.user_id).push(n);
  });
  if (!jePerson.size) return { erstellt: 0, woche };

  const { data: vorhanden } = await admin.from("buddy_wochen")
    .select("user_id").eq("woche", woche).in("user_id", [...jePerson.keys()]);
  const schonDa = new Set((vorhanden || []).map((v) => v.user_id));
  const profilVon = await personen(admin, [...jePerson.keys()]);

  let erstellt = 0;
  for (const [userId, liste] of jePerson) {
    if (schonDa.has(userId) && !erzwingen) continue;
    // Ohne eigene Worte gibt es nichts auszuwerten.
    if (!liste.some((n) => n.richtung === "person")) continue;

    const p = profilVon.get(userId);
    const gespraech = liste.map((n) => `${n.richtung === "bot" ? "Coach" : "Person"}: ${n.text}`).join("\n\n");
    const roh = await kiSatz(rueckblickAnweisung({ name: p?.full_name }), [{ role: "user", content: gespraech }], 500);
    const rueckblick = leseRueckblick(roh);
    if (!rueckblick) continue;

    const { error: schreibFehler } = await admin.from("buddy_wochen").upsert({
      user_id: userId,
      organization_id: p?.organization_id || null,
      woche,
      herausforderungen: rueckblick.herausforderungen,
      stimmung: rueckblick.stimmung,
      vorhaben: rueckblick.vorhaben,
      zusammenfassung: rueckblick.zusammenfassung,
    }, { onConflict: "user_id,woche" });
    if (schreibFehler) { console.error("Vertriebsbuddy: Rückblick nicht gespeichert:", schreibFehler.message); continue; }
    erstellt += 1;
  }

  return { erstellt, woche };
}

/**
 * Der Wochenimpuls.
 *
 * @param nurFuer    nur an diese Person (Testknopf in den Einstellungen)
 * @param erzwingen  auch, wenn diese Woche schon einer raus ist
 */
export async function sendeWochenimpulse(admin, { jetzt = new Date(), nurFuer = null, erzwingen = false } = {}) {
  const { woche, diese, vorher } = impulsWochen(jetzt);

  let abfrage = admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, buddy, impuls_fuer").not("chat_id", "is", null);
  if (nurFuer) abfrage = abfrage.eq("user_id", nurFuer);
  const { data, error } = await abfrage;
  if (error) return { gesendet: 0, grund: error.message };

  const offen = (data || []).filter((v) => v.buddy !== false && (erzwingen || v.impuls_fuer !== woche));
  if (!offen.length) return { gesendet: 0, woche };

  const proTag = await zahlenFuerTage(admin, [...diese, ...vorher]);
  const profilVon = await personen(admin, offen.map((v) => v.user_id));
  // Was letzte Woche Thema war — daran knüpft der Impuls an.
  const { data: rueckblicke } = await admin.from("buddy_wochen")
    .select("user_id, herausforderungen, stimmung, vorhaben, zusammenfassung")
    .eq("woche", tagPlus(woche, -7)).in("user_id", offen.map((v) => v.user_id));
  const rueckblickVon = new Map((rueckblicke || []).map((r) => [r.user_id, r]));

  let gesendet = 0;
  let ohneZahlen = 0;
  for (const v of offen) {
    const zahlen = summiereTage(proTag, diese, v.user_id);
    const vorwoche = summiereTage(proTag, vorher, v.user_id);
    // Wer diese Woche nichts eingetragen hat (Urlaub, krank), bekommt keinen
    // Impuls. Eine Nachricht voller Nullen motiviert niemanden.
    if (!hatWochenaktivitaet(zahlen) && !hatWochenaktivitaet(vorwoche)) { ohneZahlen += 1; continue; }

    const p = profilVon.get(v.user_id);
    const frage = impulsFrage(woche);
    const rueckblick = rueckblickVon.get(v.user_id) || null;
    const kiText = await kiSatz(
      impulsAnweisung({ name: p?.full_name, organisation: p?.organisation }),
      [{
        role: "user",
        content: [
          "Zahlen dieser Woche (Vorwoche in Klammern):",
          ...zahlenBlock(zahlen, vorwoche),
          ...(gedaechtnisZeilen(rueckblick).length ? ["", "Aus dem Gespräch der Vorwoche:", ...gedaechtnisZeilen(rueckblick)] : []),
        ].join("\n"),
      }],
      300,
    );
    const text = kiText
      ? impulsNachricht({ name: p?.full_name, zahlen, vorher: vorwoche, frage, kiText, anknuepfung: anknuepfung(rueckblick) })
      : impulsFallback({ name: p?.full_name, zahlen, vorher: vorwoche, frage });

    const versand = await sendePersoenlich(admin, v, text);
    if (!versand?.ok) continue;
    await merke(admin, { user_id: v.user_id, organization_id: p?.organization_id || null, richtung: "bot", text, woche });
    await admin.from("telegram_verknuepfungen").update({ impuls_fuer: woche }).eq("user_id", v.user_id);
    gesendet += 1;
  }

  return { gesendet, woche, ohneZahlen };
}

/** Die Antwort des Buddys auf eine eingegangene Nachricht. */
async function antworte(admin, verknuepfung, profil, woche) {
  const { diese, vorher } = impulsWochen();
  const proTag = await zahlenFuerTage(admin, [...diese, ...vorher]);
  const zahlen = summiereTage(proTag, diese, verknuepfung.user_id);
  const vorwoche = summiereTage(proTag, vorher, verknuepfung.user_id);

  const { data: verlauf } = await admin.from("buddy_nachrichten")
    .select("richtung, text, created_at").eq("user_id", verknuepfung.user_id)
    .order("created_at", { ascending: false }).limit(VERLAUF);

  const nachrichten = (verlauf || []).reverse()
    .map((n) => ({ role: n.richtung === "bot" ? "assistant" : "user", content: n.text }));

  const { data: vorige } = await admin.from("buddy_wochen")
    .select("herausforderungen, stimmung, vorhaben, zusammenfassung")
    .eq("user_id", verknuepfung.user_id).lt("woche", woche)
    .order("woche", { ascending: false }).limit(1);
  const gedaechtnis = gedaechtnisZeilen(vorige?.[0] || null);

  const antwort = await kiSatz(
    [
      gespraechsAnweisung({ name: profil?.full_name, organisation: profil?.organisation, zahlen, vorher: vorwoche }),
      ...(gedaechtnis.length ? ["", "Das weisst du aus der Vorwoche:", ...gedaechtnis] : []),
    ].join("\n"),
    nachrichten,
    500,
  );
  const text = antwort
    || "Danke dir — ich hab's notiert. Gerade komme ich an meine Antworten nicht heran, schreib mir später noch mal.";

  const versand = await sendePersoenlich(admin, verknuepfung, text);
  if (versand?.ok) {
    await merke(admin, { user_id: verknuepfung.user_id, organization_id: profil?.organization_id || null, richtung: "bot", text, woche });
  }
  return !!versand?.ok;
}

/**
 * Neue Antworten aus Telegram abholen und beantworten.
 *
 * Telegram schickt nichts von sich aus (kein Webhook, sonst funktionierte
 * die Gruppensuche nicht mehr) — die Academy fragt nach. Damit nicht jeder
 * Seitenaufruf eine Abfrage auslöst, gilt ein Mindestabstand.
 */
export async function holeAntworten(admin, { mindestAbstandMs = 60000, erzwingen = false, jetzt = new Date() } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { neu: 0, grund: "Kein Telegram-Bot eingerichtet." };

  const { data: abholung, error: abholFehler } = await admin.from("buddy_abholung")
    .select("zuletzt").eq("id", true).maybeSingle();
  if (abholFehler) return { neu: 0, grund: abholFehler.message };
  if (!erzwingen && abholung?.zuletzt && jetzt.getTime() - new Date(abholung.zuletzt).getTime() < mindestAbstandMs) {
    return { neu: 0, uebersprungen: true };
  }
  await admin.from("buddy_abholung").upsert({ id: true, zuletzt: jetzt.toISOString() }, { onConflict: "id" });

  const updates = encodeURIComponent(JSON.stringify(["message", "my_chat_member", "channel_post"]));
  const antwort = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-100&allowed_updates=${updates}`);
  const daten = await antwort.json();
  if (!daten?.ok) return { neu: 0, grund: daten?.description || "Telegram hat die Anfrage abgelehnt." };

  const { data: verknuepfungen } = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, buddy").not("chat_id", "is", null);
  const jeChat = new Map((verknuepfungen || []).map((v) => [String(v.chat_id), v]));
  if (!jeChat.size) return { neu: 0 };

  const aelteste = jetzt.getTime() / 1000 - HOECHSTALTER_STUNDEN * 3600;
  const woche = wochenStartTag(jetzt);
  let neu = 0;

  for (const u of daten.result || []) {
    const m = u?.message;
    const text = String(m?.text || "").trim();
    if (!text || m?.chat?.type !== "private" || !m.date || m.date < aelteste) continue;
    // "/start HB…" ist das Verbinden, keine Unterhaltung.
    if (text.startsWith("/")) continue;
    const v = jeChat.get(String(m.chat.id));
    if (!v || v.buddy === false) continue;

    // Der Schlüssel gegen Doppelantworten: dieselbe Meldung kommt bei jeder
    // Abfrage erneut, bis Telegram sie nach 24 Stunden vergisst.
    const { data: gespeichert, error } = await admin.from("buddy_nachrichten")
      .upsert({ update_id: u.update_id, user_id: v.user_id, richtung: "person", text, woche },
        { onConflict: "update_id", ignoreDuplicates: true })
      .select("id");
    if (error) { console.error("Vertriebsbuddy: Eingang nicht gespeichert:", error.message); continue; }
    if (!gespeichert?.length) continue;   // schon bekannt

    const profil = (await personen(admin, [v.user_id])).get(v.user_id);
    await antworte(admin, v, profil, woche);
    neu += 1;
  }

  return { neu, tag: berlinHeute(jetzt) };
}
