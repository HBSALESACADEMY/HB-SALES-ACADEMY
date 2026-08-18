import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { pruefeSystem } from "../../../lib/systemPruefung";
import { sendeAlarm } from "../../../lib/alarm";

// Täglicher Überblick um 9 Uhr per Telegram: was gestern in jeder
// Kundenorganisation passiert ist, plus eine Zeile zum Systemzustand.
//
// Zur Uhrzeit: Vercel führt Cron-Aufträge in UTC aus, Deutschland wechselt
// aber zwischen Sommer- und Winterzeit. Der Auftrag läuft deshalb zu ZWEI
// Zeiten (7 und 8 Uhr UTC) und der Bericht wird nur gesendet, wenn es in
// Deutschland tatsächlich 9 Uhr ist — sonst käme er im Winter um 8 und im
// Sommer um 10.
export const config = { maxDuration: 60 };

function berlinStunde() {
  // Über formatToParts statt format(): die deutsche Schreibweise hängt " Uhr"
  // an ("09 Uhr"), daraus liesse sich keine Zahl lesen — der Bericht käme nie.
  const teile = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "numeric", hour12: false }).formatToParts(new Date());
  return Number(teile.find((t) => t.type === "hour")?.value);
}

export default async function handler(req, res) {
  const erwartet = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || req.headers.authorization !== erwartet) {
    return res.status(401).json({ error: "Nicht autorisiert." });
  }
  // "force" erlaubt einen Testlauf ausserhalb der 9 Uhr.
  if (berlinStunde() !== 9 && req.query.force !== "1") {
    return res.status(200).json({ uebersprungen: true, grund: "nicht 9 Uhr in Deutschland" });
  }

  const admin = getAdminSupabase();
  const gestern = new Date(Date.now() - 86400000);
  const vonISO = new Date(gestern.getFullYear(), gestern.getMonth(), gestern.getDate()).toISOString();
  const bisISO = new Date(gestern.getFullYear(), gestern.getMonth(), gestern.getDate(), 23, 59, 59).toISOString();
  const gesternTag = vonISO.slice(0, 10);

  try {
    const [{ data: orgs }, { data: profile }, { data: anrufe }, { data: termine }, { data: pruefungen }, { data: aufgaben }] =
      await Promise.all([
        admin.from("organizations").select("id, name").order("name"),
        admin.from("profiles").select("id, organization_id, status, created_at"),
        admin.from("call_log_days").select("user_id, counts").eq("log_date", gesternTag),
        admin.from("leads").select("created_by, created_at").gte("created_at", vonISO).lte("created_at", bisISO),
        admin.from("exam_results").select("user_id, passed, created_at").gte("created_at", vonISO).lte("created_at", bisISO),
        admin.from("lead_tasks").select("assigned_to, due_date, done").eq("done", false).lt("due_date", new Date().toISOString()),
      ]);

    // Personen ihrer Organisation zuordnen — die Kennzahlen hängen an
    // Personen, berichtet wird aber je Organisation.
    const orgVon = new Map((profile || []).map((p) => [p.id, p.organization_id]));
    const zaehle = (liste, feld, addiere) => {
      const proOrg = new Map();
      (liste || []).forEach((z) => {
        const org = orgVon.get(z[feld]);
        if (!org) return;
        proOrg.set(org, (proOrg.get(org) || 0) + addiere(z));
      });
      return proOrg;
    };

    const anwahlen = zaehle(anrufe, "user_id", (z) => z.counts?.anwahlen || 0);
    const terminiert = zaehle(anrufe, "user_id", (z) => z.counts?.termin || 0);
    const neueTermine = zaehle(termine, "created_by", () => 1);
    const bestanden = zaehle((pruefungen || []).filter((p) => p.passed), "user_id", () => 1);
    const ueberfaellig = zaehle(aufgaben, "assigned_to", () => 1);

    const wartend = new Map();
    (profile || []).forEach((p) => {
      if (p.status === "pending" && p.organization_id) wartend.set(p.organization_id, (wartend.get(p.organization_id) || 0) + 1);
    });

    const datum = gestern.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
    const zeilen = [`📊 HB Sales Academy — ${datum}`, ""];

    let irgendwoAktivitaet = false;
    for (const o of orgs || []) {
      const a = anwahlen.get(o.id) || 0, t = terminiert.get(o.id) || 0, nt = neueTermine.get(o.id) || 0;
      const b = bestanden.get(o.id) || 0, w = wartend.get(o.id) || 0, u = ueberfaellig.get(o.id) || 0;
      const aktiv = a || t || nt || b;
      if (aktiv) irgendwoAktivitaet = true;

      const teile = [];
      if (a) teile.push(`${a} Anwahlen`);
      if (t) teile.push(`${t} terminiert`);
      if (nt) teile.push(`${nt} Termine erfasst`);
      if (b) teile.push(`${b} Prüfung${b > 1 ? "en" : ""} bestanden`);
      zeilen.push(`${o.name}: ${teile.length ? teile.join(", ") : "keine Aktivität"}`);
      // Nur anhängen, was Handlungsbedarf bedeutet.
      if (w) zeilen.push(`   ⚠️ ${w} wartet auf Freigabe`);
      if (u) zeilen.push(`   ⚠️ ${u} überfällige Aufgabe${u > 1 ? "n" : ""}`);
    }

    if (!irgendwoAktivitaet) zeilen.push("", "Gestern war in keiner Organisation Aktivität.");

    const system = await pruefeSystem();
    zeilen.push("");
    zeilen.push(system.gesund
      ? "✅ System läuft."
      : "🔴 System: " + system.pruefungen.filter((p) => !p.ok).map((p) => p.name).join(", "));

    await sendeAlarm(zeilen.join("\n"));
    return res.status(200).json({ ok: true, gesendet: zeilen.length });
  } catch (e) {
    console.error("Tagesbericht fehlgeschlagen:", e.message);
    await sendeAlarm("⚠️ HB Sales Academy: Der Tagesbericht konnte nicht erstellt werden — " + e.message);
    return res.status(500).json({ error: e.message });
  }
}
