import { berlinHeute, tagPlus } from "./woche.js";
import { istWochenende } from "./tagesauswertung.js";

// Was Anwahlen zu einem Spiel macht — ohne dabei die Zahlen zu verbiegen.
//
// Die Academy belohnte bisher vor allem Lernen: Serie für die Tages-
// Challenge, Abzeichen für Rollenspiele und Kurse. Der Teil, der Umsatz
// macht, hatte keinen Anreiz im Moment des Tuns.
//
// Drei Regeln, damit es nicht zum Selbstzweck wird:
//   1. Gezählt wird, was ohnehin erfasst wird. Kein zweiter Zähler, der
//      dann mit der Auswertung streitet.
//   2. Wochenenden brechen keine Serie. Wer samstags nicht telefoniert,
//      hat nichts falsch gemacht.
//   3. Ein verpasstes Ziel wird nicht bestraft, nur nicht belohnt. Aus
//      Druck entsteht kein Anruf mehr, sondern eine geschönte Zahl.

/** Anwahlen an einem Tag aus den Tageszeilen. */
export function anwahlenAm(tage = [], tag) {
  return tage.filter((t) => t.log_date === tag)
    .reduce((s, t) => s + (Number(t?.counts?.anwahlen) || 0), 0);
}

export const SERIE_MINDESTENS = 20;

/**
 * Die Anwahl-Serie: wie viele Arbeitstage hintereinander die Mindestzahl
 * erreicht wurde.
 *
 * Der heutige Tag zählt nur, wenn er schon geschafft ist — sonst stünde
 * morgens jeden Tag eine gebrochene Serie da, obwohl der Tag noch läuft.
 * Er bricht sie aber auch nicht: gerechnet wird ab dem letzten Arbeitstag.
 */
export function anwahlSerie(tage = [], { jetzt = new Date(), mindestens = SERIE_MINDESTENS } = {}) {
  const heute = berlinHeute(jetzt);
  const heuteGeschafft = anwahlenAm(tage, heute) >= mindestens;

  let laenge = heuteGeschafft ? 1 : 0;
  let tag = tagPlus(heute, -1);
  // Höchstens ein Jahr zurück — eine Serie, die länger ist, muss niemand
  // auf den Tag genau kennen.
  for (let i = 0; i < 366; i += 1) {
    if (istWochenende(tag)) { tag = tagPlus(tag, -1); continue; }
    if (anwahlenAm(tage, tag) < mindestens) break;
    laenge += 1;
    tag = tagPlus(tag, -1);
  }
  return { laenge, heuteGeschafft, mindestens, heute, anwahlenHeute: anwahlenAm(tage, heute) };
}

/** Die längste Serie, die in den Daten steckt — als Bestwert. */
export function besteSerie(tage = [], { mindestens = SERIE_MINDESTENS } = {}) {
  const geschafft = new Set(tage
    .filter((t) => (Number(t?.counts?.anwahlen) || 0) >= mindestens || anwahlenAm(tage, t.log_date) >= mindestens)
    .map((t) => t.log_date));
  const sortiert = [...geschafft].sort();
  if (!sortiert.length) return 0;

  let beste = 0;
  let laufend = 0;
  let vorher = null;
  sortiert.forEach((tag) => {
    if (vorher) {
      // Alle Arbeitstage zwischen zwei Treffern müssen ebenfalls Treffer
      // sein, sonst ist die Kette unterbrochen.
      let zwischen = tagPlus(vorher, 1);
      let lueckenlos = true;
      while (zwischen < tag) {
        if (!istWochenende(zwischen) && !geschafft.has(zwischen)) { lueckenlos = false; break; }
        zwischen = tagPlus(zwischen, 1);
      }
      laufend = lueckenlos ? laufend + 1 : 1;
    } else {
      laufend = 1;
    }
    beste = Math.max(beste, laufend);
    vorher = tag;
  });
  return beste;
}

// Meilensteine über die gesamte Zeit. Bewusst weit auseinander: Ein
// Abzeichen, das jede Woche kommt, ist keines.
export const MEILENSTEINE = [100, 500, 1000, 5000, 10000];

export function naechsterMeilenstein(gesamt = 0) {
  const ziel = MEILENSTEINE.find((m) => gesamt < m);
  if (!ziel) return null;
  return { ziel, fehlt: ziel - gesamt, anteil: Math.min(100, Math.round((gesamt / ziel) * 100)) };
}

/**
 * Das Tagesziel aus den persönlichen Zielen.
 *
 * Genommen wird das laufende Ziel auf Anwahlen mit dem kleinsten Zeitraum:
 * Ein Tagesziel ist konkreter als ein Monatsziel, und wer beides hat, will
 * morgens das kleinere wissen.
 */
export function tagesZiel(ziele = [], { jetzt = new Date() } = {}) {
  const heute = berlinHeute(jetzt);
  const passend = (ziele || [])
    .filter((z) => z.metric === "anwahlen" && Number(z.target_count) > 0)
    .map((z) => {
      const von = z.starts_on || z.week_start;
      const bis = z.ends_on || (von ? tagPlus(von, 6) : null);
      return { ...z, von, bis };
    })
    .filter((z) => z.von && z.bis && z.von <= heute && z.bis >= heute);
  if (!passend.length) return null;

  // Tage im Zeitraum, an denen gearbeitet wird — daraus das Tagespensum.
  const arbeitstage = (z) => {
    let tage = 0;
    let tag = z.von;
    for (let i = 0; i < 400 && tag <= z.bis; i += 1) {
      if (!istWochenende(tag)) tage += 1;
      tag = tagPlus(tag, 1);
    }
    return Math.max(1, tage);
  };
  const kleinstes = passend.sort((a, b) => arbeitstage(a) - arbeitstage(b))[0];
  const tage = arbeitstage(kleinstes);
  return {
    titel: kleinstes.title || "Anwahlen",
    gesamtZiel: Number(kleinstes.target_count),
    proTag: Math.ceil(Number(kleinstes.target_count) / tage),
    von: kleinstes.von,
    bis: kleinstes.bis,
    arbeitstage: tage,
  };
}

/**
 * Das Pensum für heute — aus einem zugewiesenen Ziel oder aus dem eigenen.
 *
 * Ein zugewiesenes Ziel hat Vorrang: Es ist eine Absprache mit der
 * Leitung, und die soll ein selbst gesetzter Wert nicht stillschweigend
 * überschreiben. Wer beides hat, sieht das zugewiesene und kann sein
 * eigenes trotzdem stehen lassen.
 */
export function pensumFuerHeute({ ziele = [], eigenes = null, jetzt = new Date() } = {}) {
  const zugewiesen = tagesZiel(ziele, { jetzt });
  if (zugewiesen) return { ...zugewiesen, quelle: "zugewiesen" };
  const wert = Number(eigenes) || 0;
  if (wert > 0) return { titel: "Dein eigenes Ziel", proTag: wert, gesamtZiel: wert, arbeitstage: 1, quelle: "eigenes" };
  return null;
}

// Grenzen für das eigene Ziel — dieselben wie in der Datenbank
// (migration_177). Ein Vertipper wie 6000 statt 60 hinterlässt sonst
// wochenlang einen leeren Ring.
export const ZIEL_MIN = 1;
export const ZIEL_MAX = 500;

/** Ein eingegebenes Ziel prüfen: { wert } oder { fehler }. */
export function leseZielEingabe(text) {
  const roh = String(text ?? "").trim().replace(",", ".");
  if (!roh) return { wert: null };
  if (!/^\d{1,4}$/.test(roh)) return { fehler: "Bitte eine ganze Zahl eingeben, zum Beispiel 60." };
  const wert = Number(roh);
  if (wert < ZIEL_MIN || wert > ZIEL_MAX) return { fehler: `Zwischen ${ZIEL_MIN} und ${ZIEL_MAX} Anwahlen am Tag.` };
  return { wert };
}

/** Wie weit ist das Tagespensum geschafft? */
export function zielStand(proTag = 0, heute = 0) {
  const ziel = Math.max(0, Number(proTag) || 0);
  const wert = Math.max(0, Number(heute) || 0);
  if (!ziel) return { anteil: 0, fehlt: 0, erreicht: false, ziel: 0, wert };
  return {
    ziel,
    wert,
    anteil: Math.min(100, Math.round((wert / ziel) * 100)),
    fehlt: Math.max(0, ziel - wert),
    erreicht: wert >= ziel,
  };
}

// Die Längen eines Telefonblocks. 25 Minuten ist die klassische Runde, 45
// die, nach der man eine Pause braucht.
export const BLOCK_MINUTEN = [15, 25, 45];

/**
 * Das Ergebnis eines Blocks.
 *
 * Gezählt wird die DIFFERENZ des Tageszählers, nicht ein eigener Zähler:
 * Wer während des Blocks nachträgt oder korrigiert, soll dieselbe Zahl
 * sehen wie in der Auswertung.
 */
export function blockErgebnis({ start = 0, ende = 0, minuten = 25 } = {}) {
  const anwahlen = Math.max(0, (Number(ende) || 0) - (Number(start) || 0));
  const dauer = Math.max(1, Number(minuten) || 1);
  return {
    anwahlen,
    minuten: dauer,
    // Auf eine Stelle: "13,4 Anwahlen pro Stunde" wäre Genauigkeit, die es
    // nicht gibt, "13" verschluckt den Unterschied zwischen 13 und 14.
    proStunde: Math.round((anwahlen / dauer) * 60),
  };
}

/** Der Text, der den Block einordnet — ohne Tadel bei einer schwachen Runde. */
export function blockText({ anwahlen = 0, minuten = 25, bestwert = 0 } = {}) {
  if (!anwahlen) return "Keine Anwahl in diesem Block. Der nächste ist ein neuer Anfang.";
  if (anwahlen > bestwert) return `${anwahlen} Anwahlen in ${minuten} Minuten — das ist dein neuer Bestwert.`;
  if (anwahlen === bestwert) return `${anwahlen} Anwahlen in ${minuten} Minuten — genau dein Bestwert.`;
  const fehlt = bestwert - anwahlen;
  return `${anwahlen} Anwahlen in ${minuten} Minuten. Dein Bestwert liegt bei ${bestwert} — ${fehlt} mehr, und er fällt.`;
}
