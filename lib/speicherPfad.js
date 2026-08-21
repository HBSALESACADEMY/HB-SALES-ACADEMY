// Aus einer öffentlichen Speicher-Adresse den Pfad im Eimer zurückgewinnen.
//
// Hintergrund: Videos und Anhänge von Modulen werden als öffentliche URL in
// der Datenbank abgelegt, nicht als Pfad. Beim Löschen oder Ersetzen muss
// aber die Datei selbst weg — sonst bleibt sie für immer im Speicher liegen
// und kostet Platz, obwohl niemand mehr an sie herankommt (dieselbe Regel
// wie bei den Aufnahmen in pages/termine.js).
export function pfadAusOeffentlicherUrl(url, bucket) {
  if (!url || !bucket) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const text = String(url);
  const i = text.indexOf(marker);
  if (i === -1) return null;
  // Ein angehängter Abfrageteil (?t=…) gehört nicht zum Pfad.
  const rest = text.slice(i + marker.length).split("?")[0];
  if (!rest) return null;
  try { return decodeURIComponent(rest); } catch (e) { return rest; }
}
