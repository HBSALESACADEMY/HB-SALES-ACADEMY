import { maskiere } from "./htmlMail.js";
import { deutscheZeit } from "./terminzeit.js";
import { liegtSeitTagen, NACHFASSEN_AB_TAGEN } from "./marketingVorlage.js";

// Die Erinnerungen an Follow-ups aus dem E-Mail-Marketing — als Mail an die
// Person, die sich kümmern muss.
//
// Sie liefen früher in die Telegram-Gruppe der Organisation. Dort las sie
// das ganze Team, obwohl nur eine Person etwas damit anfangen konnte, und
// die Meldungen, auf die es in der Gruppe ankommt, gingen darin unter.

// Mehr Zeilen liest in einer Erinnerung niemand.
export const MAX_ZEILEN = 15;

/** Einträge nach einem Feld gruppieren — Einträge ohne dieses Feld fallen weg. */
export function gruppiereNach(liste = [], schluessel) {
  const gruppen = new Map();
  (liste || []).forEach((eintrag) => {
    const wert = eintrag?.[schluessel];
    if (!wert) return;
    if (!gruppen.has(wert)) gruppen.set(wert, []);
    gruppen.get(wert).push(eintrag);
  });
  return gruppen;
}

function aufzaehlung(punkte, gesamt) {
  const zeilen = punkte.slice(0, MAX_ZEILEN);
  if (gesamt > MAX_ZEILEN) zeilen.push(`… und ${gesamt - MAX_ZEILEN} weitere`);
  return `<ul>${zeilen.map((z) => `<li>${z}</li>`).join("")}</ul>`;
}

function verweis(appUrl, pfad, text) {
  return appUrl ? `<p><a href="${maskiere(appUrl)}${pfad}" target="_blank" rel="noopener noreferrer">${text} →</a></p>` : "";
}

/** Die Mail zu den heute fälligen Follow-ups einer Person. */
export function faelligeFollowUpsMail(eintraege = [], appUrl = "") {
  const anzahl = eintraege.length;
  const punkte = eintraege.map((n) =>
    `<strong>${maskiere(n.titel || "Follow-up")}</strong> — ${maskiere(deutscheZeit(n.faellig_am))} Uhr`);
  return {
    subject: anzahl === 1 ? `Heute fällig: ${eintraege[0].titel || "Follow-up"}` : `Heute fällig: ${anzahl} Follow-ups`,
    html:
      `<p>${anzahl === 1 ? "Dieses Follow-up ist" : "Diese Follow-ups sind"} heute dran:</p>`
      + aufzaehlung(punkte, anzahl)
      + verweis(appUrl, "/kalender", "Im Kalender ansehen"),
  };
}

/** Die Mail zu verschickten Mails einer Person, die ohne Antwort liegen. */
export function wartendeKontakteMail(kontakte = [], jetzt = new Date(), appUrl = "") {
  const anzahl = kontakte.length;
  const punkte = kontakte.map((k) =>
    `<strong>${maskiere(k.name || k.email || "Ohne Namen")}</strong>${k.firma ? ` (${maskiere(k.firma)})` : ""}`
    + ` — seit ${liegtSeitTagen(k.verschickt_am, jetzt)} Tagen ohne Antwort`);
  return {
    subject: `${anzahl} ${anzahl === 1 ? "Kontakt wartet" : "Kontakte warten"} auf ein Follow-up`,
    html:
      `<p>Verschickt vor mindestens ${NACHFASSEN_AB_TAGEN} Tagen, ohne Ergebnis:</p>`
      + aufzaehlung(punkte, anzahl)
      + verweis(appUrl, "/email-marketing", "Im E-Mail-Marketing ansehen"),
  };
}

/**
 * Adresse und Benachrichtigungs-Wahl je Person.
 *
 * Die Adresse steht nicht im Profil, sondern im Konto — deshalb über die
 * Kontenliste, wie an den anderen Stellen, die Mails an Teammitglieder
 * schicken (lib/notifyManagers.js).
 */
export async function empfaengerVon(admin, ids = []) {
  const adressen = new Map();
  const profile = new Map();
  if (!ids.length) return { adressen, profile };

  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  (authList?.users || []).forEach((u) => { if (ids.includes(u.id) && u.email) adressen.set(u.id, u.email); });

  const { data: leute } = await admin.from("profiles").select("id, benachrichtigungen").in("id", ids);
  (leute || []).forEach((p) => profile.set(p.id, p));

  return { adressen, profile };
}
