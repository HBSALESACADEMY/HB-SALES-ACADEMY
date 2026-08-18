// Berechnet Kennzahl-Werte je Person — die gemeinsame Grundlage für den
// Ziel-Fortschritt eines Teams, den Beitrag einzelner Mitglieder und die
// Team-Rangliste. Alle drei fragen dieselben Daten ab, nur anders
// zusammengefasst; getrennte Abfragen wären dreimal dieselbe Last.
//
// Läuft ausschliesslich serverseitig mit dem Admin-Client: die Rohdaten
// (etwa fremde Anruf-Zahlen) darf ein normales Teammitglied nicht lesen.
// Die aufrufende Route entscheidet, welche Summen sie herausgibt.
import { goalMetric } from "./goalMetrics.js";

// Für die Rangliste zusätzlich zu den Ziel-Kennzahlen: XP ist kein Ziel,
// aber der bisherige Maßstab des Wettbewerbs.
export const XP_METRIK = { key: "xp", label: "XP", quelle: "xp" };

export function ranglisteMetrik(key) {
  return key && key !== "xp" ? goalMetric(key) : XP_METRIK;
}

// Liefert Map<userId, Zahl> für den Zeitraum ab start.
export async function werteProPerson(admin, metrik, ids, startISO, startTag) {
  const werte = new Map();
  if (!metrik || !ids.length) return werte;
  const addiere = (id, n) => { if (n) werte.set(id, (werte.get(id) || 0) + n); };

  if (metrik.quelle === "zeilen") {
    const { data } = await admin.from(metrik.tabelle).select("user_id").in("user_id", ids).gte("created_at", startISO);
    (data || []).forEach((z) => addiere(z.user_id, 1));
  } else if (metrik.quelle === "calltracker") {
    // counts enthält Tagessummen — aufaddieren, nicht Zeilen zählen: eine
    // Zeile ist ein Tag, nicht ein Anruf.
    const { data } = await admin.from("call_log_days").select("user_id, counts").in("user_id", ids).gte("log_date", startTag);
    (data || []).forEach((z) => addiere(z.user_id, Number(z.counts?.[metrik.feld]) || 0));
  } else if (metrik.quelle === "leads") {
    const { data } = await admin.from("leads").select("created_by").in("created_by", ids).gte("created_at", startISO);
    (data || []).forEach((z) => addiere(z.created_by, 1));
  } else if (metrik.quelle === "xp") {
    const { data } = await admin.from("xp_log").select("user_id, amount").in("user_id", ids).gt("created_at", startISO);
    (data || []).forEach((z) => addiere(z.user_id, Number(z.amount) || 0));
  }
  return werte;
}

export function summeFuer(werte, ids) {
  return ids.reduce((s, id) => s + (werte.get(id) || 0), 0);
}

export function montagDieserWoche(d = new Date()) {
  const tag = d.getDay();
  const montag = new Date(d);
  montag.setDate(d.getDate() + ((tag === 0 ? -6 : 1) - tag));
  montag.setHours(0, 0, 0, 0);
  return montag;
}
