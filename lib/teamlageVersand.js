import { zahlenFuerTage } from "./zahlenLaden.js";
import { impulsWochen, summiereTage } from "./wochenimpuls.js";
import { teamlageText } from "./teamlage.js";
import { sendePersoenlich } from "./telegramPersoenlich.js";
import { ladeOnboarding } from "./onboardingStand.js";
import { istFuehrungsrolle } from "./rollen.js";
import { tagPlus } from "./woche.js";

// Die Teamlage zusammenstellen und an die Leitung schicken.
//
// Alles, was hier zusammenkommt, sind Zahlen aus der Academy und die
// Stichpunkte aus den Wochenrückblicken. Die Gespräche selbst werden nicht
// einmal geladen.

const WOCHEN_ZURUECK = 3;

/** Der Stand aller Leute einer Organisation — die Grundlage für Nachricht und Rückfragen. */
export async function teamStand(admin, orgId, { jetzt = new Date() } = {}) {
  const { woche, diese, vorher } = impulsWochen(jetzt);

  const { data: mitglieder } = await admin.from("profiles")
    .select("id, full_name, role, is_admin, is_platform_admin")
    .eq("organization_id", orgId).eq("status", "approved").order("full_name");
  const ids = (mitglieder || []).map((m) => m.id);
  if (!ids.length) return { woche, personen: [] };

  const abWoche = tagPlus(woche, -7 * (WOCHEN_ZURUECK - 1));
  const [proTag, rueckblicke, schulungen, verknuepfungen, antworten, onboarding] = await Promise.all([
    zahlenFuerTage(admin, [...diese, ...vorher]),
    admin.from("buddy_wochen").select("user_id, woche, stimmung, herausforderungen").in("user_id", ids).gte("woche", abWoche),
    admin.from("buddy_schulungen").select("user_id, thema, phase").in("user_id", ids).neq("phase", "fertig"),
    admin.from("telegram_verknuepfungen").select("user_id, chat_id").in("user_id", ids).not("chat_id", "is", null),
    admin.from("buddy_nachrichten").select("user_id, created_at").in("user_id", ids).eq("richtung", "person")
      .order("created_at", { ascending: false }).limit(500),
    ladeOnboarding(admin, { orgId, nurOffene: true }).catch(() => ({ zuweisungen: [] })),
  ]);

  const rueckblickVon = new Map();
  (rueckblicke.data || []).forEach((r) => {
    if (!rueckblickVon.has(r.user_id)) rueckblickVon.set(r.user_id, []);
    rueckblickVon.get(r.user_id).push(r);
  });
  const schulungVonPerson = new Map((schulungen.data || []).map((s) => [s.user_id, s.thema]));
  const verbunden = new Set((verknuepfungen.data || []).map((v) => v.user_id));
  const letzteAntwort = new Map();
  (antworten.data || []).forEach((n) => { if (!letzteAntwort.has(n.user_id)) letzteAntwort.set(n.user_id, n.created_at); });
  const ueberfaelligVon = new Map((onboarding.zuweisungen || []).map((z) => [z.user_id, z.stand?.ueberfaellig || 0]));

  const personen = (mitglieder || []).map((m) => {
    const eigene = (rueckblickVon.get(m.id) || []).sort((a, b) => b.woche.localeCompare(a.woche));
    const dieseWoche = eigene.find((r) => r.woche === woche) || null;
    // Wie viele Wochen in Folge "schwer" — rückwärts gezählt, ohne Lücken.
    let folge = 0;
    for (let i = 0; i < eigene.length; i += 1) {
      if (eigene[i].stimmung !== "schwer") break;
      folge += 1;
    }
    const zuletzt = letzteAntwort.get(m.id);
    return {
      id: m.id,
      name: m.full_name || "Unbenannt",
      istLeitung: istFuehrungsrolle(m),
      zahlen: summiereTage(proTag, diese, m.id),
      vorwoche: summiereTage(proTag, vorher, m.id),
      stimmung: dieseWoche?.stimmung || null,
      stimmungsFolge: folge,
      herausforderungen: Array.isArray(dieseWoche?.herausforderungen) ? dieseWoche.herausforderungen : [],
      schulung: schulungVonPerson.get(m.id) || null,
      verbunden: verbunden.has(m.id),
      letzteAntwortTage: zuletzt ? Math.floor((jetzt.getTime() - new Date(zuletzt).getTime()) / 86400000) : null,
      onboardingUeberfaellig: ueberfaelligVon.get(m.id) || 0,
    };
  });

  return { woche, personen };
}

/**
 * Die Teamlage verschicken — an jede Führungsrolle mit verbundenem Telegram.
 *
 * @param nurFuer    nur an diese Person (Testknopf)
 * @param erzwingen  auch, wenn sie diese Woche schon raus ist
 */
export async function sendeTeamlage(admin, { jetzt = new Date(), nurFuer = null, erzwingen = false } = {}) {
  let abfrage = admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, teamlage, teamlage_fuer").not("chat_id", "is", null);
  if (nurFuer) abfrage = abfrage.eq("user_id", nurFuer);
  const { data: verknuepfungen, error } = await abfrage;
  if (error) return { gesendet: 0, grund: error.message };

  const kandidaten = (verknuepfungen || []).filter((v) => v.teamlage !== false);
  if (!kandidaten.length) return { gesendet: 0 };

  const { data: profile } = await admin.from("profiles")
    .select("id, full_name, role, is_admin, is_platform_admin, organization_id")
    .in("id", kandidaten.map((v) => v.user_id));
  const profilVon = new Map((profile || []).map((p) => [p.id, p]));

  // Nur die Leitung, und je Organisation nur einmal rechnen.
  const empfaenger = kandidaten.filter((v) => {
    const p = profilVon.get(v.user_id);
    return p?.organization_id && istFuehrungsrolle(p);
  });
  if (!empfaenger.length) return { gesendet: 0 };

  const orgIds = [...new Set(empfaenger.map((v) => profilVon.get(v.user_id).organization_id))];
  const { data: orgs } = await admin.from("organizations").select("id, name").in("id", orgIds);
  const orgName = new Map((orgs || []).map((o) => [o.id, o.name]));

  const staende = new Map();
  for (const orgId of orgIds) staende.set(orgId, await teamStand(admin, orgId, { jetzt }));

  let gesendet = 0;
  for (const v of empfaenger) {
    const p = profilVon.get(v.user_id);
    const stand = staende.get(p.organization_id);
    if (!erzwingen && v.teamlage_fuer === stand.woche) continue;
    if (!stand.personen.length) continue;

    const text = teamlageText({
      organisation: orgName.get(p.organization_id) || "",
      woche: stand.woche,
      personen: stand.personen,
      name: p.full_name || "",
    });
    const versand = await sendePersoenlich(admin, v, text);
    if (!versand?.ok) continue;
    await admin.from("telegram_verknuepfungen").update({ teamlage_fuer: stand.woche }).eq("user_id", v.user_id);
    gesendet += 1;
  }

  return { gesendet };
}
