import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { DATEI_QUELLEN, bereichUndPfad } from "../../lib/dateiQuellen";

// Einen kurzlebigen Link zu einer hochgeladenen Datei — nur für die, die den
// zugehörigen Eintrag sehen dürfen.
//
// Die Prüfung läuft mit den Rechten der ANFRAGENDEN Person (auth.client),
// nicht mit erweiterten Rechten: Findet sie das Skript, die Karte, das
// Kursmodul oder den Beitrag mit genau diesem Link, darf sie die Datei
// sehen. Die Zugriffsregeln der Datenbank entscheiden also, wie bei jedem
// anderen Eintrag — eine eigene zweite Regel für Dateien gibt es nicht.
//
// Erst danach unterschreibt der Server den Link, und zwar für eine Stunde.
export const config = { maxDuration: 20 };

const GUELTIG_SEKUNDEN = 3600;
const HOECHSTENS = 50;

async function darfSehen(client, url) {
  const ort = bereichUndPfad(url);
  if (!ort) return null;
  for (const quelle of DATEI_QUELLEN[ort.bereich]) {
    const { data, error } = await client.from(quelle.tabelle).select("id").eq(quelle.spalte, url).limit(1);
    if (!error && data?.length) return ort;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  // Einzeln (zum Öffnen) oder als Liste (für Bilder und Videos in einer Liste).
  const eingabe = req.body || {};
  const urls = [...new Set((Array.isArray(eingabe.urls) ? eingabe.urls : [eingabe.url])
    .filter((u) => typeof u === "string" && u))].slice(0, HOECHSTENS);
  if (!urls.length) return res.status(400).json({ error: "Kein Link angegeben." });

  try {
    const admin = getAdminSupabase();
    const links = {};
    for (const url of urls) {
      const ort = await darfSehen(auth.client, url);
      if (!ort) continue;
      const { data, error } = await admin.storage.from(ort.bereich).createSignedUrl(ort.pfad, GUELTIG_SEKUNDEN);
      if (error) { console.error("Datei-Link fehlgeschlagen:", error.message); continue; }
      links[url] = data?.signedUrl || null;
    }

    if (!Array.isArray(eingabe.urls)) {
      const link = links[urls[0]];
      if (!link) return res.status(404).json({ error: "Diese Datei gibt es nicht, oder sie gehört nicht zu deiner Organisation." });
      return res.status(200).json({ url: link, gueltigSekunden: GUELTIG_SEKUNDEN });
    }
    return res.status(200).json({ links, gueltigSekunden: GUELTIG_SEKUNDEN });
  } catch (e) {
    console.error("Datei-Link fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Die Datei lässt sich gerade nicht öffnen." });
  }
}
