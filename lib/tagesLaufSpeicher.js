// Die Sperre gegen einen doppelten Morgenbericht (migration_182).
//
// Läuft auf dem Server, mit dem Dienstschlüssel — deshalb bekommt jede
// Funktion den Supabase-Zugang übergeben statt ihn selbst zu holen.
//
// Ohne die Migration verhält sich alles wie vorher: Es wird nicht gesperrt,
// nichts gemeldet, der Bericht geht raus. Eine fehlende Migration darf den
// Morgengruss nicht aufhalten — sie darf ihn höchstens zweimal zulassen,
// und das ist der harmlosere von beiden Fehlern.

const NICHT_DA = /could not find|does not exist|42P01|schema cache/i;

function tabelleFehlt(fehler) {
  const text = `${fehler?.message || ""} ${fehler?.code || ""}`;
  return /cron_laeufe/.test(text) && NICHT_DA.test(text);
}

/**
 * Wann dieser Auftrag zuletzt lief.
 *
 * @returns {{ tag: string|null, gelaufenAt: string|null, tabelleFehlt: boolean }}
 */
export async function letzterLauf(admin, name) {
  if (!admin || !name) return { tag: null, gelaufenAt: null, tabelleFehlt: false };
  const { data, error } = await admin
    .from("cron_laeufe").select("tag, gelaufen_at").eq("name", name).maybeSingle();
  if (error) {
    if (tabelleFehlt(error)) return { tag: null, gelaufenAt: null, tabelleFehlt: true };
    // Jeder andere Fehler wird berichtet, aber hält den Bericht nicht auf:
    // Eine unlesbare Sperre ist ein Grund für Doppelversand, nicht für
    // Stille.
    console.error("Cron-Sperre nicht lesbar:", error.message);
    return { tag: null, gelaufenAt: null, tabelleFehlt: false };
  }
  return { tag: data?.tag || null, gelaufenAt: data?.gelaufen_at || null, tabelleFehlt: false };
}

/**
 * Den Lauf für heute vermerken.
 *
 * Wird VOR dem Versand gesetzt, nicht danach: Bricht der Bericht in der
 * Mitte ab, ist ein Teil schon raus — ein zweiter Lauf würde diesen Teil
 * wiederholen. Lieber ein unvollständiger Bericht als zwei.
 */
export async function merkeLauf(admin, name, tag) {
  if (!admin || !name || !tag) return false;
  const { error } = await admin
    .from("cron_laeufe")
    .upsert({ name, tag, gelaufen_at: new Date().toISOString() }, { onConflict: "name" });
  if (error && !tabelleFehlt(error)) console.error("Cron-Sperre nicht schreibbar:", error.message);
  return !error;
}
