import { pruefeSystem } from "./systemPruefung.js";

// Baut den täglichen Überblick: was gestern in jeder Kundenorganisation
// passiert ist, plus eine Zeile zum Systemzustand. Hält zugleich den
// geprüften Zustand in system_health fest.
//
// Liegt hier statt in der Cron-Route, damit derselbe Bericht auch von Hand
// ausgelöst werden kann (Knopf auf der Statusseite) — im Vercel-Hobby-Tarif
// läuft der Cron nur einmal täglich, man will aber zwischendurch nachsehen
// können, ohne bis zum nächsten Morgen zu warten.
export async function baueTagesbericht(admin) {
  const gestern = new Date(Date.now() - 86400000);
  const vonISO = new Date(gestern.getFullYear(), gestern.getMonth(), gestern.getDate()).toISOString();
  const bisISO = new Date(gestern.getFullYear(), gestern.getMonth(), gestern.getDate(), 23, 59, 59).toISOString();
  const gesternTag = vonISO.slice(0, 10);

  const [{ data: orgs }, { data: profile }, { data: anrufe }, { data: termine }, { data: pruefungen }, { data: aufgaben }] =
    await Promise.all([
      admin.from("organizations").select("id, name").order("name"),
      admin.from("profiles").select("id, organization_id, status, created_at"),
      admin.from("call_log_days").select("user_id, counts").eq("log_date", gesternTag),
      admin.from("leads").select("created_by, created_at").gte("created_at", vonISO).lte("created_at", bisISO),
      admin.from("exam_results").select("user_id, passed, created_at").gte("created_at", vonISO).lte("created_at", bisISO),
      admin.from("lead_tasks").select("assigned_to, due_date, done").eq("done", false).lt("due_date", new Date().toISOString()),
    ]);

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
    if (a || t || nt || b) irgendwoAktivitaet = true;

    const teile = [];
    if (a) teile.push(`${a} Anwahlen`);
    if (t) teile.push(`${t} terminiert`);
    if (nt) teile.push(`${nt} Termine erfasst`);
    if (b) teile.push(`${b} Prüfung${b > 1 ? "en" : ""} bestanden`);
    zeilen.push(`${o.name}: ${teile.length ? teile.join(", ") : "keine Aktivität"}`);
    if (w) zeilen.push(`   ⚠️ ${w} wartet auf Freigabe`);
    if (u) zeilen.push(`   ⚠️ ${u} überfällige Aufgabe${u > 1 ? "n" : ""}`);
  }

  if (!irgendwoAktivitaet) zeilen.push("", "Gestern war in keiner Organisation Aktivität.");

  const system = await pruefeSystem();
  zeilen.push("");
  zeilen.push(system.gesund
    ? "✅ System läuft."
    : "🔴 System: " + system.pruefungen.filter((p) => !p.ok).map((p) => p.name).join(", "));

  // Zustand festhalten, damit die Statusseite ihn zeigen kann. Schlägt das
  // fehl (etwa weil migration_83 fehlt), soll der Bericht trotzdem rausgehen.
  const { error: schreibFehler } = await admin.from("system_health").upsert({
    id: true, gesund: system.gesund, pruefungen: system.pruefungen, geprueft_at: system.zeitpunkt,
  });

  return { text: zeilen.join("\n"), system, schreibFehler: schreibFehler?.message || null };
}
