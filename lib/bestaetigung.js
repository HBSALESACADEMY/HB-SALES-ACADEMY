// Wer bestätigt hat und wer noch nicht.
//
// Die Bestätigung vor einem Termin ist der billigste Schritt im ganzen
// Verkauf und der, der am häufigsten unterbleibt. Ein unbestätigter Termin
// platzt, und hinterher weiss niemand, ob jemand nachgehakt hat. Genau
// deshalb gehört beides in einen Kanal: die Liste dessen, was morgen
// ansteht und noch offen ist, und die Meldung, sobald jemand abgehakt hat.

import { SCHRITTE, TERMIN_ARTEN, artVon, schrittErledigt } from "./terminArt.js";
import { deutscheZeit, nurUhrzeit, DEUTSCHE_ZONE } from "./terminzeit.js";

/** Welcher Haken vor welcher Stufe steht — aus einer Quelle. */
export function schrittZurStufe(stufenKey) {
  return SCHRITTE.find((s) => s.vorStufe === stufenKey) || null;
}

/** Die Stufen, vor denen überhaupt bestätigt wird. */
export const BESTAETIGTE_STUFEN = SCHRITTE
  .filter((s) => s.vorStufe)
  .map((s) => TERMIN_ARTEN.find((a) => a.key === s.vorStufe))
  .filter(Boolean);

/**
 * Fehlt bei diesem Termin noch die Bestätigung?
 *
 * Nur bei geplanten Terminen: ein Termin, der schon stattgefunden hat oder
 * abgesagt wurde, braucht keine Bestätigung mehr — und eine Meldung dazu
 * wäre eine Aufforderung, etwas Sinnloses zu tun.
 */
export function fehltBestaetigung(lead) {
  if (!lead || lead.status !== "geplant") return false;
  // Einen persönlichen Termin bestätigt niemand beim Kunden.
  if (lead.kein_kundentermin) return false;
  const schritt = schrittZurStufe(artVon(lead).key);
  if (!schritt) return false;
  return !schrittErledigt(lead, schritt.key);
}

/**
 * Der Text einer einzelnen Bestätigung.
 *
 * Mit Zeitpunkt, nicht nur mit Namen: die Gruppe soll ohne Rückfrage
 * wissen, ob der Termin morgen oder nächste Woche ist.
 */
export function bestaetigungsText(lead, vertrieblerName = "") {
  const art = artVon(lead);
  const wer = vertrieblerName ? ` von ${vertrieblerName}` : "";
  const wann = lead?.appointment_at ? `${deutscheZeit(lead.appointment_at)} Uhr` : "einem offenen Zeitpunkt";
  const firma = lead?.company ? ` (${lead.company})` : "";
  return `✅ ${art.label} mit ${lead?.name || "einem Kontakt"}${firma}${wer} bestätigt — findet am ${wann} statt.`;
}

/**
 * Die Morgenliste: was morgen ansteht und noch nicht bestätigt ist.
 *
 * Nach Stufe getrennt, weil der Adressat derselbe ist, die Dringlichkeit
 * aber nicht: ein unbestätigter Closing Call kostet mehr als ein
 * unbestätigter Setting Call.
 *
 * @param {Array} leads   Termine des morgigen Tages
 * @param {Function} nameVon  id → Name
 * @returns {string|null} Der fertige Text, oder null wenn nichts offen ist
 */
export function morgenlisteText(leads = [], nameVon = () => "", appUrl = "") {
  const offen = leads.filter(fehltBestaetigung);
  if (!offen.length) return null;

  const zeilen = [];
  BESTAETIGTE_STUFEN.forEach((stufe) => {
    const dieser = offen.filter((l) => artVon(l).key === stufe.key)
      .sort((a, b) => String(a.appointment_at).localeCompare(String(b.appointment_at)));
    if (!dieser.length) return;
    zeilen.push("", `${stufe.label}:`);
    dieser.slice(0, 20).forEach((l) => {
      const name = nameVon(l.created_by);
      zeilen.push(`• ${nurUhrzeit(l.appointment_at, DEUTSCHE_ZONE)} ${l.name}`
        + (l.company ? ` (${l.company})` : "")
        + (name ? ` — ${name}` : ""));
    });
    if (dieser.length > 20) zeilen.push(`… und ${dieser.length - 20} weitere`);
  });

  return [
    `📋 Morgen: ${offen.length} ${offen.length === 1 ? "Termin ist" : "Termine sind"} noch nicht bestätigt`,
    ...zeilen,
    appUrl ? `\n${appUrl}/termine` : null,
  ].filter((z) => z !== null).join("\n");
}
