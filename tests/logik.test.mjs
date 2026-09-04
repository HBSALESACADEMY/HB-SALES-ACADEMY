// Tests für die Rechenlogik der Academy — alles, was ohne Datenbank und ohne
// Browser prüfbar ist. Bewusst auf die Stellen konzentriert, an denen ein
// Fehler echten Schaden anrichtet: verlorene Zählerstände, falsche Zeiträume,
// durchgerutschte Pflichtfelder, unlesbare Schrift.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { bereichFuer, istGleicherTag, monatsRaster, startOfWeek, endOfWeek } from "../lib/dateRange.js";
import { fehlendePflichtfelder, resolveCoreRequired, resolveLeadFields } from "../lib/leadFields.js";
import { storagePrefix, dayKey, dateKeyOf, loadDay, saveDay, aggregateRange, zaehlerZusammenfuehren, wasGiltJetzt, buildReport, FIELDS, istOffenerAnruf, merkeSchritt, offenerSchritt, alleGespeichertenTage, merkeBuchung, nimmLetztenAnruf, leereVerlauf } from "../lib/callTracker.js";
import { textColorForColors, contrastRatio, relativeLuminance, hexToRgb } from "../lib/colorMath.js";
import { resolveObjectionCategories } from "../lib/objectionCategories.js";
import { GOAL_METRICS, GOAL_METRIC_KEYS } from "../lib/goalMetrics.js";
import { FUEHRUNGSROLLEN } from "../lib/rollen.js";
import { eigeneFlaechenGelten, istHellerTon } from "../lib/orgBranding.js";
import { PFLICHTFELDER, fehlendeProfilangaben, profilVollstaendig } from "../lib/profilPflicht.js";
import { pfadAusOeffentlicherUrl } from "../lib/speicherPfad.js";
import { DASHBOARD_KACHELN, sichtbareKacheln } from "../lib/dashboardKacheln.js";
import { baueIcs, baueIcsFeed, icsDateiname } from "../lib/ics.js";
import { leseIcs, leseZeitpunkt, loeseWiederholung } from "../lib/icsLesen.js";
import { pruefeUrl, istFaellig, FRISCH_MS } from "../lib/externerKalenderAbruf.js";
import { saeubere, vergleichsForm, schluesselFuer, fasseZusammen } from "../lib/grundVorschlag.js";
import { FENSTER_MS, istMeldenswert, meldungsSchluessel, sollMelden } from "../lib/fehlerMeldung.js";
import { deutscherTag } from "../lib/terminzeit.js";
import { vorWieLange, istGeradeAktiv } from "../lib/relativeZeit.js";
import { abgleichAktiveOrg } from "../lib/activeOrg.js";
import { kreisSegmente, prozent } from "../lib/kreisdiagramm.js";
import { validateRecordingUpload } from "../lib/uploadValidation.js";
import { verstaendlicherSpeicherFehler } from "../lib/speicherFehler.js";
import { PALETTE, feldFarbe, grundFarbe, paletteFarbe } from "../lib/diagrammFarben.js";
import { sicheresZiel } from "../lib/weiterleitung.js";
import { sollLebenszeichenSenden, SENDE_ABSTAND_MS, RUHE_MS } from "../lib/anwesenheit.js";
import { quartalsStart, quartalsName, zeitraumGrenzen } from "../lib/zeitraum.js";
import { pcmZuWav, rateAusMime } from "../lib/wav.js";
import { LINIEN, MITTE, hatBingo, gewinnFelder, zufallsWoerter, freiePlaetze } from "../lib/bingo.js";
import { buchungslink, normalisiere, kurzform } from "../lib/buchungslink.js";
import { werteZielAus, zielStatus, bilanz } from "../lib/zielAuswertung.js";
import { berechneQuoten, prozentText, zahlText, QUOTEN_SPALTEN, quotenText } from "../lib/quoten.js";
import { korrigiere, regleEin, zieheAnrufAb, ziehreAnteiligMit, GRUNDLAGEN } from "../lib/anrufKorrektur.js";
import { summiere, trichter, engpass, benchmark, impactAnalyse, empfehlungen } from "../lib/auswertung.js";
import { meldungsGrund, sollMeldung, MELDENSWERT } from "../lib/terminMeldung.js";
import { xpFuerTag, offeneXp, CALL_XP } from "../lib/callXp.js";
import { kursStand, kursDetails, moduleGesamt } from "../lib/kursstand.js";
import { tempoAuswertung, dauerText, PAUSE_AB_MINUTEN, MINDESTENS_ANRUFE } from "../lib/tempo.js";
import { deutscheStunde, stundenText, stundenRaster, besteStunde, schlechtesteStunde, spitzeJeGrund, MINDESTENS_JE_STUNDE } from "../lib/tageszeit.js";
import { zeitpunktInBerlin } from "../lib/woche.js";

// --- Zeiträume -------------------------------------------------------------

test("die Woche beginnt am Montag, nicht am Sonntag", () => {
  const mittwoch = new Date(2026, 7, 12, 15, 0); // Mi, 12.08.2026
  assert.equal(startOfWeek(mittwoch).getDay(), 1, "Wochenanfang muss Montag sein");
  assert.equal(endOfWeek(mittwoch).getDay(), 0, "Wochenende muss Sonntag sein");
});

test("Zeitraum 'alle' begrenzt nichts", () => {
  assert.deepEqual(bereichFuer("alle"), [null, null]);
});

test("Tag/Woche/Monat schliessen den heutigen Termin ein", () => {
  const jetzt = new Date(2026, 7, 12, 15, 0);
  for (const schluessel of ["tag", "woche", "monat"]) {
    const [von, bis] = bereichFuer(schluessel, jetzt);
    assert.ok(jetzt >= von && jetzt <= bis, `${schluessel} muss den aktuellen Zeitpunkt enthalten`);
  }
});

test("das Monatsraster ergibt immer volle Wochen", () => {
  for (const monat of [new Date(2026, 1, 1), new Date(2026, 7, 1), new Date(2027, 0, 1)]) {
    const tage = monatsRaster(monat);
    assert.equal(tage.length % 7, 0, "Raster muss aus vollen Wochen bestehen");
    assert.equal(tage[0].getDay(), 1, "erste Zelle muss ein Montag sein");
  }
});

test("istGleicherTag ignoriert die Uhrzeit", () => {
  assert.ok(istGleicherTag(new Date(2026, 7, 12, 8, 0), new Date(2026, 7, 12, 23, 30)));
  assert.ok(!istGleicherTag(new Date(2026, 7, 12, 23, 59), new Date(2026, 7, 13, 0, 1)));
});

// --- Pflichtfelder ---------------------------------------------------------

test("ohne eigene Einstellung sind Telefon und E-Mail Pflicht", () => {
  assert.deepEqual(resolveCoreRequired(null), { phone: true, email: true });
  assert.deepEqual(fehlendePflichtfelder({ name: "Max", appointmentAt: "2026-09-01T10:00", org: null }),
    ["Telefon", "E-Mail"]);
});

test("Organisation kann Telefon und E-Mail freiwillig machen", () => {
  const org = { lead_core_required: { phone: false, email: false } };
  assert.deepEqual(fehlendePflichtfelder({ name: "Max", appointmentAt: "2026-09-01T10:00", org }), []);
});

test("Name und Termin bleiben immer Pflicht", () => {
  const org = { lead_core_required: { phone: false, email: false } };
  assert.deepEqual(fehlendePflichtfelder({ appointmentAt: "x", org }), ["Name"]);
  assert.deepEqual(fehlendePflichtfelder({ name: "Max", org }), ["Termin (Datum/Uhrzeit)"]);
});

test("eigenes Pflichtfeld: Ja/Nein muss angehakt sein, Leerzeichen zählen nicht", () => {
  const org = {
    lead_core_required: { phone: false, email: false },
    lead_field_config: [
      { key: "branche", label: "Branche", type: "text", required: true },
      { key: "dsgvo", label: "DSGVO-Einwilligung", type: "checkbox", required: true },
    ],
  };
  const basis = { name: "Max", appointmentAt: "x", org };
  assert.deepEqual(fehlendePflichtfelder({ ...basis, fields: {} }), ["Branche", "DSGVO-Einwilligung"]);
  assert.deepEqual(fehlendePflichtfelder({ ...basis, fields: { branche: "   ", dsgvo: true } }), ["Branche"]);
  assert.deepEqual(fehlendePflichtfelder({ ...basis, fields: { branche: "IT", dsgvo: true } }), []);
});

test("ohne eigene Felder gelten die Standardfelder", () => {
  assert.equal(resolveLeadFields(null).length, 4);
  assert.equal(resolveLeadFields({ lead_field_config: [] }).length, 4);
});

// --- Call Tracker: gespeicherte Zählerstände -------------------------------
// Diese Tests sichern ab, dass bereits erfasste Tage beim nächsten Umbau
// nicht verlorengehen — der Schlüssel darf sich nicht ändern.

function localStorageNachbilden() {
  const daten = {};
  globalThis.localStorage = {
    get length() { return Object.keys(daten).length; },
    key: (i) => Object.keys(daten)[i],
    getItem: (k) => (k in daten ? daten[k] : null),
    setItem: (k, v) => { daten[k] = String(v); },
    removeItem: (k) => { delete daten[k]; },
  };
  return daten;
}

const REASONS = [{ key: "preis", label: "Preis" }, { key: "sonstiges", label: "Sonstiges" }];

test("Speicher-Schlüssel bleiben unverändert (sonst sind alte Tage weg)", () => {
  assert.equal(storagePrefix("abc-123"), "hb_ct_abc-123_");
  assert.match(dayKey(new Date(2026, 7, 12)), /^callstats:2026-08-12$/);
});

test("Zählerstände im alten Format werden weiter gelesen", () => {
  const daten = localStorageNachbilden();
  const prefix = storagePrefix("u1");
  const key = dayKey();
  // Uraltes Format ohne counts-Ebene
  daten[prefix + key] = JSON.stringify({ anwahlen: 7, erreicht: 3, nicht: 4, termin: 1, negativ: 2 });
  assert.equal(loadDay(prefix, key, REASONS).counts.anwahlen, 7);
});

test("Zahlen anderer Nutzer auf demselben Gerät bleiben getrennt", () => {
  const daten = localStorageNachbilden();
  const meins = storagePrefix("ich");
  saveDay(meins, dayKey(), { anwahlen: 5, erreicht: 0, nicht: 0, termin: 0, negativ: 0 }, { preis: 0, sonstiges: 0 });
  daten[storagePrefix("jemand-anderes") + dayKey()] = JSON.stringify({ counts: { anwahlen: 999 }, reasons: {} });

  const summe = aggregateRange(meins, new Date(Date.now() - 86400000), new Date(Date.now() + 86400000), REASONS);
  assert.equal(summe.counts.anwahlen, 5, "fremde Zahlen dürfen nicht mitgezählt werden");
});

test("der Bericht nennt die Organisation und rechnet die Anteile richtig", () => {
  const bericht = buildReport({
    orgName: "VOLK WORK", rangeLabel: "Test",
    counts: { anwahlen: 10, erreicht: 6, nicht: 4, termin: 2, negativ: 3 },
    reasonCounts: { preis: 2, sonstiges: 1 }, reasons: REASONS,
  });
  assert.match(bericht, /^VOLK WORK/);
  assert.match(bericht, /Preis: 2 \(67%\)/);
});

// --- Lesbarkeit ------------------------------------------------------------
// Hintergrund: Bei einer Organisation mit hellem Logo war die Schrift auf den
// Knöpfen weiss auf weiss und damit unsichtbar.

test("Schriftfarbe auf farbigen Flächen bleibt lesbar", () => {
  assert.equal(textColorForColors(["#F5F5F0"]), "#14151C", "auf sehr hell gehört dunkle Schrift");
  assert.equal(textColorForColors(["#14151C"]), "#FFFFFF", "auf sehr dunkel gehört helle Schrift");
});

test("gewählte Schriftfarbe erreicht den Mindestkontrast", () => {
  for (const hintergrund of ["#F5F5F0", "#14151C", "#CE3A5C", "#4C5DC9"]) {
    const schrift = textColorForColors([hintergrund]);
    const kontrast = contrastRatio(relativeLuminance(hexToRgb(hintergrund)), relativeLuminance(hexToRgb(schrift)));
    assert.ok(kontrast >= 4.5, `Kontrast auf ${hintergrund} zu gering: ${kontrast.toFixed(2)}`);
  }
});

// --- Einwand-Kategorien ----------------------------------------------------

test("ohne eigene Kategorien gelten die Standardkategorien", () => {
  assert.equal(resolveObjectionCategories(null).length, 6);
  assert.equal(resolveObjectionCategories({ objection_categories: [] }).length, 6);
  assert.equal(resolveObjectionCategories({ objection_categories: [{ key: "a", label: "A" }] }).length, 1);
});

// --- Team-Ziele ------------------------------------------------------------

test("jede Ziel-Kennzahl weiss, woher ihr Fortschritt kommt", () => {
  for (const m of GOAL_METRICS) {
    assert.ok(["zeilen", "calltracker", "leads"].includes(m.quelle), `${m.key}: unbekannte Quelle ${m.quelle}`);
    if (m.quelle === "zeilen") assert.ok(m.tabelle, `${m.key}: Tabelle fehlt`);
    if (m.quelle === "calltracker") assert.ok(m.feld, `${m.key}: Zähler-Feld fehlt`);
  }
});

test("Ziel-Kennzahlen des Call Trackers entsprechen echten Zählern", () => {
  const zaehler = FIELDS.map((f) => f.key);
  GOAL_METRICS.filter((m) => m.quelle === "calltracker").forEach((m) => {
    assert.ok(zaehler.includes(m.feld), `${m.feld} ist kein Zähler des Call Trackers`);
  });
});

test("die Datenbank erlaubt genau die Kennzahlen, die es im Code gibt", () => {
  // Diese Liste steht zwangsläufig zweimal: einmal als Auswahl im Code, einmal
  // als check-Regel in der Datenbank. Läuft sie auseinander, lehnt die
  // Datenbank neue Ziele mit einem Constraint-Fehler ab — im Manager sieht man
  // dann nur eine kryptische Meldung.
  // Immer die JÜNGSTE Migration, die den check setzt — sonst prüft der
  // Test eine überholte Liste.
  const sql = readFileSync(new URL("../supabase/migration_125_ziel_kennzahlen_gatekeeper.sql", import.meta.url), "utf8");
  const block = sql.slice(sql.indexOf("metric in ("), sql.indexOf("));", sql.indexOf("metric in (")));
  const erlaubt = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(erlaubt, [...GOAL_METRIC_KEYS].sort());
});

test("der Wettbewerbs-Maßstab kennt dieselben Kennzahlen plus XP", () => {
  // Zweite check-Regel, zweite Gelegenheit zum Auseinanderlaufen: stimmt sie
  // nicht, lässt sich die Einstellung in der Verwaltung schlicht nicht
  // speichern.
  const sql = readFileSync(new URL("../supabase/migration_125_ziel_kennzahlen_gatekeeper.sql", import.meta.url), "utf8");
  const block = sql.slice(sql.indexOf("team_ranking_metric in ("));
  const ende = block.indexOf("\n  )");
  const erlaubt = [...block.slice(0, ende).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(erlaubt, ["xp", ...GOAL_METRIC_KEYS].sort());
});

// --- Wochenstart -----------------------------------------------------------

test("der Wochenstart ist überall derselbe Tag — und ein Montag", () => {
  // Der Kern des Fehlers: week_start wird im Browser geschrieben und auf dem
  // Server abgefragt. Rechnet jede Seite in ihrer eigenen Zeitzone, schreibt
  // der Browser (Berlin) den Sonntag und der Server (UTC) sucht den Montag —
  // es wird nie ein Ziel gefunden. Deshalb hier wirklich in mehreren
  // Zeitzonen ausführen statt nur die Logik nachzurechnen.
  const skript = 'import("./lib/woche.js").then(w => console.log(w.wochenStartTag() + " " + w.wochenStartZeitpunkt()))';
  const ergebnisse = ["Europe/Berlin", "UTC", "America/Los_Angeles", "Pacific/Auckland"].map((zone) =>
    execFileSync(process.execPath, ["-e", skript], { env: { ...process.env, TZ: zone }, encoding: "utf8" }).trim());

  assert.equal(new Set(ergebnisse).size, 1, `Wochenstart unterscheidet sich je Zeitzone: ${ergebnisse.join(" / ")}`);

  const [tag] = ergebnisse[0].split(" ");
  assert.match(tag, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${tag}T12:00:00Z`).getUTCDay(), 1, `${tag} ist kein Montag`);
});

// --- Verwendete Komponenten sind auch importiert ---------------------------

test("jede verwendete Komponente ist im selben Modul bekannt", () => {
  // Der Build meldet das NICHT: eine unbekannte Variable in JSX ist erst zur
  // Laufzeit ein Fehler ("Can't find variable: Icon") — und dann ist die ganze
  // Seite weiss. Genau so ist es beim Herausziehen des Betreiber-Bereichs
  // passiert: der Import blieb in der alten Datei zurück.
  const dateien = [];
  const sammle = (verzeichnis) => {
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = `${verzeichnis}/${eintrag.name}`;
      // pages/api enthält keine Oberfläche, aber KI-Anweisungen mit
      // Platzhaltern wie <Zahl> — die sind kein JSX.
      if (eintrag.isDirectory() && eintrag.name !== "api") sammle(pfad);
      else if (eintrag.name.endsWith(".js")) dateien.push(pfad);
    }
  };
  sammle(new URL("../pages", import.meta.url).pathname);
  sammle(new URL("../components", import.meta.url).pathname);

  const fehler = [];
  for (const pfad of dateien) {
    const quelle = readFileSync(pfad, "utf8");
    const benutzt = new Set([...quelle.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    if (benutzt.size === 0) continue;

    const bekannt = new Set();
    for (const m of quelle.matchAll(/import\s+([A-Za-z0-9_]+)\s*(?:,\s*\{([^}]*)\})?\s*from/g)) {
      bekannt.add(m[1]);
      if (m[2]) m[2].split(",").forEach((t) => t.trim() && bekannt.add(t.trim().split(/\s+as\s+/).pop()));
    }
    for (const m of quelle.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
      m[1].split(",").forEach((t) => t.trim() && bekannt.add(t.trim().split(/\s+as\s+/).pop()));
    }
    // Im selben Modul definierte Komponenten zählen ebenfalls.
    for (const m of quelle.matchAll(/(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/g)) bekannt.add(m[1]);
    // Komponenten, die als Eigenschaft hereingereicht werden (z.B. das
    // <Component /> in _app.js) stehen in der Parameter-Zerlegung.
    for (const m of quelle.matchAll(/\(\s*\{([^}]*)\}\s*\)/g)) {
      m[1].split(",").forEach((t) => {
        const name = t.trim().split(/[:=]/)[0].trim();
        if (/^[A-Z]/.test(name)) bekannt.add(name);
      });
    }

    for (const name of benutzt) {
      if (!bekannt.has(name)) fehler.push(`${pfad.split("/").slice(-2).join("/")}: <${name}>`);
    }
  }
  assert.deepEqual(fehler, [], `Nicht importierte Komponenten:\n${fehler.join("\n")}`);
});

// --- Rollenprüfung an einer Stelle ----------------------------------------

test("die Frage nach der Führungsrolle wird nirgends nachgebaut", () => {
  // Diese Prüfung stand einmal fünfmal wortgleich im Code — und lief
  // auseinander: ein Manager durfte Ziele serverseitig ändern, bekam die
  // Knöpfe dafür aber nicht angezeigt, weil eine Stelle role='manager' nicht
  // mitzählte. Wer sie erneut ausschreibt statt istFuehrungsrolle() zu
  // benutzen, soll das hier merken.
  const dateien = [];
  const sammle = (verzeichnis) => {
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = `${verzeichnis}/${eintrag.name}`;
      if (eintrag.isDirectory()) sammle(pfad);
      else if (eintrag.name.endsWith(".js")) dateien.push(pfad);
    }
  };
  sammle(new URL("../pages/api", import.meta.url).pathname);

  const treffer = [];
  for (const pfad of dateien) {
    const quelle = readFileSync(pfad, "utf8");
    // Ein Ausdruck, der role='manager' UND is_platform_admin in derselben
    // Zeile verodert — das ist die nachgebaute Prüfung.
    for (const zeile of quelle.split("\n")) {
      if (/role\s*===\s*"manager"/.test(zeile) && /is_platform_admin/.test(zeile) && zeile.includes("||")) {
        treffer.push(`${pfad.split("/").slice(-2).join("/")}: ${zeile.trim().slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(treffer, [], `Statt istFuehrungsrolle() aus lib/rollen.js nachgebaut:\n${treffer.join("\n")}`);
});

test("Code und Datenbank nennen dieselben Führungsrollen", () => {
  // lib/rollen.js und public.ist_fuehrungsrolle() (migration_103) müssen
  // übereinstimmen — sonst darf jemand laut Oberfläche etwas, das die
  // Datenbank ablehnt.
  const sql = readFileSync(new URL("../supabase/migration_103_manager_sehen_alles.sql", import.meta.url), "utf8");
  const block = sql.slice(sql.indexOf("function public.ist_fuehrungsrolle"), sql.indexOf("$$;", sql.indexOf("function public.ist_fuehrungsrolle")));
  for (const rolle of FUEHRUNGSROLLEN) {
    assert.ok(block.includes(`'${rolle}'`), `Rolle "${rolle}" fehlt in ist_fuehrungsrolle()`);
  }
  assert.ok(block.includes("is_admin") && block.includes("is_platform_admin"), "is_admin/is_platform_admin fehlen in ist_fuehrungsrolle()");
});

// --- Hell/Dunkel mit eigenen Markenfarben ----------------------------------

test("eigene Flächenfarben gelten nur im passenden Modus", () => {
  // Sonst macht eine Organisation mit hellem Corporate Design den
  // Dunkelmodus hell — "dunkel" wäre dann nicht dunkel.
  const dunkel = { background_color: "#14151C" };
  const hell = { background_color: "#F5F5F0" };
  assert.equal(eigeneFlaechenGelten(dunkel, "dark"), true);
  assert.equal(eigeneFlaechenGelten(dunkel, "light"), false);
  assert.equal(eigeneFlaechenGelten(hell, "light"), true);
  assert.equal(eigeneFlaechenGelten(hell, "dark"), false);
  // Ohne eigene Farbe gilt immer das geprüfte Standarddesign.
  assert.equal(eigeneFlaechenGelten({}, "dark"), false);
  assert.equal(eigeneFlaechenGelten(null, "light"), false);
});

test("die Hell/Dunkel-Einstufung trennt an einer sinnvollen Schwelle", () => {
  for (const [hex, erwartet] of [["#FFFFFF", true], ["#F5F5F0", true], ["#E5E7EB", true],
                                 ["#14151C", false], ["#1C1E2A", false], ["#374151", false]]) {
    assert.equal(istHellerTon(hex), erwartet, `${hex} falsch eingestuft`);
  }
});

test("niemand rechnet den Wochenstart selbst aus", () => {
  // Die eigene Rechnung (getDay + setHours) vergleicht Montag 00:00 ORTSZEIT
  // und landet je nach Zeitzone auf einem anderen Tag. Genau daran waren die
  // Wochenziele unsichtbar — Browser schrieb Sonntag, Server suchte Montag.
  const dateien = [];
  const sammle = (verzeichnis) => {
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = `${verzeichnis}/${eintrag.name}`;
      if (eintrag.isDirectory()) sammle(pfad);
      else if (eintrag.name.endsWith(".js")) dateien.push(pfad);
    }
  };
  sammle(new URL("../pages", import.meta.url).pathname);
  sammle(new URL("../components", import.meta.url).pathname);

  const treffer = [];
  for (const pfad of dateien) {
    const quelle = readFileSync(pfad, "utf8");
    // Das verräterische Muster: (day === 0 ? -6 : 1) - day
    if (/\(\s*day\s*===\s*0\s*\?\s*-6\s*:\s*1\s*\)/.test(quelle)) {
      treffer.push(pfad.split("/").slice(-2).join("/"));
    }
  }
  assert.deepEqual(treffer, [], `Eigene Wochenrechnung statt lib/woche.js:\n${treffer.join("\n")}`);
});

test("lokaler Tagesschlüssel und Server-Zeile nutzen dieselbe Rechnung", () => {
  // Der Server nahm UTC, der Browser die Gerätezeit. Zwischen Mitternacht
  // und dem UTC-Tageswechsel ist das ein anderer Tag: die ersten Anrufe der
  // Nacht landeten in der Zeile des Vortags und überschrieben dessen Zahlen
  // mit den frisch bei null begonnenen. Deshalb darf in der Schreibstelle
  // kein toISOString().slice(0,10) mehr stehen.
  const quelle = readFileSync(new URL("../pages/call-tracker.js", import.meta.url), "utf8");
  // Die ganze Versandfunktion, nicht nur der Upsert: der Tag wird dort
  // oben gebildet und unten geschrieben (siehe "Zählerstände landen im Tag,
  // zu dem sie gehören").
  const start = quelle.indexOf("async function sendeZahlen");
  const schreibstelle = quelle.slice(start, quelle.indexOf('from("call_log_days").upsert', start) + 500);
  assert.ok(schreibstelle.includes("dateKeyOf("), "log_date muss über dateKeyOf() gebildet werden");
  assert.ok(!/toISOString\(\)\.slice\(0, ?10\)/.test(schreibstelle), "log_date darf nicht aus UTC kommen");

  // Und dateKeyOf bleibt die Gerätezeit — sonst wären alte Tage im
  // Browserspeicher unter einem anderen Schlüssel abgelegt.
  const d = new Date(2026, 7, 12, 13, 0, 0);
  assert.equal(dateKeyOf(d), "2026-08-12");
});

test("der Datumsfilter trifft den Tag, an dem der Termin stattfindet", () => {
  // Die ersten zehn Zeichen einer ISO-Zeichenkette stehen in UTC. Ein Termin
  // kurz nach Mitternacht liegt dort noch auf dem Vortag — der Filter zeigte
  // ihn dann am falschen Tag oder gar nicht.
  const spaet = new Date(2026, 7, 22, 0, 30);            // 22.08., halb eins
  const frueh = new Date(2026, 7, 21, 23, 30);           // 21.08., halb zwölf
  assert.equal(istGleicherTag(spaet.toISOString(), new Date("2026-08-22T12:00:00")), true);
  assert.equal(istGleicherTag(spaet.toISOString(), new Date("2026-08-21T12:00:00")), false);
  assert.equal(istGleicherTag(frueh.toISOString(), new Date("2026-08-21T12:00:00")), true);
});

test("die aktive Organisation wird nirgends nachgebaut", () => {
  // Dieselbe Falle wie bei der Führungsrolle: Wer die Firmencode-Logik
  // ausschreibt statt getActiveOrgId() zu benutzen, hat sie beim nächsten
  // Mal anders — und dann sieht eine Seite eine andere Organisation als der
  // Rest der App.
  const dateien = [];
  const sammle = (verzeichnis) => {
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = `${verzeichnis}/${eintrag.name}`;
      if (eintrag.isDirectory()) sammle(pfad);
      else if (eintrag.name.endsWith(".js")) dateien.push(pfad);
    }
  };
  sammle(new URL("../pages", import.meta.url).pathname);
  sammle(new URL("../components", import.meta.url).pathname);

  const treffer = dateien.filter((p) => readFileSync(p, "utf8").includes('sessionStorage.getItem("hb_active_org_id")'))
    .map((p) => p.split("/").slice(-2).join("/"));
  assert.deepEqual(treffer, [], `Statt getActiveOrgId() aus lib/activeOrg.js nachgebaut:\n${treffer.join("\n")}`);
});

// --- Pflichtangaben im Profil ---------------------------------------------

test("ein Profil gilt erst mit Foto, vollem Namen, Geburtstag und Telefon als eingerichtet", () => {
  const voll = { avatar_url: "https://…/bild.jpg", full_name: "Sabine Meyer", geburtstag: "1990-04-12", phone: "0170 1234567" };
  assert.equal(profilVollstaendig(voll), true);
  assert.deepEqual(fehlendeProfilangaben(voll), []);

  // Ein Vorname allein hilft beim Zuordnen nicht — genau dafür ist das Feld da.
  assert.deepEqual(fehlendeProfilangaben({ ...voll, full_name: "Sabine" }), ["Vollständiger Name"]);
  assert.deepEqual(fehlendeProfilangaben({ ...voll, avatar_url: "" }), ["Profilfoto"]);
  assert.deepEqual(fehlendeProfilangaben({ ...voll, geburtstag: null }), ["Geburtsdatum"]);
  assert.deepEqual(fehlendeProfilangaben({ ...voll, phone: "   " }), ["Telefonnummer"]);
  assert.equal(fehlendeProfilangaben(null).length, 4);
});

// Jedes Pflichtfeld muss im Profil auch als Pflichtfeld erkennbar sein.
// Sonst blockiert das Speichern an einer Stelle, die harmlos aussieht.
test("Profil: jedes Pflichtfeld trägt einen Stern", () => {
  const quelle = readFileSync(new URL("../pages/profile.js", import.meta.url), "utf8");
  for (const feld of PFLICHTFELDER) {
    assert.ok(
      quelle.includes(`<Stern feld="${feld.key}" />`),
      `Pflichtfeld ${feld.label} (${feld.key}) ist im Profil nicht als Pflichtfeld markiert.`
    );
  }
});

// Wird der Pfad falsch zurückgerechnet, bleibt beim Löschen eines Moduls die
// Videodatei im Speicher liegen — sichtbar wird das erst an der Rechnung.
test("Speicher-Pfad wird aus der öffentlichen Adresse zurückgewonnen", () => {
  const basis = "https://abc.supabase.co/storage/v1/object/public";
  assert.equal(pfadAusOeffentlicherUrl(`${basis}/course-videos/user-1/1699.mp4`, "course-videos"), "user-1/1699.mp4");
  assert.equal(pfadAusOeffentlicherUrl(`${basis}/content-files/user-1/1699.pdf?t=2`, "content-files"), "user-1/1699.pdf");
  assert.equal(pfadAusOeffentlicherUrl(`${basis}/content-files/u/Preis%20Liste.pdf`, "content-files"), "u/Preis Liste.pdf");
  // Fremder Eimer, leere Angabe: lieber nichts löschen als das Falsche.
  assert.equal(pfadAusOeffentlicherUrl(`${basis}/course-videos/u/a.mp4`, "content-files"), null);
  assert.equal(pfadAusOeffentlicherUrl(null, "course-videos"), null);
  assert.equal(pfadAusOeffentlicherUrl("https://example.com/a.mp4", "course-videos"), null);
});

// Der Schnellzugriff gehorcht der eigenen Auswahl — sonst tauchen Kacheln
// wieder auf, die jemand bewusst weggeklickt hat.
test("Schnellzugriff: eigene Auswahl schlägt Vorgabe", () => {
  const standard = sichtbareKacheln({}, false).map((k) => k.key);
  assert.ok(standard.includes("kalender"), "Kalender gehört zur Grundausstattung.");
  assert.ok(!standard.includes("recordings"), "Aufnahmen sind erst auf Wunsch dabei.");
  assert.ok(!standard.includes("admin"), "Verwaltungs-Kacheln nur für Führungsrollen.");
  assert.ok(sichtbareKacheln({}, true).map((k) => k.key).includes("admin"));

  // Ausdrücklich ausgeblendet bleibt ausgeblendet, auch als Standardkachel.
  assert.ok(!sichtbareKacheln({ hidden: ["kalender"] }, false).map((k) => k.key).includes("kalender"));
  // Ausdrückliche Auswahl ersetzt die Vorgabe vollständig.
  const eigene = sichtbareKacheln({ sichtbar: ["recordings", "duel"] }, false).map((k) => k.key);
  assert.deepEqual(eigene.sort(), ["duel", "recordings"]);
  // Reihenfolge kommt aus den eigenen Einstellungen.
  const sortiert = sichtbareKacheln({ sichtbar: ["duel", "recordings"], order: ["recordings", "duel"] }, false).map((k) => k.key);
  assert.deepEqual(sortiert, ["recordings", "duel"]);
});

// Eine .ics-Datei, die ein Kalender nicht liest, merkt man erst, wenn der
// Termin beim Gegenüber fehlt — deshalb hier geprüft.
test("Kalender-Datei: Format, Maskierung und ganze Tage", () => {
  const datei = baueIcs({
    uid: "lead-1@hb", titel: "Gespräch; Meier, GmbH",
    beschreibung: "Zeile eins\nZeile zwei", start: "2026-08-22T12:00:00.000Z", dauerMinuten: 30,
  });
  assert.ok(datei.startsWith("BEGIN:VCALENDAR\r\n"), "Zeilen enden mit CRLF.");
  assert.ok(datei.includes("DTSTART:20260822T120000Z"));
  assert.ok(datei.includes("DTEND:20260822T123000Z"), "30 Minuten Dauer.");
  // Semikolon, Komma und Zeilenumbruch haben im Format eine Bedeutung.
  assert.ok(datei.includes("SUMMARY:Gespräch\\; Meier\\, GmbH"));
  assert.ok(datei.includes("DESCRIPTION:Zeile eins\\nZeile zwei"));
  assert.ok(datei.trimEnd().endsWith("END:VCALENDAR"));

  // Ohne Uhrzeit: ganztägig, Ende ist der Folgetag.
  const ganz = baueIcs({ uid: "ev-1@hb", titel: "Messe", tagVon: "2026-09-01", tagBis: "2026-09-03" });
  assert.ok(ganz.includes("DTSTART;VALUE=DATE:20260901"));
  assert.ok(ganz.includes("DTEND;VALUE=DATE:20260904"));

  // Ohne verwertbaren Zeitpunkt lieber gar keine Datei als eine kaputte.
  assert.equal(baueIcs({ titel: "Ohne alles" }), null);
  assert.equal(baueIcs({ titel: "Unsinn", start: "kein Datum" }), null);

  // Lange Zeilen werden gefaltet — sonst lehnen manche Kalender die Datei ab.
  const lang = baueIcs({ uid: "x@hb", titel: "T".repeat(200), start: "2026-08-22T12:00:00.000Z" });
  lang.split("\r\n").forEach((z) => assert.ok(z.length <= 75, `Zeile zu lang: ${z.length}`));

  assert.equal(icsDateiname("Gespräch: Meier & Co"), "Gespräch-Meier-Co.ics");
});

// Eine im Kalender eingetragene Uhrzeit ist deutsche Zeit. Wird sie auf
// einem Gerät im Ausland als Ortszeit gelesen, wandert der Termin.
test("Uhrzeit im Kalender gilt als deutsche Zeit", () => {
  // Sommerzeit: 14:00 in Berlin sind 12:00 UTC.
  assert.equal(zeitpunktInBerlin("2026-08-22", "14:00"), "2026-08-22T12:00:00.000Z");
  // Winterzeit: nur eine Stunde Unterschied.
  assert.equal(zeitpunktInBerlin("2026-01-15", "14:00"), "2026-01-15T13:00:00.000Z");
  assert.equal(zeitpunktInBerlin("2026-08-22", "9:30"), "2026-08-22T07:30:00.000Z");
  // Unbrauchbare Angaben führen zum ganztägigen Termin, nicht zu Mitternacht.
  assert.equal(zeitpunktInBerlin("2026-08-22", "nachmittags"), null);
  assert.equal(zeitpunktInBerlin("2026-08-22", "25:00"), null);
  assert.equal(zeitpunktInBerlin("", "14:00"), null);
});

// Das Organigramm läuft über den Admin-Zugang, an den Zugriffsregeln der
// Datenbank vorbei. Was wer sieht, entscheidet allein diese Route — deshalb
// hier festgehalten, dass die volle Aufstellung an der Führungsrolle hängt.
test("Organigramm: volle Aufstellung nur für Führungsrollen", () => {
  const quelle = readFileSync(new URL("../pages/api/org-chart.js", import.meta.url), "utf8");
  const stelle = quelle.indexOf("teams: knoten, ohneTeam, struktur, teamsOhneEinheit, personenBaum, zusatz");
  assert.ok(stelle > -1, "Die volle Antwort gibt es nicht mehr — Test anpassen.");
  const davor = quelle.slice(0, stelle);
  assert.ok(/if \(darf\) \{\s*$/m.test(davor.split("\n").slice(-3).join("\n")),
    "Die volle Antwort muss hinter der Prüfung auf die Führungsrolle stehen.");
  assert.ok(quelle.includes("nurEigeneLinie: true"), "Für alle anderen bleibt nur die eigene Linie.");
});

// Ein Störungsmelder ohne Bremse ist nach einer Woche wertlos: derselbe
// Fehler bei zehn Leuten, zwanzig Nachrichten, und niemand schaut mehr hin.
test("Störungsmeldungen werden zusammengefasst und gefiltert", () => {
  const speicher = new Map();
  const s = meldungsSchluessel("/profile", "Upload fehlgeschlagen");
  assert.equal(sollMelden(s, speicher, 0), true, "Die erste Meldung geht raus.");
  assert.equal(sollMelden(s, speicher, 60_000), false, "Die Wiederholung nicht.");
  assert.equal(sollMelden(s, speicher, FENSTER_MS + 1), true, "Nach dem Fenster wieder.");

  // Kennungen und Zeitstempel machen aus derselben Störung sonst jedes Mal
  // eine neue.
  assert.equal(
    meldungsSchluessel("/termine", "Lead 8f3c1a2b-99 nicht gefunden"),
    meldungsSchluessel("/termine", "Lead 0000abcd-12 nicht gefunden")
  );

  // Erwartete Absagen sind keine Störung.
  assert.equal(istMeldenswert("Deine Sitzung ist abgelaufen. Bitte neu anmelden."), false);
  assert.equal(istMeldenswert("Failed to fetch"), false);
  assert.equal(istMeldenswert(""), false);
  assert.equal(istMeldenswert("Cannot read properties of undefined (reading 'id')"), true);
});

// Aktivitäten und Kalender gruppieren nach TAGEN. Zählt das Gerät in seiner
// eigenen Zeitzone, rutscht ein Abendereignis auf den Vortag.
test("Tagesgrenze richtet sich nach deutscher Zeit", () => {
  // 22:30 Uhr deutscher Sommerzeit = 20:30 UTC — bleibt derselbe Tag.
  assert.equal(deutscherTag("2026-08-22T20:30:00.000Z"), "2026-08-22");
  // 00:30 Uhr deutscher Zeit = 22:30 UTC am Vortag — gehört zum 23.
  assert.equal(deutscherTag("2026-08-22T22:30:00.000Z"), "2026-08-23");
  // Winterzeit: 23:30 UTC ist in Berlin bereits 00:30 des Folgetags.
  assert.equal(deutscherTag("2026-01-15T23:30:00.000Z"), "2026-01-16");
  assert.equal(deutscherTag(null), null);
  assert.equal(deutscherTag("kein Datum"), null);
});

// "vor 5 Minuten" ist die Frage, die man an eine Aktivitätsliste stellt.
test("Relative Zeitangaben", () => {
  const jetzt = new Date("2026-08-22T12:00:00.000Z").getTime();
  assert.equal(vorWieLange("2026-08-22T11:59:30.000Z", jetzt), "gerade eben");
  assert.equal(vorWieLange("2026-08-22T11:55:00.000Z", jetzt), "vor 5 Min.");
  assert.equal(vorWieLange("2026-08-22T09:00:00.000Z", jetzt), "vor 3 Std.");
  assert.equal(vorWieLange("2026-08-21T11:00:00.000Z", jetzt), "gestern");
  assert.equal(vorWieLange("2026-08-19T12:00:00.000Z", jetzt), "vor 3 Tagen");
  // Eine leicht vorgehende Geräteuhr darf nicht "in 2 Sekunden" ergeben.
  assert.equal(vorWieLange("2026-08-22T12:00:02.000Z", jetzt), "gerade eben");
  assert.equal(vorWieLange(null, jetzt), "");

  assert.equal(istGeradeAktiv("2026-08-22T11:50:00.000Z", jetzt), true);
  assert.equal(istGeradeAktiv("2026-08-22T11:40:00.000Z", jetzt), false);
  assert.equal(istGeradeAktiv(null, jetzt), false);
});

// Browser (sessionStorage, pro Tab) und Server (active_org, pro Konto)
// müssen dieselbe Organisation meinen. Wichen sie ab, sah ein Plattform-
// Admin nur noch seine EIGENEN Einträge — und je nach Tab mal so, mal so.
test("Aktive Organisation: Browser und Server werden abgeglichen", () => {
  // Frisch mit Firmencode angemeldet: der Tab gewinnt, der Server zieht nach.
  assert.deepEqual(abgleichAktiveOrg({ gespeichert: "volk", server: "hb", heimat: "hb" }),
    { aktiv: "volk", serverSchreiben: "volk", sessionSchreiben: null });

  // Beide einig: nichts zu schreiben.
  assert.deepEqual(abgleichAktiveOrg({ gespeichert: "volk", server: "volk", heimat: "hb" }),
    { aktiv: "volk", serverSchreiben: null, sessionSchreiben: null });

  // Neuer Tab: der Server gilt — NICHT die Heimat-Organisation. Genau hier
  // entstand der Fehler.
  assert.deepEqual(abgleichAktiveOrg({ gespeichert: null, server: "volk", heimat: "hb" }),
    { aktiv: "volk", serverSchreiben: null, sessionSchreiben: "volk" });

  // Nie etwas gewählt: die eigene Organisation, und beide Seiten lernen sie.
  assert.deepEqual(abgleichAktiveOrg({ gespeichert: null, server: null, heimat: "hb" }),
    { aktiv: "hb", serverSchreiben: "hb", sessionSchreiben: "hb" });

  // Konto ohne Organisation: nichts erfinden.
  assert.deepEqual(abgleichAktiveOrg({ gespeichert: null, server: null, heimat: null }),
    { aktiv: null, serverSchreiben: null, sessionSchreiben: null });
});

// Ein Kreisdiagramm mit einem einzigen Wert zeichnet keinen Bogen: Anfang
// und Ende liegen aufeinander, das Stück verschwindet. Und Nullwerte dürfen
// die Farbreihenfolge nicht verschieben.
test("Kreisdiagramm rechnet Anteile und Bögen richtig", () => {
  const { summe, segmente, vollkreis } = kreisSegmente([
    { label: "A", value: 30 }, { label: "B", value: 10 }, { label: "C", value: 0 },
  ]);
  assert.equal(summe, 40);
  assert.equal(vollkreis, null);
  assert.equal(segmente.length, 2, "Der Nullwert bekommt kein Stück.");
  assert.equal(Math.round(segmente[0].anteil * 100), 75);
  assert.equal(Math.round(segmente[1].anteil * 100), 25);
  // Das grössere Stück braucht das Kennzeichen für den grossen Bogen.
  assert.match(segmente[0].pfad, / 1 1 /);
  assert.match(segmente[1].pfad, / 0 1 /);

  const einer = kreisSegmente([{ label: "Nur A", value: 5 }, { label: "B", value: 0 }]);
  assert.equal(einer.segmente.length, 0);
  assert.deepEqual(einer.vollkreis, { label: "Nur A", value: 5, anteil: 1 });

  const leer = kreisSegmente([{ label: "A", value: 0 }]);
  assert.equal(leer.summe, 0);
  assert.deepEqual(leer.segmente, []);
  assert.equal(prozent(0.333), "33 %");
});

// Auf dem Handy kommt eine Sprachaufnahme oft ohne Dateityp an. Die Prüfung
// auf "audio/..." lehnte sie dann ab — am Rechner fiel das nie auf.
test("Aufnahmen vom Handy werden als Audio erkannt", () => {
  assert.equal(validateRecordingUpload({ name: "call.mp3", type: "audio/mpeg", size: 1000 }), null);
  // iCloud/Dateien-App: kein Typ, nur die Endung.
  assert.equal(validateRecordingUpload({ name: "Sprachmemo.m4a", type: "", size: 1000 }), null);
  assert.equal(validateRecordingUpload({ name: "audio.opus", type: "application/octet-stream", size: 1000 }), null);
  // iPhone verpackt Sprachaufnahmen zum Teil als video/mp4.
  assert.equal(validateRecordingUpload({ name: "aufnahme.mp4", type: "video/mp4", size: 1000 }), null);
  // Kein Audio bleibt kein Audio.
  assert.match(validateRecordingUpload({ name: "angebot.pdf", type: "application/pdf", size: 1000 }) || "", /Audio-Datei/);
  assert.match(validateRecordingUpload({ name: "foto.jpg", type: "image/jpeg", size: 1000 }) || "", /Audio-Datei/);
  // Zu gross: die Meldung nennt die tatsächliche Grösse.
  assert.match(validateRecordingUpload({ name: "lang.m4a", type: "audio/mp4", size: 40 * 1024 * 1024 }) || "", /40 MB/);
});

// Die Meldungen des Dateispeichers kommen englisch und technisch. Wer eine
// Aufnahme hochladen wollte, kann daraus nichts ablesen.
test("Speicher-Fehler werden übersetzt", () => {
  assert.match(verstaendlicherSpeicherFehler(new Error("new row violates row-level security policy")), /abgelehnt/);
  assert.match(verstaendlicherSpeicherFehler(new Error("Payload too large")), /zu groß/);
  assert.match(verstaendlicherSpeicherFehler(new Error("Bucket not found")), /Speicherort/);
  assert.match(verstaendlicherSpeicherFehler(new Error("Failed to fetch")), /Verbindung/);
  // Die technische Ursache bleibt für die Fehlersuche erhalten.
  assert.match(verstaendlicherSpeicherFehler(new Error("Bucket not found")), /Bucket not found/);
  // Unbekannte Meldungen werden durchgereicht statt verschluckt.
  assert.equal(verstaendlicherSpeicherFehler(new Error("Irgendwas Neues")), "Irgendwas Neues");
  assert.equal(verstaendlicherSpeicherFehler(null), "Hochladen fehlgeschlagen.");
});

// Dieselbe Sache muss in jedem Diagramm dieselbe Farbe haben. Sonst ist
// "Terminiert" im einen Kreis grün und im anderen violett, und die Legende
// muss jedes Mal neu gelesen werden.
test("Diagramm-Farben bleiben je Sache gleich", () => {
  assert.equal(feldFarbe("termin"), feldFarbe("termin"));
  assert.notEqual(feldFarbe("termin"), feldFarbe("negativ"));
  assert.notEqual(feldFarbe("erreicht"), feldFarbe("nicht"));
  // Unbekannte Schlüssel bekommen eine Farbe statt undefined.
  assert.ok(feldFarbe("gibtsnicht"));

  // Einwandgründe: die Farbe hängt an der Reihenfolge der hinterlegten
  // Gründe, nicht an der Sortierung der jeweiligen Ansicht.
  const gruende = [{ key: "preis" }, { key: "zeit" }, { key: "kein_bedarf" }];
  const sortiertAnders = [{ key: "kein_bedarf" }, { key: "preis" }, { key: "zeit" }];
  assert.equal(grundFarbe(gruende, "zeit"), grundFarbe(gruende, "zeit"));
  assert.notEqual(grundFarbe(gruende, "preis"), grundFarbe(gruende, "zeit"));
  assert.notEqual(grundFarbe(gruende, "zeit"), grundFarbe(sortiertAnders, "zeit"),
    "Andere Reihenfolge der Gründe = andere Farbe — deshalb wird IMMER dieselbe Liste übergeben.");

  // Palette wiederholt sich statt ins Leere zu laufen.
  assert.equal(paletteFarbe(0), paletteFarbe(PALETTE.length));
});

// Dieselbe Sache muss in jedem Diagramm dieselbe Farbe haben. Sonst ist
// "Terminiert" im einen Kreis grün und im anderen violett, und die Legende
// muss jedes Mal neu gelesen werden.
test("Diagramm-Farben bleiben je Sache gleich", () => {
  assert.equal(feldFarbe("termin"), feldFarbe("termin"));
  assert.notEqual(feldFarbe("termin"), feldFarbe("negativ"));
  assert.notEqual(feldFarbe("erreicht"), feldFarbe("nicht"));
  // Unbekannte Schlüssel bekommen eine Farbe statt undefined.
  assert.ok(feldFarbe("gibtsnicht"));

  // Einwandgründe: die Farbe hängt an der Reihenfolge der hinterlegten
  // Gründe, nicht an der Sortierung der jeweiligen Ansicht.
  const gruende = [{ key: "preis" }, { key: "zeit" }, { key: "kein_bedarf" }];
  const sortiertAnders = [{ key: "kein_bedarf" }, { key: "preis" }, { key: "zeit" }];
  assert.equal(grundFarbe(gruende, "zeit"), grundFarbe(gruende, "zeit"));
  assert.notEqual(grundFarbe(gruende, "preis"), grundFarbe(gruende, "zeit"));
  assert.notEqual(grundFarbe(gruende, "zeit"), grundFarbe(sortiertAnders, "zeit"),
    "Andere Reihenfolge der Gründe = andere Farbe — deshalb wird IMMER dieselbe Liste übergeben.");

  // Palette wiederholt sich statt ins Leere zu laufen.
  assert.equal(paletteFarbe(0), paletteFarbe(PALETTE.length));
});

// Nach dem Anmelden zurück auf die Seite, auf der man war. Das Ziel steht in
// der Adresszeile — deshalb darf es nur INNERHALB der Academy liegen.
test("Ziel nach dem Anmelden bleibt in der Academy", () => {
  assert.equal(sicheresZiel("/termine?leadId=7", "/"), "/termine?leadId=7");
  assert.equal(sicheresZiel("/call-tracker", "/"), "/call-tracker");
  // Ohne Ziel gilt die eingestellte Startseite.
  assert.equal(sicheresZiel(null, "/call-tracker"), "/call-tracker");
  assert.equal(sicheresZiel("", "/call-tracker"), "/call-tracker");
  // Fremde Adressen sind der Grund für die Prüfung.
  assert.equal(sicheresZiel("https://fremde.de", "/"), "/");
  assert.equal(sicheresZiel("//fremde.de", "/"), "/");
  assert.equal(sicheresZiel("/\\fremde.de", "/"), "/");
  assert.equal(sicheresZiel("javascript:alert(1)", "/"), "/");
  // Keine Schleife zurück auf die Anmeldung.
  assert.equal(sicheresZiel("/login", "/"), "/");
  assert.equal(sicheresZiel("/login?weiter=/x", "/"), "/");
});

// Anwesenheit heisst "tut gerade etwas", nicht "hat einen Tab offen".
test("Lebenszeichen: nur bei sichtbarem Tab und frischer Berührung", () => {
  const jetzt = 10_000_000;
  const basis = { sichtbar: true, jetzt, letztesSenden: 0, letzteInteraktion: jetzt - 1000 };

  assert.equal(sollLebenszeichenSenden(basis), true);
  // Unsichtbarer Tab meldet nie — auch nicht direkt nach einer Berührung.
  assert.equal(sollLebenszeichenSenden({ ...basis, sichtbar: false }), false);
  // Zu kurz nach dem letzten Senden: nicht bei jedem Klick schreiben.
  assert.equal(sollLebenszeichenSenden({ ...basis, letztesSenden: jetzt - 30_000 }), false);
  assert.equal(sollLebenszeichenSenden({ ...basis, letztesSenden: jetzt - (SENDE_ABSTAND_MS + 1) }), true);
  // Lange nichts getan: fällt still heraus, statt ewig als anwesend zu gelten.
  assert.equal(sollLebenszeichenSenden({ ...basis, letzteInteraktion: jetzt - (RUHE_MS + 1) }), false);
  // Frisch geöffnet, noch nichts berührt: einmal melden.
  assert.equal(sollLebenszeichenSenden({ ...basis, letzteInteraktion: 0 }), true);
});

// Zeiträume der Auswertungen. "Quartal" muss überall dasselbe heissen, und
// ein eigener Zeitraum darf nie zu einer leeren Auswertung führen, ohne dass
// jemand versteht warum.
test("Zeiträume: Quartal, 30 Tage und eigene Grenzen", () => {
  assert.equal(quartalsStart("2026-08-22"), "2026-07-01");
  assert.equal(quartalsStart("2026-01-01"), "2026-01-01");
  assert.equal(quartalsStart("2026-12-31"), "2026-10-01");
  assert.equal(quartalsName("2026-08-22"), "Q3 2026");

  const heute = "2026-08-22";
  assert.deepEqual(zeitraumGrenzen("heute", { heute }), { von: "2026-08-22", bis: "2026-08-22" });
  assert.deepEqual(zeitraumGrenzen("woche", { heute }), { von: "2026-08-16", bis: "2026-08-22" });
  assert.deepEqual(zeitraumGrenzen("monat", { heute }), { von: "2026-07-24", bis: "2026-08-22" });
  assert.deepEqual(zeitraumGrenzen("quartal", { heute }), { von: "2026-07-01", bis: "2026-08-22" });

  // Eigener Zeitraum: vertauschte Grenzen werden gedreht, fehlende ergänzt.
  assert.deepEqual(zeitraumGrenzen("eigen", { heute, von: "2026-08-01", bis: "2026-08-10" }), { von: "2026-08-01", bis: "2026-08-10" });
  assert.deepEqual(zeitraumGrenzen("eigen", { heute, von: "2026-08-10", bis: "2026-08-01" }), { von: "2026-08-01", bis: "2026-08-10" });
  assert.deepEqual(zeitraumGrenzen("eigen", { heute, von: "2026-08-05" }), { von: "2026-08-05", bis: "2026-08-05" });
  assert.deepEqual(zeitraumGrenzen("eigen", { heute }), { von: heute, bis: heute });
});

// Die Sprachausgabe kommt als nacktes PCM zurück. Ohne korrekten WAV-Kopf
// spielt kein Browser sie ab — und der Fehler wäre "es passiert nichts".
test("PCM wird zu abspielbarem WAV verpackt", () => {
  const pcm = Buffer.alloc(100, 7);
  const wav = pcmZuWav(pcm, 24000);
  assert.equal(wav.length, 144, "44 Byte Kopf plus Daten.");
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.subarray(36, 40).toString(), "data");
  assert.equal(wav.readUInt32LE(4), 36 + 100, "Grössenangabe zählt ab Byte 8.");
  assert.equal(wav.readUInt32LE(40), 100, "Länge der Nutzdaten.");
  assert.equal(wav.readUInt16LE(20), 1, "Unkomprimiertes PCM.");
  assert.equal(wav.readUInt32LE(24), 24000, "Abtastrate.");
  assert.equal(wav.readUInt32LE(28), 48000, "Byte pro Sekunde: Rate mal Blockgrösse.");

  // Die Rate steht im MIME-Typ — falsch gelesen klingt die Stimme zu tief
  // oder zu hoch.
  assert.equal(rateAusMime("audio/L16;codec=pcm;rate=16000"), 16000);
  assert.equal(rateAusMime("audio/L16"), 24000);
  assert.equal(rateAusMime(null), 24000);
});

// Beim Nachtragen lokaler Tage darf nichts verloren gehen, was auf dem
// Server schon höher steht — sonst löscht das Nachtragen fremde Arbeit.
test("Zähler zusammenführen: der höhere Wert gewinnt", () => {
  const lokal = { anwahlen: 12, erreicht: 3, termin: 0 };
  const server = { anwahlen: 8, erreicht: 9, negativ: 2 };
  assert.deepEqual(zaehlerZusammenfuehren(lokal, server),
    { anwahlen: 12, erreicht: 9, termin: 0, negativ: 2 });

  // Fehlt eine Seite ganz, bleibt die andere unverändert.
  assert.deepEqual(zaehlerZusammenfuehren({ anwahlen: 5 }, {}), { anwahlen: 5 });
  assert.deepEqual(zaehlerZusammenfuehren({}, { anwahlen: 7 }), { anwahlen: 7 });
  // Unsinnige Werte zählen als 0 statt die Rechnung zu vergiften.
  assert.deepEqual(zaehlerZusammenfuehren({ anwahlen: null }, { anwahlen: 4 }), { anwahlen: 4 });
});

// Bingo: das Spiel darf nie einen Gewinn behaupten, den es nicht gibt — und
// keinen übersehen. Die Mitte ist geschenkt und zählt immer mit.
test("Bingo erkennt Reihen, Spalten und Diagonalen", () => {
  assert.equal(LINIEN.length, 12, "5 Reihen, 5 Spalten, 2 Diagonalen.");
  assert.equal(MITTE, 12);

  // Leere Karte: die Mitte allein gewinnt nicht.
  assert.equal(hatBingo([]), false);

  // Oberste Reihe.
  assert.equal(hatBingo([0, 1, 2, 3, 4]), true);
  // Erste Spalte.
  assert.equal(hatBingo([0, 5, 10, 15, 20]), true);
  // Diagonale — die Mitte muss NICHT angeklickt sein, sie zählt von selbst.
  assert.equal(hatBingo([0, 6, 18, 24]), true);
  assert.equal(hatBingo([4, 8, 16, 20]), true);
  // Vier in einer Reihe ist kein Bingo.
  assert.equal(hatBingo([0, 1, 2, 3]), false);
  // Verstreute Felder ebenso wenig.
  assert.equal(hatBingo([0, 2, 7, 19, 23]), false);

  // Die Felder einer Gewinnlinie werden hervorgehoben, andere nicht.
  const treffer = gewinnFelder([0, 1, 2, 3, 4, 9]);
  assert.equal(treffer.has(0) && treffer.has(4), true);
  assert.equal(treffer.has(9), false);
});

test("Bingo: Zufallswörter und freie Plätze", () => {
  // Keine Wiederholung dessen, was schon auf der Karte steht.
  const woerter = zufallsWoerter(5, ["Zu teuer", "Keine Zeit"]);
  assert.equal(woerter.length, 5);
  assert.equal(new Set(woerter.map((w) => w.toLowerCase())).size, 5, "Keine Dubletten.");
  assert.equal(woerter.some((w) => w === "Zu teuer" || w === "Keine Zeit"), false);

  // Freie Plätze: die Mitte ist nie frei, belegte Plätze fallen heraus.
  const frei = freiePlaetze([{ position: 0 }, { position: 1 }]);
  assert.equal(frei.includes(12), false, "Die Mitte ist das Freifeld.");
  assert.equal(frei.includes(0), false);
  assert.equal(frei.length, 25 - 2 - 1);
});

// Der Buchungslink wird mitten im Telefonat angeklickt. Ein Tippfehler fällt
// dann zum denkbar schlechtesten Zeitpunkt auf.
test("Buchungslink: persönlich schlägt Organisation, Eingaben werden geprüft", () => {
  // Der eigene Kalender gewinnt — gebucht wird beim Vertriebler.
  assert.equal(
    buchungslink({ booking_url: "cal.com/houman" }, { booking_url: "cal.com/firma" }),
    "https://cal.com/houman"
  );
  assert.equal(buchungslink({}, { booking_url: "https://cal.com/firma" }), "https://cal.com/firma");
  assert.equal(buchungslink(null, null), null);
  assert.equal(buchungslink({ booking_url: "   " }, { booking_url: "cal.com/firma" }), "https://cal.com/firma");

  // Ohne Protokoll deutet der Browser die Adresse als Unterseite der Academy.
  assert.equal(normalisiere("cal.com/max"), "https://cal.com/max");
  // Kein Unfug aus dem Eingabefeld.
  assert.equal(normalisiere("javascript:alert(1)"), null);
  assert.equal(normalisiere("nur-text"), null);
  assert.equal(normalisiere(""), null);

  assert.equal(kurzform("https://cal.com/houman/30min"), "cal.com/houman/30min");
});

// Ein angefangener Anruf darf nicht verloren gehen: "Erreicht" gezählt, das
// Ergebnis nie — genau daraus entstand der graue Rest in der Auswertung.
test("Angefangene Anrufe werden gemerkt und wieder aufgenommen", () => {
  const daten = localStorageNachbilden();
  const meins = storagePrefix("nutzer-1");

  // Jeder Schritt zwischen "erreicht" und dem Abschluss gilt als offen.
  ["outcome", "wen", "durchgestellt", "callResult", "reason", "booking", "leadForm"]
    .forEach((schritt) => assert.equal(istOffenerAnruf(schritt), true, `${schritt} muss als offen gelten`));
  // Der Ruhezustand und der Abschluss nicht.
  assert.equal(istOffenerAnruf("lead"), false);
  assert.equal(istOffenerAnruf("breathe"), false);
  assert.equal(istOffenerAnruf(null), false);

  merkeSchritt(meins, "wen");
  assert.equal(offenerSchritt(meins), "wen", "Beim nächsten Öffnen wird dort weitergefragt.");

  // Ist der Anruf fertig, bleibt nichts zurück.
  merkeSchritt(meins, "lead");
  assert.equal(offenerSchritt(meins), null);
  assert.ok(Object.keys(daten).length >= 0);
});

// Ziele: der Balken sagt "wie weit", die Auswertung sagt "reicht das Tempo".
// Zweiteres ist die Zahl, mit der man mitten in der Woche noch etwas ändern
// kann — und genau dort darf sie nicht falsch sein.
test("Ziel-Auswertung: Tempo, Hochrechnung und Bedarf", () => {
  // Sieben Tage, Ziel 700, am vierten Tag 400 geschafft.
  const ziel = { starts_on: "2026-08-17", ends_on: "2026-08-23", target_count: 700 };
  const a = werteZielAus(ziel, 400, "2026-08-20");
  assert.equal(a.status, "laeuft");
  assert.equal(a.gesamtTage, 7);
  assert.equal(a.vergangeneTage, 4, "Der angebrochene Tag zählt mit.");
  assert.equal(a.verbleibendeTage, 4, "Heute zählt noch als Arbeitstag.");
  assert.equal(a.tempo, 100);
  assert.equal(a.hochrechnung, 700);
  assert.equal(a.aufKurs, true);
  assert.equal(a.noetigProTag, 75);

  // Dasselbe Ziel, aber zu langsam: die Hochrechnung sagt es, der Balken nicht.
  const b = werteZielAus(ziel, 200, "2026-08-20");
  assert.equal(b.hochrechnung, 350);
  assert.equal(b.aufKurs, false);
  assert.equal(b.noetigProTag, 125);

  // Abgelaufen: keine Hochrechnung mehr, nur das Ergebnis.
  const c = werteZielAus(ziel, 650, "2026-08-30");
  assert.equal(c.status, "vorbei");
  assert.equal(c.hochrechnung, 650);
  assert.equal(c.geschafft, false);
  assert.equal(c.verbleibendeTage, 0);
  assert.equal(c.noetigProTag, 50, "Ohne Resttage bleibt der volle Rückstand stehen.");

  // Erreicht ist erreicht, auch über 100 Prozent.
  const d = werteZielAus(ziel, 900, "2026-08-30");
  assert.equal(d.geschafft, true);
  assert.equal(d.anteil, 1);

  // Ein Ziel, das noch nicht begonnen hat.
  assert.equal(zielStatus(ziel, "2026-08-01"), "geplant");
});

test("Ziel-Bilanz zeigt, ob die Ziele realistisch gesetzt sind", () => {
  const ziel = { starts_on: "2026-08-01", ends_on: "2026-08-07", target_count: 100 };
  const auswertungen = [
    werteZielAus(ziel, 120, "2026-08-20"),
    werteZielAus(ziel, 100, "2026-08-20"),
    werteZielAus(ziel, 40, "2026-08-20"),
    werteZielAus(ziel, 60, "2026-08-20"),
    // Ein laufendes Ziel gehört nicht in die Bilanz — es ist noch offen.
    werteZielAus({ starts_on: "2026-08-18", ends_on: "2026-08-24", target_count: 100 }, 10, "2026-08-20"),
  ];
  const b = bilanz(auswertungen);
  assert.equal(b.anzahl, 4);
  assert.equal(b.geschafft, 2);
  assert.equal(b.verfehlt, 2);
  assert.equal(b.quote, 0.5);
  assert.equal(Math.round(b.schnittErfuellung * 100), 75);
});

// --- Quoten rund um das Terminieren ---------------------------------------

test("Quoten: die Rechnungen stimmen", () => {
  const q = berechneQuoten({ anwahlen: 120, erreicht: 40, gatekeeper: 25, entscheider: 15, weitergeleitet: 10, termin: 2 });
  assert.equal(q.anwahlenProTermin, 60);      // 120 Anrufe für 2 Termine
  assert.equal(q.erreichbarkeit, 33);         // 40 von 120
  assert.equal(q.terminJeAnwahl, 2);          // 2 von 120
  assert.equal(q.terminJeGespraech, 5);       // 2 von 40
  assert.equal(q.beiEntscheidung, 25);        // 15 direkt + 10 durchgestellt
  assert.equal(q.terminJeEntscheider, 8);     // 2 von 25
  assert.equal(q.durchstellQuote, 40);        // 10 von 25 Vorzimmern
});

test("Quoten: ohne Grundlage kommt null, nicht null Prozent", () => {
  const leer = berechneQuoten({});
  for (const spalte of QUOTEN_SPALTEN) assert.equal(leer[spalte.key], null, spalte.key);
  // Telefoniert, aber noch kein Termin: "Anwahlen je Termin" hat keine Antwort.
  const ohneTermin = berechneQuoten({ anwahlen: 50, erreicht: 10 });
  assert.equal(ohneTermin.anwahlenProTermin, null);
  assert.equal(ohneTermin.terminJeAnwahl, 0);
  assert.equal(ohneTermin.erreichbarkeit, 20);
});

test("Quoten: Termine je Entscheider zählt Durchgestellte mit", () => {
  // Zwei Wege zur Entscheidung, gleiche Termine: die Quote darf nicht davon
  // abhängen, ob man direkt durchkam oder durchgestellt wurde.
  const direkt = berechneQuoten({ entscheider: 10, weitergeleitet: 0, termin: 5 });
  const durch = berechneQuoten({ entscheider: 0, gatekeeper: 10, weitergeleitet: 10, termin: 5 });
  assert.equal(direkt.terminJeEntscheider, durch.terminJeEntscheider);
});

test("Quoten: Anzeige mit deutschem Komma und Strich statt Lücke", () => {
  assert.equal(prozentText(42), "42 %");
  assert.equal(prozentText(null), "—");
  assert.equal(zahlText(60), "60");
  assert.equal(zahlText(12.34), "12,3");
  assert.equal(zahlText(null), "—");
  const q = berechneQuoten({ anwahlen: 100, termin: 8 });
  assert.equal(quotenText(q, QUOTEN_SPALTEN[0]), "12,5");
  assert.equal(quotenText(q, QUOTEN_SPALTEN.find((s) => s.key === "durchstellQuote")), "—");
});

test("Call Tracker: ein zweites Gerät darf einen Tag nicht auf null setzen", () => {
  // Der Fall, der einen ganzen Tag gekostet hat: am Laptop 200 Anwahlen
  // gezählt, dann am Handy den Call Tracker geöffnet. Dort ist der lokale
  // Speicher leer, der erste Klick steht auf 1 — und schrieb bisher diese 1
  // über die 200. Zusammengeführt wird nach dem höheren Wert je Zähler.
  const handy = { anwahlen: 1, erreicht: 0, termin: 0 };
  const server = { anwahlen: 200, erreicht: 60, termin: 3 };
  const zusammen = zaehlerZusammenfuehren(handy, server);
  assert.equal(zusammen.anwahlen, 200);
  assert.equal(zusammen.erreicht, 60);
  assert.equal(zusammen.termin, 3);
  // Und andersherum darf der Server das Gerät nicht bremsen.
  assert.equal(zaehlerZusammenfuehren({ anwahlen: 205 }, server).anwahlen, 205);
});

// --- Korrekturen ziehen die ganze Tabelle mit -----------------------------

test("Korrektur: eine zurückgenommene Anwahl nimmt den ganzen Anruf mit", () => {
  // Ein vollständiger Anruf: angewählt, erreicht, Vorzimmer, durchgestellt,
  // Termin. Wird die Anwahl zurückgenommen, darf davon nichts stehenbleiben.
  const counts = { anwahlen: 10, erreicht: 6, nicht: 4, gatekeeper: 4, entscheider: 2, weitergeleitet: 3, termin: 2, negativ: 3 };
  const gruende = { kein_interesse: 3 };
  const anruf = { counts: { anwahlen: 1, erreicht: 1, gatekeeper: 1, weitergeleitet: 1, termin: 1 }, reasons: {} };
  const neu = korrigiere(counts, gruende, "anwahlen", anruf);
  assert.equal(neu.counts.anwahlen, 9);
  assert.equal(neu.counts.erreicht, 5);
  assert.equal(neu.counts.gatekeeper, 3);
  assert.equal(neu.counts.weitergeleitet, 2);
  assert.equal(neu.counts.termin, 1);
  assert.equal(neu.counts.nicht, 4);   // unbeteiligt, bleibt stehen
});

test("Korrektur: der zurückgenommene negative Anruf nimmt seinen Grund mit", () => {
  const anruf = { counts: { anwahlen: 1, erreicht: 1, entscheider: 1, negativ: 1 }, reasons: { kein_interesse: 1 } };
  const neu = korrigiere(
    { anwahlen: 5, erreicht: 5, entscheider: 5, negativ: 2 },
    { kein_interesse: 2 },
    "anwahlen", anruf
  );
  assert.equal(neu.counts.negativ, 1);
  assert.equal(neu.reasons.kein_interesse, 1);
});

test("Korrektur: ohne bekannten Anruf regelt sich die Tabelle trotzdem ein", () => {
  // Der Altbestand hat keine Anruf-Historie. Dann zählt nur die Regel:
  // keine Zahl grösser als ihre Grundlage.
  const neu = korrigiere({ anwahlen: 10, erreicht: 6, nicht: 4 }, {}, "anwahlen", null);
  assert.equal(neu.counts.anwahlen, 9);
  assert.equal(neu.counts.erreicht + neu.counts.nicht, 9); // nicht mehr 10
});

test("Einregeln: keine Zahl steht über ihrer Grundlage", () => {
  const { counts, reasons } = regleEin(
    { anwahlen: 5, erreicht: 9, nicht: 9, gatekeeper: 9, entscheider: 9, weitergeleitet: 9, termin: 9, negativ: 9 },
    { kein_interesse: 9, kein_budget: 9 }
  );
  assert.ok(counts.erreicht + counts.nicht <= counts.anwahlen);
  assert.ok(counts.gatekeeper + counts.entscheider <= counts.erreicht);
  assert.ok(counts.weitergeleitet <= counts.gatekeeper);
  assert.ok(counts.termin + counts.negativ <= counts.erreicht);
  assert.ok(reasons.kein_interesse + reasons.kein_budget <= counts.negativ);
});

test("Einregeln: stimmige Zahlen bleiben unangetastet", () => {
  const counts = { anwahlen: 100, erreicht: 40, nicht: 60, gatekeeper: 25, entscheider: 15, weitergeleitet: 10, termin: 5, negativ: 30 };
  const gruende = { kein_interesse: 20, kein_budget: 10 };
  const neu = regleEin(counts, gruende);
  assert.deepEqual(neu.counts, counts);
  assert.deepEqual(neu.reasons, gruende);
});

test("Einregeln: der grösste Posten gibt zuerst nach", () => {
  // Vier Gespräche zu viel bei drei Anwahlen: abgebaut wird beim grösseren.
  const { counts } = regleEin({ anwahlen: 3, erreicht: 2, nicht: 5 }, {});
  assert.equal(counts.nicht, 2);
  assert.equal(counts.erreicht, 1);
});

test("Korrektur: nichts wird negativ", () => {
  const neu = korrigiere({ anwahlen: 0, erreicht: 0 }, {}, "anwahlen", { counts: { anwahlen: 1, erreicht: 1 }, reasons: {} });
  assert.equal(neu.counts.anwahlen, 0);
  assert.equal(neu.counts.erreicht, 0);
  assert.equal(zieheAnrufAb({}, {}, { counts: { termin: 5 } }).counts.termin, 0);
  assert.ok(GRUNDLAGEN.length >= 4);
});

test("Nachtragen: ein unlesbarer Eintrag stoppt nicht den Rest", () => {
  // Genau hier ging es schief: ein kaputter Schlüssel brach die Schleife ab,
  // und alle Tage danach fehlten beim Nachtragen — ohne jede Meldung.
  const speicher = new Map();
  globalThis.localStorage = {
    get length() { return speicher.size; },
    key: (i) => [...speicher.keys()][i],
    getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
    setItem: (k, v) => speicher.set(k, String(v)),
    removeItem: (k) => speicher.delete(k),
  };
  const prefix = storagePrefix("nutzer-1");
  speicher.set(`${prefix}callstats:2026-08-30`, JSON.stringify({ counts: { anwahlen: 5 }, reasons: {} }));
  speicher.set(`${prefix}callstats:2026-08-31`, "{kaputt");
  speicher.set(`${prefix}callstats:2026-09-01`, JSON.stringify({ counts: { anwahlen: 7 }, reasons: {} }));

  const tage = alleGespeichertenTage(prefix, []);
  assert.deepEqual(tage.map((t) => t.tag), ["2026-08-30", "2026-09-01"]);
  assert.equal(tage[1].counts.anwahlen, 7);

  // Der Anruf-Verlauf liegt beim selben Tag, ist aber kein Tageseintrag und
  // darf nicht als Datum in die Datenbank wandern.
  merkeBuchung(prefix, "callstats:2026-09-01", "anwahlen");
  merkeBuchung(prefix, "callstats:2026-09-01", "erreicht");
  merkeBuchung(prefix, "callstats:2026-09-01", "termin");
  assert.deepEqual(alleGespeichertenTage(prefix, []).map((t) => t.tag), ["2026-08-30", "2026-09-01"]);

  // Und der letzte Anruf kommt mit allem zurück, was er gebucht hat.
  const letzter = nimmLetztenAnruf(prefix, "callstats:2026-09-01");
  assert.deepEqual(letzter.counts, { anwahlen: 1, erreicht: 1, termin: 1 });
  assert.equal(nimmLetztenAnruf(prefix, "callstats:2026-09-01"), null);
  leereVerlauf(prefix, "callstats:2026-09-01");
  delete globalThis.localStorage;
});

// --- Management-Auswertung -------------------------------------------------

const TAG = (user_id, counts, reasons = {}) => ({ user_id, log_date: "2026-09-01", counts, reasons });

test("Auswertung: der Trichter rechnet jede Stufe an der vorigen", () => {
  const stufen = trichter({ anwahlen: 1000, erreicht: 400, entscheider: 100, weitergeleitet: 80, termin: 20 });
  assert.deepEqual(stufen.map((s) => s.wert), [1000, 400, 180, 20]);
  assert.equal(stufen[0].uebergang, null);      // die erste Stufe hat keine vorige
  assert.equal(stufen[1].uebergang, 40);        // 400 von 1000
  assert.equal(stufen[2].uebergang, 45);        // 180 von 400
  assert.equal(stufen[2].wert, 180);            // direkt + durchgestellt
});

test("Auswertung: der Engpass ist der schwächste Übergang, nicht der grösste Verlust", () => {
  // Absolut verliert die erste Stufe am meisten (600 Kontakte). Die Frage
  // ist aber, welcher SCHRITT schlechter läuft als er sollte.
  const stufen = trichter({ anwahlen: 1000, erreicht: 400, entscheider: 300, weitergeleitet: 0, termin: 15 });
  const eng = engpass(stufen);
  assert.equal(eng.key, "termin");
  assert.equal(eng.uebergang, 5);
});

test("Auswertung: der Benchmark wird gewichtet, nicht gemittelt", () => {
  // Ein winziges Team mit Traumquote darf den Vergleichswert nicht
  // hochziehen — sonst steht die ganze Mannschaft grundlos schlecht da.
  const gross = { counts: { anwahlen: 1000, erreicht: 400, termin: 20 } };
  const klein = { counts: { anwahlen: 10, erreicht: 10, termin: 5 } };
  const b = benchmark([gross, klein]);
  assert.equal(b.counts.anwahlen, 1010);
  assert.equal(b.quoten.terminJeGespraech, 6);   // 25 von 410, nicht (5+50)/2
});

test("Auswertung: der Impact-Vergleich verweigert sich bei zu dünner Grundlage", () => {
  const wenige = [
    { name: "A", training: 10, counts: { anwahlen: 100, erreicht: 40, termin: 4 } },
    { name: "B", training: 0, counts: { anwahlen: 100, erreicht: 40, termin: 1 } },
  ];
  assert.equal(impactAnalyse(wenige).belastbar, false);
  // Und wer im Zeitraum kaum telefoniert hat, zählt nicht mit: sonst misst
  // man Abwesenheit statt Wirkung.
  const mitKarteileichen = [
    ...wenige,
    { name: "C", training: 5, counts: { anwahlen: 2, erreicht: 1, termin: 0 } },
    { name: "D", training: 1, counts: { anwahlen: 0 } },
  ];
  assert.equal(impactAnalyse(mitKarteileichen).belastbar, false);
});

test("Auswertung: der Impact-Vergleich stellt die Hälften gegenüber", () => {
  const personen = [
    { name: "A", training: 20, counts: { anwahlen: 100, erreicht: 50, termin: 10 } },
    { name: "B", training: 15, counts: { anwahlen: 100, erreicht: 50, termin: 10 } },
    { name: "C", training: 1, counts: { anwahlen: 100, erreicht: 50, termin: 2 } },
    { name: "D", training: 0, counts: { anwahlen: 100, erreicht: 50, termin: 2 } },
  ];
  const i = impactAnalyse(personen);
  assert.equal(i.belastbar, true);
  assert.equal(i.aktiv.quoten.terminJeGespraech, 20);
  assert.equal(i.wenig.quoten.terminJeGespraech, 4);
  assert.equal(i.unterschied, 16);
});

test("Auswertung: jede Empfehlung hängt an einer Zahl", () => {
  const gesamt = summiere([
    TAG("a", { anwahlen: 600, erreicht: 240, gatekeeper: 200, entscheider: 40, weitergeleitet: 40, termin: 12, negativ: 120 }),
    TAG("b", { anwahlen: 400, erreicht: 160, gatekeeper: 120, entscheider: 40, weitergeleitet: 20, termin: 3, negativ: 80 }),
  ]);
  const rat = empfehlungen({
    teams: [
      { name: "Team Nord", counts: { anwahlen: 600, erreicht: 240, termin: 12 } },
      { name: "Team Süd", counts: { anwahlen: 400, erreicht: 160, termin: 3 } },
    ],
    personen: [
      { name: "A", counts: { anwahlen: 600 } },
      { name: "B", counts: { anwahlen: 400 } },
      { name: "C", counts: { anwahlen: 20 } },
    ],
    gesamt,
    gruende: [{ label: "Kein Interesse", wert: 160 }, { label: "Kein Budget", wert: 40 }],
  });
  assert.ok(rat.length >= 3 && rat.length <= 4);
  // Jede Empfehlung nennt mindestens eine Zahl — sonst ist es eine Meinung.
  rat.forEach((r) => assert.match(r.text, /\d/, r.titel));
  // Das schwächere Team wird benannt, das stärkere nicht.
  assert.ok(rat.some((r) => r.titel.includes("Team Süd")));
  assert.ok(!rat.some((r) => r.titel.includes("Team Nord")));
  // Die dünne Datenlage von C führt zu keiner Aussage über C's Qualität.
  assert.ok(!rat.some((r) => r.titel.includes("C ")));
});

test("Auswertung: ohne Daten keine Empfehlungen", () => {
  assert.deepEqual(empfehlungen({ teams: [], personen: [], gesamt: {}, gruende: [] }), []);
});

test("LogoHintergrund wird nie um Inhalt gelegt", () => {
  // Die Komponente ist ein absolut gesetztes Hintergrundbild und gibt
  // keinerlei Inhalt aus. Wer sie als Klammer benutzt, löscht damit die
  // ganze Seite — genau so war der Reiter "Auswertung" leer, ohne einen
  // einzigen Fehler in der Konsole.
  const seiten = readdirSync(new URL("../pages", import.meta.url), { recursive: true })
    .filter((n) => typeof n === "string" && n.endsWith(".js"));
  const mitInhalt = [];
  for (const name of seiten) {
    const quelle = readFileSync(new URL(`../pages/${name}`, import.meta.url), "utf8");
    // Ein schliessendes Tag gibt es nur, wenn etwas dazwischen steht.
    if (/<LogoHintergrund[^/>]*>[\s\S]*?<\/LogoHintergrund>/.test(quelle)) mitInhalt.push(name);
  }
  assert.deepEqual(mitInhalt, [],
    `Diese Seiten legen LogoHintergrund um ihren Inhalt — der verschwindet dadurch: ${mitInhalt.join(", ")}`);
});

test("dayKey gehört in den Speicher, dateKeyOf in die Datenbank", () => {
  // Zwei Schlüssel für denselben Tag, die sich zum Verwechseln ähneln:
  // dayKey trägt ein Präfix für den Browser-Speicher, dateKeyOf ist das
  // blanke Datum für die Spalte log_date. Eine Abfrage mit dayKey fragt die
  // Datenbank nach "log_date = callstats:2026-09-01" — sie scheitert, und
  // zwar bei jedem. Genau so standen die Zählerkacheln auf null, während
  // die Statistik daneben die richtigen Zahlen zeigte.
  assert.ok(dayKey().startsWith("callstats:"));
  assert.match(dateKeyOf(new Date("2026-09-01T10:00:00")), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!dateKeyOf(new Date()).includes(":"));

  const seiten = readdirSync(new URL("../pages", import.meta.url), { recursive: true })
    .filter((n) => typeof n === "string" && n.endsWith(".js"));
  const falsch = [];
  for (const name of seiten) {
    const quelle = readFileSync(new URL(`../pages/${name}`, import.meta.url), "utf8");
    // dayKey() in derselben Zeile wie eine Datenbank-Spalte oder -Abfrage.
    quelle.split("\n").forEach((zeile, i) => {
      if (!zeile.includes("dayKey()")) return;
      if (/log_date|\.eq\(|\.gte\(|\.lte\(|\.in\(|upsert|insert|update/.test(zeile)) {
        falsch.push(`${name}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(falsch, [],
    `Hier wird der Speicher-Schlüssel an die Datenbank gegeben — die Abfrage scheitert lautlos: ${falsch.join(", ")}`);
});

// --- Einwände nach Uhrzeit -------------------------------------------------

const GRUENDE = [{ key: "kein_interesse", label: "Kein Interesse" }, { key: "kein_budget", label: "Kein Budget" }];
const EV = (art, grund, iso) => ({ art, grund, erfasst_at: iso });

test("Tageszeit: gerechnet wird in deutscher Zeit, nicht in UTC", () => {
  // Sommerzeit: 07:30 UTC ist 09:30 in Deutschland. Ohne Umrechnung stünde
  // in der Auswertung 7 Uhr, wo um 9 telefoniert wurde.
  assert.equal(deutscheStunde("2026-07-01T07:30:00Z"), 9);
  // Winterzeit: dieselbe UTC-Stunde ist eine Stunde früher.
  assert.equal(deutscheStunde("2026-01-15T07:30:00Z"), 8);
  assert.equal(deutscheStunde("kaputt"), null);
  assert.equal(stundenText(9), "09–10 Uhr");
  assert.equal(stundenText(23), "23–00 Uhr");
});

test("Tageszeit: das Raster zählt je Stunde und je Grund", () => {
  const raster = stundenRaster([
    EV("negativ", "kein_interesse", "2026-07-01T07:10:00Z"),   // 9 Uhr
    EV("negativ", "kein_interesse", "2026-07-01T07:50:00Z"),   // 9 Uhr
    EV("termin", null, "2026-07-01T07:55:00Z"),                // 9 Uhr
    EV("negativ", "kein_budget", "2026-07-01T12:05:00Z"),      // 14 Uhr
  ], GRUENDE);
  assert.deepEqual(raster.map((z) => z.stunde), [9, 14]);
  assert.equal(raster[0].negativ, 2);
  assert.equal(raster[0].termin, 1);
  assert.equal(raster[0].erfolgsquote, 33);
  assert.equal(raster[0].gruende.kein_interesse, 2);
  assert.equal(raster[1].gruende.kein_budget, 1);
});

test("Tageszeit: eine Stunde mit drei Anrufen ist keine beste Stunde", () => {
  // Sonst liest jemand eine Zufallsspitze als Muster und legt seinen
  // Arbeitstag danach.
  const duenn = stundenRaster([EV("termin", null, "2026-07-01T07:10:00Z")], GRUENDE);
  assert.equal(besteStunde(duenn), null);
  assert.equal(schlechtesteStunde(duenn), null);

  const dicht = [];
  for (let i = 0; i < MINDESTENS_JE_STUNDE; i++) dicht.push(EV("termin", null, "2026-07-01T07:10:00Z"));
  for (let i = 0; i < MINDESTENS_JE_STUNDE; i++) dicht.push(EV("negativ", "kein_budget", "2026-07-01T13:10:00Z"));
  const raster = stundenRaster(dicht, GRUENDE);
  assert.equal(besteStunde(raster).stunde, 9);
  assert.equal(besteStunde(raster).erfolgsquote, 100);
  assert.equal(schlechtesteStunde(raster).stunde, 15);
  assert.equal(schlechtesteStunde(raster).erfolgsquote, 0);
});

test("Tageszeit: die Spitze eines Einwands ist ein Anteil, keine Menge", () => {
  // Vormittags wird viel telefoniert: dort steht "kein Budget" absolut
  // höher. Nachmittags ist es aber der bestimmende Einwand — und genau das
  // ist die Antwort auf "wann kommt welcher Einwand".
  const ereignisse = [];
  for (let i = 0; i < 8; i++) ereignisse.push(EV("negativ", "kein_interesse", "2026-07-01T07:10:00Z"));
  for (let i = 0; i < 4; i++) ereignisse.push(EV("negativ", "kein_budget", "2026-07-01T07:20:00Z"));
  for (let i = 0; i < 1; i++) ereignisse.push(EV("negativ", "kein_interesse", "2026-07-01T13:10:00Z"));
  for (let i = 0; i < 5; i++) ereignisse.push(EV("negativ", "kein_budget", "2026-07-01T13:20:00Z"));

  const raster = stundenRaster(ereignisse, GRUENDE);
  const spitzen = spitzeJeGrund(raster, GRUENDE);
  const budget = spitzen.find((s) => s.key === "kein_budget");
  assert.equal(budget.stunde, 15);        // nachmittags, nicht vormittags
  assert.equal(budget.anteil, 83);        // 5 von 6 Absagen dieser Stunde
  assert.equal(budget.gesamt, 9);
  const interesse = spitzen.find((s) => s.key === "kein_interesse");
  assert.equal(interesse.stunde, 9);
});

test("Tageszeit: ohne Ereignisse bleibt alles leer statt zu raten", () => {
  assert.deepEqual(stundenRaster([], GRUENDE), []);
  assert.equal(besteStunde([]), null);
  assert.deepEqual(spitzeJeGrund([], GRUENDE).map((s) => s.stunde), [null, null]);
});

test("Jedes Diagramm sagt, was es aussagt", () => {
  // Ein Ring mit vier Farben ist schnell gezeichnet und ebenso schnell
  // falsch verstanden. Deshalb trägt jedes Diagramm eine kleine Zeile
  // darunter — nicht was drinsteht, sondern was man daraus schliessen darf.
  const seiten = readdirSync(new URL("../pages", import.meta.url), { recursive: true })
    .filter((n) => typeof n === "string" && n.endsWith(".js"));
  const ohne = [];
  for (const name of seiten) {
    const quelle = readFileSync(new URL(`../pages/${name}`, import.meta.url), "utf8");
    // Jeder Aufruf bis zu seinem schliessenden Zeichen.
    const treffer = quelle.match(/<Kreisdiagramm[\s\S]*?\/>/g) || [];
    treffer.forEach((aufruf, i) => {
      if (!/erklaerung=/.test(aufruf)) ohne.push(`${name} (${i + 1}. Diagramm)`);
    });
  }
  assert.deepEqual(ohne, [],
    `Diese Diagramme stehen ohne Erklärung da: ${ohne.join(", ")}`);
});

test("Zählerstände landen im Tag, zu dem sie gehören", () => {
  // Der Versand schrieb immer auf "jetzt". Wer den Reiter über Mitternacht
  // offen liess, schob damit die Anwahlen von gestern in die heutige Zeile:
  // am nächsten Morgen standen dort Anrufe, die nie stattgefunden hatten.
  const quelle = readFileSync(new URL("../pages/call-tracker.js", import.meta.url), "utf8");

  // Der gespeicherte Stand trägt seinen Tag mit sich.
  assert.match(quelle, /letzterStand\.current = \{[^}]*tag: dateKeyOf\(new Date\(\)\)/);

  // Und der Upsert nimmt diesen Tag, nicht den Zeitpunkt des Sendens.
  const upsert = quelle.match(/from\("call_log_days"\)\.upsert\(\{[\s\S]*?\}\)/);
  assert.ok(upsert, "Der Upsert der Tageszähler wurde nicht gefunden.");
  assert.match(upsert[0], /log_date: tag,/);
  assert.ok(!/log_date: dateKeyOf\(new Date\(\)\)/.test(upsert[0]),
    "Der Stand wird auf den Tag des Sendens geschrieben statt auf seinen eigenen.");

  // Und die Seite bemerkt den Tageswechsel von sich aus.
  assert.match(quelle, /function pruefeTageswechsel\(\)/);
  assert.match(quelle, /setInterval\(\(\) => tageswechselRef\.current\(\)/);
});

test("Einen Zähler setzen regelt die Tabelle mit ein", () => {
  // Nach dem Setzen darf keine abhängige Zahl über ihrer Grundlage stehen:
  // wer die Anwahlen von 120 auf 60 korrigiert, kann nicht 100 erreichte
  // Gespräche behalten.
  const { counts } = regleEin(
    { anwahlen: 60, erreicht: 100, nicht: 20, gatekeeper: 90, entscheider: 10, weitergeleitet: 80, termin: 5, negativ: 50 },
    {}
  );
  assert.ok(counts.erreicht + counts.nicht <= 60);
  assert.ok(counts.gatekeeper + counts.entscheider <= counts.erreicht);
  assert.ok(counts.weitergeleitet <= counts.gatekeeper);
  assert.ok(counts.termin + counts.negativ <= counts.erreicht);

  // Und die Seite setzt erzwungen — sonst zieht der Abgleich, der überall
  // das Maximum nimmt, die alte höhere Zahl sofort zurück.
  const quelle = readFileSync(new URL("../pages/call-tracker.js", import.meta.url), "utf8");
  // Beide Wege — direkt gesetzt und über die Rückfrage — speichern
  // erzwungen, regeln ein und räumen den Anruf-Verlauf ab.
  const direkt = quelle.slice(quelle.indexOf("function setzeZaehler"), quelle.indexOf("function setzeZaehler") + 1800);
  assert.match(direkt, /korrektur: true/);
  assert.match(direkt, /regleEin\(/);
  const ueberRueckfrage = quelle.slice(quelle.indexOf("function wendeRuecklaufAn"), quelle.indexOf("function wendeRuecklaufAn") + 700);
  assert.match(ueberRueckfrage, /korrektur: true/);
  assert.match(ueberRueckfrage, /leereVerlauf\(/);
});

// --- Eine Korrektur gilt überall -------------------------------------------

test("Korrektur schlägt Maximum: ein anderes Gerät zieht sie nicht hoch", () => {
  // Am Laptop stand 120, korrigiert wurde am Handy auf 60. Das Handy
  // schreibt die Korrektur mit Zeitstempel. Der Laptop hat noch seinen
  // alten Stand von 120 — und darf ihn NICHT zurückschreiben, sonst sehen
  // alle wieder 120.
  const laptop = { counts: { anwahlen: 120 }, reasons: {}, gespeichert_at: "2026-09-02T09:00:00.000Z" };
  const server = { counts: { anwahlen: 60 }, reasons: {}, korrigiert_at: "2026-09-02T11:00:00.000Z" };
  const gilt = wasGiltJetzt(laptop, server);
  assert.equal(gilt.counts.anwahlen, 60);
  assert.equal(gilt.quelle, "server");
});

test("Ohne Korrektur bleibt es beim Maximum", () => {
  // Der Normalfall: zwei Geräte zählen, keins darf das andere löschen.
  const geraet = { counts: { anwahlen: 40, termin: 1 }, reasons: {}, gespeichert_at: "2026-09-02T09:00:00.000Z" };
  const server = { counts: { anwahlen: 55, termin: 0 }, reasons: {}, korrigiert_at: null };
  const gilt = wasGiltJetzt(geraet, server);
  assert.equal(gilt.counts.anwahlen, 55);
  assert.equal(gilt.counts.termin, 1);
  assert.equal(gilt.quelle, "zusammengefuehrt");
});

test("Nach der Korrektur weitergezählte Anrufe gehen nicht verloren", () => {
  // Korrigiert um 11:00 auf 60, danach am selben Gerät weiter auf 63
  // gezählt: der neuere Stand des Geräts gewinnt wieder das Maximum.
  const geraet = { counts: { anwahlen: 63 }, reasons: {}, gespeichert_at: "2026-09-02T11:30:00.000Z" };
  const server = { counts: { anwahlen: 60 }, reasons: {}, korrigiert_at: "2026-09-02T11:00:00.000Z" };
  assert.equal(wasGiltJetzt(geraet, server).counts.anwahlen, 63);
});

test("Ein Gerät ohne Zeitstempel beugt sich der Korrektur", () => {
  // Stände aus der Zeit vor dieser Änderung tragen keinen Zeitpunkt. Im
  // Zweifel gilt die Korrektur — sie ist die bewusste Angabe eines Menschen,
  // der alte Stand nur ein Überbleibsel.
  const alt = { counts: { anwahlen: 120 }, reasons: {} };
  const server = { counts: { anwahlen: 60 }, reasons: {}, korrigiert_at: "2026-09-02T11:00:00.000Z" };
  assert.equal(wasGiltJetzt(alt, server).counts.anwahlen, 60);
  // Und ohne Serverzeile bleibt der lokale Stand, wie er ist.
  assert.equal(wasGiltJetzt(alt, null).counts.anwahlen, 120);
});

test("Der gespeicherte Tag merkt sich, wann er geschrieben wurde", () => {
  const speicher = new Map();
  globalThis.localStorage = {
    get length() { return speicher.size; },
    key: (i) => [...speicher.keys()][i],
    getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
    setItem: (k, v) => speicher.set(k, String(v)),
    removeItem: (k) => speicher.delete(k),
  };
  const prefix = storagePrefix("nutzer-2");
  saveDay(prefix, "callstats:2026-09-02", { anwahlen: 7 }, {});
  const geladen = loadDay(prefix, "callstats:2026-09-02", []);
  assert.equal(geladen.counts.anwahlen, 7);
  assert.ok(geladen.gespeichert_at, "Ohne Zeitpunkt lässt sich keine Korrektur einordnen.");
  delete globalThis.localStorage;
});

test("Anteilig kürzen zieht alles im selben Verhältnis mit", () => {
  // Der Fall: die Anwahlen von gestern sind im heutigen Tag gelandet. Dann
  // stecken die fremden Anrufe auch in erreicht, in den Terminen und in den
  // Gründen — ein blosses Auflösen der Widersprüche liesse sie stehen.
  const counts = { anwahlen: 120, erreicht: 20, nicht: 25, gatekeeper: 12, entscheider: 8, weitergeleitet: 5, termin: 3, negativ: 10 };
  const neu = ziehreAnteiligMit(counts, { kein_interesse: 7, kein_budget: 3 }, "anwahlen", 120, 60);
  assert.equal(neu.counts.anwahlen, 60);
  assert.equal(neu.counts.erreicht, 10);
  assert.equal(neu.counts.gatekeeper, 6);
  assert.equal(neu.counts.negativ, 5);
  // Kaufmännisch gerundet: aus 3 Terminen werden 2, nicht 1. Im Zweifel
  // bleibt lieber ein Termin zu viel stehen — den sieht man in der Liste,
  // den fehlenden nie wieder.
  assert.equal(neu.counts.termin, 2);
  // 7 halbiert wären 4 (kaufmännisch gerundet) — daraus wird 3, weil die
  // Gründe zusammen nicht über den 5 negativen Anrufen liegen dürfen. Das
  // Einregeln läuft nach dem anteiligen Kürzen noch einmal drüber.
  assert.equal(neu.reasons.kein_interesse, 3);
  assert.equal(neu.reasons.kein_interesse + neu.reasons.kein_budget, neu.counts.negativ);

  // Und das Ergebnis bleibt in sich stimmig.
  assert.ok(neu.counts.erreicht + neu.counts.nicht <= neu.counts.anwahlen);
  assert.ok(neu.counts.termin + neu.counts.negativ <= neu.counts.erreicht);
});

test("Anteilig kürzen greift nur nach unten", () => {
  const counts = { anwahlen: 60, erreicht: 20, termin: 3 };
  // Nach oben wird nichts mitgezogen: wer die Anwahlen erhöht, hat nicht
  // rückwirkend mehr Gespräche geführt.
  const hoch = ziehreAnteiligMit(counts, {}, "anwahlen", 60, 120);
  assert.equal(hoch.counts.anwahlen, 120);
  assert.equal(hoch.counts.erreicht, 20);
  assert.equal(hoch.counts.termin, 3);
  // Und von null aus gibt es kein Verhältnis.
  const ausNull = ziehreAnteiligMit({ anwahlen: 0, erreicht: 5 }, {}, "anwahlen", 0, 10);
  assert.equal(ausNull.counts.anwahlen, 10);
});

test("Die Rückfrage kommt nur, wenn wirklich etwas daran hängt", () => {
  const quelle = readFileSync(new URL("../pages/call-tracker.js", import.meta.url), "utf8");
  const fn = quelle.slice(quelle.indexOf("function setzeZaehler"), quelle.indexOf("function setzeZaehler") + 1400);
  // Nur bei kleinerer Zahl UND vorhandenen abhängigen Werten.
  assert.match(fn, /wert < alt/);
  assert.match(fn, /haengtWas/);
  // Und beide Antworten führen zu einer erzwungenen Korrektur.
  const anwenden = quelle.slice(quelle.indexOf("function wendeRuecklaufAn"), quelle.indexOf("function wendeRuecklaufAn") + 700);
  assert.match(anwenden, /ziehreAnteiligMit\(/);
  assert.match(anwenden, /regleEin\(/);
  assert.match(anwenden, /korrektur: true/);
});

// --- Was eine Telegram-Meldung wert ist ------------------------------------

test("Gemeldet wird, was den Kalender ändert oder ein Abschluss ist", () => {
  assert.equal(meldungsGrund("bearbeitet", { zeitpunktGeaendert: true }), "verschoben");
  assert.equal(meldungsGrund("status", { status: "abgesagt" }), "abgesagt");
  assert.equal(meldungsGrund("geloescht"), "geloescht");
  assert.equal(meldungsGrund("folgetermin"), "folgetermin");
  assert.equal(meldungsGrund("ergebnis", { outcome: "kunde" }), "kunde");
  // Jeder Grund hat einen Klartext für die Antwort der Route.
  Object.keys(MELDENSWERT).forEach((k) => assert.ok(MELDENSWERT[k].length > 3, k));
});

test("Alltägliches bleibt still", () => {
  // Eine nachgetragene Telefonnummer weckt nicht das ganze Team.
  assert.equal(meldungsGrund("bearbeitet", { zeitpunktGeaendert: false }), null);
  assert.equal(meldungsGrund("bearbeitet", {}), null);
  // Der Normalfall nach einem Termin.
  assert.equal(meldungsGrund("status", { status: "wahrgenommen" }), null);
  assert.equal(meldungsGrund("status", { status: "geplant" }), null);
  // Steht in der Auswertung; beim Folgetermin meldet sich der neue Termin.
  assert.equal(meldungsGrund("ergebnis", { outcome: "absage" }), null);
  assert.equal(meldungsGrund("ergebnis", { outcome: "follow_up" }), null);
  assert.equal(sollMeldung("ergebnis", { outcome: "absage" }), false);
});

test("Die Entscheidung fällt auf dem Server, nicht in der Seite", () => {
  // Sonst müsste jede aufrufende Stelle sie einzeln richtig treffen — und
  // die erste, die es vergisst, füllt den Kanal wieder.
  const route = readFileSync(new URL("../pages/api/lead-notify.js", import.meta.url), "utf8");
  assert.match(route, /meldungsGrund\(ereignis, details \|\| \{\}\)/);
  assert.match(route, /if \(!grund\) return res\.status\(200\)/);
});

// --- Kalender-Abo ----------------------------------------------------------

test("Der Abo-Kalender trägt mehrere Termine und einen Namen", () => {
  const feed = baueIcsFeed([
    { uid: "lead-1@x", titel: "Termin: Meier GmbH", start: "2026-09-10T09:00:00Z" },
    { uid: "event-2@x", titel: "Schulung", tagVon: "2026-09-12", tagBis: "2026-09-13" },
  ], { name: "HB — Houman" });

  assert.equal((feed.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(feed, /X-WR-CALNAME:HB — Houman/);
  // Beides, weil Apple das eine liest und Google das andere.
  assert.match(feed, /X-PUBLISHED-TTL:PT1H/);
  assert.match(feed, /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
  // Ganztägig endet am Folgetag des letzten Tages.
  assert.match(feed, /DTSTART;VALUE=DATE:20260912/);
  assert.match(feed, /DTEND;VALUE=DATE:20260914/);
  assert.ok(feed.endsWith("END:VCALENDAR\r\n"));
});

test("Abgesagte Termine verschwinden nicht, sie werden abgesagt", () => {
  // Fällt ein Termin einfach aus der Datei, bleibt er in manchen Kalendern
  // für immer stehen. CANCELLED räumt ihn dort weg.
  const feed = baueIcsFeed([{ uid: "lead-9@x", titel: "Termin: Weg", start: "2026-09-10T09:00:00Z", abgesagt: true }]);
  assert.match(feed, /STATUS:CANCELLED/);
});

test("Die UID eines Termins bleibt gleich, wenn er verschoben wird", () => {
  // Sonst legt der fremde Kalender den verschobenen Termin ein zweites Mal
  // an, statt den vorhandenen zu bewegen.
  const frueh = baueIcsFeed([{ uid: "lead-7@x", titel: "Termin", start: "2026-09-10T09:00:00Z" }]);
  const spaet = baueIcsFeed([{ uid: "lead-7@x", titel: "Termin", start: "2026-09-11T14:00:00Z" }]);
  assert.match(frueh, /UID:lead-7@x/);
  assert.match(spaet, /UID:lead-7@x/);
  assert.ok(frueh !== spaet);
});

test("Der Abo-Kalender liefert nur die Termine EINER Person", () => {
  // Der Link ist ein Geheimnis in einer Adresse und wird ohne Anmeldung
  // abgerufen. Käme dort heraus, was jemand als Führungskraft sehen darf,
  // gäbe ein weitergeleiteter Link unbemerkt die halbe Organisation preis.
  const route = readFileSync(new URL("../pages/api/kalender-abo.js", import.meta.url), "utf8");
  assert.match(route, /eq\("kalender_token", token\)/);
  assert.match(route, /eq\("person_id", profil\.id\)/);
  // Der erweiterte Umfang hängt an der Datenbank, nicht an der Adresse:
  // stünde er dort, hinge jeder "&umfang=team" an und bekäme, was ihm nicht
  // zusteht.
  assert.match(route, /profil\.kalender_umfang === "team" \|\| profil\.kalender_umfang === "auswahl"/);
  // Die gespeicherte Auswahl ist ein Filter, keine Berechtigung: sie wird
  // gegen das geschnitten, was die Rolle JETZT hergibt.
  assert.match(route, /if \(gewuenscht && !gewuenscht\.has\(id\)\) return;/);
  assert.ok(!/req\.query\.umfang/.test(route),
    "Der Umfang darf nicht aus der Adresse kommen — sonst erweitert ihn jeder selbst.");
  // Und die Rolle wird bei JEDEM Abruf neu geprüft, nicht einmal beim
  // Einrichten: wer die Teamleitung abgibt, verliert den Kalender sofort.
  assert.match(route, /istFuehrungsrolle\(profil\)/);
  assert.match(route, /eq\("created_by", profil\.id\)/);
  // Die Mandanten-Grenze hält auch bei Team-Mitgliedern.
  assert.match(route, /organization_id !== profil\.organization_id/);
  // Ohne die bewusste Umstellung bleibt es bei den eigenen Terminen: die
  // Personenliste startet mit genau einer Kennung.
  assert.match(route, /new Set\(\[profil\.id\]\)/);
  // Und kein Zwischenspeicher, sonst hinkt der Kalender hinterher.
  assert.match(route, /no-store/);
  assert.match(route, /noindex/);
});

// --- Fremde Kalender lesen -------------------------------------------------

const ICS = (...zeilen) => ["BEGIN:VCALENDAR", ...zeilen, "END:VCALENDAR"].join("\r\n");
const FENSTER = { vonMs: Date.parse("2026-09-01"), bisMs: Date.parse("2026-10-01") };

test("Fremder Kalender: Ortszeit wird nach UTC gerechnet, nicht abgetippt", () => {
  // 09:00 deutscher Sommerzeit sind 07:00 UTC. Wer das "Z" einfach annimmt,
  // legt jeden Termin im Sommer zwei Stunden daneben.
  assert.equal(leseZeitpunkt("20260907T090000", { TZID: "Europe/Berlin" }).ms, Date.parse("2026-09-07T07:00:00Z"));
  // Im Winter ist es eine Stunde.
  assert.equal(leseZeitpunkt("20260115T090000", { TZID: "Europe/Berlin" }).ms, Date.parse("2026-01-15T08:00:00Z"));
  // Mit Z ist es schon UTC.
  assert.equal(leseZeitpunkt("20260907T090000Z").ms, Date.parse("2026-09-07T09:00:00Z"));
  // Ohne Zeitzone gilt die deutsche, denn hier wird gearbeitet.
  assert.equal(leseZeitpunkt("20260907T090000").ms, Date.parse("2026-09-07T07:00:00Z"));
  // Reine Datumsangabe heisst ganztägig.
  assert.deepEqual(leseZeitpunkt("20260910"), { ms: Date.parse("2026-09-10T00:00:00Z"), ganztags: true });
});

test("Fremder Kalender: gefaltete Zeilen werden zusammengesetzt", () => {
  // Lange Titel werden umgebrochen. Wer das übersieht, bekommt
  // abgeschnittene Titel und kaputte Datumsangaben.
  const lang = "Quartalsgespräch mit dem gesamten Vertriebsteam und der Leitung";
  const roh = ICS("BEGIN:VEVENT", "UID:x@y", `SUMMARY:${lang.slice(0, 30)}`, ` ${lang.slice(30)}`,
    "DTSTART:20260907T090000Z", "END:VEVENT");
  const [t] = leseIcs(roh, FENSTER);
  assert.equal(t.titel, lang.slice(0, 30) + lang.slice(30));
});

test("Fremder Kalender: wiederkehrende Termine stehen in jeder Woche", () => {
  // Ein wöchentliches Meeting steht EINMAL in der Datei, mit einer Regel.
  // Ohne deren Auflösung fehlt es in jeder Woche ausser der ersten.
  const roh = ICS("BEGIN:VEVENT", "UID:m@y", "SUMMARY:Jour fixe",
    "DTSTART;TZID=Europe/Berlin:20260907T090000", "DTEND;TZID=Europe/Berlin:20260907T100000",
    "RRULE:FREQ=WEEKLY;COUNT=3", "END:VEVENT");
  const termine = leseIcs(roh, FENSTER);
  assert.equal(termine.length, 3);
  assert.deepEqual(termine.map((t) => t.beginn.slice(0, 10)), ["2026-09-07", "2026-09-14", "2026-09-21"]);
  // Jede Ausprägung braucht eine eigene Kennung, sonst überschreiben sie
  // sich beim Speichern gegenseitig.
  assert.equal(new Set(termine.map((t) => t.uid)).size, 3);
});

test("Fremder Kalender: UNTIL und INTERVAL werden beachtet", () => {
  const zwei = loeseWiederholung(Date.parse("2026-09-07T07:00:00Z"), "FREQ=WEEKLY;INTERVAL=2",
    { bisMs: Date.parse("2026-10-01") });
  assert.deepEqual(zwei.map((ms) => new Date(ms).toISOString().slice(0, 10)),
    ["2026-09-07", "2026-09-21"]);
  const bisEnde = loeseWiederholung(Date.parse("2026-09-07T07:00:00Z"), "FREQ=DAILY;UNTIL=20260909T235959Z",
    { bisMs: Date.parse("2026-10-01") });
  assert.equal(bisEnde.length, 3);
});

test("Fremder Kalender: Abgesagtes und Ausserhalb bleiben draussen", () => {
  const roh = ICS(
    "BEGIN:VEVENT", "UID:a@y", "SUMMARY:Abgesagt", "DTSTART:20260907T090000Z", "STATUS:CANCELLED", "END:VEVENT",
    "BEGIN:VEVENT", "UID:b@y", "SUMMARY:Letztes Jahr", "DTSTART:20250907T090000Z", "END:VEVENT",
    "BEGIN:VEVENT", "UID:c@y", "SUMMARY:Zählt", "DTSTART:20260907T090000Z", "END:VEVENT",
  );
  const termine = leseIcs(roh, FENSTER);
  assert.deepEqual(termine.map((t) => t.titel), ["Zählt"]);
});

test("Fremder Kalender: kaputte Daten werfen nicht", () => {
  assert.deepEqual(leseIcs("", FENSTER), []);
  assert.deepEqual(leseIcs("völliger Unsinn ohne Kalender", FENSTER), []);
  // Ein Termin ohne Beginn wird übersprungen, der Rest bleibt lesbar.
  const roh = ICS("BEGIN:VEVENT", "SUMMARY:Ohne Datum", "END:VEVENT",
    "BEGIN:VEVENT", "UID:ok@y", "SUMMARY:Gut", "DTSTART:20260907T090000Z", "END:VEVENT");
  assert.deepEqual(leseIcs(roh, FENSTER).map((t) => t.titel), ["Gut"]);
});

test("Fremde Kalender: keine Adressen ins eigene Netz", () => {
  // Ohne diese Prüfung liesse sich unser Server dazu bringen, interne
  // Adressen abzurufen und das Ergebnis auszuliefern.
  ["http://localhost/x.ics", "https://127.0.0.1/x.ics", "http://10.0.0.5/x.ics",
   "https://192.168.1.9/x.ics", "http://172.16.0.1/x.ics", "https://server.local/x.ics",
  ].forEach((u) => assert.ok(pruefeUrl(u).fehler, u));
  // Und keine anderen Protokolle.
  assert.ok(pruefeUrl("file:///etc/passwd").fehler);
  assert.ok(pruefeUrl("javascript:alert(1)").fehler);
  assert.ok(pruefeUrl("").fehler);
  // webcal:// ist die übliche Form aus Apple und Outlook — die wird
  // umgeschrieben statt abgelehnt.
  assert.equal(pruefeUrl("webcal://p12.calendar.icloud.com/x.ics").url, "https://p12.calendar.icloud.com/x.ics");
  assert.ok(pruefeUrl("https://calendar.google.com/calendar/ical/abc/basic.ics").url);
});

test("Fremde Kalender: nicht bei jedem Seitenaufruf neu holen", () => {
  const jetzt = Date.parse("2026-09-03T12:00:00Z");
  assert.equal(istFaellig(null, jetzt), true);
  assert.equal(istFaellig(new Date(jetzt - FRISCH_MS - 1000).toISOString(), jetzt), true);
  assert.equal(istFaellig(new Date(jetzt - 60000).toISOString(), jetzt), false);
  // Ein unlesbares Datum lieber neu holen als nie wieder.
  assert.equal(istFaellig("Unsinn", jetzt), true);
});

test("Fremde Kalender: der Titel wird auf dem Server entschieden", () => {
  // Eine Zugriffsregel kann keine einzelne Spalte ausblenden. Stünde die
  // Entscheidung in der Anzeige, käme der Titel trotzdem über die Leitung
  // und stünde in jedem Netzwerk-Protokoll.
  const route = readFileSync(new URL("../pages/api/org-kalender.js", import.meta.url), "utf8");
  assert.match(route, /const mitTitel = eigener \|\| quelle\?\.sichtbarkeit === "titel"/);
  assert.match(route, /titel: mitTitel \? \(t\.titel \|\| "Termin"\) : "Belegt"/);
  // Aufgefrischt werden nur die EIGENEN Kalender.
  assert.match(route, /from\("externe_kalender"\)[\s\S]{0,200}eq\("user_id", userId\)/);
});

// --- Gründe aus dem Team ---------------------------------------------------

test("Grund-Vorschläge: Freitext wird gesäubert, Unsinn fällt raus", () => {
  assert.equal(saeubere("  Vertrag   läuft noch  "), "Vertrag läuft noch");
  // Nur Satzzeichen ist kein Grund — sonst stehen "..." und "???" in der
  // Liste, und niemand kann sie übernehmen.
  assert.equal(saeubere("..."), "");
  assert.equal(saeubere("???"), "");
  assert.equal(saeubere(""), "");
  assert.equal(saeubere(null), "");
  assert.ok(saeubere("x".repeat(200)).length <= 60);
});

test("Grund-Vorschläge: gleiche Gründe werden zusammengefasst", () => {
  // Ohne das stünde derselbe Grund dreimal mit Anzahl 1 in der Liste — und
  // damit sähe kein einziger Vorschlag wichtig aus.
  assert.equal(vergleichsForm("Kein Interesse"), vergleichsForm("kein  interesse!"));
  const gruppen = fasseZusammen([
    { id: "1", text: "Kein Interesse", user_id: "a", created_at: "2026-09-01" },
    { id: "2", text: "kein interesse!", user_id: "b", created_at: "2026-09-02" },
    { id: "3", text: "Vertrag läuft noch", user_id: "a", created_at: "2026-09-03" },
    { id: "4", text: "...", user_id: "a", created_at: "2026-09-03" },
  ]);
  assert.equal(gruppen.length, 2);
  assert.equal(gruppen[0].anzahl, 2);
  assert.equal(gruppen[0].personen, 2);
  assert.deepEqual(gruppen[0].ids.sort(), ["1", "2"]);
  // Häufigstes zuerst — danach entscheidet die Leitung schneller.
  assert.ok(gruppen[0].anzahl >= gruppen[1].anzahl);
});

test("Grund-Vorschläge: der Schlüssel überschreibt keine bestehende Kategorie", () => {
  const vorhanden = [{ key: "preis", label: "Preis" }, { key: "kein_interesse", label: "Kein Interesse" }];
  assert.equal(schluesselFuer("Vertrag läuft noch", vorhanden), "vertrag_lauft_noch");
  // Derselbe Name noch einmal: durchnummerieren statt still überschreiben —
  // sonst verschwinden die bisher darauf gebuchten Zahlen.
  assert.equal(schluesselFuer("Kein Interesse", vorhanden), "kein_interesse_2");
  assert.ok(schluesselFuer("!!!", vorhanden).length > 0);
});

test("Verwaltung: jede Seite hat genau einen Ort", () => {
  // Vorher standen dreizehn gleichrangige Reiter nebeneinander, darunter
  // drei, die alle nach Beobachtung klingen. Wer nicht wusste, wo etwas
  // steht, landete dreimal falsch.
  const quelle = readFileSync(new URL("../components/AdminTabs.js", import.meta.url), "utf8");
  const routen = [...quelle.matchAll(/route: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(routen).size, routen.length,
    `Diese Seite steht in mehr als einem Bereich: ${routen.filter((r, i) => routen.indexOf(r) !== i).join(", ")}`);

  // Jede Seite sagt, wofür sie da ist — sonst lassen sich Nachbarn wie
  // "Aktivitäten" und "Anmeldungen" nur durch Ausprobieren unterscheiden.
  const seiten = [...quelle.matchAll(/\{ key: "[^"]+", label: "[^"]+", route: "[^"]+", icon: "[^"]+",\s*\n?\s*zweck: "([^"]+)"/g)];
  assert.equal(seiten.length, routen.length, "Es gibt Seiten ohne Zweck-Beschreibung.");

  // Und der Betriebs-Bereich bleibt dem Plattform-Betreiber vorbehalten.
  assert.match(quelle, /nurBetreiber: true/);
  assert.match(quelle, /istBetreiber \? \[\.\.\.BEREICHE, BETRIEB\] : BEREICHE/);

  // Kein Reiter für Seiten, die man einmal je Ordner braucht: die
  // Sidebar-Struktur hängt bei "Kurse & Module", wo sie gebraucht wird.
  assert.ok(!routen.includes("/admin/navigation"),
    "Die Sidebar-Verwaltung steht wieder als gleichrangiger Reiter — sie gehört zu den Inhalten.");
  // Sie ist keine eigene Seite mehr, sondern klappt bei "Kurse & Module"
  // auf. Ein zurückgelassener Link würde ins Leere führen.
  assert.ok(!readFileSync(new URL("../pages/admin/content.js", import.meta.url), "utf8").includes("/admin/navigation"),
    "Es gibt noch einen Link auf die gelöschte Navigationsseite.");
  // Und die Vertriebsauswertung steht NICHT in der Verwaltung: sie ist ein
  // eigener Reiter in der Sidebar, weil sie täglich gelesen wird — die
  // Verwaltung betritt man selten.
  assert.ok(!routen.includes("/auswertung"),
    "Die Vertriebsauswertung steht wieder in der Verwaltung — sie gehört in die Sidebar.");
  const layout = readFileSync(new URL("../components/Layout.js", import.meta.url), "utf8");
  assert.match(layout, /route: "\/auswertung", is_builtin: true, requires_manager: true/);

  // Jede verlinkte Verwaltungsseite existiert auch.
  routen.filter((r) => r.startsWith("/admin/")).forEach((r) => {
    const datei = new URL(`../pages${r}.js`, import.meta.url);
    assert.ok(readFileSync(datei, "utf8").length > 0, `Seite fehlt: ${r}`);
  });
});

test("Kein Menüpunkt zeigt auf eine Seite, die es nicht gibt", () => {
  // Ein Menüpunkt lebt in der Datenbank weiter, auch wenn die Seite dazu
  // gelöscht wurde — und führt dann ins Leere. Genau das ist zweimal
  // passiert. Deshalb filtert die Academy solche Routen immer aus, statt
  // sich darauf zu verlassen, dass jemand die Migration einspielt.
  const layout = readFileSync(new URL("../components/Layout.js", import.meta.url), "utf8");
  const entfernt = layout.match(/ENTFERNTE_SEITEN = new Set\(\[([\s\S]*?)\]\)/)?.[1] || "";
  const routen = [...entfernt.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(routen.length > 0, "Die Liste entfernter Seiten ist leer — sie hält tote Menüpunkte auf.");

  // Was dort steht, darf es tatsächlich nicht mehr geben.
  routen.forEach((r) => {
    assert.throws(() => readFileSync(new URL(`../pages${r}.js`, import.meta.url), "utf8"),
      `${r} steht als entfernt, die Seite existiert aber noch.`);
  });

  // Und der Filter greift, bevor irgendetwas anderes filtert.
  assert.match(layout, /\.filter\(\(n\) => !ENTFERNTE_SEITEN\.has\(n\.route\)\)/);
});

// --- Tempo: wie zügig telefoniert wird -------------------------------------

// Sommerzeit: UTC+2, also ist 07:00 UTC gleich 09:00 in Deutschland.
const ANWAHL = (stunde, minute) => ({
  art: "anwahl",
  erfasst_at: new Date(Date.UTC(2026, 8, 1, stunde - 2, minute)).toISOString(),
});

test("Tempo: eine Mittagspause zählt nicht als Telefonzeit", () => {
  // Fünf Anrufe am Vormittag, drei am Mittag, dazwischen über zwei Stunden
  // Pause. Ohne Pausengrenze wäre die "aktive Zeit" die ganze Spanne — und
  // das Tempo damit ein Viertel des tatsächlichen.
  const t = tempoAuswertung([
    ANWAHL(9, 0), ANWAHL(9, 5), ANWAHL(9, 12), ANWAHL(9, 20), ANWAHL(9, 26),
    ANWAHL(12, 0), ANWAHL(12, 4), ANWAHL(12, 9),
  ]).tage[0];

  assert.equal(t.anzahl, 8);
  assert.equal(t.ersterAnruf, "09:00");
  assert.equal(t.letzterAnruf, "12:09");
  assert.equal(t.aktiveMinuten, 35);       // nicht 189 — die Pause fehlt darin
  assert.equal(t.pausen, 1);
  assert.ok(t.pausenMinuten > 120);
  // Abstände am Hörer: 5, 7, 8, 6, 4, 5 — der mittlere Wert liegt bei 6.
  assert.equal(t.medianAbstand, 6);
  assert.ok(t.proStunde > 12 && t.proStunde < 15);
});

test("Tempo: der Median lässt sich von einem Ausreisser nicht verbiegen", () => {
  // Abstände 2, 3, 4 und einer knapp unter der Pausengrenze. Der
  // Durchschnitt wäre 7 — der Median sagt, wie der Alltag wirklich aussieht.
  const t = tempoAuswertung([
    ANWAHL(9, 0), ANWAHL(9, 2), ANWAHL(9, 5), ANWAHL(9, 9), ANWAHL(9, 28),
  ]).tage[0];
  // Abstände 2, 3, 4, 19: der Durchschnitt wäre 7 und damit fast doppelt so
  // hoch wie der Alltag. Der Median bleibt bei 4.
  assert.equal(t.medianAbstand, 4);
  assert.equal(t.aktiveMinuten, 28);
});

test("Tempo: zu wenige Anrufe gelten nicht als belastbar", () => {
  const wenig = tempoAuswertung([ANWAHL(9, 0), ANWAHL(9, 5)]);
  assert.equal(wenig.tage[0].belastbar, false);
  assert.equal(wenig.gesamt.fruehesterStart, null);   // nichts behaupten
  assert.equal(wenig.gesamt.tageMitDaten, 0);
  assert.ok(MINDESTENS_ANRUFE >= 3);
  assert.ok(PAUSE_AB_MINUTEN >= 10);
});

test("Tempo: ohne Anwahl-Ereignisse bleibt alles leer", () => {
  // Termine und Absagen tragen zwar auch Zeitstempel, sagen aber nichts
  // über das Tempo der Anwahlen.
  const nurAndere = tempoAuswertung([{ art: "termin", erfasst_at: "2026-09-01T09:00:00Z" }]);
  assert.deepEqual(nurAndere.tage, []);
  assert.equal(nurAndere.gesamt.proStunde, null);
  assert.equal(dauerText(null), "—");
  assert.equal(dauerText(35), "35 min");
  assert.equal(dauerText(105), "1 h 45 min");
  assert.equal(dauerText(120), "2 h");
});

// --- XP aus dem Call Tracker -----------------------------------------------

test("XP gibt es für Ergebnisse, nicht fürs Klicken", () => {
  // 200-mal auf "Anwahl starten" tippen, ohne je ein Gespräch zu führen:
  // Wer dafür XP bekäme, klickt statt zu telefonieren, und die Rangliste
  // wäre wertlos. Es bleibt beim einmaligen Tagesbonus.
  const nurGeklickt = xpFuerTag({ anwahlen: 200 }, {});
  assert.equal(nurGeklickt, CALL_XP.tagesbonus);

  // Ein echter Arbeitstag: 60 Anwahlen, 25 Gespräche, 2 Termine,
  // 20 Absagen mit Grund.
  const echt = xpFuerTag({ anwahlen: 60, erreicht: 25, termin: 2, negativ: 20 }, { kein_interesse: 15, kein_budget: 5 });
  assert.equal(echt, 10 + 25 * CALL_XP.erreicht + 2 * CALL_XP.termin + 20 * CALL_XP.negativMitGrund);
  assert.ok(echt > nurGeklickt * 5);
});

test("XP für Absagen nur mit erfasstem Grund", () => {
  // Für das blosse Wegklicken gibt es nichts — sonst lohnt sich das
  // Abkürzen des Assistenten.
  const ohneGrund = xpFuerTag({ erreicht: 0, negativ: 10 }, {});
  const mitGrund = xpFuerTag({ erreicht: 0, negativ: 10 }, { kein_interesse: 10 });
  assert.equal(ohneGrund, 0);
  assert.equal(mitGrund, 10 * CALL_XP.negativMitGrund);
});

test("XP ist je Tag gedeckelt", () => {
  const wahnsinn = xpFuerTag({ anwahlen: 500, erreicht: 300, termin: 50 }, {});
  assert.equal(wahnsinn, CALL_XP.tagesLimit);
});

test("XP wird nie doppelt und nie negativ gutgeschrieben", () => {
  const counts = { anwahlen: 60, erreicht: 25, termin: 2 };
  const anspruch = xpFuerTag(counts, {});
  // Beim ersten Mal alles, danach nichts mehr.
  assert.equal(offeneXp(counts, {}, 0), anspruch);
  assert.equal(offeneXp(counts, {}, anspruch), 0);
  // Nach einer Korrektur nach unten wird nichts zurückgefordert: wer für
  // echte Arbeit XP bekommen hat, soll es nicht wieder verlieren.
  assert.equal(offeneXp({ anwahlen: 10 }, {}, anspruch), 0);
});

test("Tempo: Unterbrechungen werden gezählt, nicht gemeldet", () => {
  // Kein Pausenknopf: eine Lücke über der Grenze IST eine Unterbrechung.
  // Ein Knopf, den man vergisst, verfälscht die Daten immer in die
  // schmeichelhafte Richtung — perfektes Tempo bei zwei Anrufen.
  const g = tempoAuswertung([
    ANWAHL(9, 0), ANWAHL(9, 5), ANWAHL(9, 10), ANWAHL(9, 15), ANWAHL(9, 20),
    ANWAHL(11, 0), ANWAHL(11, 5),
    ANWAHL(14, 0), ANWAHL(14, 6),
  ]).gesamt;
  assert.equal(g.pausen, 2);              // zweimal längere Lücke
  assert.ok(g.pausenMinuten > 200);
  assert.equal(g.pausenJeTag, 2);         // an einem Tag mit Daten
});

// --- Kursergebnisse --------------------------------------------------------

const KURSE = [
  { id: "a", title: "Kurs A", modules: [{ id: "a1", title: "A1" }, { id: "a2", title: "A2" }] },
  { id: "b", title: "Kurs B", modules: [{ id: "b1", title: "B1" }] },
];

test("Kursstand: Fortschritt und Schnitt sind zwei verschiedene Zahlen", () => {
  // Zwei perfekte Module sind kein grösserer Wissensstand als zwölf
  // mittelmässige — und kein kleinerer. Beide Zahlen müssen nebeneinander
  // stehen, sonst zieht man aus einer allein den falschen Schluss.
  const perfektAberWenig = kursStand(
    [{ course_id: "a", module_id: "a1", mc_score: 10, mc_total: 10, created_at: "2026-09-01" }], [], KURSE
  );
  assert.equal(perfektAberWenig.module, 1);
  assert.equal(perfektAberWenig.fortschritt, 33);   // 1 von 3 Modulen
  assert.equal(perfektAberWenig.schnitt, 100);

  const vielAberMittel = kursStand([
    { course_id: "a", module_id: "a1", mc_score: 5, mc_total: 10, created_at: "2026-09-01" },
    { course_id: "a", module_id: "a2", mc_score: 6, mc_total: 10, created_at: "2026-09-02" },
    { course_id: "b", module_id: "b1", mc_score: 5, mc_total: 10, created_at: "2026-09-03" },
  ], [], KURSE);
  assert.equal(vielAberMittel.fortschritt, 100);
  assert.equal(vielAberMittel.schnitt, 53);
});

test("Kursstand: Prozent der Punkte, nicht Punkte", () => {
  // Module sind unterschiedlich lang: 8 von 10 ist etwas anderes als 8 von 20.
  const kurz = kursStand([{ course_id: "a", module_id: "a1", mc_score: 8, mc_total: 10 }], [], KURSE);
  const lang = kursStand([{ course_id: "a", module_id: "a1", mc_score: 8, mc_total: 20 }], [], KURSE);
  assert.equal(kurz.schnitt, 80);
  assert.equal(lang.schnitt, 40);
});

test("Kursstand: ohne ein einziges Modul gibt es keinen Schnitt", () => {
  const leer = kursStand([], [], KURSE);
  assert.equal(leer.schnitt, null);      // und nicht 0 %
  assert.equal(leer.module, 0);
  assert.equal(leer.zuletzt, null);
  assert.ok(moduleGesamt(KURSE) === 3);
});

test("Kursdetails: offene Module bleiben sichtbar", () => {
  // Der Blick der Führungskraft ist "was fehlt noch" — ein Modul, das nicht
  // gemacht wurde, darf deshalb nicht einfach fehlen.
  const details = kursDetails(
    [{ course_id: "a", module_id: "a1", mc_score: 9, mc_total: 10 }], [], KURSE
  );
  const kursA = details.find((k) => k.id === "a");
  assert.equal(kursA.gemacht, 1);
  assert.equal(kursA.gesamt, 2);
  assert.equal(kursA.module.find((m) => m.id === "a2").gemacht, false);
  assert.equal(kursA.module.find((m) => m.id === "a1").ergebnis, 90);
  assert.equal(kursA.pruefung, null);
});
