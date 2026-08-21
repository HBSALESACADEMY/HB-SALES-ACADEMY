// Offene Termin-Einladungen einer Person, mit Titel und Zeitpunkt.
//
// Nur auf dem Server: die Titel stehen in org_events und leads, und wer
// eingeladen ist, hat auf den Termin selbst nicht zwingend Zugriff — die
// Einladung wäre sonst eine Zeile ohne Inhalt. Herausgegeben wird deshalb
// bewusst nur, was auf der Einladung stehen muss: Titel und Zeitpunkt.
export async function offeneEinladungenFuer(admin, userId, orgId) {
  const { data: roh } = await admin.from("termin_einladungen")
    .select("*").eq("person_id", userId).eq("status", "offen")
    .eq("organization_id", orgId);
  if (!roh || !roh.length) return [];

  const eventIds = roh.filter((e) => e.quelle === "org_event").map((e) => e.ziel_id);
  const leadIds = roh.filter((e) => e.quelle === "lead").map((e) => e.ziel_id);
  const [{ data: events }, { data: leads }, { data: einladende }] = await Promise.all([
    eventIds.length ? admin.from("org_events").select("id, titel, von, uhrzeit").in("id", eventIds) : Promise.resolve({ data: [] }),
    leadIds.length ? admin.from("leads").select("id, name, appointment_at").in("id", leadIds) : Promise.resolve({ data: [] }),
    admin.from("profiles").select("id, full_name").in("id", [...new Set(roh.map((e) => e.eingeladen_von))]),
  ]);

  const evMap = new Map((events || []).map((e) => [e.id, e]));
  const ldMap = new Map((leads || []).map((l) => [l.id, l]));
  const namen = new Map((einladende || []).map((p) => [p.id, p.full_name || "Unbenannt"]));

  return roh
    .map((e) => {
      const ev = e.quelle === "org_event" ? evMap.get(e.ziel_id) : null;
      const ld = e.quelle === "lead" ? ldMap.get(e.ziel_id) : null;
      return {
        ...e,
        titel: ev?.titel || ld?.name || "Termin",
        zeitpunkt: ld?.appointment_at || null,
        tag: ev?.von || null,
        uhrzeit: ev?.uhrzeit || null,
        von_name: namen.get(e.eingeladen_von) || "Unbenannt",
      };
    })
    // Ein Termin, den es nicht mehr gibt, braucht keine Einladung mehr.
    .filter((e) => e.tag || e.zeitpunkt);
}
