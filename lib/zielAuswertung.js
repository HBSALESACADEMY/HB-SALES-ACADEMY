import { berlinHeute } from "./woche.js";

// Was ein Ziel über sich selbst aussagt.
//
// Ein Balken beantwortet nur "wie weit sind wir". Die Frage, mit der man am
// Mittwoch noch etwas ändern kann, lautet: "reicht das Tempo?" Deshalb hier
// Hochrechnung und Tagesbedarf — und zwar in deutschen Kalendertagen
// (lib/woche.js), sonst verschiebt die Zeitzone den letzten Tag.

export function tageZwischen(vonTag, bisTag) {
  const a = Date.parse(`${vonTag}T12:00:00Z`);
  const b = Date.parse(`${bisTag}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

// Ein Ziel hat drei Lebenslagen: läuft noch, heute zu Ende, vorbei.
export function zielStatus(ziel, heute = berlinHeute()) {
  const start = ziel.starts_on || ziel.week_start;
  const ende = ziel.ends_on || ziel.starts_on || ziel.week_start;
  if (!start || !ende) return "unbekannt";
  if (heute < start) return "geplant";
  if (heute > ende) return "vorbei";
  return "laeuft";
}

// Die eigentliche Auswertung eines Ziels.
//
// tempo:      Schnitt pro Tag seit Beginn (nur vergangene Tage zählen).
// hochrechnung: Wo man bei diesem Tempo am Ende landet.
// noetigProTag: Was ab jetzt täglich nötig ist, um es doch zu schaffen.
export function werteZielAus(ziel, wert, heute = berlinHeute()) {
  const start = ziel.starts_on || ziel.week_start;
  const ende = ziel.ends_on || start;
  const ziel_wert = Number(ziel.target_count) || 0;
  const erreicht = Number(wert) || 0;
  const status = zielStatus(ziel, heute);

  const gesamtTage = Math.max(1, tageZwischen(start, ende) + 1);
  // Angebrochene Tage zählen mit: wer heute schon telefoniert hat, soll sein
  // Tempo nicht künstlich niedrig dargestellt bekommen.
  const vergangeneTage = Math.min(gesamtTage, Math.max(1, tageZwischen(start, heute) + 1));
  const verbleibendeTage = status === "vorbei" ? 0 : Math.max(0, tageZwischen(heute, ende) + 1);

  const tempo = erreicht / vergangeneTage;
  const hochrechnung = status === "vorbei" ? erreicht : Math.round(tempo * gesamtTage);
  const fehlt = Math.max(0, ziel_wert - erreicht);
  const noetigProTag = verbleibendeTage > 0 ? Math.ceil(fehlt / verbleibendeTage) : fehlt;

  return {
    status,
    erreicht,
    ziel: ziel_wert,
    anteil: ziel_wert > 0 ? Math.min(1, erreicht / ziel_wert) : 0,
    gesamtTage,
    vergangeneTage,
    verbleibendeTage,
    tempo,
    hochrechnung,
    fehlt,
    noetigProTag,
    geschafft: erreicht >= ziel_wert && ziel_wert > 0,
    // "Auf Kurs" heisst: die Hochrechnung erreicht das Ziel. Ohne diese
    // Aussage sieht ein halb gefüllter Balken am Mittwoch gut aus, obwohl
    // das Tempo nicht reicht.
    aufKurs: ziel_wert > 0 && (erreicht >= ziel_wert || hochrechnung >= ziel_wert),
  };
}

// Für die Historie: wie viele Ziele wurden erreicht, und um wie viel wurden
// die verfehlten verfehlt. Daran sieht man, ob die Ziele realistisch sind —
// fünf verfehlte in Folge heissen meist "zu hoch angesetzt", nicht "faul".
export function bilanz(auswertungen) {
  const vorbei = (auswertungen || []).filter((a) => a.status === "vorbei" && a.ziel > 0);
  const geschafft = vorbei.filter((a) => a.geschafft);
  const verfehlt = vorbei.filter((a) => !a.geschafft);
  const schnittErfuellung = vorbei.length
    ? vorbei.reduce((s, a) => s + Math.min(1, a.erreicht / a.ziel), 0) / vorbei.length
    : 0;
  return {
    anzahl: vorbei.length,
    geschafft: geschafft.length,
    verfehlt: verfehlt.length,
    quote: vorbei.length ? geschafft.length / vorbei.length : 0,
    schnittErfuellung,
  };
}
