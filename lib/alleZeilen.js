// Alle Zeilen einer Abfrage — nicht nur die ersten tausend.
//
// Supabase liefert je Abfrage höchstens 1000 Zeilen und sagt nicht, dass
// es abgeschnitten hat. Eine Auswertung über einen Monat mit zehn Leuten
// und fünfzig Anrufen am Tag hat 15.000 Anrufereignisse — gezählt wurden
// davon tausend. Die Zahlen sahen plausibel aus und waren falsch.
//
// baueAbfrage muss bei jedem Aufruf eine NEUE Abfrage liefern, und zwar mit
// einer eindeutigen Sortierung. Ohne sie darf die Datenbank die Reihenfolge
// zwischen zwei Seiten ändern, und Zeilen fehlen doppelt oder gar nicht.
export async function alleZeilen(baueAbfrage, seite = 1000, hoechstens = 50000) {
  const zeilen = [];
  for (let ab = 0; ab < hoechstens; ab += seite) {
    const { data, error } = await baueAbfrage().range(ab, ab + seite - 1);
    if (error) return { data: null, error };
    zeilen.push(...(data || []));
    if (!data || data.length < seite) break;
  }
  return { data: zeilen, error: null };
}
