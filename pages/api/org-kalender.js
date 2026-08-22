import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { tagesBeginnZeitpunkt, tagPlus } from "../../lib/woche";
import { offeneEinladungenFuer } from "../../lib/einladungenServer";

// Alles, was im Firmenkalender eines Zeitraums steht: eingetragene Termine,
// Vertriebstermine, Geburtstage, Abwesenheiten und Einladungen.
//
// Über eine Route, weil fünf Quellen zusammenkommen und die Geburtstage aus
// profiles gelesen werden müssen — dort steht mehr, als im Kalender zu
// sehen sein soll. Herausgegeben wird nur Name, Bild und der Tag.
//
// Zeitraum statt Monat, weil die Wochenansicht über den Monatswechsel
// hinausreicht und das Monatsraster Tage der Nachbarmonate mitzeigt.
export const config = { maxDuration: 20 };

const TAG = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const von = String(req.query.von || "");
  const bis = String(req.query.bis || "");
  if (!TAG.test(von) || !TAG.test(bis) || bis < von) {
    return res.status(400).json({ error: "Zeitraum als von/bis im Format JJJJ-MM-TT erforderlich." });
  }

  try {
    const admin = getAdminSupabase();
    const { data: ich } = await auth.client.from("profiles")
      .select("organization_id, is_platform_admin, role, is_admin").eq("id", auth.user.id).maybeSingle();
    const orgId = await aktiveOrgId(admin, ich, auth.user.id);
    if (!orgId) return res.status(400).json({ error: "Keine Organisation gefunden." });

    // Vertriebstermine über den RLS-gebundenen Client: wer einen Termin
    // nicht sehen darf, sieht ihn auch hier nicht. Die Grenzen sind deutsche
    // Tagesgrenzen — der Server läuft in UTC (siehe lib/woche.js).
    const vonZeitpunkt = tagesBeginnZeitpunkt(von);
    const bisZeitpunkt = tagesBeginnZeitpunkt(tagPlus(bis, 1));

    const [{ data: eintraege }, { data: personen }, { data: org }, { data: termine }] = await Promise.all([
      // Überlappend statt nur beginnend: ein mehrtägiger Eintrag, der vorher
      // startet, gehört trotzdem in diesen Zeitraum.
      admin.from("org_events").select("*").eq("organization_id", orgId)
        .lte("von", bis)
        .or(`bis.is.null,bis.gte.${von}`)
        .order("von"),
      admin.from("profiles").select("id, full_name, avatar_url, geburtstag, abwesend_von, abwesend_bis")
        .eq("organization_id", orgId),
      // Für das Logo im Kalender-Hintergrund. Bewusst über die AKTIVE
      // Organisation, damit im Kalender kein fremdes Logo auftaucht.
      admin.from("organizations").select("name, logo_url").eq("id", orgId).maybeSingle(),
      auth.client.from("leads").select("id, name, company, appointment_at, status, outcome, created_by")
        .not("appointment_at", "is", null)
        .gte("appointment_at", vonZeitpunkt)
        .lt("appointment_at", bisZeitpunkt)
        .order("appointment_at"),
    ]);

    // Ein Eintrag, der vorher begann und kein Ende hat, dauert einen Tag
    // — der gehört dann doch nicht hierher.
    const gefiltert = (eintraege || []).filter((e) => (e.bis || e.von) >= von);

    // Welche Termine jemand sieht, entscheidet die Datenbank: angelegt,
    // eingeladen, zugewiesen, erwähnt — oder Führung bzw. Teamleitung
    // (migration_113). Deshalb kommen sie über den RLS-gebundenen Client
    // und nicht über den Admin-Zugang.
    const sichtbareTermine = termine || [];

    // Geburtstage: der Zeitraum kann mehrere Monate berühren, deshalb wird
    // für jeden Monat darin geprüft, ob der Tag hineinfällt.
    const monateImZeitraum = [];
    for (let m = von.slice(0, 7); m <= bis.slice(0, 7); m = naechsterMonat(m)) monateImZeitraum.push(m);
    const geburtstage = [];
    (personen || []).filter((p) => p.geburtstag).forEach((p) => {
      monateImZeitraum.forEach((monat) => {
        if (p.geburtstag.slice(5, 7) !== monat.slice(5, 7)) return;
        // Nur Tag und Monat herausgeben — das Geburtsjahr geht niemanden an.
        const tag = `${monat}-${p.geburtstag.slice(8, 10)}`;
        if (tag < von || tag > bis) return;
        geburtstage.push({ id: p.id, name: p.full_name || "Unbenannt", avatar_url: p.avatar_url, tag });
      });
    });

    const abwesenheiten = (personen || [])
      .filter((p) => (p.abwesend_von || p.abwesend_bis))
      .map((p) => ({
        id: p.id,
        name: p.full_name || "Unbenannt",
        von: p.abwesend_von || p.abwesend_bis,
        bis: p.abwesend_bis || p.abwesend_von,
      }))
      .filter((a) => a.von <= bis && a.bis >= von);

    // Einladungen zu allem, was diese Person hier sehen darf — inklusive
    // Namen, damit "wer hat zugesagt" ohne zweite Abfrage dasteht.
    const zielIds = [...gefiltert.map((e) => e.id), ...sichtbareTermine.map((t) => t.id)];
    let einladungen = [];
    if (zielIds.length) {
      const { data: alle } = await admin.from("termin_einladungen")
        .select("*").eq("organization_id", orgId).in("ziel_id", zielIds);
      einladungen = alle || [];
    }

    // Offene Einladungen unabhängig vom Zeitraum: eine Einladung für den
    // nächsten Monat darf nicht erst dann auftauchen, wenn man dorthin
    // blättert. Dieselbe Auflösung wie auf dem Dashboard.
    const offeneEinladungen = await offeneEinladungenFuer(admin, auth.user.id, orgId);

    const personenListe = (personen || []).map((p) => ({ id: p.id, name: p.full_name || "Unbenannt", avatar_url: p.avatar_url }));
    const namen = new Map(personenListe.map((p) => [p.id, p.name]));
    return res.status(200).json({
      eintraege: gefiltert.map((e) => ({ ...e, autor: namen.get(e.created_by) || "Unbenannt" })),
      termine: sichtbareTermine.map((t) => ({ ...t, autor: namen.get(t.created_by) || "Unbenannt" })),
      einladungen: einladungen.map((e) => ({
        ...e,
        name: namen.get(e.person_id) || "Unbenannt",
        von_name: namen.get(e.eingeladen_von) || "Unbenannt",
      })),
      geburtstage,
      abwesenheiten,
      // Für die Auswahlliste beim Einladen — nur die eigene Organisation.
      personen: personenListe,
      offeneEinladungen,
      selbst: auth.user.id,
      organisation: { name: org?.name || null, logo_url: org?.logo_url || null },
    });
  } catch (e) {
    console.error("Kalender konnte nicht geladen werden:", e.message);
    return res.status(500).json({ error: e.message });
  }
}

function naechsterMonat(monat) {
  const [j, m] = monat.split("-").map(Number);
  return m === 12 ? `${j + 1}-01` : `${j}-${String(m + 1).padStart(2, "0")}`;
}
