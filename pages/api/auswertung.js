import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../lib/rollen";
import { resolveObjectionCategories } from "../../lib/objectionCategories";

// Datengrundlage der Management-Auswertung.
//
// Zwei Dinge entscheiden hier über alles:
//
// 1. WER darf. Die Auswertung ist Führungsstoff — sie stellt Menschen
//    nebeneinander und benennt, wer zurückliegt. Das sehen nur
//    Führungsrollen (lib/rollen.js). Die Prüfung steht hier auf dem Server,
//    nicht in der Seite: ein verstecktes Menü ist keine Zugriffsregel.
//
// 2. WELCHE Organisation. Diese Route arbeitet mit erweiterten Rechten und
//    umgeht damit die Zugriffsregeln der Datenbank. Die Trennung der
//    Mandanten muss deshalb ausdrücklich in jeder Abfrage stehen — sie
//    kommt aus active_org auf dem Server und NICHT aus der Anfrage, sonst
//    liesse sie sich von aussen umschreiben (siehe lib/aktiveOrgServer.js).
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  const { data: profil } = await client.from("profiles")
    .select("id, role, is_admin, is_platform_admin, organization_id").eq("id", user.id).maybeSingle();

  if (!istFuehrungsrolle(profil)) {
    return res.status(403).json({
      error: "Diese Auswertung ist Teamleitungen und der Vertriebsleitung vorbehalten.",
    });
  }

  const admin = getAdminSupabase();
  const orgId = await aktiveOrgId(admin, profil, user.id);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  const von = typeof req.query.von === "string" ? req.query.von : null;
  const bis = typeof req.query.bis === "string" ? req.query.bis : null;
  if (!von || !bis) return res.status(400).json({ error: "Zeitraum fehlt." });

  try {
    const [{ data: personen }, { data: teams }, { data: org }] = await Promise.all([
      admin.from("profiles").select("id, full_name, role, status").eq("organization_id", orgId),
      admin.from("teams").select("id, name").eq("organization_id", orgId).order("name"),
      admin.from("organizations").select("objection_categories").eq("id", orgId).maybeSingle(),
    ]);

    const ids = (personen || []).map((p) => p.id);
    if (!ids.length) return res.status(200).json({ personen: [], teams: [], zeilen: [], kategorien: [] });

    const teamIds = (teams || []).map((t) => t.id);
    const [{ data: mitglieder }, { data: zeilen }, { data: termine }, { data: ereignisse }] = await Promise.all([
      teamIds.length
        ? admin.from("team_members").select("team_id, user_id").in("team_id", teamIds)
        : Promise.resolve({ data: [] }),
      admin.from("call_log_days").select("user_id, log_date, counts, reasons")
        .in("user_id", ids).gte("log_date", von).lte("log_date", bis),
      // Termine über organization_id, nicht über die anlegende Person: wer
      // per Firmencode in mehreren Organisationen arbeitet, nähme seine
      // Termine sonst überallhin mit (migration_114).
      admin.from("leads").select("created_by, status, outcome, appointment_at, created_at")
        .eq("organization_id", orgId).gte("created_at", `${von}T00:00:00`).lte("created_at", `${bis}T23:59:59`),
      // Einzelne Ereignisse mit Uhrzeit (migration_128) — die Grundlage für
      // "welcher Einwand zu welcher Stunde". Über die Personen der
      // Organisation eingegrenzt, nicht über organization_id allein: Zeilen
      // aus der Zeit vor migration_128 tragen dort noch nichts.
      admin.from("call_events").select("user_id, art, grund, erfasst_at")
        .in("user_id", ids)
        .gte("erfasst_at", `${von}T00:00:00`).lte("erfasst_at", `${bis}T23:59:59.999`),
    ]);

    // Trainingsaktivität im selben Zeitraum — die Grundlage der
    // Impact-Analyse. Gezählt wird die Anzahl der Einheiten, nicht ihre
    // Bewertung: es geht um "wer trainiert", nicht um "wer wird gut
    // benotet".
    const seit = `${von}T00:00:00`;
    const bisZeit = `${bis}T23:59:59`;
    const zaehleJePerson = async (tabelle) => {
      const { data } = await admin.from(tabelle).select("user_id")
        .in("user_id", ids).gte("created_at", seit).lte("created_at", bisZeit);
      const proPerson = {};
      (data || []).forEach((z) => { proPerson[z.user_id] = (proPerson[z.user_id] || 0) + 1; });
      return proPerson;
    };
    const [quiz, roleplay, challenge] = await Promise.all([
      zaehleJePerson("quiz_results"),
      zaehleJePerson("roleplay_sessions"),
      zaehleJePerson("daily_challenge_completions"),
    ]);

    // Kursergebnisse: bewusst OHNE Zeitfilter. Eine Führungskraft fragt
    // "hat sie den Kurs gemacht und wie ist er ausgefallen" — und nicht
    // "hat sie ihn in diesen sieben Tagen gemacht". Ein Kurs vom letzten
    // Monat verschwindet sonst aus der Übersicht, obwohl er zählt.
    const [{ data: quizAlle }, { data: pruefungen }] = await Promise.all([
      admin.from("quiz_results")
        .select("user_id, course_id, module_id, mc_score, mc_total, open_score, open_total, created_at")
        .in("user_id", ids).order("created_at", { ascending: false }).limit(5000),
      admin.from("exam_results")
        .select("user_id, course_id, score, total, passed, created_at")
        .in("user_id", ids).order("created_at", { ascending: false }).limit(2000),
    ]);

    // Nur der jüngste Versuch je Person und Modul zählt: wer ein Quiz
    // wiederholt, soll am zuletzt Gekonnten gemessen werden und nicht am
    // ersten Anlauf. Die Liste kommt absteigend, also gewinnt der erste
    // Treffer.
    const letzteQuiz = new Map();
    (quizAlle || []).forEach((q) => {
      const schluessel = `${q.user_id}|${q.course_id}|${q.module_id}`;
      if (!letzteQuiz.has(schluessel)) letzteQuiz.set(schluessel, q);
    });
    const quizJePerson = {};
    letzteQuiz.forEach((q) => { (quizJePerson[q.user_id] = quizJePerson[q.user_id] || []).push(q); });

    const letztePruefung = new Map();
    (pruefungen || []).forEach((p) => {
      const schluessel = `${p.user_id}|${p.course_id}`;
      // Eine bestandene Prüfung schlägt einen späteren Fehlversuch nicht —
      // aber ein späteres Bestehen schlägt einen früheren Fehlversuch.
      const vorhanden = letztePruefung.get(schluessel);
      if (!vorhanden || (!vorhanden.passed && p.passed)) letztePruefung.set(schluessel, p);
    });
    const pruefungJePerson = {};
    letztePruefung.forEach((p) => { (pruefungJePerson[p.user_id] = pruefungJePerson[p.user_id] || []).push(p); });

    const teamsVonPerson = {};
    (mitglieder || []).forEach((m) => {
      (teamsVonPerson[m.user_id] = teamsVonPerson[m.user_id] || []).push(m.team_id);
    });

    const termineJePerson = {};
    (termine || []).forEach((t) => {
      const e = termineJePerson[t.created_by] || (termineJePerson[t.created_by] = { gesamt: 0, wahrgenommen: 0, abgesagt: 0, kunden: 0 });
      e.gesamt += 1;
      if (t.status === "wahrgenommen") e.wahrgenommen += 1;
      if (t.status === "abgesagt") e.abgesagt += 1;
      if (t.outcome === "kunde") e.kunden += 1;
    });

    res.status(200).json({
      zeitraum: { von, bis },
      kategorien: resolveObjectionCategories(org),
      teams: teams || [],
      personen: (personen || []).map((p) => ({
        id: p.id,
        name: p.full_name || "Unbenannt",
        rolle: p.role || null,
        teams: teamsVonPerson[p.id] || [],
        training: (quiz[p.id] || 0) + (roleplay[p.id] || 0) + (challenge[p.id] || 0),
        trainingDetail: { quiz: quiz[p.id] || 0, roleplay: roleplay[p.id] || 0, challenge: challenge[p.id] || 0 },
        termine: termineJePerson[p.id] || { gesamt: 0, wahrgenommen: 0, abgesagt: 0, kunden: 0 },
        quiz: quizJePerson[p.id] || [],
        pruefungen: pruefungJePerson[p.id] || [],
      })),
      zeilen: zeilen || [],
      ereignisse: ereignisse || [],
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Die Auswertung konnte nicht geladen werden." });
  }
}
