import { sendePersoenlich, ladeVerknuepfungen } from "./telegramPersoenlich.js";
import { zahlenFuerTage } from "./zahlenLaden.js";
import { callAI } from "./aiClient.js";
import { berlinHeute, wochenStartTag, tagPlus, tagesBeginnZeitpunkt } from "./woche.js";
import {
  impulsWochen, summiereTage, hatWochenaktivitaet, impulsFrage, impulsNachricht, impulsFallback,
  impulsAnweisung, gespraechsAnweisung, zahlenBlock,
} from "./wochenimpuls.js";
import { rueckblickAnweisung, leseRueckblick, anknuepfung, gedaechtnisZeilen } from "./buddyRueckblick.js";
import { schulungVon, naechstesThema, lektionsText, uebungsText, fazitZeile } from "./schulung.js";

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

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || "";

/** Die laufende Schulung einer Person — oder null. */
async function laufendeSchulung(admin, userId) {
  const { data } = await admin.from("buddy_schulungen")
    .select("id, thema, phase, woche, gestartet_am, uebung_am, erledigt")
    .eq("user_id", userId).neq("phase", "fertig")
    .order("gestartet_am", { ascending: false }).limit(1);
  return data?.[0] || null;
}

/**
 * Eine Schulung beginnen: die Lektion verschicken und festhalten.
 *
 * Der Kern kommt aus lib/schulung.js, nicht aus der KI — ein
 * Einstiegssatz, den eine Sprach-KI frei erfindet, klingt gut und
 * funktioniert am Telefon nicht.
 */
async function starteSchulung(admin, verknuepfung, profil, { text = "", zahlen = null, woche }) {
  const { data: frueher } = await admin.from("buddy_schulungen")
    .select("thema").eq("user_id", verknuepfung.user_id).order("gestartet_am", { ascending: false }).limit(8);
  const thema = naechstesThema({ text, zahlen, ausser: (frueher || []).map((f) => f.thema) });
  const schulung = schulungVon(thema);
  if (!schulung) return null;

  const versand = await sendePersoenlich(admin, verknuepfung, lektionsText(schulung, appUrl()));
  if (!versand?.ok) return null;
  await merke(admin, {
    user_id: verknuepfung.user_id, organization_id: profil?.organization_id || null,
    richtung: "bot", text: lektionsText(schulung, appUrl()), woche,
  });
  const { error } = await admin.from("buddy_schulungen").insert({
    user_id: verknuepfung.user_id,
    organization_id: profil?.organization_id || null,
    thema: schulung.key,
    phase: "gestartet",
    woche,
    gestartet_am: berlinHeute(),
  });
  if (error) { console.error("Vertriebsbuddy: Schulung nicht gespeichert:", error.message); return null; }
  return schulung.key;
}

/**
 * Der Übungsauftrag am Tag nach der Lektion.
 *
 * Getrennt und einen Tag später, weil beides zusammen niemand umsetzt:
 * Erklärung und Aufgabe in einer Nachricht liest man wie einen Artikel.
 */
export async function schickeUebungen(admin, { jetzt = new Date() } = {}) {
  const heute = berlinHeute(jetzt);
  const { data: offen, error } = await admin.from("buddy_schulungen")
    .select("id, user_id, thema, gestartet_am").eq("phase", "gestartet").lt("gestartet_am", heute);
  if (error) return { verschickt: 0, grund: error.message };
  if (!offen?.length) return { verschickt: 0 };

  const chats = await ladeVerknuepfungen(admin, offen.map((s) => s.user_id));
  const profilVon = await personen(admin, offen.map((s) => s.user_id));
  let verschickt = 0;
  for (const s of offen) {
    const chat = chats.get(s.user_id);
    const schulung = schulungVon(s.thema);
    if (!chat || chat.buddy === false || !schulung) continue;
    const text = uebungsText(schulung);
    const versand = await sendePersoenlich(admin, chat, text);
    if (!versand?.ok) continue;
    await merke(admin, {
      user_id: s.user_id, organization_id: profilVon.get(s.user_id)?.organization_id || null,
      richtung: "bot", text, woche: wochenStartTag(jetzt),
    });
    await admin.from("buddy_schulungen").update({ phase: "uebung", uebung_am: heute }).eq("id", s.id);
    verschickt += 1;
  }
  return { verschickt };
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

    // Ob die Übung gemacht wurde, gehört an die Schulung — daraus sieht die
    // Leitung später, ob aus dem Rat etwas geworden ist.
    if (rueckblick.uebungGemacht !== null && rueckblick.uebungGemacht !== undefined) {
      const laufend = await laufendeSchulung(admin, userId);
      if (laufend) await admin.from("buddy_schulungen").update({ erledigt: rueckblick.uebungGemacht }).eq("id", laufend.id);
    }
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

    // Die Schulung der Woche abschliessen — mit Fazit, nicht stillschweigend.
    const laufend = await laufendeSchulung(admin, v.user_id);
    const baustein = schulungVon(laufend?.thema);
    if (baustein) {
      const fazit = fazitZeile(baustein, laufend.erledigt);
      const fazitVersand = await sendePersoenlich(admin, v, fazit);
      if (fazitVersand?.ok) {
        await merke(admin, { user_id: v.user_id, organization_id: p?.organization_id || null, richtung: "bot", text: fazit, woche });
      }
      await admin.from("buddy_schulungen").update({ phase: "fertig" }).eq("id", laufend.id);
    } else {
      // Kein Thema aus dem Gespräch? Dann legen die Zahlen eines nahe.
      await starteSchulung(admin, v, p, { zahlen, woche });
    }
  }

  return { gesendet, woche, ohneZahlen };
}

/** Die Antwort des Buddys auf eine eingegangene Nachricht. */
async function antworte(admin, verknuepfung, profil, woche, eingang = "") {
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

  // Läuft gerade eine Schulung, gehört sie ins Gespräch — sonst fragt der
  // Buddy nach der Übung, die er selbst verschickt hat, nie nach.
  const schulung = await laufendeSchulung(admin, verknuepfung.user_id);
  const baustein = schulungVon(schulung?.thema);
  const schulungsZeilen = baustein
    ? [
      "",
      `Ihr arbeitet gerade an: ${baustein.titel}.`,
      `Die Übung dazu lautet: ${baustein.uebung}`,
      schulung.phase === "uebung"
        ? "Frag beiläufig nach, wie die Übung läuft, wenn es zum Gespräch passt."
        : "Die Übung dazu kommt morgen — kündige sie nicht gross an.",
    ]
    : [];

  const antwort = await kiSatz(
    [
      gespraechsAnweisung({ name: profil?.full_name, organisation: profil?.organisation, zahlen, vorher: vorwoche }),
      ...(gedaechtnis.length ? ["", "Das weisst du aus der Vorwoche:", ...gedaechtnis] : []),
      ...schulungsZeilen,
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

  // Nennt jemand ein Thema, zu dem es einen Baustein gibt, und läuft noch
  // keine Schulung: Dann wird aus dem Rat eine kleine Schulung.
  if (!schulung && eingang) {
    await starteSchulung(admin, verknuepfung, profil, { text: eingang, zahlen, woche });
  }
  return !!versand?.ok;
}

/**
 * Eine einzelne Nachricht beantworten, die der Webhook gemeldet hat.
 *
 * Der Weg für den Normalfall: Telegram meldet sofort, der Buddy antwortet
 * in Sekunden. Das Abholen weiter unten bleibt als Rückfallebene, falls
 * kein Webhook eingerichtet ist.
 */
export async function beantworteEingang(admin, eingang = {}) {
  const chatId = String(eingang.chat_id || "");
  const text = String(eingang.text || "").trim();
  if (!chatId || !text) return { ignoriert: true };

  const { data: zeilen } = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, buddy").eq("chat_id", chatId).limit(1);
  const v = zeilen?.[0];
  if (!v || v.buddy === false) return { ignoriert: true };

  const profil = (await personen(admin, [v.user_id])).get(v.user_id);
  const woche = wochenStartTag();

  // Dieselbe Meldung kommt nicht zweimal in den Verlauf — und wird damit
  // auch nicht zweimal beantwortet.
  const { data: gespeichert, error } = await admin.from("buddy_nachrichten")
    .upsert({
      update_id: eingang.update_id, user_id: v.user_id,
      organization_id: profil?.organization_id || null, richtung: "person", text, woche,
    }, { onConflict: "update_id", ignoreDuplicates: true })
    .select("id");
  if (error) { console.error("Vertriebsbuddy: Eingang nicht gespeichert:", error.message); return { fehler: error.message }; }
  if (!gespeichert?.length) return { doppelt: true };

  await antworte(admin, v, profil, woche, text);
  return { ok: true };
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
    await antworte(admin, v, profil, woche, text);
    neu += 1;
  }

  return { neu, tag: berlinHeute(jetzt) };
}
