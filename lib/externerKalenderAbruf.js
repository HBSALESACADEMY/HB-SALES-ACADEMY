import { leseIcs } from "./icsLesen.js";

// Einen fremden Kalender abholen und in die Datenbank schreiben.
//
// Läuft nur auf dem Server: die Adresse ist ein Geheimnis und darf den
// Browser nie erreichen. Ausserdem verbietet die Content-Security-Policy
// Abrufe an fremde Adressen aus der Seite heraus — richtigerweise.

// Wie weit der Abruf reicht. Zurück nur wenig: Vergangenes im
// Firmenkalender interessiert niemanden, es kostet aber Speicher.
const TAGE_ZURUECK = 14;
const TAGE_VORAUS = 120;

// Nicht bei jedem Seitenaufruf neu holen. Eine halbe Stunde ist der
// Kompromiss: ein spontan eingetragener Termin ist bald da, und ein
// Kalender, den zehn Leute gleichzeitig ansehen, wird nicht zehnmal geladen.
export const FRISCH_MS = 30 * 60 * 1000;

// Grenzen gegen eine Datei, die alles lahmlegt.
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TERMINE = 2000;

export function istFaellig(letzterAbruf, jetzt = Date.now()) {
  if (!letzterAbruf) return true;
  const zeit = Date.parse(letzterAbruf);
  return Number.isNaN(zeit) || jetzt - zeit > FRISCH_MS;
}

/**
 * Prüft eine Adresse, bevor sie gespeichert wird.
 *
 * Wichtig gegen SSRF: unsere Server könnten sonst dazu gebracht werden,
 * interne Adressen abzurufen und das Ergebnis auszuliefern. Deshalb nur
 * http/https und keine Adressen, die offensichtlich ins eigene Netz zeigen.
 */
export function pruefeUrl(roh) {
  const text = String(roh || "").trim().replace(/^webcal:/i, "https:");
  if (!text) return { fehler: "Bitte eine Kalender-Adresse eintragen." };
  let url;
  try { url = new URL(text); } catch (e) { return { fehler: "Das ist keine gültige Adresse." }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { fehler: "Nur http- und https-Adressen sind möglich." };
  }
  const host = url.hostname.toLowerCase();
  const intern = host === "localhost" || host.endsWith(".local") || host === "[::1]"
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host);
  if (intern) return { fehler: "Diese Adresse zeigt ins interne Netz und kann nicht abgerufen werden." };
  return { url: url.toString() };
}

/**
 * Holt den Kalender und gibt die Termine zurück.
 * Wirft nicht — Fehler kommen als { fehler } zurück, damit sie beim
 * Kalendereintrag stehen können statt in einem Protokoll zu verschwinden.
 */
export async function holeKalender(url, { jetzt = Date.now() } = {}) {
  const geprueft = pruefeUrl(url);
  if (geprueft.fehler) return { fehler: geprueft.fehler };

  try {
    const abbruch = AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined;
    const antwort = await fetch(geprueft.url, {
      signal: abbruch,
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8" },
      redirect: "follow",
    });
    if (!antwort.ok) return { fehler: `Der Kalender antwortet mit Fehler ${antwort.status}.` };

    const laenge = Number(antwort.headers.get("content-length") || 0);
    if (laenge > MAX_BYTES) return { fehler: "Der Kalender ist zu gross." };

    const text = await antwort.text();
    if (text.length > MAX_BYTES) return { fehler: "Der Kalender ist zu gross." };
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return { fehler: "Unter dieser Adresse liegt kein Kalender. Bei Google ist es die „geheime Adresse im iCal-Format“." };
    }

    const termine = leseIcs(text, {
      vonMs: jetzt - TAGE_ZURUECK * 86400000,
      bisMs: jetzt + TAGE_VORAUS * 86400000,
    });
    return { termine: termine.slice(0, MAX_TERMINE) };
  } catch (e) {
    const name = e?.name === "TimeoutError" || e?.name === "AbortError"
      ? "Der Kalender hat zu lange gebraucht."
      : "Der Kalender war nicht erreichbar.";
    return { fehler: name };
  }
}

/**
 * Abrufen und speichern. Ersetzt die Termine dieses Kalenders vollständig —
 * gelöschte Termine verschwinden so von selbst, statt für immer zu bleiben.
 */
export async function aktualisiereKalender(admin, kalender, { jetzt = Date.now() } = {}) {
  const { termine, fehler } = await holeKalender(kalender.url, { jetzt });

  if (fehler) {
    await admin.from("externe_kalender")
      .update({ letzter_abruf: new Date(jetzt).toISOString(), letzter_fehler: fehler })
      .eq("id", kalender.id);
    return { fehler };
  }

  await admin.from("externe_termine").delete().eq("kalender_id", kalender.id);
  if (termine.length) {
    const zeilen = termine.map((t) => ({
      kalender_id: kalender.id,
      user_id: kalender.user_id,
      uid: String(t.uid).slice(0, 300),
      titel: t.titel ? String(t.titel).slice(0, 200) : null,
      beginn: t.beginn,
      ende: t.ende,
      ganztags: t.ganztags,
    }));
    for (let i = 0; i < zeilen.length; i += 500) {
      await admin.from("externe_termine").upsert(zeilen.slice(i, i + 500), { onConflict: "kalender_id,uid" });
    }
  }

  await admin.from("externe_kalender")
    .update({ letzter_abruf: new Date(jetzt).toISOString(), letzter_fehler: null })
    .eq("id", kalender.id);
  return { anzahl: termine.length };
}
