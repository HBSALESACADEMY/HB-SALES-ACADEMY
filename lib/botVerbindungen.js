// Wer im Team mit dem Telegram-Bot verbunden ist — für die Leitung.
//
// Heraus kommt nur, OB jemand verbunden ist, seit wann, was eingeschaltet
// ist und wann zuletzt geantwortet wurde. Keine Chat-Kennung, kein
// Telegram-Name, kein Wort aus einem Gespräch: Das braucht niemand, um zu
// wissen, wen man noch ansprechen sollte.

/**
 * @param mitglieder      [{ id, full_name }]
 * @param verknuepfungen  [{ user_id, chat_id, verbunden_am, buddy, tagesauswertung }]
 * @param antworten       [{ user_id, created_at }] — neueste zuerst
 */
export function verbindungsUebersicht(mitglieder = [], verknuepfungen = [], antworten = [], jetzt = new Date()) {
  const verknuepfungVon = new Map(
    (verknuepfungen || []).filter((v) => v?.chat_id).map((v) => [v.user_id, v]),
  );
  const letzteAntwort = new Map();
  (antworten || []).forEach((a) => { if (!letzteAntwort.has(a.user_id)) letzteAntwort.set(a.user_id, a.created_at); });

  const verbunden = [];
  const offen = [];
  (mitglieder || []).forEach((m) => {
    const name = m.full_name || "Unbenannt";
    const v = verknuepfungVon.get(m.id);
    if (!v) { offen.push({ id: m.id, name }); return; }
    const zuletzt = letzteAntwort.get(m.id);
    verbunden.push({
      id: m.id,
      name,
      seit: v.verbunden_am || null,
      buddy: v.buddy !== false,
      tagesauswertung: v.tagesauswertung !== false,
      letzteAntwortTage: zuletzt ? Math.floor((jetzt.getTime() - new Date(zuletzt).getTime()) / 86400000) : null,
    });
  });

  const alphabetisch = (a, b) => a.name.localeCompare(b.name, "de");
  return { verbunden: verbunden.sort(alphabetisch), offen: offen.sort(alphabetisch), gesamt: (mitglieder || []).length };
}
