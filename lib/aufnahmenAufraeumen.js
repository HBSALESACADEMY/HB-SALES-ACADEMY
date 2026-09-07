import { istAbgelaufen, fristTage } from "./aufnahmeFrist.js";

// Fällige Aufnahmen entfernen — Datei UND Eintrag.
//
// Läuft im Tagesbericht mit, weil Vercel im Hobby-Tarif nur zwei
// Cron-Aufträge erlaubt. Passt ohnehin: einmal am Morgen aufräumen reicht.
//
// Die Datei zuerst, dann der Eintrag. Andersherum bliebe bei einem Abbruch
// eine Datei ohne Zeile zurück — die findet danach niemand mehr, und sie
// zählt trotzdem gegen das Speicherkontingent.
export async function raeumeAufnahmenAuf(admin, jetzt = new Date()) {
  const { data: orgs } = await admin.from("organizations").select("id, aufnahme_frist_tage");
  let geloescht = 0;

  for (const org of orgs || []) {
    if (!fristTage(org)) continue; // Frist ausdrücklich abgeschaltet

    // Nur Aufnahmen dieser Organisation. Über die Personen, weil an der
    // Aufnahme selbst keine Organisation steht.
    const { data: leute } = await admin.from("profiles").select("id").eq("organization_id", org.id);
    const ids = (leute || []).map((p) => p.id);
    if (!ids.length) continue;

    const { data: aufnahmen } = await admin.from("call_recordings")
      .select("id, recording_path, created_at, behalten")
      .in("user_id", ids).eq("behalten", false).limit(500);

    for (const a of aufnahmen || []) {
      if (!istAbgelaufen(a, org, jetzt)) continue;
      if (a.recording_path) {
        await admin.storage.from("call-recordings").remove([a.recording_path]);
      }
      await admin.from("call_recordings").delete().eq("id", a.id);
      geloescht += 1;
    }

    // Dasselbe für Aufnahmen an Terminen.
    const { data: termine } = await admin.from("leads")
      .select("id, recording_path, created_at, aufnahme_behalten")
      .eq("organization_id", org.id).not("recording_path", "is", null)
      .eq("aufnahme_behalten", false).limit(500);

    for (const t of termine || []) {
      if (!istAbgelaufen({ created_at: t.created_at, behalten: t.aufnahme_behalten }, org, jetzt)) continue;
      await admin.storage.from("lead-recordings").remove([t.recording_path]);
      // Der Termin bleibt — nur die Aufnahme geht. Sonst verschwände mit
      // der Datei auch der Kunde aus der Terminliste.
      await admin.from("leads").update({ recording_path: null }).eq("id", t.id);
      geloescht += 1;
    }
  }

  return { geloescht };
}
