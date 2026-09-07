import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { istFuehrungsrolle } from "../../../lib/rollen";
import { ERWARTUNGEN, WERT_ERWARTUNGEN } from "../../../lib/schemaErwartung";

// Prüft, ob die Datenbank das kann, was die Anwendung von ihr erwartet.
//
// Migrationen werden von Hand eingespielt. Fehlt eine, sieht das im Betrieb
// nicht aus wie "Migration fehlt", sondern wie ein Fehler im Programm.
// Diese Route beantwortet die Frage in zwei Sekunden statt in zwei Stunden.
//
// Geprüft wird durch eine Abfrage, die nichts zurückgibt: existiert die
// Spalte nicht, antwortet Postgres mit einem Fehler — und genau das ist die
// Auskunft, um die es geht.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("role, is_admin, is_platform_admin").eq("id", auth.user.id).maybeSingle();
  if (!istFuehrungsrolle(profil)) return res.status(403).json({ error: "Diese Prüfung ist der Leitung vorbehalten." });

  const ergebnisse = [];
  for (const e of ERWARTUNGEN) {
    try {
      const { error } = await admin.from(e.tabelle).select(e.spalte || "*").limit(1);
      ergebnisse.push({ ...e, vorhanden: !error, meldung: error?.message || null });
    } catch (fehler) {
      ergebnisse.push({ ...e, vorhanden: false, meldung: fehler.message });
    }
  }

  // Und die Migrationen, die keine Spalte anlegen, sondern einen Wert
  // ändern. Für die gilt dasselbe: sie fehlen leise.
  for (const w of WERT_ERWARTUNGEN) {
    try {
      let abfrage = admin.from(w.tabelle).select(w.spalte);
      Object.entries(w.filter || {}).forEach(([feld, wert]) => { abfrage = abfrage.eq(feld, wert); });
      const { data, error } = await abfrage.maybeSingle();
      ergebnisse.push({
        ...w,
        // Kein Eintrag heisst: die Migration, die ihn anlegt, fehlt auch.
        vorhanden: !error && !!data && data[w.spalte] === w.erwartet,
        meldung: error?.message || null,
      });
    } catch (fehler) {
      ergebnisse.push({ ...w, vorhanden: false, meldung: fehler.message });
    }
  }

  return res.status(200).json({ ergebnisse });
}
