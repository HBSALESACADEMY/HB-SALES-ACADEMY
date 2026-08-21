import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { tagesBeginnZeitpunkt, tagPlus } from "../../lib/woche";

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

    const [{ data: eintraege }, { data: personen }, { data: org }, { data: termine }, { data: meineEinladungen }] = await Promise.all([
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
      admin.from("termin_einladungen").select("*").eq("person_id", auth.user.id).eq("organization_id", orgId),
    ]);

    // Ein Eintrag, der vorher begann und kein Ende hat, dauert einen Tag
    // — der gehört dann doch nicht hierher.
    const gefiltert = (eintraege || []).filter((e) => (e.bis || e.von) >= von);

    // Wer zu einem Vertriebstermin eingeladen ist, darf ihn sehen — auch
    // ohne eigenes Recht auf den Termin. Sonst wäre die Einladung sinnlos.
    const sichtbareTermine = [...(termine || [])];
    const bekannt = new Set(sichtbareTermine.map((t) => t.id));
    const eingeladenAufLeads = (meineEinladungen || [])
      .filter((e) => e.quelle === "lead" && !bekannt.has(e.ziel_id))
      .map((e) => e.ziel_id);
    if (eingeladenAufLeads.length) {
      const { data: zusatz } = await admin.from("leads")
        .select("id, name, company, appointment_at, status, outcome, created_by")
        .in("id", eingeladenAufLeads)
        .not("appointment_at", "is", null)
        .gte("appointment_at", vonZeitpunkt)
        .lt("appointment_at", bisZeitpunkt);
      (zusatz || []).forEach((t) => { if (!bekannt.has(t.id)) { sichtbareTermine.push(t); bekannt.add(t.id); } });
    }
    sichtbareTermine.sort((a, b) => String(a.appointment_at).localeCompare(String(b.appointment_at)));

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
    // blättert. Titel und Zeitpunkt werden hier aufgelöst.
    const offeneRoh = (meineEinladungen || []).filter((e) => e.status === "offen");
    let offeneEinladungen = [];
    if (offeneRoh.length) {
      const eventIds = offeneRoh.filter((e) => e.quelle === "org_event").map((e) => e.ziel_id);
      const leadIds = offeneRoh.filter((e) => e.quelle === "lead").map((e) => e.ziel_id);
      const [{ data: evs }, { data: lds }] = await Promise.all([
        eventIds.length ? admin.from("org_events").select("id, titel, von, uhrzeit").in("id", eventIds) : Promise.resolve({ data: [] }),
        leadIds.length ? admin.from("leads").select("id, name, appointment_at").in("id", leadIds) : Promise.resolve({ data: [] }),
      ]);
      const evMap = new Map((evs || []).map((e) => [e.id, e]));
      const ldMap = new Map((lds || []).map((l) => [l.id, l]));
      offeneEinladungen = offeneRoh.map((e) => {
        const ev = e.quelle === "org_event" ? evMap.get(e.ziel_id) : null;
        const ld = e.quelle === "lead" ? ldMap.get(e.ziel_id) : null;
        return {
          ...e,
          titel: ev?.titel || ld?.name || "Termin",
          zeitpunkt: ld?.appointment_at || null,
          tag: ev?.von || null,
          uhrzeit: ev?.uhrzeit || null,
        };
      // Ein Termin, den es nicht mehr gibt, braucht keine Einladung mehr.
      }).filter((e) => e.tag || e.zeitpunkt);
    }

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
      offeneEinladungen: offeneEinladungen.map((e) => ({ ...e, von_name: namen.get(e.eingeladen_von) || "Unbenannt" })),
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
