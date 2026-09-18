import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { istFuehrungsrolle } from "../../lib/rollen";
import { haeufigeHerausforderungen, stimmungsBild } from "../../lib/buddyRueckblick";
import { wochenStartTag, tagPlus } from "../../lib/woche";

// Was die Leitung aus den Buddy-Gesprächen ihres Teams sieht.
//
// Und was sie NICHT sieht: die Sätze selbst. Diese Route liest die Spalte
// "zusammenfassung" nicht einmal aus der Datenbank — sie enthält das
// Gedächtnis des Buddys samt Persönlichem und geht niemanden sonst etwas
// an. Heraus kommen die Herausforderungen, die Stimmung und das, was sich
// jemand vorgenommen hat.
//
// Ohne diese Grenze wäre der Buddy in zwei Wochen tot: Wer weiss, dass
// seine Worte bei der Leitung landen, schreibt nichts Ehrliches mehr.
export const config = { maxDuration: 20 };

const WOCHEN = 8;
const MIGRATION_FEHLT = "In der Datenbank fehlt die Tabelle für die Wochenrückblicke (migration_169).";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("id, role, is_admin, is_platform_admin, organization_id").eq("id", auth.user.id).maybeSingle();
  if (!istFuehrungsrolle(profil)) return res.status(403).json({ error: "Das sieht die Leitung." });
  const orgId = await aktiveOrgId(admin, profil, auth.user.id);
  if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

  try {
    const ab = tagPlus(wochenStartTag(), -7 * (WOCHEN - 1));
    const { data: rueckblicke, error } = await admin.from("buddy_wochen")
      // Ausdrücklich ohne "zusammenfassung".
      .select("user_id, woche, herausforderungen, stimmung, vorhaben")
      .eq("organization_id", orgId).gte("woche", ab)
      .order("woche", { ascending: false });
    if (error) {
      return res.status(500).json({ error: /buddy_wochen/.test(error.message) ? MIGRATION_FEHLT : error.message });
    }

    // Dazu die Schulungen — Thema und ob die Übung gemacht wurde. Auch hier
    // nur Kennzahlen, kein Wort aus dem Chat.
    const { data: schulungen } = await admin.from("buddy_schulungen")
      .select("user_id, woche, thema, phase, erledigt")
      .eq("organization_id", orgId).gte("woche", ab);

    const ids = [...new Set([...(rueckblicke || []).map((r) => r.user_id), ...(schulungen || []).map((s) => s.user_id)])];
    const { data: profile } = ids.length
      ? await admin.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] };
    const nameVon = new Map((profile || []).map((p) => [p.id, p.full_name || "Unbenannt"]));

    const jeWoche = new Map();
    const dazu = (woche) => {
      if (!jeWoche.has(woche)) jeWoche.set(woche, { rueckblicke: [], schulungen: [] });
      return jeWoche.get(woche);
    };
    (rueckblicke || []).forEach((r) => dazu(r.woche).rueckblicke.push(r));
    (schulungen || []).forEach((s) => dazu(s.woche).schulungen.push(s));

    const wochen = [...jeWoche.entries()].map(([woche, inhalt]) => {
      const schulungVonPerson = new Map(inhalt.schulungen.map((s) => [s.user_id, s]));
      const personenIds = [...new Set([
        ...inhalt.rueckblicke.map((r) => r.user_id),
        ...inhalt.schulungen.map((s) => s.user_id),
      ])];
      const themen = new Map();
      inhalt.schulungen.forEach((s) => {
        const e = themen.get(s.thema) || { thema: s.thema, anzahl: 0, erledigt: 0 };
        e.anzahl += 1;
        if (s.erledigt === true) e.erledigt += 1;
        themen.set(s.thema, e);
      });

      return {
        woche,
        personen: personenIds.map((id) => {
          const r = inhalt.rueckblicke.find((x) => x.user_id === id);
          const s = schulungVonPerson.get(id);
          return {
            id,
            name: nameVon.get(id) || "Unbenannt",
            herausforderungen: Array.isArray(r?.herausforderungen) ? r.herausforderungen : [],
            stimmung: r?.stimmung || null,
            vorhaben: r?.vorhaben || null,
            schulung: s ? { thema: s.thema, phase: s.phase, erledigt: s.erledigt } : null,
          };
        }),
        haeufig: haeufigeHerausforderungen(inhalt.rueckblicke),
        stimmung: stimmungsBild(inhalt.rueckblicke),
        themen: [...themen.values()].sort((a, b) => b.anzahl - a.anzahl),
      };
    });

    return res.status(200).json({ wochen, diese: wochenStartTag() });
  } catch (e) {
    console.error("Herausforderungen fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Unbekannter Fehler." });
  }
}
