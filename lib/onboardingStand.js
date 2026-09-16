import { alleZeilen } from "./alleZeilen.js";
import { planStand } from "./onboarding.js";
import { berlinHeute, tagesBeginnZeitpunkt } from "./woche.js";

// Lädt Plan, Zuweisungen und Haken einer Organisation — und rechnet aus
// den vorhandenen Daten nach, welche automatischen Schritte erledigt sind.
//
// Nur mit dem Admin-Client: Wie viele Anwahlen oder Termine jemand hat,
// darf nicht jede Person über den Browser nachlesen. Wer das Ergebnis sehen
// darf, entscheidet die Route (pages/api/onboarding.js).

// Fehlt eine Tabelle (eine ältere Migration nicht eingespielt), zählt das
// Signal als 0 — der Rest des Onboardings bleibt benutzbar. Still ist es
// trotzdem nicht: der Grund steht im Log.
async function sicher(anfrage, was) {
  const { data, error } = await anfrage;
  if (error) {
    console.error(`Onboarding: ${was} nicht lesbar:`, error.message);
    return [];
  }
  return data || [];
}

async function ladeWerte(admin, zuweisungen, profilVon) {
  const ids = [...new Set(zuweisungen.map((z) => z.user_id))];
  const startVon = new Map(zuweisungen.map((z) => [z.user_id, z.gestartet_am]));
  const fruehester = [...startVon.values()].sort()[0];
  const ab = tagesBeginnZeitpunkt(fruehester);
  const nachStart = (id, zeitpunkt) =>
    !!zeitpunkt && startVon.has(id) && new Date(zeitpunkt).getTime() >= new Date(tagesBeginnZeitpunkt(startVon.get(id))).getTime();

  const [telegram, quiz, pruefung, rollenspiele, anrufe, termine, mails] = await Promise.all([
    sicher(admin.from("telegram_verknuepfungen").select("user_id").in("user_id", ids).not("chat_id", "is", null), "Telegram"),
    sicher(alleZeilen(() => admin.from("quiz_results").select("id, user_id").in("user_id", ids).order("id")), "Quiz"),
    sicher(alleZeilen(() => admin.from("exam_results").select("id, user_id").eq("passed", true).in("user_id", ids).order("id")), "Prüfungen"),
    sicher(alleZeilen(() => admin.from("roleplay_sessions").select("id, user_id, created_at").in("user_id", ids)
      .gte("created_at", ab).order("id")), "Rollenspiele"),
    sicher(alleZeilen(() => admin.from("call_log_days").select("user_id, log_date, counts").in("user_id", ids)
      .gte("log_date", fruehester).order("user_id").order("log_date")), "Call Tracker"),
    sicher(alleZeilen(() => admin.from("leads").select("id, created_by, created_at, outcome, kein_kundentermin")
      .is("geloescht_am", null).in("created_by", ids).gte("created_at", ab).order("id")), "Termine"),
    sicher(alleZeilen(() => admin.from("email_kontakte").select("id, verschickt_von, verschickt_am")
      .in("verschickt_von", ids).gte("verschickt_am", ab).order("id")), "Mails"),
  ]);

  const werte = new Map(ids.map((id) => {
    const p = profilVon.get(id);
    // Vollständig heisst: so, wie die Academy es selbst festhält
    // (migration_109). Fehlt die Angabe, reichen Bild und Text über sich.
    const profil = p?.profil_vollstaendig === true
      || (p?.profil_vollstaendig == null && !!p?.avatar_url && !!String(p?.bio || "").trim());
    return [id, { profil, telegram: false, quiz: false, pruefung: false, rollenspiel: 0, anwahlen: 0, termine: 0, kunden: 0, mails: 0 }];
  }));
  const w = (id) => werte.get(id);

  telegram.forEach((z) => { if (w(z.user_id)) w(z.user_id).telegram = true; });
  quiz.forEach((z) => { if (w(z.user_id)) w(z.user_id).quiz = true; });
  pruefung.forEach((z) => { if (w(z.user_id)) w(z.user_id).pruefung = true; });
  rollenspiele.forEach((z) => { if (w(z.user_id) && nachStart(z.user_id, z.created_at)) w(z.user_id).rollenspiel += 1; });
  anrufe.forEach((z) => {
    if (w(z.user_id) && z.log_date >= startVon.get(z.user_id)) w(z.user_id).anwahlen += Number(z.counts?.anwahlen) || 0;
  });
  termine.forEach((z) => {
    if (!w(z.created_by) || z.kein_kundentermin || !nachStart(z.created_by, z.created_at)) return;
    w(z.created_by).termine += 1;
    if (z.outcome === "kunde") w(z.created_by).kunden += 1;
  });
  mails.forEach((z) => { if (w(z.verschickt_von) && nachStart(z.verschickt_von, z.verschickt_am)) w(z.verschickt_von).mails += 1; });

  return werte;
}

/**
 * @returns { schritte, zuweisungen } — jede Zuweisung mit person, haken,
 *          werte und stand (lib/onboarding.js#planStand).
 */
export async function ladeOnboarding(admin, { orgId, userIds = null, nurOffene = false }) {
  let zuweisungsAbfrage = admin.from("onboarding_zuweisungen").select("*").eq("organization_id", orgId);
  if (userIds) zuweisungsAbfrage = zuweisungsAbfrage.in("user_id", userIds);
  if (nurOffene) zuweisungsAbfrage = zuweisungsAbfrage.is("abgeschlossen_am", null);

  const [schritteAntwort, zuweisungAntwort] = await Promise.all([
    admin.from("onboarding_schritte").select("*").eq("organization_id", orgId).order("reihenfolge").order("created_at"),
    zuweisungsAbfrage.order("gestartet_am", { ascending: false }),
  ]);
  if (schritteAntwort.error) throw schritteAntwort.error;
  if (zuweisungAntwort.error) throw zuweisungAntwort.error;
  const schritte = schritteAntwort.data || [];
  const roh = zuweisungAntwort.data || [];
  if (!roh.length) return { schritte, zuweisungen: [] };

  const { data: haken, error: hakenFehler } = await admin.from("onboarding_haken")
    .select("*").in("zuweisung_id", roh.map((z) => z.id));
  if (hakenFehler) throw hakenFehler;

  const namensIds = [...new Set([
    ...roh.map((z) => z.user_id),
    ...roh.map((z) => z.zugewiesen_von),
    ...(haken || []).map((h) => h.erledigt_von),
  ].filter(Boolean))];
  const { data: profile, error: profilFehler } = await admin.from("profiles")
    .select("id, full_name, avatar_url, bio, profil_vollstaendig").in("id", namensIds);
  if (profilFehler) throw profilFehler;
  const profilVon = new Map((profile || []).map((p) => [p.id, p]));

  const werte = await ladeWerte(admin, roh, profilVon);
  const heute = berlinHeute();

  const zuweisungen = roh.map((z) => {
    const eigeneHaken = {};
    (haken || []).filter((h) => h.zuweisung_id === z.id).forEach((h) => {
      eigeneHaken[h.schritt_id] = {
        erledigt_am: h.erledigt_am,
        erledigt_von: h.erledigt_von,
        von_name: profilVon.get(h.erledigt_von)?.full_name || null,
      };
    });
    const eigeneWerte = werte.get(z.user_id) || {};
    return {
      ...z,
      person: { id: z.user_id, full_name: profilVon.get(z.user_id)?.full_name || "Unbenannt", avatar_url: profilVon.get(z.user_id)?.avatar_url || null },
      zugewiesen_von_name: profilVon.get(z.zugewiesen_von)?.full_name || null,
      haken: eigeneHaken,
      werte: eigeneWerte,
      stand: planStand(schritte, { haken: eigeneHaken, werte: eigeneWerte, gestartetAm: z.gestartet_am, heute }),
    };
  });

  return { schritte, zuweisungen };
}
