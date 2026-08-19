import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { goalMetric } from "../../lib/goalMetrics";
import { COURSES } from "../../lib/curriculum";
import { ranglisteMetrik, werteProPerson, summeFuer, XP_METRIK } from "../../lib/goalProgress";
import { wochenStartTag, wochenStartZeitpunkt } from "../../lib/woche";

// Alles, was die Seite „Mein Team" an Zahlen braucht: die Wochenziele der
// eigenen Teams samt Fortschritt, die Mitglieder jedes Teams mit ihrem
// Beitrag, und die Rangliste aller Teams der Organisation.
//
// Warum auf dem Server: die Zahlen sind Summen, die Rohdaten dahinter nicht
// für jede/n lesbar. Die Anruf-Zahlen (call_log_days) darf ein normales
// Teammitglied nur für sich selbst lesen — würde der Browser rechnen, sähe
// jede/r nur den EIGENEN Beitrag und das Team wirkte dauerhaft weit hinter
// dem Ziel. Hier wird mit erweiterten Rechten gerechnet, aber nur für Teams,
// in denen die anfragende Person Mitglied oder Leitung ist.
//
// Die Aufschlüsselung JE PERSON bekommt nicht jede/r: sie zeigt, wie viel
// einzelne Kolleg:innen geleistet haben. Sichtbar ist sie für die
// Teamleitung, für Admins der Organisation und für Mitglieder, denen die
// Leitung das ausdrücklich erlaubt hat (profiles.can_view_call_stats,
// Schalter „Auswertung sichtbar" in der Manager-Ansicht).
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { client, user } = auth;

  try {
    const admin = getAdminSupabase();
    const { data: ich } = await client.from("profiles")
      .select("organization_id, is_admin, is_platform_admin, can_view_call_stats, role").eq("id", user.id).maybeSingle();

    const activeOrgId = req.query.activeOrgId || null;
    let orgId = ich?.organization_id || null;
    if (activeOrgId && (ich?.is_platform_admin || activeOrgId === ich?.organization_id)) orgId = activeOrgId;

    // Beides aus lib/woche.js: der Browser schreibt week_start mit genau
    // derselben Funktion. Rechnete jede Seite in ihrer eigenen Zeitzone,
    // suchte der Server (Vercel läuft in UTC) einen anderen Tag als der
    // Browser geschrieben hat und fände nie ein Ziel.
    const startTag = wochenStartTag();
    const startISO = wochenStartZeitpunkt();

    // --- Eigene Teams (Mitgliedschaft ODER Leitung) -------------------------
    const [{ data: eigene }, { data: gefuehrte }] = await Promise.all([
      client.from("team_members").select("team_id").eq("user_id", user.id),
      client.from("teams").select("id").eq("created_by", user.id),
    ]);
    const meineTeamIds = Array.from(new Set([
      ...(eigene || []).map((m) => m.team_id),
      ...(gefuehrte || []).map((t) => t.id),
    ]));

    // --- Alle Teams der Organisation (für die Rangliste) --------------------
    // Über den RLS-Client: teams_select_all beschränkt bereits auf die eigene
    // Organisation, hier wird nichts zusätzlich geöffnet.
    const { data: alleTeams } = await client.from("teams").select("id, name, created_by");
    const teamIds = (alleTeams || []).map((t) => t.id);
    if (!teamIds.length) {
      return res.status(200).json({ teams: [], rangliste: [], ranglisteMetrik: "xp", darfDetails: false, wochenStart: startTag });
    }

    const [{ data: mitgliedschaften }, { data: ziele }, { data: org }] = await Promise.all([
      admin.from("team_members").select("team_id, user_id").in("team_id", teamIds),
      admin.from("team_goals").select("*").in("team_id", meineTeamIds.length ? meineTeamIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("week_start", startTag).order("created_at", { ascending: true }),
      orgId ? admin.from("organizations").select("team_ranking_metric").eq("id", orgId).maybeSingle() : { data: null },
    ]);

    const idsVonTeam = new Map();
    (mitgliedschaften || []).forEach((m) => {
      if (!idsVonTeam.has(m.team_id)) idsVonTeam.set(m.team_id, []);
      idsVonTeam.get(m.team_id).push(m.user_id);
    });
    const alleIds = Array.from(new Set((mitgliedschaften || []).map((m) => m.user_id)));

    // Namen: Leitungen sind nicht zwingend als Mitglied eingetragen.
    const namensIds = Array.from(new Set([...alleIds, ...(alleTeams || []).map((t) => t.created_by)]));
    const { data: personen } = await admin.from("profiles").select("id, full_name, avatar_url").in("id", namensIds);
    const personVon = new Map((personen || []).map((p) => [p.id, p]));

    // --- Lernfortschritt je Person -----------------------------------------
    // Anders als die Kennzahlen oben ist das nicht zeitraumbezogen: gefragt
    // ist der Gesamtstand ("wer hat was abgeschlossen"), nicht die Woche.
    // Zwei gebündelte Abfragen für alle statt zwei je Person.
    const [{ data: quizzes }, { data: pruefungen }] = await Promise.all([
      alleIds.length ? admin.from("quiz_results").select("user_id, module_id").in("user_id", alleIds) : { data: [] },
      alleIds.length ? admin.from("exam_results").select("user_id, course_id").eq("passed", true).in("user_id", alleIds) : { data: [] },
    ]);
    const modulGesamt = COURSES.reduce((s2, k) => s2 + k.modules.length, 0);
    const modulePro = new Map();
    (quizzes || []).forEach((q) => {
      if (!modulePro.has(q.user_id)) modulePro.set(q.user_id, new Set());
      modulePro.get(q.user_id).add(q.module_id);
    });
    const kursePro = new Map();
    (pruefungen || []).forEach((e) => {
      if (!kursePro.has(e.user_id)) kursePro.set(e.user_id, new Set());
      kursePro.get(e.user_id).add(e.course_id);
    });
    const kursTitel = new Map(COURSES.map((k) => [k.id, k.title]));

    // --- Werte je Kennzahl: jede Kennzahl genau einmal abfragen -------------
    const gebraucht = new Map();
    (ziele || []).forEach((z) => { const m = goalMetric(z.metric); if (m) gebraucht.set(m.key, m); });
    const rangMetrik = ranglisteMetrik(org?.team_ranking_metric);
    if (rangMetrik) gebraucht.set(rangMetrik.key, rangMetrik);
    // XP immer mitrechnen: sie dient als Rückfallebene für die Leistung
    // innerhalb des Teams, wenn der Wettbewerbs-Maßstab auf Anruf-Zahlen
    // steht und die anfragende Person die nicht einzeln sehen darf.
    gebraucht.set(XP_METRIK.key, XP_METRIK);

    const werte = new Map();
    await Promise.all(Array.from(gebraucht.values()).map(async (m) => {
      werte.set(m.key, await werteProPerson(admin, m, alleIds, startISO, startTag));
    }));

    // Wer darf sehen, wie viel eine EINZELNE Person beigetragen hat?
    const istLeitung = (alleTeams || []).some((t) => t.created_by === user.id);
    const darfDetails = !!(istLeitung || ich?.is_platform_admin || ich?.is_admin || ich?.can_view_call_stats);

    // Leistung im Team: nach dem Maßstab der Organisation. Steht der auf
    // Anruf-Zahlen und fehlt die Berechtigung für Einzelwerte, wird auf XP
    // ausgewichen statt die Liste ganz wegzulassen.
    const leistungMetrik = (rangMetrik.quelle === "calltracker" && !darfDetails) ? XP_METRIK : rangMetrik;
    const leistungWerte = werte.get(leistungMetrik.key);

    // --- Antwort ------------------------------------------------------------
    const teams = meineTeamIds.map((tid) => {
      const t = (alleTeams || []).find((x) => x.id === tid);
      const ids = idsVonTeam.get(tid) || [];
      const lead = t ? personVon.get(t.created_by) : null;
      return {
        id: tid,
        name: t?.name || "Team",
        isLead: t?.created_by === user.id,
        leadName: lead?.full_name || null,
        mitglieder: ids.map((id) => ({
          id,
          name: personVon.get(id)?.full_name || "Unbenannt",
          avatar_url: personVon.get(id)?.avatar_url || null,
          istLeitung: t?.created_by === id,
          module: { fertig: modulePro.get(id)?.size || 0, gesamt: modulGesamt },
          // Nur bestandene Prüfungen — das ist der Abschluss eines Kurses.
          kurse: Array.from(kursePro.get(id) || []).map((kid) => kursTitel.get(kid) || kid).sort((a, b) => a.localeCompare(b, "de")),
        })).sort((a, b) => a.name.localeCompare(b.name, "de")),
        leistung: ids.map((id) => ({
          id,
          name: personVon.get(id)?.full_name || "Unbenannt",
          avatar_url: personVon.get(id)?.avatar_url || null,
          wert: leistungWerte?.get(id) || 0,
        })).sort((a, b) => b.wert - a.wert),
        ziele: (ziele || []).filter((z) => z.team_id === tid).map((z) => {
          const w = werte.get(z.metric);
          return {
            ...z,
            fortschritt: w ? summeFuer(w, ids) : 0,
            // null statt eines leeren Objekts: die Seite soll den Unterschied
            // zwischen „darf ich nicht sehen" und „alle bei null" kennen.
            beitraege: darfDetails && w ? Object.fromEntries(ids.map((id) => [id, w.get(id) || 0])) : null,
          };
        }),
      };
    });

    const rangWerte = werte.get(rangMetrik.key);
    const rangliste = (alleTeams || []).map((t) => {
      const ids = idsVonTeam.get(t.id) || [];
      return { teamId: t.id, name: t.name, mitglieder: ids.length, wert: rangWerte ? summeFuer(rangWerte, ids) : 0 };
    }).sort((a, b) => b.wert - a.wert);

    // startTag wird mitgeliefert, damit die Seite benennen kann, welche
    // Woche sie zeigt — ein leerer Ziel-Block war sonst nicht von einem
    // Datums-Versatz zu unterscheiden.
    return res.status(200).json({ teams, rangliste, ranglisteMetrik: rangMetrik.key, leistungMetrik: leistungMetrik.key, darfDetails, wochenStart: startTag });
  } catch (e) {
    console.error("Team-Daten konnten nicht geladen werden:", e.message);
    return res.status(500).json({ error: e.message || "Team-Daten konnten nicht geladen werden." });
  }
}
