import { berlinHeute, tagPlus } from "./woche.js";

// Das Onboarding: ein Plan aus Schritten, den die Leitung einer neuen Person
// zuweist. Hier steht nur das Rechnen — was erledigt, fällig und überfällig
// ist. Die Daten lädt lib/onboardingStand.js.

// Woran die Academy selbst erkennt, dass ein Schritt erledigt ist.
// "zaehlbar": braucht eine Zielanzahl und zählt ab dem Start des Onboardings
// — "50 Anwahlen" heisst fünfzig Anwahlen im Onboarding, nicht irgendwann.
export const AUTO_SIGNALE = [
  { key: "profil", label: "Profil ausgefüllt", zaehlbar: false },
  { key: "telegram", label: "Telegram verbunden", zaehlbar: false },
  { key: "quiz", label: "Erstes Quiz gemacht", zaehlbar: false },
  { key: "pruefung", label: "Prüfung bestanden", zaehlbar: false },
  { key: "rollenspiel", label: "Rollenspiele geübt", zaehlbar: true, einheit: "Rollenspiele" },
  { key: "anwahlen", label: "Anwahlen", zaehlbar: true, einheit: "Anwahlen" },
  { key: "termine", label: "Termine gelegt", zaehlbar: true, einheit: "Termine" },
  { key: "kunden", label: "Kunden gewonnen", zaehlbar: true, einheit: "Kunden" },
  { key: "mails", label: "Mails verschickt", zaehlbar: true, einheit: "Mails" },
];

export const WER = { vertrieb: "Vertriebler", leitung: "Leitung" };

export function signalVon(key) {
  return AUTO_SIGNALE.find((s) => s.key === key) || null;
}

/** "2026-09-14" oder ein Zeitpunkt → "14.9." (deutscher Kalendertag). */
export function datumKurz(wert) {
  if (!wert) return "";
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(String(wert)) ? String(wert) : berlinHeute(new Date(wert));
  const [, m, t] = tag.split("-").map(Number);
  return `${t}.${m}.`;
}

/** Der Stand eines Schritts für eine Person. */
export function schrittStand(schritt, { haken = null, werte = {}, gestartetAm = null, heute = berlinHeute() } = {}) {
  const signal = signalVon(schritt?.automatisch);
  let erledigt;
  let ist = null;
  let ziel = null;
  if (signal) {
    if (signal.zaehlbar) {
      ziel = Math.max(1, Number(schritt.ziel_anzahl) || 1);
      ist = Number(werte[signal.key]) || 0;
      erledigt = ist >= ziel;
    } else {
      erledigt = !!werte[signal.key];
    }
  } else {
    erledigt = !!haken;
  }
  const faelligAm = gestartetAm && Number.isInteger(schritt?.faellig_tag) ? tagPlus(gestartetAm, schritt.faellig_tag) : null;
  // Überfällig erst am Tag NACH der Frist: "bis Tag 3" heisst, Tag 3 zählt noch.
  const ueberfaellig = !erledigt && !!faelligAm && heute > faelligAm;
  return { erledigt, automatisch: !!signal, ist, ziel, faelligAm, ueberfaellig, haken: haken || null };
}

/** Der Stand des ganzen Plans für eine Person. */
export function planStand(schritte = [], { haken = {}, werte = {}, gestartetAm = null, heute = berlinHeute() } = {}) {
  const geordnet = [...schritte].sort((a, b) =>
    (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const liste = geordnet.map((s) => ({ schritt: s, ...schrittStand(s, { haken: haken[s.id], werte, gestartetAm, heute }) }));
  const erledigt = liste.filter((x) => x.erledigt).length;
  const gesamt = liste.length;
  return {
    liste,
    erledigt,
    gesamt,
    prozent: gesamt ? Math.round((erledigt / gesamt) * 100) : 0,
    ueberfaellig: liste.filter((x) => x.ueberfaellig).length,
    naechster: liste.find((x) => !x.erledigt)?.schritt || null,
    // Ein Plan ohne Schritte ist nicht fertig, sondern leer.
    fertig: gesamt > 0 && erledigt === gesamt,
  };
}

/**
 * Darf diese Person diesen Schritt von Hand abhaken?
 *
 * Automatische Schritte hakt niemand ab — sonst stünde "50 Anwahlen" als
 * erledigt da, obwohl es zwölf waren. Die Leitung hakt alle übrigen ab, ein
 * Vertriebler nur die eigenen, die für ihn gedacht sind.
 */
export function darfAbhaken(schritt, { istLeitung = false, istEigene = false } = {}) {
  if (!schritt || schritt.automatisch) return false;
  if (istLeitung) return true;
  return !!istEigene && schritt.wer === "vertrieb";
}

/** Eingaben für einen Schritt prüfen und in die gespeicherte Form bringen. */
export function pruefeSchritt(e = {}) {
  const titel = String(e?.titel || "").trim();
  if (!titel) return { fehler: "Der Schritt braucht einen Titel." };
  if (titel.length > 120) return { fehler: "Der Titel ist zu lang (höchstens 120 Zeichen)." };
  const beschreibung = String(e?.beschreibung || "").trim().slice(0, 500) || null;

  const automatisch = e?.automatisch ? String(e.automatisch) : null;
  const signal = signalVon(automatisch);
  if (automatisch && !signal) return { fehler: "Unbekannte automatische Prüfung." };

  let zielAnzahl = null;
  if (signal?.zaehlbar) {
    const n = Number(e.ziel_anzahl);
    if (!Number.isInteger(n) || n < 1 || n > 100000) {
      return { fehler: `Gib an, wie viele ${signal.einheit} es sein sollen (ganze Zahl ab 1).` };
    }
    zielAnzahl = n;
  }

  let faelligTag = null;
  if (e?.faellig_tag !== "" && e?.faellig_tag !== null && e?.faellig_tag !== undefined) {
    const n = Number(e.faellig_tag);
    if (!Number.isInteger(n) || n < 0 || n > 365) return { fehler: "„Fällig bis Tag“ muss eine ganze Zahl von 0 bis 365 sein." };
    faelligTag = n;
  }

  return {
    schritt: {
      titel,
      beschreibung,
      wer: signal ? "vertrieb" : (e?.wer === "leitung" ? "leitung" : "vertrieb"),
      automatisch,
      ziel_anzahl: zielAnzahl,
      faellig_tag: faelligTag,
    },
  };
}

/** Die Erinnerung an überfällige Schritte — für die Person selbst oder die Leitung. */
export function erinnerungsText({ name = "", eintraege = [], fuerLeitung = false }) {
  const zeilen = eintraege.map((e) => `• ${e.titel}${e.faelligAm ? ` (fällig bis ${datumKurz(e.faelligAm)})` : ""}`);
  const kopf = fuerLeitung
    ? `⏰ Onboarding von ${name || "einer Person"}: ${eintraege.length === 1 ? "Ein Schritt ist" : `${eintraege.length} Schritte sind`} überfällig.`
    : `⏰ Dein Onboarding: ${eintraege.length === 1 ? "Dieser Schritt ist" : "Diese Schritte sind"} überfällig.`;
  const fuss = fuerLeitung
    ? "Details in der Academy unter Onboarding."
    : "Du findest sie in der Academy auf deinem Startbildschirm.";
  return [kopf, "", ...zeilen, "", fuss].join("\n");
}

export function fertigText({ name = "", fuerLeitung = false }) {
  if (fuerLeitung) return `🎉 ${name || "Eine Person"} hat das Onboarding abgeschlossen — alle Schritte sind erledigt.`;
  const vorname = String(name || "").trim().split(/\s+/)[0];
  return `🎉 Glückwunsch${vorname ? `, ${vorname}` : ""}! Dein Onboarding ist abgeschlossen — alle Schritte sind erledigt.`;
}
