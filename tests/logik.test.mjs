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
import { buchungslink, normalisiere, kurzform } from "../lib/buchungslink.js";
import { werteZielAus, zielStatus, bilanz } from "../lib/zielAuswertung.js";
import { berechneQuoten, prozentText, zahlText, QUOTEN_SPALTEN, quotenText } from "../lib/quoten.js";
import { korrigiere, regleEin, zieheAnrufAb, ziehreAnteiligMit, GRUNDLAGEN } from "../lib/anrufKorrektur.js";
import { summiere, trichter, engpass, benchmark, impactAnalyse, empfehlungen } from "../lib/auswertung.js";
import { meldungsGrund, sollMeldung, MELDENSWERT } from "../lib/terminMeldung.js";
import { xpFuerTag, offeneXp, CALL_XP } from "../lib/callXp.js";
import { kursStand, kursDetails, moduleGesamt } from "../lib/kursstand.js";
import { fristTage, verbleibendeTage, istAbgelaufen, fristText, STANDARD_FRIST_TAGE } from "../lib/aufnahmeFrist.js";
import { resolveLeitfaden, hatLeitfaden, STANDARD_LEITFADEN } from "../lib/leitfaden.js";
import { EMAIL_STATUS, STATUS_REIHENFOLGE, istErledigt, gueltigeAdresse, marketingQuote } from "../lib/emailKontakt.js";
import { zustandFuer, istGescheitert, darfNochSenden, ZUSTELLUNG_LABELS } from "../lib/zustellung.js";
import { artVon, stufenAuswertung, TERMIN_ARTEN, SCHRITTE, WEGMARKEN, kalenderTitel, kuerzelVon, terminFarbe, rueckeVor, verlaufVon, fortschritt, erreichteMarken, darfSchritt, schrittPatch, istVerloren, checkinFaellig, CHECKIN_NACH_TAGEN, istKundeGeworden } from "../lib/terminArt.js";
import { fuelleVorlage, unbekanntePlatzhalter, brauchtNachfassen, liegtSeitTagen, NACHFASSEN_AB_TAGEN, PLATZHALTER, fertigeMail, vorlagenErfolg, BEISPIEL_KONTAKT, alsHtml, doppelt, werteFuerKontakt, anredeText, nachnameAus, mitSchluss, verschiebeVorlage, nachNamen, nachErfolg } from "../lib/marketingVorlage.js";
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

// Die jüngste Migration, die eine bestimmte Regel setzt. Migrationen sind
// durchnummeriert, also gewinnt die höchste Nummer.
function juengsteMigrationMit(regel) {
  const ordner = new URL("../supabase/", import.meta.url);
  const treffer = readdirSync(ordner)
    .filter((n) => /^migration_\d+/.test(n) && readFileSync(new URL(n, ordner), "utf8").includes(`add constraint ${regel}`))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  assert.ok(treffer.length, `Keine Migration setzt ${regel}`);
  return readFileSync(new URL(treffer[treffer.length - 1], ordner), "utf8");
}

test("die Datenbank erlaubt genau die Kennzahlen, die es im Code gibt", () => {
  // Diese Liste steht zwangsläufig zweimal: einmal als Auswahl im Code, einmal
  // als check-Regel in der Datenbank. Läuft sie auseinander, lehnt die
  // Datenbank neue Ziele mit einem Constraint-Fehler ab — im Manager sieht man
  // dann nur eine kryptische Meldung.
  // Immer die JÜNGSTE Migration, die den check setzt — automatisch gesucht,
  // weil eine fest eingetragene Dateiname bei der nächsten Erweiterung
  // wieder auf eine überholte Liste zeigt.
  const sql = juengsteMigrationMit("team_goals_metric_check");
  const block = sql.slice(sql.indexOf("metric in ("), sql.indexOf("));", sql.indexOf("metric in (")));
  const erlaubt = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(erlaubt, [...GOAL_METRIC_KEYS].sort());
});

test("der Wettbewerbs-Maßstab kennt dieselben Kennzahlen plus XP", () => {
  // Zweite check-Regel, zweite Gelegenheit zum Auseinanderlaufen: stimmt sie
  // nicht, lässt sich die Einstellung in der Verwaltung schlicht nicht
  // speichern.
  const sql = juengsteMigrationMit("organizations_team_ranking_metric_check");
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

// --- E-Mail-Kontakte -------------------------------------------------------

test("E-Mail gewünscht ist ein eigener Ausgang, kein Ablehnungsgrund", () => {
  // Der Kern der Sache: als Grund gezählt gälte der Anruf in jeder
  // Statistik als verloren, dabei ist ein Kontakt entstanden.
  const zaehler = FIELDS.map((f) => f.key);
  assert.ok(zaehler.includes("email"));
  // Und der neue Ausgang hängt an "erreicht" wie Termin und Absage: die
  // Summe darf nie grösser sein als die geführten Gespräche.
  const { counts } = regleEin({ erreicht: 10, termin: 5, negativ: 5, email: 5 }, {});
  assert.ok(counts.termin + counts.negativ + counts.email <= 10);
});

test("E-Mail-Kontakte: Status heissen überall gleich", () => {
  STATUS_REIHENFOLGE.forEach((s) => assert.ok(EMAIL_STATUS[s], `${s} hat keine Bezeichnung`));
  assert.equal(Object.keys(EMAIL_STATUS).length, STATUS_REIHENFOLGE.length);
  assert.equal(istErledigt("offen"), false);
  assert.equal(istErledigt("verschickt"), false);   // da ist noch etwas offen
  assert.equal(istErledigt("termin"), true);
});

test("E-Mail-Kontakte: Adressprüfung und Trefferquote", () => {
  assert.ok(gueltigeAdresse("max@firma.de"));
  assert.ok(!gueltigeAdresse("max@firma"));
  assert.ok(!gueltigeAdresse("max firma.de"));
  assert.ok(!gueltigeAdresse(""));

  // Ohne bearbeitete Kontakte gibt es keine Quote — und nicht null Prozent.
  assert.equal(marketingQuote([{ status: "offen" }]), null);
  assert.equal(marketingQuote([]), null);
  assert.equal(marketingQuote([
    { status: "termin" }, { status: "keine_antwort" }, { status: "kein_interesse" }, { status: "offen" },
  ]), 33);
});

// --- Mail-Vorlagen und Wiedervorlage ---------------------------------------

test("Vorlage: fehlt ein Wert, fällt die halbe Zeile nicht als Rumpf zurück", () => {
  // "Firma:" ohne Firma ist genau das, woran ein Kunde eine Serienmail
  // erkennt. Die ganze Zeile muss weg.
  const text = "Hallo {{name}},\nFirma: {{firma}}\n\naus unserem Gespräch: {{notiz}}\n\nViele Grüße\n{{vertriebler}}";
  const gefuellt = fuelleVorlage(text, { name: "Max", notiz: "will Infos", vertriebler: "Ernestine" });
  assert.ok(!gefuellt.includes("Firma"));
  assert.ok(!gefuellt.includes("{{"));
  assert.ok(gefuellt.startsWith("Hallo Max,"));
  assert.ok(gefuellt.includes("will Infos"));
  assert.ok(gefuellt.endsWith("Ernestine"));
});

test("Vorlage: eine Zeile mit Text bleibt, auch wenn ein Wert fehlt", () => {
  // Nur wenn die Zeile AUSSER dem Platzhalter nichts trägt, fällt sie weg.
  const gefuellt = fuelleVorlage("Wir sprachen über {{notiz}} und melden uns.", {});
  assert.ok(gefuellt.includes("Wir sprachen über"));
  assert.ok(gefuellt.includes("melden uns"));
});

test("Vorlage: Tippfehler in Platzhaltern werden erkannt", () => {
  assert.deepEqual(unbekanntePlatzhalter("Hallo {{vorname}}, {{name}}"), ["vorname"]);
  assert.deepEqual(unbekanntePlatzhalter("Hallo {{name}}"), []);
  PLATZHALTER.forEach((p) => assert.deepEqual(unbekanntePlatzhalter(`{{${p.schluessel}}}`), []));
});

test("Nachfassen: nur verschickte Mails ohne Ergebnis", () => {
  const jetzt = new Date("2026-09-20T10:00:00Z");
  const vorTagen = (n) => new Date(jetzt.getTime() - n * 86400000).toISOString();

  // Offen heisst: es ist noch gar nichts passiert. Das ist unerledigt,
  // keine Wiedervorlage.
  assert.equal(brauchtNachfassen({ status: "offen", verschickt_am: vorTagen(10) }, jetzt), false);
  // Frisch verschickt: niemand fasst nach zwei Tagen nach.
  assert.equal(brauchtNachfassen({ status: "verschickt", verschickt_am: vorTagen(2) }, jetzt), false);
  // Überfällig.
  assert.equal(brauchtNachfassen({ status: "verschickt", verschickt_am: vorTagen(NACHFASSEN_AB_TAGEN) }, jetzt), true);
  // Erledigt bleibt erledigt.
  assert.equal(brauchtNachfassen({ status: "termin", verschickt_am: vorTagen(30) }, jetzt), false);
  assert.equal(liegtSeitTagen(vorTagen(6), jetzt), 6);
  assert.equal(liegtSeitTagen(null, jetzt), null);
});

test("Kalender-Abo: Erinnerung nur dort, wo sie Sinn ergibt", () => {
  // Ein Abo-Kalender wird abgeholt, nicht zugestellt — die Academy kann
  // nichts auf ein Telefon schicken. Was sie kann: den Alarm mitliefern,
  // damit das Telefon ihn selbst stellt.
  const feed = baueIcsFeed([
    { uid: "a@b", titel: "Termin: Max", start: "2026-09-25T13:00:00Z" },
    { uid: "c@d", titel: "Feiertag", tagVon: "2026-09-26" },
    { uid: "e@f", titel: "Abgesagt", start: "2026-09-27T09:00:00Z", abgesagt: true },
  ]);
  const alarme = feed.split("\r\n").filter((z) => z === "BEGIN:VALARM").length;
  assert.equal(alarme, 1, "Nur der Termin mit Uhrzeit bekommt einen Alarm.");
  assert.ok(feed.includes("TRIGGER:-PT30M"));
  // Ein Wecker für einen ganztägigen Eintrag klingelt um Mitternacht, und
  // einer für einen abgesagten Termin ist schlicht falsch.
  assert.ok(feed.includes("STATUS:CANCELLED"));

  // Und das Format bleibt gültig: CRLF, Kopf, Abschluss.
  assert.ok(feed.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(feed.trim().endsWith("END:VCALENDAR"));
  assert.equal(feed.split("\r\n").filter((z) => z === "BEGIN:VEVENT").length, 3);
});

test("Fertige Mail: Vorlage plus Signatur, an einer Stelle zusammengesetzt", () => {
  // Vorschau, Probemail und echter Versand müssen denselben Text ergeben —
  // sonst fällt der Unterschied erst beim Kunden auf.
  const fertig = fertigeMail(
    { betreff: "Info für {{firma}}", text: "Hallo {{name}}," },
    { ...BEISPIEL_KONTAKT, organisation: "VolkWork" },
    "Viele Grüße\n{{organisation}}"
  );
  assert.equal(fertig.betreff, "Info für Musterfirma GmbH");
  assert.ok(fertig.text.startsWith("Hallo Beispiel Ansprechpartner,"));
  assert.ok(fertig.text.endsWith("Viele Grüße\nVolkWork"));
  // Ohne Signatur bleibt es beim Text allein.
  assert.equal(fertigeMail({ text: "Kurz." }, {}, "").text, "Kurz.");
});

test("Vorlagen-Erfolg: gerade Verschicktes zählt noch nicht gegen die Vorlage", () => {
  const erfolg = vorlagenErfolg([
    { vorlage: "Erstinfo", status: "termin" },
    { vorlage: "Erstinfo", status: "kein_interesse" },
    { vorlage: "Erstinfo", status: "verschickt" },   // noch offen
    { vorlage: "Kurzinfo", status: "verschickt" },
    { status: "termin" },                             // ohne Vorlage
  ]);
  const erst = erfolg.find((e) => e.name === "Erstinfo");
  assert.equal(erst.verschickt, 3);
  assert.equal(erst.bewertet, 2);
  assert.equal(erst.quote, 50);
  // Ohne abgeschlossene Fälle keine Quote — und nicht null Prozent.
  assert.equal(erfolg.find((e) => e.name === "Kurzinfo").quote, null);
  assert.equal(erfolg.length, 2);
});

test("Kein Hook steht hinter einem frühen Ausstieg", () => {
  // React verlangt, dass jeder Aufruf einer Komponente dieselben Hooks in
  // derselben Reihenfolge ausführt. Steht ein useEffect hinter einem
  // "if (...) return", wird er beim ersten Zeichnen übersprungen und danach
  // nicht mehr — die Seite stürzt dann mit einer Ausnahme ab, die weder der
  // Build noch ein Test der Rechenlogik sieht. Genau so ging der
  // Systemstatus kaputt.
  const ordner = new URL("../pages/", import.meta.url);
  const dateien = readdirSync(ordner, { recursive: true })
    .filter((n) => typeof n === "string" && n.endsWith(".js") && !n.startsWith("api/"));

  const treffer = [];
  for (const name of dateien) {
    const zeilen = readFileSync(new URL(name, ordner), "utf8").split("\n");
    let ausstieg = null;
    zeilen.forEach((zeile, i) => {
      // Jede neue Funktion auf oberster Ebene fängt von vorn an — sonst
      // zählt ein Ausstieg aus einer Hilfsfunktion für alles danach mit.
      if (/^(export default )?function \w+/.test(zeile) || /^const \w+ = \(/.test(zeile)) { ausstieg = null; return; }
      // Ein Ausstieg auf oberster Ebene der Komponente: zwei Leerzeichen
      // Einrückung, "if (...) return".
      if (/^ {2}if \(.*\) return /.test(zeile)) { if (ausstieg === null) ausstieg = i + 1; return; }
      // Danach darf kein Hook mehr kommen.
      if (ausstieg !== null && /^ {2}(const \[[^\]]+\] = useState|useEffect\(|const \w+ = useMemo\(|const \w+ = useRef\()/.test(zeile)) {
        treffer.push(`${name}:${i + 1} (nach Ausstieg in Zeile ${ausstieg})`);
      }
    });
  }

  assert.deepEqual(treffer, [],
    `Diese Hooks stehen hinter einem frühen return — die Seite stürzt beim zweiten Zeichnen ab: ${treffer.join(", ")}`);
});

// --- Löschfrist für Aufnahmen ----------------------------------------------

test("Aufnahmen: die Frist gilt, aber Musterbeispiele bleiben", () => {
  const vorTagen = (n) => ({ created_at: new Date(Date.now() - n * 86400000).toISOString() });

  assert.equal(fristTage({}), STANDARD_FRIST_TAGE);
  assert.equal(fristTage({ aufnahme_frist_tage: 14 }), 14);
  // Null heisst ausdrücklich "keine Frist" und darf nicht als fehlender
  // Wert durchgehen — sonst löscht die Academy, wo jemand es abgeschaltet hat.
  assert.equal(fristTage({ aufnahme_frist_tage: 0 }), 0);
  assert.equal(verbleibendeTage(vorTagen(5), { aufnahme_frist_tage: 0 }), null);

  assert.equal(verbleibendeTage(vorTagen(0), {}), 30);
  assert.equal(verbleibendeTage(vorTagen(29), {}), 1);
  assert.equal(istAbgelaufen(vorTagen(31), {}), true);
  assert.equal(istAbgelaufen(vorTagen(10), {}), false);

  // Ein Musterbeispiel bleibt, egal wie alt.
  assert.equal(istAbgelaufen({ ...vorTagen(400), behalten: true }, {}), false);
  assert.equal(verbleibendeTage({ ...vorTagen(400), behalten: true }, {}), null);
});

test("Aufnahmen: der Hinweis sagt, was gilt", () => {
  assert.match(fristText({}), /30 Tagen/);
  assert.match(fristText({ aufnahme_frist_tage: 7 }), /7 Tagen/);
  assert.match(fristText({ aufnahme_frist_tage: 0 }), /unbegrenzt/);
});

test("Gesprächsablauf: Voreinstellung, eigener Ablauf, abgeschaltet", () => {
  // Ohne Einstellung gilt der Standard.
  assert.deepEqual(resolveLeitfaden(null), STANDARD_LEITFADEN);
  assert.deepEqual(resolveLeitfaden({}), STANDARD_LEITFADEN);
  assert.equal(STANDARD_LEITFADEN.length, 4);
  assert.deepEqual(STANDARD_LEITFADEN.map((s) => s.titel),
    ["Pitch", "Bedarfsanalyse", "Terminierung", "Qualifizierung"]);

  // Eine leere Liste heisst ausdrücklich "kein Leitfaden" — wer ihn
  // abschaltet, darf nicht den Standard zurückbekommen.
  assert.deepEqual(resolveLeitfaden({ gespraechsleitfaden: [] }), []);
  assert.equal(hatLeitfaden({ gespraechsleitfaden: [] }), false);
  assert.equal(hatLeitfaden({}), true);

  // Schritte ohne Titel fallen weg: eine leere Zeile im Gespräch hilft
  // niemandem.
  const eigen = resolveLeitfaden({ gespraechsleitfaden: [{ titel: "Einstieg" }, { titel: "  " }, { hinweis: "ohne Titel" }] });
  assert.deepEqual(eigen.map((s) => s.titel), ["Einstieg"]);
});

test("Mail-HTML: erst maskieren, dann umbrechen", () => {
  // Andersherum stand beim Empfänger wörtlich "<br/>" im Text — das eben
  // eingefügte Zeichen wurde von der Maskierung wieder unschädlich gemacht.
  const html = alsHtml("Hallo Frau Xy\n\nMit freundlichen Grüßen\nHonarmand");
  assert.ok(html.includes("<br/>Honarmand"), "Der Umbruch muss ein echter Umbruch sein.");
  assert.ok(!html.includes("&lt;br"), "Der Umbruch darf nicht maskiert sein.");
  assert.equal((html.match(/<p>/g) || []).length, 2, "Leerzeile trennt Absätze.");

  // Was der Mensch tippt, bleibt Text — auch wenn es nach HTML aussieht.
  const boese = alsHtml("Preis < 100 & mehr <script>alert(1)</script>");
  assert.ok(boese.includes("&lt;script&gt;"));
  assert.ok(boese.includes("&amp;"));
  assert.ok(!boese.includes("<script>"));
});

test("Doppelter Gruss wird erkannt, bevor er beim Kunden steht", () => {
  // Der häufigste Fehler beim Einrichten: Vorlage und Signatur enden beide
  // mit Gruss und Namen — und beim Kunden steht "Honarmand - Honarmand".
  const schlecht = doppelt(
    "Hallo {{name}},\n\nanbei die Unterlagen.\n\nMit freundlichen Grüßen\n{{vertriebler}}",
    "Mit freundlichen Grüßen\n{{vertriebler}}\n{{organisation}}"
  );
  assert.equal(schlecht.hatDoppeltes, true);
  assert.equal(schlecht.gruss, true);
  assert.deepEqual(schlecht.platzhalter, ["vertriebler"]);

  // Richtig aufgeteilt: die Vorlage endet mit dem Inhalt, der Schluss
  // trägt Gruss, Name und Organisation.
  const gut = doppelt(
    "Hallo {{name}},\n\nanbei die Unterlagen zu {{firma}}.",
    "Mit freundlichen Grüßen\n{{vertriebler}}\n{{organisation}}"
  );
  assert.equal(gut.hatDoppeltes, false);
});

test("Anrede: Frau Schmidt statt Maria Schmidt", () => {
  // Eine Mail an einen Geschäftskontakt mit Vornamen wirkt wie
  // Massenversand — genau das soll sie nicht.
  const werte = werteFuerKontakt({ name: "Maria Schmidt", anrede: "frau" });
  assert.equal(werte.anrede, "Frau");
  assert.equal(werte.nachname, "Schmidt");
  assert.equal(fuelleVorlage("Hallo {{anrede}} {{nachname}},", werte), "Hallo Frau Schmidt,");

  // Ohne Anrede bleibt kein doppeltes Leerzeichen stehen.
  const ohne = werteFuerKontakt({ name: "Maria Schmidt" });
  assert.equal(fuelleVorlage("Hallo {{anrede}} {{nachname}},", ohne), "Hallo Schmidt,");

  assert.equal(anredeText("herr"), "Herr");
  assert.equal(anredeText(null), "");
  assert.equal(anredeText("divers"), "");   // nur die zwei bekannten Werte
  // Ein einzelnes Wort ist der Nachname — oder das Einzige, was man hat.
  assert.equal(nachnameAus("Schmidt"), "Schmidt");
  assert.equal(nachnameAus("Anna Maria von Schmidt"), "Schmidt");
  assert.equal(nachnameAus(""), "");
});

test("Platzhalter werden auch im fertigen Text noch gefüllt", () => {
  // Wer im Textfeld selbst "{{vertriebler}}" tippt oder eine Signatur
  // hineinkopiert, hatte das sonst wörtlich in der Mail stehen: die Seite
  // füllt nur beim Öffnen der Vorlage, danach nie wieder. Deshalb füllt der
  // Server vor dem Versand noch einmal.
  const werte = werteFuerKontakt({ name: "Max Muster", anrede: "herr" },
    { vertriebler: "Ernestine", organisation: "VolkWork" });
  const vonHand = "Hallo {{anrede}} {{nachname}},\n\nText.\n\nMit freundlichen Grüßen\n{{vertriebler}}\n{{organisation}}";
  const fertig = fuelleVorlage(vonHand, werte);
  assert.ok(!fertig.includes("{{"), "Es darf kein Platzhalter übrig bleiben.");
  assert.ok(fertig.includes("Hallo Herr Muster,"));
  assert.ok(fertig.endsWith("Ernestine\nVolkWork"));
});

test("Die Versandhistorie steht nicht in der Gesprächsnotiz", () => {
  // Sie wuchs dort mit jedem Versand — und weil {{notiz}} in den Vorlagen
  // steht, landete sie in der nächsten Mail beim Kunden.
  const route = readFileSync(new URL("../pages/api/marketing-mail.js", import.meta.url), "utf8");

  // Alle Schreibvorgänge auf die Kontakte betrachten, nicht nur den ersten:
  // die Route repariert inzwischen auch eine unsaubere Adresse, und die
  // steht davor.
  const bloecke = [...route.matchAll(/from\("email_kontakte"\)\s*\.update\(\{([\s\S]*?)\}\)/g)]
    .map((m) => m[1]);
  assert.ok(bloecke.length >= 1, "Die Route muss den Kontakt nach dem Versand fortschreiben.");
  bloecke.forEach((b) => {
    assert.ok(!/notiz:/.test(b),
      "Der Versand darf die Gesprächsnotiz nicht verändern — sie wird in Vorlagen eingesetzt.");
  });
  assert.equal(bloecke.filter((b) => /letzter_betreff:/.test(b)).length, 1,
    "Genau ein Schreibvorgang hält den zuletzt verschickten Betreff fest.");
});

test("Der Standardschluss kommt nicht zweimal", () => {
  const signatur = "Mit freundlichen Grüßen\n{{vertriebler}}\n{{organisation}}";
  const werte = { vertriebler: "Houman Honarmand", organisation: "VolkWork" };

  // Vorlage OHNE Signatur: sie wird angehängt.
  const ohne = mitSchluss("Hallo Herr Muster,\n\nText.", signatur, werte);
  assert.ok(ohne.endsWith("Mit freundlichen Grüßen\nHouman Honarmand\nVolkWork"));
  assert.equal((ohne.match(/Houman Honarmand/g) || []).length, 1);

  // Vorlage MIT Signatur am Ende: sie wird NICHT noch einmal angehängt —
  // sonst steht das Ende doppelt in der Mail beim Kunden.
  const schonDrin = "Hallo Herr Muster,\n\nText.\n\nMit freundlichen Grüßen\nHouman Honarmand\nVolkWork";
  assert.equal(mitSchluss(schonDrin, signatur, werte), schonDrin);

  // Auch mit abweichenden Leerzeilen erkannt: ein Umbruch mehr darf die
  // Erkennung nicht aushebeln.
  const andersUmbrochen = "Text.\n\nMit freundlichen Grüßen\n\nHouman Honarmand\n\nVolkWork";
  assert.equal(mitSchluss(andersUmbrochen, signatur, werte), andersUmbrochen);

  // Ohne Signatur bleibt alles, wie es ist.
  assert.equal(mitSchluss("Nur Text.", "", werte), "Nur Text.");
});

test("Reiterleisten laufen über die gemeinsame Komponente", () => {
  // Sie sah auf jeder Seite anders aus: mal schmale Pillen, mal breitere
  // mit Symbolen. Wer zwischen Seiten wechselt, muss die Bedienung sonst
  // jedes Mal neu suchen — und übersieht, dass es überhaupt Reiter gibt.
  const seiten = ["call-tracker", "termine", "kalender", "team", "leaderboard", "follow-up"];
  const ohne = seiten.filter((name) => {
    const quelle = readFileSync(new URL(`../pages/${name}.js`, import.meta.url), "utf8");
    return !quelle.includes("<SeitenReiter");
  });
  assert.deepEqual(ohne, [],
    `Diese Seiten haben eigene Reiterleisten statt der gemeinsamen: ${ohne.join(", ")}`);
});

test("Die Seitenleiste gliedert nach Tätigkeit, nicht nach Restehaufen", () => {
  // "Team" war vorher eine Gruppe mit siebzehn Punkten: Call Tracker,
  // Termine, Kunden, Community, Auswertung — alles, was nirgends sonst
  // hinpasste. Eine Gruppe, in der alles steht, sortiert nichts.
  const quelle = readFileSync(new URL("../components/Layout.js", import.meta.url), "utf8");
  const block = quelle.slice(quelle.indexOf("const NAV_GROUPS = {"), quelle.indexOf("};", quelle.indexOf("const NAV_GROUPS = {")));

  const zuordnung = [...block.matchAll(/"?([\w-]+)"?:\s*"([^"]+)"/g)].map((m) => ({ key: m[1], gruppe: m[2] }));
  const proGruppe = {};
  zuordnung.forEach((z) => { proGruppe[z.gruppe] = (proGruppe[z.gruppe] || 0) + 1; });

  // Der tägliche Arbeitsweg steht beisammen.
  ["call-tracker", "termine", "follow-up", "kunden"].forEach((k) => {
    assert.equal(zuordnung.find((z) => z.key === k)?.gruppe, "Verkaufen", `${k} gehört zum Arbeitstag`);
  });
  // Führungsstoff steht getrennt vom Alltag.
  assert.equal(zuordnung.find((z) => z.key === "auswertung")?.gruppe, "Führung");

  // Keine Gruppe sammelt mehr alles ein.
  Object.entries(proGruppe).forEach(([gruppe, anzahl]) => {
    assert.ok(anzahl <= 13, `Die Gruppe "${gruppe}" hat ${anzahl} Punkte — das sortiert nichts mehr.`);
  });

  // Und jede Gruppe kommt in der Reihenfolge vor, sonst landet sie hinten.
  const reihenfolge = quelle.slice(quelle.indexOf("const GRUPPEN_REIHENFOLGE"), quelle.indexOf("];", quelle.indexOf("const GRUPPEN_REIHENFOLGE")));
  Object.keys(proGruppe).forEach((g) => {
    assert.ok(reihenfolge.includes(`"${g}"`), `Die Gruppe "${g}" fehlt in der Reihenfolge.`);
  });
});

// --- Rückmeldungen des Mailversands ---------------------------------------

test("Rückmeldungen: nur was zählt, wird übernommen", () => {
  assert.equal(zustandFuer("email.delivered"), "zugestellt");
  assert.equal(zustandFuer("email.bounced"), "unzustellbar");
  assert.equal(zustandFuer("email.complained"), "beschwerde");
  // Öffnungsraten sind ungenau — eine Zahl, der man nicht trauen kann, ist
  // schlimmer als keine.
  assert.equal(zustandFuer("email.opened"), null);
  assert.equal(zustandFuer("unbekannt"), null);
  Object.values(zustandFuer("email.sent") ? { a: "angenommen" } : {}).forEach(() => {});
  Object.keys(ZUSTELLUNG_LABELS).forEach((k) => assert.ok(ZUSTELLUNG_LABELS[k].length > 3));
});

test("Eine unzustellbare Adresse kommt nicht in die Nachfass-Liste", () => {
  // Sonst erinnert die Academy in fünf Tagen daran, einer toten Adresse
  // hinterherzutelefonieren.
  const vorTagen = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const offen = { status: "verschickt", verschickt_am: vorTagen(10) };
  assert.equal(brauchtNachfassen(offen), true);
  assert.equal(brauchtNachfassen({ ...offen, zustellung: "unzustellbar" }), false);
  assert.equal(brauchtNachfassen({ ...offen, zustellung: "beschwerde" }), false);
  assert.equal(brauchtNachfassen({ ...offen, zustellung: "zugestellt" }), true);

  assert.equal(istGescheitert("unzustellbar"), true);
  assert.equal(istGescheitert("zugestellt"), false);
  // Nach einer Beschwerde geht dorthin nichts mehr raus — das ist die
  // Bedingung dafür, dass die eigene Domain zustellbar bleibt.
  assert.equal(darfNochSenden({ zustellung: "beschwerde" }), false);
  assert.equal(darfNochSenden({ zustellung: "unzustellbar" }), true);
  assert.equal(darfNochSenden({}), true);
});

test("Die Rückmeldungs-Route schützt sich mit einem Geheimnis", () => {
  // Sie hat keine Anmeldung — der Versanddienst ruft sie auf. Eine offene
  // Route, über die jeder den Zustand fremder Kontakte umschreiben könnte,
  // wäre schlimmer als keine Rückmeldung.
  const route = readFileSync(new URL("../pages/api/versand-rueckmeldung.js", import.meta.url), "utf8");
  assert.match(route, /RESEND_WEBHOOK_SECRET/);
  assert.match(route, /return res\.status\(401\)/);
  // Ohne eingerichtetes Geheimnis nimmt sie gar nichts an.
  assert.match(route, /if \(!geheimnis\) return res\.status\(503\)/);
});

test("Closing Call ist eine eigene Stufe, kein Ergebnis", () => {
  // "Der Kunde überlegt noch" und "jetzt wird abgeschlossen" sahen in der
  // Liste gleich aus. Für die Frage, wo es hakt, ist genau dieser
  // Unterschied die Antwort.
  // Vier Stufen: die drei bis zum Abschluss und der Check-in danach.
  assert.equal(TERMIN_ARTEN.length, 4);
  // Ohne Angabe wird nichts geraten: siehe "Ein Termin ohne Stufe wird
  // nicht zum Setting Call erklärt".
  assert.equal(artVon({ termin_art: "closing" }).label, "Closing Call");

  const stufen = stufenAuswertung([
    { termin_art: "erstgespraech", status: "wahrgenommen" },
    { termin_art: "closing", status: "wahrgenommen", outcome: "kunde" },
    { termin_art: "closing", status: "wahrgenommen" },
    { termin_art: "closing", status: "geplant" },
  ]);
  const closing = stufen.find((s) => s.key === "closing");
  assert.equal(closing.gesamt, 3);
  assert.equal(closing.wahrgenommen, 2);   // der geplante zählt nicht mit
  assert.equal(closing.abschlussquote, 50);

  // Ohne wahrgenommene Termine keine Quote — und nicht null Prozent.
  assert.equal(stufen.find((s) => s.key === "folgetermin").abschlussquote, null);
});

test("Im Kalender steht die Stufe und der ursprüngliche Vertriebler", () => {
  // Der Kern: Führt Lion das Erstgespräch von Ernestines Interessent und
  // vereinbart einen Closing Call, bleibt es Ernestines Kontakt. Im
  // Kalender muss ihr Name stehen, nicht seiner — sonst sieht es aus, als
  // wäre es Lions Kunde.
  // Der Closing Call trägt zusätzlich den Geldschein: in einer Liste aus
  // zwanzig Terminen soll der eine, in dem es ums Geld geht, ins Auge
  // springen. Nur diese eine Stufe hat ein Symbol — bekäme jede eines,
  // wäre wieder keins auffällig.
  assert.equal(kalenderTitel({ name: "Max Muster", termin_art: "closing" }, "Ernestine"),
    "💵 CC: Max Muster – Ernestine");
  assert.equal(kalenderTitel({ name: "Max Muster", termin_art: "erstgespraech" }, "Ernestine"),
    "ST: Max Muster – Ernestine");
  assert.equal(kalenderTitel({ name: "Max Muster", termin_art: "folgetermin" }, ""),
    "FU: Max Muster");

  // Jede Stufe hat ein Kürzel und eine eigene Farbe — beides an einer
  // Stelle, sonst laufen Kalender und Liste auseinander.
  const kuerzel = TERMIN_ARTEN.map((a) => a.kurz);
  assert.deepEqual(kuerzel, ["ST", "FU", "CC", "CI"]);
  assert.deepEqual(TERMIN_ARTEN.filter((a) => a.symbol).map((a) => a.key), ["closing"],
    "Nur der Closing Call trägt ein Symbol — sonst hebt sich keiner mehr ab.");
  assert.deepEqual(TERMIN_ARTEN.map(kuerzelVon), ["ST", "FU", "💵 CC", "CI"]);
  const farben = TERMIN_ARTEN.map((a) => a.farbe);
  assert.equal(new Set(farben).size, 4, "Jede Stufe braucht eine unterscheidbare Farbe.");
  assert.equal(terminFarbe({ termin_art: "closing" }), TERMIN_ARTEN[2].farbe);
  // Ohne Stufe ein neutrales Grau statt der Farbe des Erstgesprächs: eine
  // Farbe, die eine Stufe behauptet, ist dieselbe Vermutung wie ein Kürzel.
  assert.equal(terminFarbe({ termin_art: "erstgespraech" }), TERMIN_ARTEN[0].farbe);
  assert.notEqual(terminFarbe({}), TERMIN_ARTEN[0].farbe);
});

test("Der Termin rückt weiter, statt sich zu verdoppeln", () => {
  // Ein Interessent ist EIN Eintrag, der durch die Stufen wandert — sonst
  // steht derselbe Kunde dreimal in der Liste.
  const erst = {
    termin_art: "erstgespraech",
    appointment_at: "2026-09-03T10:00:00.000Z",
    outcome: "follow_up",
    status: "wahrgenommen",
    stufen_verlauf: [],
  };
  const patch = rueckeVor(erst, "closing", "2026-09-12T14:00:00.000Z", "ernestine");

  assert.equal(patch.termin_art, "closing");
  assert.equal(patch.appointment_at, "2026-09-12T14:00:00.000Z");
  // Status und Ergebnis gehören zur abgeschlossenen Stufe und stünden bei
  // der neuen falsch.
  assert.equal(patch.status, "geplant");
  assert.equal(patch.outcome, null);

  // Die Geschichte bleibt — genau daran scheiterte die frühere Fassung.
  assert.equal(patch.stufen_verlauf.length, 1);
  assert.equal(patch.stufen_verlauf[0].art, "erstgespraech");
  assert.equal(patch.stufen_verlauf[0].am, "2026-09-03T10:00:00.000Z");
  assert.equal(patch.stufen_verlauf[0].ergebnis, "follow_up");
});

test("Die Auswertung zählt jede Stufe, auch die abgeschlossenen", () => {
  // Ohne den Verlauf hätte ein Kontakt, der bis zum Closing vorgerückt ist,
  // nie ein Erstgespräch gehabt — die Tabelle zeigte lauter Closings und
  // keine Erstgespräche.
  const vorgerueckt = {
    termin_art: "closing", status: "wahrgenommen", outcome: "kunde",
    stufen_verlauf: [
      { art: "erstgespraech", am: "2026-09-03", ergebnis: "follow_up" },
      { art: "folgetermin", am: "2026-09-08", ergebnis: null },
    ],
  };
  const stufen = stufenAuswertung([vorgerueckt]);
  assert.equal(stufen.find((s) => s.key === "erstgespraech").gesamt, 1);
  assert.equal(stufen.find((s) => s.key === "folgetermin").gesamt, 1);
  assert.equal(stufen.find((s) => s.key === "closing").gesamt, 1);
  assert.equal(stufen.find((s) => s.key === "closing").kunden, 1);
  assert.equal(stufen.find((s) => s.key === "closing").abschlussquote, 100);

  // Und der Verlauf lässt sich anzeigen.
  assert.deepEqual(verlaufVon(vorgerueckt).map((v) => v.kurz), ["ST", "FU"]);
});

test("Der Abschluss steht bei 85 Prozent, nicht bei 100", () => {
  // Mit dem Geld ist es nicht fertig. Was danach fehlt, ist die
  // Projektumsetzung und der Anruf einen Monat später — die beiden
  // Schritte nach dem Verkauf, und deshalb die, die ohne festen Platz im
  // System immer vergessen werden.
  // Ein bloss eingetragener Termin ist noch keine Leistung, sondern ein
  // Vorhaben. Er zählte früher als erreichtes Gespräch — die Kette stand
  // damit auf einem Viertel, bevor irgendjemand etwas getan hatte, und die
  // Bestätigung davor bewegte den Balken nicht mehr.
  assert.equal(fortschritt({ termin_art: "erstgespraech", status: "geplant" }), 0);
  assert.equal(fortschritt({ termin_art: "erstgespraech", status: "wahrgenommen" }), 25);
  // Bewusst nur knapp über dem blossen Termin: ein Folgetermin heisst, dass
  // der Kunde zögert. Auf halber Strecke stehend wäre er eine Zahl, die aus
  // einem Zögern einen Fortschritt macht.
  assert.equal(fortschritt({ termin_art: "folgetermin", status: "wahrgenommen" }), 35);
  assert.ok(fortschritt({ termin_art: "folgetermin", status: "wahrgenommen" })
    < fortschritt({ termin_art: "closing", status: "wahrgenommen" }) - 30,
    "Der Folgetermin muss deutlich unter dem Abschlussgespräch liegen.");
  assert.equal(fortschritt({ termin_art: "closing", status: "wahrgenommen" }), 70);
  assert.equal(fortschritt({ outcome: "kunde" }), 85);                  // Kunde — noch nicht fertig
  assert.equal(fortschritt({ termin_art: "checkin", status: "wahrgenommen" }), 100);

  // Ein GEPLANTER Check-in ist kein geführter: erst das Gespräch zählt.
  // Er fällt dann auf das zurück, was wirklich erreicht ist.
  assert.equal(fortschritt({ termin_art: "checkin", status: "geplant", outcome: "kunde" }), 85);
  // "Kein Abschluss" löscht den Weg nicht, den der Kontakt gegangen ist.
  //
  // Vorher gab der Fortschritt hier 0 zurück — der Balken war leer, während
  // daneben die Marken für Setting Call und Closing Call als erreicht
  // dastanden. Zwei Angaben, die einander widersprachen: die eine sagte
  // "nichts passiert", die andere "zwei Gespräche geführt". Beide stimmen
  // für sich, also zeigt der Balken jetzt, wie weit es kam, und sagt dazu,
  // dass es dort geendet hat.
  assert.equal(fortschritt({ termin_art: "closing", status: "wahrgenommen", outcome: "absage" }), 70);
  assert.equal(istVerloren({ termin_art: "closing", status: "wahrgenommen", outcome: "absage" }), true);
  assert.equal(istVerloren({ termin_art: "closing" }), false);
  assert.equal(istVerloren({ outcome: "kunde" }), false);
});

test("Die Schritte zwischen den Gesprächen bewegen den Balken", () => {
  // Der Ablauf, wie er im Verkauf wirklich läuft: bestätigen, sprechen,
  // bestätigen, abschliessen, liefern, nachfragen. Die Bestätigungen sind
  // keine Termine, sondern Haken — und der billigste Schritt im ganzen
  // Ablauf. Ein unbestätigter Termin platzt.
  assert.deepEqual(WEGMARKEN.map((m) => m.kurz),
    ["SB", "ST", "FU", "CB", "CC", "KD", "PU", "CI"]);

  // Wer abhakt, steht an jedem Schritt. Die Bestätigungen und der Check-in
  // gehören dem Vertrieb, die Projektumsetzung der Leitung: wer verkauft
  // hat, ist nicht die Person, die beurteilt, ob geliefert wurde.
  assert.deepEqual(SCHRITTE.map((x) => [x.key, x.rolle]), [
    ["setting_bestaetigt", "vertrieb"],
    ["closing_bestaetigt", "vertrieb"],
    ["projektumsetzung", "leitung"],
    ["checkin_erledigt", "vertrieb"],
  ]);

  // Die höchste erreichte Marke zählt, nicht die letzte. Wer den Closing
  // Call schon bestätigt hat, aber noch im Setting Call steht, ist weiter
  // als 25 % — ein Balken, der beim Abhaken zurückspringt, wird nicht mehr
  // abgehakt.
  const mitHaken = (keys, rest = {}) => ({
    ...rest,
    schritte: Object.fromEntries(keys.map((k) => [k, { am: "2026-09-11T08:00:00Z" }])),
  });
  assert.equal(fortschritt(mitHaken(["closing_bestaetigt"], { termin_art: "erstgespraech" })), 50);

  // Der Balken füllt sich in der Reihenfolge, in der gearbeitet wird: jeder
  // Schritt bewegt ihn, und keiner bewegt ihn zurück.
  const kette = [
    { l: { termin_art: "erstgespraech", status: "geplant" }, wert: 0 },
    { l: mitHaken(["setting_bestaetigt"], { termin_art: "erstgespraech", status: "geplant" }), wert: 10 },
    { l: mitHaken(["setting_bestaetigt"], { termin_art: "erstgespraech", status: "wahrgenommen" }), wert: 25 },
    { l: mitHaken(["setting_bestaetigt", "closing_bestaetigt"],
      { termin_art: "closing", status: "geplant", stufen_verlauf: [{ art: "erstgespraech" }] }), wert: 50 },
    { l: mitHaken(["setting_bestaetigt", "closing_bestaetigt"],
      { termin_art: "closing", status: "wahrgenommen", stufen_verlauf: [{ art: "erstgespraech" }] }), wert: 70 },
    { l: { termin_art: "closing", status: "wahrgenommen", outcome: "kunde" }, wert: 85 },
    { l: mitHaken(["projektumsetzung"], { termin_art: "closing", status: "wahrgenommen", outcome: "kunde" }), wert: 95 },
    { l: mitHaken(["projektumsetzung", "checkin_erledigt"],
      { termin_art: "closing", status: "wahrgenommen", outcome: "kunde" }), wert: 100 },
  ];
  kette.forEach(({ l, wert }) => assert.equal(fortschritt(l), wert));
  kette.forEach((s, i) => {
    if (i === 0) return;
    assert.ok(s.wert > kette[i - 1].wert, "Jeder Schritt muss den Balken weiterbewegen.");
  });

  // Der Haken vor dem Setting Call liegt unter dem Gespräch selbst: erst
  // bestätigen, dann sprechen.
  assert.equal(fortschritt(mitHaken(["setting_bestaetigt"], { termin_art: "erstgespraech", status: "wahrgenommen" })), 25);
  // Ohne Stufe zählt nur der Haken selbst.
  assert.equal(fortschritt(mitHaken(["setting_bestaetigt"], { termin_art: null })), 10);

  // Nach dem Abschluss die Umsetzung, danach der Check-in.
  assert.equal(fortschritt(mitHaken(["projektumsetzung"], { outcome: "kunde", termin_art: "closing", status: "wahrgenommen" })), 95);
  // Der Check-in zählt als Haken des Vertriebs. Hat der Termin dazu
  // stattgefunden, gilt er als abgehakt — sonst müsste man zweimal
  // dasselbe bestätigen.
  assert.equal(fortschritt(mitHaken(["projektumsetzung"],
    { outcome: "kunde", termin_art: "checkin", status: "wahrgenommen" })), 100);
  assert.equal(fortschritt(mitHaken(["checkin_erledigt"], { outcome: "kunde", termin_art: "closing", status: "wahrgenommen" })), 100);
  assert.equal(fortschritt({ outcome: "kunde", termin_art: "checkin", status: "geplant" }), 85);

  // Ein übersprungener Haken bleibt offen sichtbar — genau das ist die
  // Information: der Termin wurde nie bestätigt.
  const erreicht = erreichteMarken({ termin_art: "closing", status: "wahrgenommen", stufen_verlauf: [{ art: "erstgespraech" }] });
  assert.equal(erreicht.has("erstgespraech"), true);
  assert.equal(erreicht.has("closing"), true);
  assert.equal(erreicht.has("setting_bestaetigt"), false);
  assert.equal(erreicht.has("closing_bestaetigt"), false);
});

test("Die Projektumsetzung hakt nur die Leitung ab", () => {
  const umsetzung = SCHRITTE.find((s) => s.key === "projektumsetzung");
  const bestaetigung = SCHRITTE.find((s) => s.key === "setting_bestaetigt");

  // Wer verkauft hat, ist nicht die Person, die beurteilt, ob geliefert
  // wurde.
  assert.equal(darfSchritt(umsetzung, false), false);
  assert.equal(darfSchritt(umsetzung, true), true);
  assert.equal(darfSchritt(bestaetigung, false), true);

  // Der Haken hält fest, WER und WANN — sonst lässt sich später nicht
  // klären, ob überhaupt jemand hingesehen hat.
  const patch = schrittPatch({}, "setting_bestaetigt", true, "uuid-1");
  assert.equal(patch.schritte.setting_bestaetigt.von, "uuid-1");
  assert.ok(patch.schritte.setting_bestaetigt.am);

  // Und er lässt sich zurücknehmen, ohne die anderen mitzureissen.
  const zwei = schrittPatch(patch, "closing_bestaetigt", true, "uuid-1");
  const zurueck = schrittPatch(zwei, "setting_bestaetigt", false);
  assert.equal(zurueck.schritte.setting_bestaetigt, undefined);
  assert.ok(zurueck.schritte.closing_bestaetigt);
});

test("Der Check-in wird nach einem Monat fällig — und nur bei Kunden", () => {
  const vorTagen = (n) => new Date(Date.now() - n * 86400000).toISOString();

  assert.equal(checkinFaellig({ outcome: "kunde", appointment_at: vorTagen(CHECKIN_NACH_TAGEN + 1) }), true);
  // Frisch abgeschlossen: noch nichts zu fragen.
  assert.equal(checkinFaellig({ outcome: "kunde", appointment_at: vorTagen(5) }), false);
  // Kein Kunde, kein Check-in — das wäre ein Anruf ins Blaue.
  assert.equal(checkinFaellig({ outcome: "absage", appointment_at: vorTagen(60) }), false);
  assert.equal(checkinFaellig({ appointment_at: vorTagen(60) }), false);
  // Läuft schon: nicht noch einmal vorschlagen.
  assert.equal(checkinFaellig({ outcome: "kunde", termin_art: "checkin", appointment_at: vorTagen(60) }), false);
});

test("Die Reihenfolge der Vorlagen lässt sich ordnen", () => {
  const v = [{ name: "Nachfassen" }, { name: "Angebot" }, { name: "Erstinfo" }];

  // Von Hand: die Vorlage tauscht mit ihrer Nachbarin.
  assert.deepEqual(verschiebeVorlage(v, 2, -1).map((x) => x.name),
    ["Nachfassen", "Erstinfo", "Angebot"]);
  assert.deepEqual(verschiebeVorlage(v, 0, 1).map((x) => x.name),
    ["Angebot", "Nachfassen", "Erstinfo"]);

  // Über den Rand hinaus passiert nichts — und die Liste bleibt heil.
  assert.deepEqual(verschiebeVorlage(v, 0, -1).map((x) => x.name),
    ["Nachfassen", "Angebot", "Erstinfo"]);
  assert.deepEqual(verschiebeVorlage(v, 2, 1).length, 3);

  // Alphabetisch, mit deutschen Umlauten an der richtigen Stelle.
  assert.deepEqual(nachNamen([{ name: "Zusage" }, { name: "Änderung" }, { name: "Angebot" }]).map((x) => x.name),
    ["Änderung", "Angebot", "Zusage"]);

  // Nach Erfolg: die beste Quote oben. Eine Vorlage ohne bewertete Fälle
  // darf nicht vor eine mit 40 Prozent rutschen — sie landet hinten und
  // behält dort ihre bisherige Reihenfolge.
  const erfolge = [{ name: "Angebot", quote: 40 }, { name: "Erstinfo", quote: 70 }, { name: "Nachfassen", quote: null }];
  assert.deepEqual(nachErfolg(v, erfolge).map((x) => x.name),
    ["Erstinfo", "Angebot", "Nachfassen"]);

  // Das Sortieren fasst die Vorlagen nicht an, es ordnet sie nur.
  assert.deepEqual(nachNamen(v).length, 3);
  assert.deepEqual(v.map((x) => x.name), ["Nachfassen", "Angebot", "Erstinfo"]);
});

test("Das Follow-up bekommt einen Zeitpunkt, den ein Kalender annimmt", async () => {
  const { faelligIn, nachfassTitel, istFaelligesNachfassen, offeneNachfass, NACHFASS_STUNDE } =
    await import("../lib/nachfass.js");

  // Mit Uhrzeit, nicht nur mit Datum: ein Kalendereintrag ohne Uhrzeit
  // hängt als Ganztagesbalken über allem und wird genau deshalb übersehen.
  const jetzt = new Date("2026-09-09T14:35:00");
  const in3 = faelligIn(3, jetzt);
  assert.equal(in3.getHours(), NACHFASS_STUNDE);
  assert.equal(in3.getMinutes(), 0);
  assert.equal(in3.getDate(), 12);

  assert.equal(nachfassTitel({ name: "Max Muster", firma: "ACME" }), "Follow-up: Max Muster (ACME)");
  assert.equal(nachfassTitel({ firma: "ACME" }), "Follow-up: ACME");
  assert.equal(nachfassTitel({}), "Follow-up");

  // Ein abgehaktes Nachfassen ist nie fällig — auch wenn sein Zeitpunkt
  // längst vorbei ist. Sonst stünde die Liste voller alter Häkchen.
  const vorbei = { faellig_am: "2026-09-01T09:00:00Z" };
  assert.equal(istFaelligesNachfassen(vorbei, jetzt), true);
  assert.equal(istFaelligesNachfassen({ ...vorbei, erledigt_am: "2026-09-02T10:00:00Z" }, jetzt), false);
  assert.equal(istFaelligesNachfassen({ faellig_am: "2026-12-01T09:00:00Z" }, jetzt), false);

  // Das Älteste zuerst: was am längsten liegt, drängt am meisten.
  const liste = [
    { id: "b", faellig_am: "2026-09-08T09:00:00Z" },
    { id: "a", faellig_am: "2026-09-02T09:00:00Z" },
    { id: "c", faellig_am: "2026-12-01T09:00:00Z" },
    { id: "d", faellig_am: "2026-09-03T09:00:00Z", erledigt_am: "2026-09-03T12:00:00Z" },
  ];
  assert.deepEqual(offeneNachfass(liste, jetzt).map((n) => n.id), ["a", "b"]);
});

test("Die Follow-up-Meldung endet am Berliner Tagesende, nicht am Serverzeit-Tagesende", async () => {
  const { berlinHeute, tagPlus, tagesBeginnZeitpunkt } = await import("../lib/woche.js");

  // Der Server läuft in UTC. Ein Rückruf, der für 00:30 Berliner Zeit
  // eingetragen ist, liegt in der Sommerzeit noch am UTC-Vortag — mit
  // einem Tagesende nach Serverzeit würde er einen Tag zu früh gemeldet.
  const jetzt = new Date("2026-09-09T05:00:00Z");           // 07:00 in Berlin
  const bis = tagesBeginnZeitpunkt(tagPlus(berlinHeute(jetzt), 1));

  const morgenFruehBerlin = "2026-09-10T00:30:00+02:00";    // = 09.09. 22:30 UTC
  assert.ok(new Date(morgenFruehBerlin).toISOString() < "2026-09-09T23:59:59Z",
    "Voraussetzung des Tests: nach Serverzeit fiele dieser Rückruf noch auf heute.");
  assert.ok(new Date(morgenFruehBerlin).toISOString() >= bis,
    "Ein Rückruf für morgen früh darf heute noch nicht gemeldet werden.");

  // Und was heute spätabends in Berlin ansteht, gehört noch zu heute.
  assert.ok(new Date("2026-09-09T23:30:00+02:00").toISOString() < bis);
});

test("Adressen mit unsichtbaren Zeichen werden gesäubert, nicht verschickt", async () => {
  const { bereinigeAdresse, fremdeZeichen, gueltigeAdresse } = await import("../lib/emailKontakt.js");

  // Der echte Fall: eine kopierte Adresse trug ein Zeichen der Breite null.
  // Sie sah richtig aus, und Resend antwortete "Invalid `to` field. The
  // email address contains non-ASCII characters" — gesucht wurde dann beim
  // Absender, weil die Meldung nichts anderes hergab.
  const kopiert = "kontakt​@volkwork.de";
  assert.equal(bereinigeAdresse(kopiert), "kontakt@volkwork.de");
  assert.equal(gueltigeAdresse(kopiert), true, "Nach dem Säubern ist sie in Ordnung.");

  // Geschützte Leerzeichen und Schreibrichtungs-Steuerzeichen ebenso.
  assert.equal(bereinigeAdresse("‪ kontakt@volkwork.de "), "kontakt@volkwork.de");

  // Was sich nicht säubern lässt, ist keine versandfähige Adresse.
  // Umlaut-Adressen gibt es technisch, aber der Versanddienst nimmt sie
  // nicht — und eine Adresse, an die nichts rausgeht, ist im Marketing
  // eine Falle, die erst beim Senden zuschnappt.
  assert.equal(gueltigeAdresse("müller@volkwork.de"), false);
  assert.deepEqual(fremdeZeichen("müller@volkwork.de"), ["U+00FC (ü)"]);
  assert.equal(gueltigeAdresse("ohne-at.volkwork.de"), false);
  assert.equal(gueltigeAdresse("kontakt@volkwork.de"), true);

  // Das Codepunkt-Format ist die Auskunft: ein Zeichen der Breite null
  // lässt sich nicht anzeigen.
  assert.deepEqual(fremdeZeichen(kopiert), ["U+200B (Zeichen der Breite null)"]);
  assert.deepEqual(fremdeZeichen("kontakt@volkwork.de"), []);
});

test("Der Gedankenstrich in einer Adresse wird zum Bindestrich", async () => {
  const { bereinigeAdresse, gueltigeAdresse, fremdeZeichen } = await import("../lib/emailKontakt.js");

  // Word und Outlook machen beim Tippen aus "bauplanung-nord" ein
  // "bauplanung–nord". Die Adresse sieht danach fast gleich aus, und der
  // Versanddienst lehnt sie ab.
  //
  // Die Umwandlung ist sicher: im Domainnamen ist ausser Buchstaben,
  // Ziffern und dem Bindestrich nichts erlaubt — ein Gedankenstrich kann
  // dort nie gemeint sein.
  assert.equal(bereinigeAdresse("bpn@bauplanung–nord.de"), "bpn@bauplanung-nord.de");
  assert.equal(bereinigeAdresse("bpn@bauplanung—nord.de"), "bpn@bauplanung-nord.de");
  assert.equal(bereinigeAdresse("bpn@bauplanung−nord.de"), "bpn@bauplanung-nord.de");
  assert.equal(gueltigeAdresse("bpn@bauplanung–nord.de"), true);

  // Der Name des Zeichens gehört in die Meldung: "U+2013" sagt niemandem
  // etwas, "Gedankenstrich" sagt sofort, wonach man sucht.
  assert.deepEqual(fremdeZeichen("bpn@bauplanung–nord.de"), ["U+2013 (Gedankenstrich)"]);
  assert.deepEqual(fremdeZeichen("müller@x.de"), ["U+00FC (ü)"]);
});

test("Die Morgenliste nennt nur, was morgen noch unbestätigt ist", async () => {
  const { morgenlisteText, fehltBestaetigung, bestaetigungsText, schrittZurStufe } =
    await import("../lib/bestaetigung.js");

  // Vor dem Setting Call und vor dem Closing Call wird bestätigt, sonst
  // nirgends. Ein Folgetermin ist kein Termin, den man vorher bestätigt.
  assert.equal(schrittZurStufe("erstgespraech").key, "setting_bestaetigt");
  assert.equal(schrittZurStufe("closing").key, "closing_bestaetigt");
  assert.equal(schrittZurStufe("folgetermin"), null);
  assert.equal(schrittZurStufe("checkin"), null);

  const termin = (zusatz) => ({
    name: "Max Muster", appointment_at: "2026-09-12T08:30:00Z",
    status: "geplant", termin_art: "erstgespraech", created_by: "a", ...zusatz,
  });

  assert.equal(fehltBestaetigung(termin()), true);
  // Abgehakt: nichts mehr zu tun.
  assert.equal(fehltBestaetigung(termin({ schritte: { setting_bestaetigt: { am: "x" } } })), false);
  // Schon gelaufen oder abgesagt: eine Erinnerung wäre die Aufforderung,
  // etwas Sinnloses zu tun.
  assert.equal(fehltBestaetigung(termin({ status: "wahrgenommen" })), false);
  assert.equal(fehltBestaetigung(termin({ status: "abgesagt" })), false);

  // Ist alles bestätigt, kommt gar keine Nachricht. Eine tägliche "nichts
  // zu tun"-Meldung wird nach einer Woche weggewischt, und mit ihr die,
  // auf die es ankommt.
  assert.equal(morgenlisteText([termin({ schritte: { setting_bestaetigt: { am: "x" } } })]), null);
  assert.equal(morgenlisteText([]), null);

  const text = morgenlisteText(
    [termin(), termin({ name: "Eva Klein", termin_art: "closing", created_by: "b" })],
    (id) => ({ a: "Ernestine", b: "Lion" }[id]),
  );
  assert.match(text, /2 Termine sind noch nicht bestätigt/);
  assert.match(text, /Setting Call:/);
  assert.match(text, /Closing Call:/);
  assert.match(text, /Max Muster — Ernestine/);
  assert.match(text, /Eva Klein — Lion/);

  // Die einzelne Bestätigung nennt Termin, Person und Zeitpunkt — die
  // Gruppe soll ohne Rückfrage wissen, wann es stattfindet.
  const einzeln = bestaetigungsText(termin({ company: "ACME" }), "Ernestine",
    { key: "setting_bestaetigt", label: "Setting Call bestätigt", vorStufe: "erstgespraech" });
  assert.match(einzeln, /Setting Call mit Max Muster \(ACME\) von Ernestine bestätigt/);
  assert.match(einzeln, /findet am .* statt\./);
});

test("Die Meldung nennt den bestätigten Schritt, nicht die aktuelle Stufe", async () => {
  const { bestaetigungsText } = await import("../lib/bestaetigung.js");
  const { SCHRITTE } = await import("../lib/terminArt.js");

  // Wer die Closing-Bestätigung setzt, während der Termin noch auf der
  // Setting-Stufe steht, hat trotzdem das Closing bestätigt. Vorher stand
  // in der Meldung "Setting Call bestätigt" — das Gegenteil dessen, was
  // getan wurde.
  const aufSetting = { name: "Max Muster", termin_art: "erstgespraech", appointment_at: "2026-09-12T08:30:00Z" };
  const closing = SCHRITTE.find((x) => x.key === "closing_bestaetigt");
  assert.match(bestaetigungsText(aufSetting, "Ernestine", closing), /^✅ Closing Call mit Max Muster/);
  const setting = SCHRITTE.find((x) => x.key === "setting_bestaetigt");
  assert.match(bestaetigungsText(aufSetting, "Ernestine", setting), /^✅ Setting Call mit Max Muster/);

  // Welche Schritte überhaupt gemeldet werden, steht am Schritt. Die
  // Projektumsetzung nicht: die hakt die Leitung selbst ab und weiss es
  // damit bereits — eine Meldung wäre eine Nachricht an den Absender.
  assert.deepEqual(SCHRITTE.filter((x) => x.meldet).map((x) => x.key),
    ["setting_bestaetigt", "closing_bestaetigt", "checkin_erledigt"]);

  // Eine Bestätigung schaut nach vorn und nennt den Zeitpunkt. Der
  // Check-in schaut zurück — dort wäre "findet statt am" schlicht falsch.
  const checkin = SCHRITTE.find((x) => x.key === "checkin_erledigt");
  const ciText = bestaetigungsText(aufSetting, "Ernestine", checkin);
  assert.match(ciText, /^✅ Check-in erledigt: Max Muster von Ernestine\.$/);
  assert.ok(!/findet am/.test(ciText));

});

test("Ein Termin ohne Stufe wird nicht zum Setting Call erklärt", async () => {
  const { OHNE_STUFE } = await import("../lib/terminArt.js");

  // Der Anlass: In der Liste stand "ST: https://meet.google.com/…" —
  // ein echter Termin, aber kein Erstgespräch. Die Stufe war leer, und die
  // Anzeige machte daraus ein Erstgespräch. Geraten und als Tatsache
  // angezeigt, in Liste, Kalender und Auswertung.
  assert.equal(artVon({}).key, "unbestimmt");
  assert.equal(artVon({ termin_art: null }).key, "unbestimmt");
  assert.equal(artVon({ termin_art: "erstgespraech" }).key, "erstgespraech");

  // Kein Kürzel heisst: kein Präfix im Kalendertitel. Ein ": " vor dem
  // Namen sähe nach einem Fehler aus, ein erfundenes "ST" wäre einer.
  assert.equal(kuerzelVon(OHNE_STUFE), "");
  assert.equal(kalenderTitel({ name: "Max Muster" }, "Ernestine"), "Max Muster – Ernestine");
  assert.equal(kalenderTitel({ name: "Max Muster", termin_art: "erstgespraech" }, ""), "ST: Max Muster");

  // Und kein Fortschritt: ein Termin, von dem niemand weiss, was er ist,
  // ist kein Viertel des Weges.
  assert.equal(fortschritt({ status: "wahrgenommen" }), 0);
  assert.equal(fortschritt({ termin_art: "erstgespraech", status: "wahrgenommen" }), 25);

  // In der Auswertung ein eigener Eimer statt der Erstgespräche — sonst
  // besteht die wichtigste Zahl des Trichters aus Vermutungen.
  const mitLeeren = stufenAuswertung([{}, {}, { termin_art: "closing" }]);
  assert.equal(mitLeeren.find((s) => s.key === "erstgespraech").gesamt, 0);
  assert.equal(mitLeeren.find((s) => s.key === "unbestimmt").gesamt, 2);

  // Gibt es keine, taucht die Zeile gar nicht auf: "Ohne Stufe: 0" in
  // jeder Auswertung wäre Ballast.
  const ohneLeere = stufenAuswertung([{ termin_art: "erstgespraech" }]);
  assert.equal(ohneLeere.some((s) => s.key === "unbestimmt"), false);
});

test("Ein Name, der wie ein Link aussieht, wird angemerkt", async () => {
  const { namensHinweis, wirktWieLink } = await import("../lib/kundenname.js");

  // Beim Terminieren liegen Buchungslink und Namensfeld nebeneinander.
  // Was in die Zwischenablage gehört, landet dann im Feld daneben — und
  // der Kunde heisst danach überall "https://meet.google.com/…".
  assert.equal(wirktWieLink("https://meet.google.com/bcn-euvp-ray"), true);
  assert.equal(wirktWieLink("www.firma.de"), true);
  assert.equal(wirktWieLink("meet.google.com/abc"), true);

  // Und kein Fehlalarm bei echten Namen. "Müller & Co." hat einen Punkt,
  // ist aber keine Adresse.
  assert.equal(wirktWieLink("Max Muster"), false);
  assert.equal(wirktWieLink("Müller & Co."), false);
  assert.equal(wirktWieLink("Dr. Karl-Heinz von Müller"), false);
  assert.equal(namensHinweis("Max Muster"), null);

  // Eine Adresse im Namensfeld ist derselbe Griff daneben.
  assert.match(namensHinweis("max@firma.de"), /E-Mail-Adresse/);
  assert.match(namensHinweis("https://meet.google.com/x"), /Link/);
});

test("Ein persönlicher Termin bekommt nicht die Maske eines Kunden", async () => {
  const { istKundentermin } = await import("../lib/terminArt.js");
  const { kategorieVon } = await import("../lib/followUp.js");
  const { fehltBestaetigung } = await import("../lib/bestaetigung.js");

  // Der Anlass: eine persönliche Erinnerung mit einem Meet-Link stand in
  // der Terminliste — mit Stufe, Fortschrittsbalken, Ergebnis und Closing
  // Call. Nicht nur unnütz: die Auswertung zählte einen Verkaufsvorgang,
  // den es nie gab, und die Quoten des Teams wurden dadurch schlechter.
  const privat = { kein_kundentermin: true, termin_art: "erstgespraech", status: "wahrgenommen" };

  assert.equal(istKundentermin({}), true);
  assert.equal(istKundentermin(privat), false);

  // Kein Weg zum Abschluss, kein Nachfassen, keine Bestätigung.
  assert.equal(fortschritt(privat), 0);
  assert.equal(kategorieVon(privat), null);
  assert.equal(fehltBestaetigung({ ...privat, status: "geplant" }), false);

  // Und vor allem: nicht im Trichter. Sonst besteht die wichtigste Zahl
  // des Vertriebs aus Terminen, die nie welche waren.
  const stufen = stufenAuswertung([privat, { termin_art: "erstgespraech", status: "wahrgenommen" }]);
  assert.equal(stufen.find((s) => s.key === "erstgespraech").gesamt, 1);

  // Derselbe Termin als Kundentermin zählt wieder mit — die Markierung
  // lässt sich zurücknehmen.
  const zurueck = stufenAuswertung([{ ...privat, kein_kundentermin: false }]);
  assert.equal(zurueck.find((s) => s.key === "erstgespraech").gesamt, 1);
});

test("Die Terminliste bündelt nach Tagen, Heute zuerst benannt", async () => {
  const { gruppiereNachTag, tagesTitel } = await import("../lib/terminGruppen.js");
  const jetzt = new Date("2026-09-11T10:00:00+02:00");

  // Drei Wörter beantworten die Frage, die man an eine Terminliste stellt,
  // ohne dass jemand ein Datum umrechnen muss.
  assert.equal(tagesTitel("2026-09-11", jetzt), "Heute");
  assert.equal(tagesTitel("2026-09-12", jetzt), "Morgen");
  assert.equal(tagesTitel("2026-09-10", jetzt), "Gestern");
  assert.equal(tagesTitel("2026-09-18", jetzt), "Freitag, 18. September");
  assert.equal(tagesTitel(null, jetzt), "Ohne Zeitpunkt");

  // Die Liste kommt sortiert herein, und die Gruppen behalten diese
  // Reihenfolge: bevorstehend aufsteigend, vergangen absteigend. Hier wird
  // gebündelt, nicht umsortiert — sonst stünde in der
  // Vergangenheitsansicht plötzlich das Älteste oben.
  const gruppen = gruppiereNachTag([
    { id: "heute", appointment_at: "2026-09-11T08:30:00Z" },
    { id: "heute2", appointment_at: "2026-09-11T14:00:00Z" },
    // Nach DEUTSCHEM Tag: 22:30 UTC ist in Berlin schon der Folgetag. Auf
    // einem anders eingestellten Rechner rutschte der Termin sonst in die
    // falsche Gruppe.
    { id: "spaet", appointment_at: "2026-09-11T22:30:00Z" },
    { id: "ohne", appointment_at: null },
  ], jetzt);

  assert.deepEqual(gruppen.map((g) => g.titel), ["Heute", "Morgen", "Ohne Zeitpunkt"]);
  assert.deepEqual(gruppen[0].leads.map((l) => l.id), ["heute", "heute2"]);
  assert.deepEqual(gruppen[1].leads.map((l) => l.id), ["spaet"]);
  assert.equal(gruppen[0].istHeute, true);
  assert.equal(gruppen[1].istHeute, false);

  // Termine ohne Zeitpunkt ans Ende: eine Gruppe, die nie dringend ist,
  // gehört nicht über das, was heute ansteht.
  assert.equal(gruppen[gruppen.length - 1].titel, "Ohne Zeitpunkt");
});

test("Der Vergleichszeitraum ist gleich lang und schliesst lückenlos an", async () => {
  const { vorherigerZeitraum, tageImZeitraum, differenz, vergleichsText, vergleichsName } =
    await import("../lib/vergleich.js");

  // Gleich lang ist die Bedingung: eine Woche gegen einen Vormonat zu
  // stellen ergibt eine Zahl, die immer dramatisch aussieht und nichts
  // bedeutet. Lückenlos, damit kein Tag doppelt zählt oder herausfällt.
  assert.deepEqual(vorherigerZeitraum({ von: "2026-09-05", bis: "2026-09-11" }),
    { von: "2026-08-29", bis: "2026-09-04" });
  assert.equal(tageImZeitraum("2026-09-05", "2026-09-11"), 7);
  assert.equal(tageImZeitraum("2026-08-29", "2026-09-04"), 7);

  // Ein einzelner Tag vergleicht sich mit gestern — auch über den
  // Monatswechsel.
  assert.deepEqual(vorherigerZeitraum({ von: "2026-09-01", bis: "2026-09-01" }),
    { von: "2026-08-31", bis: "2026-08-31" });
  assert.equal(vorherigerZeitraum({}), null);

  // Ohne Vorwert gibt es KEINE Prozentzahl. Von null auf drei sind nicht
  // "unendlich Prozent mehr" und auch nicht "100 % mehr" — es ist neu.
  assert.equal(differenz(3, 0).prozent, null);
  assert.match(vergleichsText(differenz(3, 0), "der Vorwoche"), /^neu gegenüber/);
  assert.equal(differenz(312, 264).prozent, 18);
  assert.match(vergleichsText(differenz(312, 264), "der Vorwoche"), /^\+48 \(\+18 %\)/);
  assert.match(vergleichsText(differenz(2, 8), "der Vorwoche"), /^−6 \(−75 %\)/);
  assert.match(vergleichsText(differenz(5, 5), "der Vorwoche"), /^unverändert/);
  assert.equal(differenz(5, 5).richtung, "gleich");

  // Im Dativ, denn der Name steht hinter "gegenüber".
  assert.equal(vergleichsName("woche"), "den 7 Tagen davor");
  assert.equal(vergleichsName("heute"), "gestern");
});

test("Die Wochentags-Analyse gibt keine Quote auf drei Anrufe", async () => {
  const { wochentagsRaster, besterTag, wochentagsBefund, MINDESTENS_JE_TAG } =
    await import("../lib/wochentage.js");

  const raster = wochentagsRaster([
    // Montag: viel telefoniert, selten beim Chef gelandet.
    { log_date: "2026-09-07", counts: { anwahlen: 40, erreicht: 20, entscheider: 4, weitergeleitet: 2, termin: 2 } },
    // Donnerstag: gleich viel telefoniert, dreimal so oft bei der Entscheidung.
    { log_date: "2026-09-10", counts: { anwahlen: 40, erreicht: 25, entscheider: 12, weitergeleitet: 6, termin: 5 } },
    // Samstag: drei Anrufe, einer beim Chef. Das wären "33 %" — und eine
    // Empfehlung, samstags zu telefonieren.
    { log_date: "2026-09-12", counts: { anwahlen: 3, erreicht: 2, entscheider: 1, weitergeleitet: 0, termin: 1 } },
  ]);

  const mo = raster[0], don = raster[3], sa = raster[5];
  // "Bei der Entscheidung" ist abgeleitet: direkt erreicht plus
  // durchgestellt. Nicht zusätzlich gebucht, sonst wäre die Summe der
  // Zähler grösser als "erreicht".
  assert.equal(mo.beiEntscheidung, 6);
  assert.equal(don.beiEntscheidung, 18);
  assert.equal(mo.entscheiderQuote, 15);
  assert.equal(don.entscheiderQuote, 45);

  // Zu dünne Grundlage: keine Quote, kein Strich in der Statistik.
  assert.equal(sa.anwahlen < MINDESTENS_JE_TAG, true);
  assert.equal(sa.entscheiderQuote, null);
  assert.equal(besterTag(raster).name, "Donnerstag");

  const befund = wochentagsBefund(raster);
  assert.match(befund.text, /^Donnerstags landen 45 %/);
  assert.match(befund.text, /montags nur 15 %/);
  assert.equal(befund.abstand, 30);

  // Unter fünf Punkten Unterschied ist es Rauschen und keine Empfehlung.
  const knapp = wochentagsRaster([
    { log_date: "2026-09-07", counts: { anwahlen: 40, entscheider: 8, weitergeleitet: 0 } },
    { log_date: "2026-09-10", counts: { anwahlen: 40, entscheider: 9, weitergeleitet: 0 } },
  ]);
  assert.equal(wochentagsBefund(knapp), null);

  // Und ohne Vergleichsmöglichkeit gar keine Aussage.
  assert.equal(wochentagsBefund(wochentagsRaster([])), null);
});

test("Der Vergleichszeitraum lässt sich selbst wählen", async () => {
  const { vergleichsZeitraum, verschiebeUmMonate, ueberschneidung, vergleichsArtName } =
    await import("../lib/vergleich.js");
  const woche = { von: "2026-09-05", bis: "2026-09-11" };

  // Woche, Monat und Jahr verschieben denselben Zeitraum zurück: dieselbe
  // Länge, nur früher. "Zeitraum davor" schliesst dagegen lückenlos an.
  assert.deepEqual(vergleichsZeitraum("woche", woche), { von: "2026-08-29", bis: "2026-09-04" });
  assert.deepEqual(vergleichsZeitraum("monat", woche), { von: "2026-08-05", bis: "2026-08-11" });
  assert.deepEqual(vergleichsZeitraum("jahr", woche), { von: "2025-09-05", bis: "2025-09-11" });
  assert.deepEqual(vergleichsZeitraum("davor", woche), { von: "2026-08-29", bis: "2026-09-04" });
  assert.equal(vergleichsZeitraum("keiner", woche), null);

  // Ein eigener Zeitraum, auch verkehrt herum eingegeben.
  assert.deepEqual(vergleichsZeitraum("eigen", woche, { von: "2026-01-31", bis: "2026-01-01" }),
    { von: "2026-01-01", bis: "2026-01-31" });
  assert.equal(vergleichsZeitraum("eigen", woche, { von: "2026-01-01" }), null);

  // Der 31. März minus ein Monat ist der 28. Februar, nicht der 3. März.
  // Über Millisekunden gerechnet käme genau das heraus.
  assert.equal(verschiebeUmMonate("2026-03-31", 1), "2026-02-28");
  assert.equal(verschiebeUmMonate("2026-01-15", 1), "2025-12-15");
  assert.equal(verschiebeUmMonate("2026-09-05", 12), "2025-09-05");

  // Ein Vergleich mit sich selbst ist keiner: 30 Tage gegen "die Woche
  // davor" teilen 23 Tage, und die Veränderung wirkt dann immer klein.
  const monat = { von: "2026-08-13", bis: "2026-09-11" };
  assert.equal(ueberschneidung(monat, vergleichsZeitraum("woche", monat)), 23);
  assert.equal(ueberschneidung(monat, vergleichsZeitraum("davor", monat)), 0);

  // Der Name steht hinter "gegenüber" und damit im Dativ.
  assert.equal(vergleichsArtName("woche"), "der Woche davor");
  assert.equal(vergleichsArtName("davor", "woche"), "den 7 Tagen davor");
});

test("Ergebnis und Status heissen nicht beide fast gleich", async () => {
  const { ERGEBNISSE, ERGEBNIS_LABELS, ergebnisLabel } = await import("../lib/ergebnis.js");

  // Ein Termin hat einen STATUS — geplant, wahrgenommen, abgesagt — und
  // ein ERGEBNIS. In derselben Karte standen "Abgesagt" und "Absage"
  // nebeneinander und meinten Verschiedenes: das eine, dass das Gespräch
  // nicht stattfand, das andere, dass es stattfand und nichts daraus
  // wurde. Wer das verwechselt, verfälscht beide Zahlen.
  const statusWoerter = ["Geplant", "Wahrgenommen", "Abgesagt"];
  ERGEBNISSE.forEach((e) => {
    statusWoerter.forEach((wort) => {
      assert.ok(!e.label.toLowerCase().startsWith(wort.slice(0, 5).toLowerCase()),
        `Das Ergebnis "${e.label}" liest sich wie der Status "${wort}".`);
    });
  });

  assert.deepEqual(ERGEBNISSE.map((e) => e.wert), ["kunde", "follow_up", "absage"]);
  assert.equal(ERGEBNIS_LABELS.absage, "Kein Abschluss");
  assert.equal(ergebnisLabel("kunde"), "Kunde geworden");
  // Kein Ergebnis ist auch eine Auskunft — aber keine Bezeichnung.
  assert.equal(ergebnisLabel(null), "");
  assert.equal(ergebnisLabel("quatsch"), "");

  // Jedes Ergebnis erklärt sich selbst. "Kein Abschluss" deckt kein
  // Interesse, kein Budget und den falschen Zeitpunkt ab — das muss
  // dastehen, sonst sucht jemand einen vierten Knopf.
  ERGEBNISSE.forEach((e) => assert.ok(e.hinweis?.length > 10, `Zu "${e.label}" fehlt der Hinweis.`));
  assert.match(ERGEBNIS_LABELS.absage && ERGEBNISSE[2].hinweis, /kein Interesse/);
});

test("Eine HTML-Vorlage wird gefüllt, ohne dass ein Kontaktname Markup schreibt", async () => {
  const { fuelleHtml, bereinigeHtml, fertigeHtmlMail, htmlZuText, htmlPruefung, htmlMitSchluss,
    istHtmlVorlage, GMAIL_GRENZE_BYTES } = await import("../lib/htmlMail.js");

  // Die VORLAGE ist vertraut, die WERTE nicht. Ein Kontakt steht so in der
  // Datenbank, wie ihn jemand am Telefon notiert hat — samt spitzer
  // Klammern. Ohne Maskierung schriebe sein Name Markup in eine Mail, die
  // im Namen der Firma rausgeht.
  const gefuellt = fuelleHtml("<p>Hallo {{name}}</p>", { name: "<b>Müller</b> & Co" });
  assert.equal(gefuellt, "<p>Hallo &lt;b&gt;Müller&lt;/b&gt; &amp; Co</p>");
  assert.ok(!/<b>/.test(gefuellt));

  // Anders als beim Text fällt keine Zeile weg — das zerschnitte Tabellen.
  assert.equal(fuelleHtml("<td>{{firma}}</td>", {}), "<td></td>");

  // Was in einer Mail nichts zu suchen hat, fliegt raus — und die Maske
  // sagt, was.
  const { html: sauber, entfernt } = bereinigeHtml(
    '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:y()">Link</a><iframe src="z"></iframe>');
  assert.ok(!/script|onclick|javascript:|iframe/i.test(sauber));
  assert.ok(entfernt.includes("Skripte"));
  assert.ok(entfernt.some((e) => /onclick/.test(e)));
  assert.ok(entfernt.includes("javascript:-Links"));
  assert.ok(entfernt.includes("eingebettete Rahmen"));

  // Der Standardschluss kommt vor </body>, und nicht zweimal, wenn er
  // schon im HTML steht.
  const mitSchluss = htmlMitSchluss("<html><body><p>Text</p></body></html>", "Viele Grüße\nVolkWork");
  assert.match(mitSchluss, /Viele Grüße<br\/>VolkWork<\/p><\/div><\/body>/);
  const schonDa = "<html><body><p>Viele Grüße<br>VolkWork</p></body></html>";
  assert.equal(htmlMitSchluss(schonDa, "Viele Grüße\nVolkWork"), schonDa);

  // Die Textfassung ist lesbar: Absätze, Links mit Adresse, Entitäten
  // aufgelöst — und entschärfte Links ohne ein sinnloses "(#)".
  const text = htmlZuText('<style>p{}</style><p>Hallo&nbsp;Welt &amp; Co</p><p><a href="https://volkwork.de">Seite</a> <a href="#">weg</a></p>');
  assert.equal(text, "Hallo Welt & Co\n\nSeite (https://volkwork.de) weg");

  // Vorschau und Versand gehen durch dieselbe Funktion.
  const fertig = fertigeHtmlMail(
    { format: "html", betreff: "Für {{firma}}", html: "<body><p>Hallo {{anrede}} {{nachname}}</p><script>x</script></body>" },
    { firma: "ACME", anrede: "Herr", nachname: "Muster" }, "");
  assert.equal(fertig.betreff, "Für ACME");
  assert.match(fertig.html, /Hallo Herr Muster/);
  assert.ok(!/script/.test(fertig.html));
  assert.equal(fertig.text, "Hallo Herr Muster");

  assert.equal(istHtmlVorlage({ format: "html" }), true);
  assert.equal(istHtmlVorlage({ text: "x" }), false);

  // Die Hinweise stehen VOR dem ersten Versand: zu gross für Gmail, Bilder
  // ohne öffentliche Adresse, kein Abmeldehinweis.
  const riesig = `<p>${"x".repeat(GMAIL_GRENZE_BYTES + 10)}</p><p>abmelden</p>`;
  assert.ok(htmlPruefung(riesig).some((h) => /Gmail/.test(h)));
  assert.ok(htmlPruefung('<img src="bild.png"><p>abmelden</p>').some((h) => /öffentliche https-Adresse/.test(h)));
  assert.ok(htmlPruefung("<p>Nur Text</p>").some((h) => /Abmeldehinweis/.test(h)));
  assert.deepEqual(htmlPruefung('<p>Hallo</p><img src="https://x.de/a.png"><p>Abmelden</p>'), []);
});

test("Eine HTML-Vorlage passt sich der Organisation an", async () => {
  const { werteFuerKontakt, markeAus, sichereFarbe, sichereBildAdresse, unbekanntePlatzhalter } =
    await import("../lib/marketingVorlage.js");
  const { fertigeHtmlMail, fremdePlatzhalter, ersetzeFremdePlatzhalter } = await import("../lib/htmlMail.js");

  // Logo und Farben wurden nie an eine Vorlage übergeben — also blieb
  // stehen, was fest in der Datei stand. Jetzt kommen sie aus der
  // Organisation.
  const org = { name: "VolkWork", logo_url: "https://cdn.volkwork.de/logo.png", primary_color: "#CE3A5C", secondary_color: "#4C5DC9" };
  const werte = werteFuerKontakt({ name: "Max Muster" }, { organisation: org.name, ...markeAus(org) });
  const mail = fertigeHtmlMail(
    { format: "html", html: '<table style="background:{{farbe}}"><tr><td><img src="{{logo}}"><p>{{organisation}}</p></td></tr></table>' },
    werte, "");
  assert.match(mail.html, /background:#CE3A5C/);
  assert.match(mail.html, /src="https:\/\/cdn\.volkwork\.de\/logo\.png"/);
  assert.match(mail.html, /<p>VolkWork<\/p>/);

  // Die Werte landen in style- und src-Attributen. Eine Farbe, die keine
  // ist, würde beliebiges CSS in jede Mail schreiben; ein Logo ohne https
  // käme als leeres Kästchen an.
  assert.equal(sichereFarbe("#abc"), "#abc");
  assert.equal(sichereFarbe("red; background:url(x)"), "");
  assert.equal(sichereBildAdresse("https://x.de/a.png"), "https://x.de/a.png");
  assert.equal(sichereBildAdresse("javascript:alert(1)"), "");
  assert.equal(sichereBildAdresse('https://x.de/a.png" onerror="y'), "");

  // Die Markenplatzhalter gelten nicht als Tippfehler.
  assert.deepEqual(unbekanntePlatzhalter("{{logo}} {{farbe}} {{farbe2}} {{vorname}}"), ["vorname"]);

  // Platzhalter aus anderen Programmen werden erkannt — sonst kam die Mail
  // mit "*|FNAME|*" beim Kunden an.
  const fremd = fremdePlatzhalter('<p>Hallo *|FNAME|*, von [Firma] und {{ contact.LASTNAME }} und %%company%%</p>');
  assert.deepEqual(fremd.map((f) => [f.fund, f.vorschlag]), [
    ["*|FNAME|*", "{{name}}"],
    ["{{ contact.LASTNAME }}", "{{nachname}}"],
    ["%%company%%", "{{firma}}"],
    ["[Firma]", "{{firma}}"],
  ]);
  assert.equal(ersetzeFremdePlatzhalter("Hallo *|FNAME|* von [Firma]"), "Hallo {{name}} von {{firma}}");

  // Kein Fehlalarm bei gewöhnlichem Text in Klammern oder bei CSS.
  assert.deepEqual(fremdePlatzhalter("<style>p{color:red}</style><p>[Hinweis] {Beispiel}</p>"), []);
});

test("Der Buchungslink trägt mit, von wem der Kunde kam", async () => {
  const { nachverfolgbarerLink } = await import("../lib/buchungslink.js");
  const { werteFuerKontakt } = await import("../lib/marketingVorlage.js");
  const { htmlMitSchluss, fertigeHtmlMail } = await import("../lib/htmlMail.js");

  // Bucht ein Kunde über den Link in der Mail, stand im Kalender bisher
  // nur ein Termin. Von wem er kam, liess sich nicht mehr sagen.
  const link = nachverfolgbarerLink("https://www.cal.eu/volkwork.de/erstgesprach", {
    vertriebler: "Ernestine Müller", kontaktId: "abc-123", name: "Max Muster", email: "max@firma.de",
  });
  const url = new URL(link);
  assert.equal(url.searchParams.get("vertriebler"), "Ernestine Müller");
  assert.equal(url.searchParams.get("ref"), "abc-123");
  assert.equal(url.searchParams.get("utm_source"), "hb-academy");
  assert.equal(url.searchParams.get("utm_campaign"), "Ernestine Müller");
  // Vorgefüllt, damit der Kunde nichts zweimal eintippt.
  assert.equal(url.searchParams.get("name"), "Max Muster");
  assert.equal(url.searchParams.get("email"), "max@firma.de");
  // Leerzeichen und Umlaute sind kodiert — sonst endet der Link beim ersten
  // Leerzeichen, und aus "Ernestine Müller" wird "Ernestine".
  assert.ok(!/ /.test(link));

  // Ohne hinterlegten Link: leer statt kaputt. Und kein http in eine Mail.
  assert.equal(nachverfolgbarerLink("", {}), "");
  assert.equal(nachverfolgbarerLink("http://cal.eu/x", {}), "");

  // Im HTML landet der Link maskiert im href — & wird zu &amp;, wie es
  // in einem Attribut sein muss.
  const mail = fertigeHtmlMail({ format: "html", html: '<a href="{{buchungslink}}">Termin</a>' },
    werteFuerKontakt({ name: "Max Muster" }, { buchungslink: link }), "");
  assert.match(mail.html, /href="https:\/\/www\.cal\.eu\/volkwork\.de\/erstgesprach\?name=Max\+Muster&amp;email=/);

  // Eine Vorlage mit eigener Grussformel bekommt keinen zweiten Gruss
  // darunter — der Kunde läse ihn sonst zweimal.
  const mitGruss = "<body><p>Beste Grüße</p><p>Ernestine</p></body>";
  assert.equal(htmlMitSchluss(mitGruss, "Viele Grüße\nVolkWork"), mitGruss);
  assert.match(htmlMitSchluss("<body><p>Text</p></body>", "Viele Grüße\nVolkWork"), /Viele Grüße/);
});

test("Die Prüfung bemängelt keinen Platzhalter und warnt vor WebP", async () => {
  const { htmlPruefung } = await import("../lib/htmlMail.js");

  // {{logo}} wird beim Versand mit einer geprüften https-Adresse gefüllt.
  // Ihn als "keine öffentliche Adresse" zu melden, bemängelte genau die
  // Vorlage, die es richtig macht.
  const mitPlatzhalter = htmlPruefung('<img src="{{logo}}"><p>Abmelden</p>');
  assert.ok(!mitPlatzhalter.some((h) => /öffentliche https-Adresse/.test(h)));

  // Ein echter lokaler Pfad bleibt ein Fehler.
  assert.ok(htmlPruefung('<img src="logo.png"><p>Abmelden</p>').some((h) => /öffentliche https-Adresse/.test(h)));

  // WebP zeigt Outlook am Windows-Rechner nicht an.
  const webp = htmlPruefung('<img src="https://volkwork.de/a/karl-meyer.webp"><p>Abmelden</p>');
  assert.ok(webp.some((h) => /WebP/.test(h) && /karl-meyer\.webp/.test(h)));
  assert.ok(!htmlPruefung('<img src="https://x.de/a.png"><p>Abmelden</p>').some((h) => /WebP/.test(h)));
});

test("In der Mail steht der erfasste Nachname, nicht das letzte Wort", async () => {
  const { werteFuerKontakt, ganzerName, teileName } = await import("../lib/marketingVorlage.js");

  // Aus einem Feld "Name" das letzte Wort zu nehmen, geht bei
  // "Karl-Heinz Müller" gut und bei "Anna von der Heide" schief: "Guten Tag
  // Frau Heide" verrät dem Kunden sofort, dass eine Maschine schrieb.
  const mitFeldern = werteFuerKontakt({ anrede: "frau", vorname: "Anna", nachname: "von der Heide", name: "Anna von der Heide" });
  assert.equal(mitFeldern.nachname, "von der Heide");
  assert.equal(mitFeldern.anrede, "Frau");

  // Alte Kontakte ohne getrennte Felder behalten das bisherige Verhalten.
  assert.equal(werteFuerKontakt({ name: "Max Muster" }).nachname, "Muster");

  // "name" wird aus beiden Teilen gebildet — alles, was ihn liest, läuft
  // unverändert weiter.
  assert.equal(ganzerName("Anna", "von der Heide"), "Anna von der Heide");
  assert.equal(ganzerName("", "Muster"), "Muster");
  assert.equal(ganzerName("  Max ", " Muster "), "Max Muster");

  // Das Aufteilen alter Namen ist ein Vorschlag: letztes Wort Nachname.
  assert.deepEqual(teileName("Max Muster"), { vorname: "Max", nachname: "Muster" });
  assert.deepEqual(teileName("Muster"), { vorname: "", nachname: "Muster" });
  assert.deepEqual(teileName(""), { vorname: "", nachname: "" });
  assert.deepEqual(teileName("Anna von der Heide"), { vorname: "Anna von der", nachname: "Heide" });
});

test("Die Abmelde-Kopfzeile gibt es nur für echten Massenversand", async () => {
  const { abmeldeKopfzeilen } = await import("../lib/email.js");

  // Ohne "List-Unsubscribe" gilt Werbung bei Gmail, web.de und GMX als
  // Massenversand ohne Regeln und landet eher im Spam. Mit ihr zeigt das
  // Postfach einen Abmeldeknopf — und wer sich abmelden will, drückt den
  // statt "Spam", was sonst den Ruf der Absenderdomain ruiniert.
  assert.deepEqual(abmeldeKopfzeilen("kontakt@volkwork.de"),
    { "List-Unsubscribe": "<mailto:kontakt@volkwork.de?subject=Abmelden>" });

  // Ohne gültige Adresse keine Kopfzeile — eine kaputte wäre schlimmer
  // als keine.
  assert.equal(abmeldeKopfzeilen(""), null);
  assert.equal(abmeldeKopfzeilen("keine-adresse"), null);
  assert.equal(abmeldeKopfzeilen("a@b.de>\r\nBcc: x@y.de"), null);

  // Die Marketing-Mails setzen sie NICHT. Mit ihr zeigen Mailprogramme
  // "Diese Nachricht stammt von einer Mailingliste" über der Mail — und
  // eine persönliche Mail nach einem Telefonat liest sich dann wie eine
  // Rundmail. Diese Entscheidung soll niemand still rückgängig machen.
  const route = readFileSync(new URL("../pages/api/marketing-mail.js", import.meta.url), "utf8");
  assert.ok(!/^\s*abmeldung:/m.test(route),
    "Die Marketing-Route setzt die Abmelde-Kopfzeile — dann erscheint beim Kunden das Mailinglisten-Banner.");
});

test("Die Hinweise zu einer Vorlage stehen gesammelt und mit Schweregrad", async () => {
  const { vorlagenHinweise, ernsteHinweise } = await import("../lib/vorlagenHinweise.js");

  // Vorher standen alle Hinweise verstreut untereinander in der Maske. Jetzt
  // zeigt die Übersicht nur eine Zahl — und die muss die ernsten zählen,
  // nicht jede Randbemerkung.
  const sauber = vorlagenHinweise({
    name: "Erstinfo", betreff: "Hallo {{firma}}",
    text: "Guten Tag {{anrede}} {{nachname}},\n\nDanke für das Gespräch.",
  });
  assert.equal(ernsteHinweise(sauber), 0);

  // Ein Tippfehler im Platzhalter ist ein Fehler: er steht wörtlich beim Kunden.
  const tippfehler = vorlagenHinweise({ name: "X", text: "Hallo {{vorname}}" });
  assert.ok(tippfehler.some((h) => h.art === "fehler" && /\{\{vorname\}\}/.test(h.text)));

  // Fremde Platzhalter bringen den Ersatzvorschlag gleich mit.
  const fremd = vorlagenHinweise({ name: "X", format: "html", html: "<p>Hallo *|FNAME|*</p><p>abmelden</p>" });
  const eintrag = fremd.find((h) => h.fremde);
  assert.equal(eintrag.art, "fehler");
  assert.deepEqual(eintrag.fremde, [{ fund: "*|FNAME|*", vorschlag: "{{name}}" }]);

  // Doppelter Gruss bei Text-Vorlagen ist eine Warnung.
  const doppeltGruss = vorlagenHinweise({ name: "X", text: "Text\n\nViele Grüße\n{{vertriebler}}" }, "Viele Grüße\n{{vertriebler}}");
  assert.ok(doppeltGruss.some((h) => h.art === "warnung" && /doppelt/.test(h.text)));

  // Eine leere Vorlage ist nur ein Hinweis — kein Grund für ein Warnzeichen
  // in der Übersicht, solange man sie gerade erst anlegt.
  const leer = vorlagenHinweise({ name: "", text: "" });
  assert.ok(leer.some((h) => h.art === "info"));
  assert.equal(ernsteHinweise(leer), 0);
});

test("Kunde bleibt Kunde: Der Balken springt beim Planen des Check-ins nicht zurück", () => {
  // Nach dem Closing Call "Kunde geworden" angetippt, dann den Check-in
  // geplant. Früher leerte das Weiterrücken das Ergebnis, und der Balken
  // fiel von 85 % auf 70 %.
  const kunde = {
    termin_art: "closing", status: "wahrgenommen", outcome: "kunde",
    appointment_at: "2026-09-10T10:00:00.000Z",
    stufen_verlauf: [{ art: "erstgespraech", am: "2026-09-01", ergebnis: "follow_up" }],
  };
  assert.equal(fortschritt(kunde), 85);

  const patch = rueckeVor(kunde, "checkin", "2026-10-10T10:00:00.000Z", "ernestine");
  assert.equal(patch.outcome, "kunde");
  assert.equal(patch.status, "geplant");
  const danach = { ...kunde, ...patch };
  assert.equal(fortschritt(danach), 85);
  assert.ok(erreichteMarken(danach).has("kunde"));

  // Hat der Check-in stattgefunden, geht es weiter auf 100 %.
  assert.equal(fortschritt({ ...danach, status: "wahrgenommen" }), 100);

  // Wer noch KEIN Kunde ist, bekommt beim Weiterrücken weiter ein leeres
  // Ergebnis — das Zögern aus dem Setting Call gehört nicht zum Closing.
  const zoegert = { termin_art: "erstgespraech", status: "wahrgenommen", outcome: "follow_up", stufen_verlauf: [] };
  assert.equal(rueckeVor(zoegert, "closing", "2026-09-12T14:00:00.000Z").outcome, null);
});

test("Alte Einträge, bei denen der Kunde nur noch im Verlauf steht, zählen als Kunde", () => {
  // So stehen die Kontakte da, die vor der Korrektur zum Check-in
  // weitergerückt sind (migration_164 repariert sie auch in der Datenbank).
  const alt = {
    termin_art: "checkin", status: "geplant", outcome: null,
    stufen_verlauf: [
      { art: "erstgespraech", ergebnis: "follow_up" },
      { art: "closing", ergebnis: "kunde" },
    ],
  };
  assert.equal(istKundeGeworden(alt), true);
  assert.equal(fortschritt(alt), 85);
  assert.equal(istKundeGeworden({ termin_art: "closing", outcome: "absage", stufen_verlauf: [] }), false);
});

test("Der Kunde, der zum Check-in mitwandert, zählt in der Auswertung nur einmal", () => {
  const imCheckin = {
    termin_art: "checkin", status: "geplant", outcome: "kunde",
    stufen_verlauf: [
      { art: "erstgespraech", ergebnis: "follow_up" },
      { art: "closing", ergebnis: "kunde" },
    ],
  };
  const zeilen = stufenAuswertung([imCheckin]);
  const summe = zeilen.reduce((n, z) => n + z.kunden, 0);
  assert.equal(summe, 1);
  assert.equal(zeilen.find((z) => z.key === "closing").kunden, 1);
  assert.equal(zeilen.find((z) => z.key === "checkin").kunden, 0);
});

test("Die Follow-up-Erinnerungen gehen als Mail an die zuständige Person", async () => {
  const { gruppiereNach, faelligeFollowUpsMail, wartendeKontakteMail, MAX_ZEILEN } = await import("../lib/nachfassMail.js");

  // Je Person eine Mail; Einträge ohne Person fallen weg, statt bei
  // "undefined" zu landen.
  const gruppen = gruppiereNach([
    { id: 1, zustaendig: "a" }, { id: 2, zustaendig: "b" }, { id: 3, zustaendig: "a" }, { id: 4 },
  ], "zustaendig");
  assert.deepEqual([...gruppen.keys()], ["a", "b"]);
  assert.equal(gruppen.get("a").length, 2);

  const eine = faelligeFollowUpsMail([{ titel: "Follow-up: Dirk Reuters", faellig_am: "2026-09-14T06:00:00Z" }], "https://app.example.de");
  assert.equal(eine.subject, "Heute fällig: Follow-up: Dirk Reuters");
  assert.match(eine.html, /Dieses Follow-up ist heute dran/);
  assert.match(eine.html, /https:\/\/app\.example\.de\/kalender/);

  // Was Leute eintippen, landet maskiert im HTML.
  const boese = faelligeFollowUpsMail([{ titel: "<img src=x onerror=alert(1)>", faellig_am: "2026-09-14T06:00:00Z" }]);
  assert.ok(!boese.html.includes("<img"));

  const viele = faelligeFollowUpsMail(Array.from({ length: MAX_ZEILEN + 3 }, (_, i) => ({ titel: `F${i}`, faellig_am: "2026-09-14T06:00:00Z" })));
  assert.equal(viele.subject, `Heute fällig: ${MAX_ZEILEN + 3} Follow-ups`);
  assert.match(viele.html, /… und 3 weitere/);

  const warten = wartendeKontakteMail(
    [{ name: "Dirk Reuters", firma: "Bau & Co", verschickt_am: "2026-09-01T08:00:00Z" }],
    new Date("2026-09-14T08:00:00Z"));
  assert.equal(warten.subject, "1 Kontakt wartet auf ein Follow-up");
  assert.match(warten.html, /Bau &amp; Co/);
  assert.match(warten.html, /seit 13 Tagen ohne Antwort/);
});

test("Die Tagesauswertung vergleicht Arbeitstage, nie das Wochenende", async () => {
  const { auswertungsTage, arbeitstagDavor } = await import("../lib/tagesauswertung.js");
  // Montag, 14.9.2026: Freitag gegen Donnerstag.
  assert.deepEqual(auswertungsTage(new Date("2026-09-14T07:00:00Z")),
    { heute: "2026-09-14", berichtTag: "2026-09-11", vergleichTag: "2026-09-10" });
  // Dienstag: Montag gegen Freitag.
  assert.deepEqual(auswertungsTage(new Date("2026-09-15T07:00:00Z")),
    { heute: "2026-09-15", berichtTag: "2026-09-14", vergleichTag: "2026-09-11" });
  // Samstag und Sonntag kommt nichts.
  assert.equal(auswertungsTage(new Date("2026-09-12T07:00:00Z")), null);
  assert.equal(auswertungsTage(new Date("2026-09-13T07:00:00Z")), null);
  // Kurz nach Mitternacht deutscher Zeit ist schon Montag, in UTC noch Sonntag.
  assert.equal(auswertungsTage(new Date("2026-09-13T22:30:00Z"))?.heute, "2026-09-14");
  assert.equal(arbeitstagDavor("2026-09-14"), "2026-09-11");
});

test("Die Tagesauswertung zählt je Person und nach deutschem Kalendertag", async () => {
  const { zaehleTage } = await import("../lib/tagesauswertung.js");
  const tage = ["2026-09-11", "2026-09-10"];
  const z = zaehleTage({
    anrufe: [
      { user_id: "anna", log_date: "2026-09-11", counts: { anwahlen: 40, entscheider: 3, weitergeleitet: 2, termin: 1 } },
      { user_id: "anna", log_date: "2026-09-10", counts: { anwahlen: 30 } },
    ],
    termine: [
      // 22:30 UTC ist 00:30 in Berlin — der 11., nicht der 10.
      { created_by: "anna", termin_art: "erstgespraech", status: "wahrgenommen", appointment_at: "2026-09-10T22:30:00Z" },
      // Nur geplant: zählt nicht als geführt.
      { created_by: "anna", termin_art: "closing", status: "geplant", appointment_at: "2026-09-11T10:00:00Z" },
      // Weitergerückt: der Closing Call im Verlauf hat am 11. stattgefunden.
      { created_by: "anna", termin_art: "checkin", status: "geplant", appointment_at: "2026-10-11T10:00:00Z",
        stufen_verlauf: [{ art: "closing", am: "2026-09-11T09:00:00Z", ergebnis: "kunde" }],
        kunde_am: "2026-09-11T09:30:00Z",
        schritte: { closing_bestaetigt: { am: "2026-09-10T08:00:00Z", von: "ben" } } },
      // Persönlicher Termin: zählt gar nicht.
      { created_by: "anna", termin_art: "erstgespraech", status: "wahrgenommen", appointment_at: "2026-09-11T12:00:00Z", kein_kundentermin: true },
    ],
    mails: [{ user_id: "anna", verschickt_von: "ben", verschickt_am: "2026-09-11T08:00:00Z" }],
    followUps: [{ zustaendig: "anna", erledigt_am: "2026-09-11T15:00:00Z" }],
  }, tage);

  const anna = z.get("2026-09-11").get("anna");
  assert.equal(anna.anwahlen, 40);
  assert.equal(anna.entscheider, 5);
  assert.equal(anna.terminiert, 1);
  assert.equal(anna.setting, 1);
  assert.equal(anna.closing, 1);
  assert.equal(anna.kunden, 1);
  assert.equal(anna.followups, 1);
  assert.equal(anna.mails, 0);
  // Bestätigt und verschickt hat Ben — es zählt bei ihm.
  assert.equal(z.get("2026-09-10").get("ben").bestaetigt, 1);
  assert.equal(z.get("2026-09-11").get("ben").mails, 1);
  assert.equal(z.get("2026-09-10").get("anna").anwahlen, 30);
});

test("Platz 1 im Team verrät keine fremden Zahlen und zählt nur mit Konkurrenz", async () => {
  const { platzEins, leereZahlen } = await import("../lib/tagesauswertung.js");
  const zahlen = (werte) => ({ ...leereZahlen(), ...werte });
  const jePerson = new Map([
    ["anna", zahlen({ anwahlen: 50, kunden: 1 })],
    ["ben", zahlen({ anwahlen: 50, setting: 2 })],
    ["cem", zahlen({ anwahlen: 20 })],
    ["dora", zahlen({ anwahlen: 90 })],
  ]);
  const orgVon = new Map([["anna", "o1"], ["ben", "o1"], ["cem", "o1"], ["dora", "o2"]]);
  // Gleichstand ist geteilter Platz 1. Dora aus der anderen Firma zählt nicht.
  assert.deepEqual(platzEins("anna", jePerson, orgVon), ["anwahlen"]);
  assert.deepEqual(platzEins("ben", jePerson, orgVon), ["anwahlen"]);
  // Kunden und Setting Calls hat im Team jeweils nur einer: kein Platz 1.
  assert.deepEqual(platzEins("cem", jePerson, orgVon), []);
  assert.deepEqual(platzEins("dora", jePerson, orgVon), []);
});

test("Die Auswertung lobt Steigerung, Bestwerte und Abschlüsse", async () => {
  const { auswertungsText, leereZahlen } = await import("../lib/tagesauswertung.js");
  const zahlen = (werte) => ({ ...leereZahlen(), ...werte });
  const text = auswertungsText({
    name: "Anna Muster", berichtTag: "2026-09-11", vergleichTag: "2026-09-10",
    heute: zahlen({ anwahlen: 60, entscheider: 4, kunden: 1 }),
    vorher: zahlen({ anwahlen: 48, entscheider: 5 }),
    bestwerte: ["anwahlen"],
  });
  assert.match(text, /^☀️ Guten Morgen, Anna!/);
  assert.match(text, /Deine Auswertung für Freitag, 11\.9\. — im Vergleich zum Donnerstag\./);
  assert.match(text, /Anwahlen: 60 \(Do: 48\) ↑/);
  assert.match(text, /Entscheider erreicht: 4 \(Do: 5\) ↓/);
  // Gruppen ohne jede Zahl an beiden Tagen fehlen.
  assert.ok(!/E-Mail und Follow-ups/.test(text));
  assert.ok(!/📅 Termine/.test(text));
  assert.match(text, /🏆 Platz 1 im Team am Freitag: bei den Anwahlen\./);
  assert.match(text, /🎉 Ein neuer Kunde/);
  assert.match(text, /📈 Mehr als am Donnerstag: Anwahlen \(\+25 %\)\./);

  // Nichts besser, nirgends vorne: der stärkste echte Wert, kein Tadel.
  const ruhig = auswertungsText({
    name: "Ben", berichtTag: "2026-09-14", vergleichTag: "2026-09-11",
    heute: zahlen({ anwahlen: 20, mails: 3 }), vorher: zahlen({ anwahlen: 35, mails: 3 }),
  });
  assert.match(ruhig, /💪 Dein stärkster Wert am Montag: Anwahlen 20\./);
  assert.match(ruhig, /\(Fr: 35\)/);
});

test("Der Telegram-Code gilt nur im privaten Chat und nur frisch", async () => {
  const { neuerVerbindungsCode, findeStart, codeGueltig, startLink } = await import("../lib/telegramPersoenlich.js");
  const code = neuerVerbindungsCode(Buffer.from([0, 1, 2, 3, 4, 5, 6, 255]));
  assert.match(code, /^HB[A-HJ-NP-Z2-9]{8}$/);
  assert.match(neuerVerbindungsCode(), /^HB[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(startLink("hb_bot", code), `https://t.me/hb_bot?start=${code}`);

  const seit = "2026-09-15T08:00:00Z";
  const sek = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  const updates = [
    // In einer Gruppe: zählt nicht, sonst landete die Auswertung vor allen.
    { message: { date: sek("2026-09-15T08:01:00Z"), text: `/start ${code}`, chat: { id: -100, type: "group", title: "Team" } } },
    // Zu alt.
    { message: { date: sek("2026-09-15T07:00:00Z"), text: `/start ${code}`, chat: { id: 1, type: "private", first_name: "Alt" } } },
    // Fremder Code.
    { message: { date: sek("2026-09-15T08:02:00Z"), text: "/start HBXXXXXXXX", chat: { id: 2, type: "private", first_name: "Fremd" } } },
    // Richtig — auch klein abgetippt.
    { message: { date: sek("2026-09-15T08:03:00Z"), text: code.toLowerCase(), chat: { id: 42, type: "private", first_name: "Anna", last_name: "Muster" } } },
  ];
  assert.deepEqual(findeStart(updates, code, seit), { chatId: "42", name: "Anna Muster" });
  assert.equal(findeStart(updates.slice(0, 3), code, seit), null);

  assert.equal(codeGueltig(seit, new Date("2026-09-15T08:09:00Z")), true);
  assert.equal(codeGueltig(seit, new Date("2026-09-15T08:11:00Z")), false);
  assert.equal(codeGueltig(null), false);
});

test("Zum Lob kommt ein Zitat, das zum Anlass passt", async () => {
  const { auswertungsText, zitatAnlass, leereZahlen } = await import("../lib/tagesauswertung.js");
  const { ZITATE, zitatFuer, zitatZeile } = await import("../lib/zitate.js");
  const zahlen = (werte) => ({ ...leereZahlen(), ...werte });

  // Jedes Zitat hat einen Urheber und bleibt kurz genug fürs Handy.
  ZITATE.forEach((z) => {
    assert.ok(z.text && z.von && z.anlass, JSON.stringify(z));
    assert.ok(z.text.length <= 120, z.text);
  });
  // Jeder Anlass hat mindestens zwei — sonst käme täglich dasselbe.
  ["abschluss", "spitze", "nachfassen", "steigerung", "dranbleiben"].forEach((a) =>
    assert.ok(ZITATE.filter((z) => z.anlass === a).length >= 2, a));

  // Das Wichtigste zuerst: ein Kunde schlägt Platz 1 und Steigerung.
  assert.equal(zitatAnlass({ heute: zahlen({ kunden: 1, anwahlen: 9 }), vorher: zahlen({}), bestwerte: ["anwahlen"] }), "abschluss");
  assert.equal(zitatAnlass({ heute: zahlen({ anwahlen: 9 }), vorher: zahlen({}), bestwerte: ["anwahlen"] }), "spitze");
  assert.equal(zitatAnlass({ heute: zahlen({ followups: 3, anwahlen: 9 }), vorher: zahlen({ followups: 1 }) }), "nachfassen");
  assert.equal(zitatAnlass({ heute: zahlen({ anwahlen: 9 }), vorher: zahlen({ anwahlen: 5 }) }), "steigerung");
  assert.equal(zitatAnlass({ heute: zahlen({ anwahlen: 4 }), vorher: zahlen({ anwahlen: 5 }) }), "dranbleiben");

  // Derselbe Tag: dasselbe Zitat. Zwei Tage hintereinander: nie dasselbe.
  ["abschluss", "spitze", "nachfassen", "steigerung", "dranbleiben"].forEach((a) => {
    assert.equal(zitatFuer(a, "2026-09-14"), zitatFuer(a, "2026-09-14"));
    for (const [heute, morgen] of [["2026-09-14", "2026-09-15"], ["2026-09-30", "2026-10-01"], ["2026-12-31", "2027-01-01"]]) {
      assert.notEqual(zitatFuer(a, heute).text, zitatFuer(a, morgen).text, `${a} ${heute}`);
    }
    assert.equal(zitatFuer(a, "2026-09-14").anlass, a);
  });

  const text = auswertungsText({
    name: "Anna", berichtTag: "2026-09-11", vergleichTag: "2026-09-10",
    heute: zahlen({ anwahlen: 60, kunden: 1 }), vorher: zahlen({ anwahlen: 48 }),
  });
  const zeile = zitatZeile(zitatFuer("abschluss", "2026-09-11"));
  assert.match(zeile, /^💬 „.+“ — .+$/);
  assert.ok(text.endsWith(zeile), text);

  // Auch am ruhigen Tag kommt eins — unter dem stärksten Wert.
  const ruhig = auswertungsText({
    name: "Ben", berichtTag: "2026-09-14", vergleichTag: "2026-09-11",
    heute: zahlen({ anwahlen: 20 }), vorher: zahlen({ anwahlen: 35 }),
  });
  assert.match(ruhig, /💪 Dein stärkster Wert[^\n]*\n\n💬 „/);

  // Zeilen, die an beiden Tagen 0 sind, fehlen — auch in einer Gruppe,
  // in der sonst etwas steht.
  const gemischt = auswertungsText({
    name: "Cem", berichtTag: "2026-09-15", vergleichTag: "2026-09-14",
    heute: zahlen({ anwahlen: 22, followups: 2 }), vorher: zahlen({ anwahlen: 35 }),
  });
  assert.match(gemischt, /Follow-ups erledigt: 2 \(Mo: 0\) ↑/);
  assert.ok(!/: 0 \(Mo: 0\)/.test(gemischt), gemischt);
  assert.ok(!/Mails verschickt/.test(gemischt));
});

test("alleZeilen holt alle Seiten statt nach tausend aufzuhören", async () => {
  const { alleZeilen } = await import("../lib/alleZeilen.js");
  const bestand = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
  let abfragen = 0;
  const baue = () => ({
    range: async (von, bis) => { abfragen += 1; return { data: bestand.slice(von, bis + 1), error: null }; },
  });
  const { data } = await alleZeilen(baue);
  assert.equal(data.length, 2345);
  assert.equal(abfragen, 3);
  assert.equal(new Set(data.map((z) => z.id)).size, 2345);

  // Genau tausend: eine leere Seite zur Bestätigung, nicht endlos.
  const tausend = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
  const { data: d2 } = await alleZeilen(() => ({ range: async (v, b) => ({ data: tausend.slice(v, b + 1), error: null }) }));
  assert.equal(d2.length, 1000);

  // Ein Fehler wird weitergegeben, nicht als leere Liste verschluckt.
  const { data: d3, error } = await alleZeilen(() => ({ range: async () => ({ data: null, error: { message: "kaputt" } }) }));
  assert.equal(d3, null);
  assert.equal(error.message, "kaputt");
});

test("Onboarding: Schritte haken sich selbst ab, Fristen zählen ab dem Start", async () => {
  const { planStand, schrittStand, darfAbhaken, pruefeSchritt, erinnerungsText, fertigText, datumKurz } = await import("../lib/onboarding.js");
  const schritte = [
    { id: "a", titel: "Profil ausfüllen", reihenfolge: 0, automatisch: "profil", faellig_tag: 1 },
    { id: "b", titel: "50 Anwahlen", reihenfolge: 1, automatisch: "anwahlen", ziel_anzahl: 50, faellig_tag: 5 },
    { id: "c", titel: "Probetelefonat", reihenfolge: 2, wer: "leitung", faellig_tag: 3 },
    { id: "d", titel: "Leitfaden lesen", reihenfolge: 3, wer: "vertrieb" },
  ];
  const stand = planStand(schritte, {
    werte: { profil: true, anwahlen: 37 },
    haken: { d: { erledigt_am: "2026-09-15T08:00:00Z", von_name: "Anna" } },
    gestartetAm: "2026-09-10",
    heute: "2026-09-14",
  });
  assert.equal(stand.gesamt, 4);
  assert.equal(stand.erledigt, 2);
  assert.equal(stand.prozent, 50);
  const nach = Object.fromEntries(stand.liste.map((x) => [x.schritt.id, x]));
  assert.equal(nach.a.erledigt, true);
  // 37 von 50: nicht erledigt, Frist Tag 5 = 15.9., am 14.9. noch nicht überfällig.
  assert.equal(nach.b.erledigt, false);
  assert.equal(nach.b.ist, 37);
  assert.equal(nach.b.ziel, 50);
  assert.equal(nach.b.faelligAm, "2026-09-15");
  assert.equal(nach.b.ueberfaellig, false);
  // Tag 3 = 13.9.: am 14.9. überfällig.
  assert.equal(nach.c.ueberfaellig, true);
  assert.equal(stand.ueberfaellig, 1);
  assert.equal(stand.naechster.id, "b");
  assert.equal(stand.fertig, false);

  // Am Fristtag selbst ist noch nichts überfällig.
  assert.equal(schrittStand(schritte[2], { gestartetAm: "2026-09-10", heute: "2026-09-13" }).ueberfaellig, false);
  // Ohne Frist nie überfällig.
  assert.equal(schrittStand(schritte[3], { gestartetAm: "2026-01-01", heute: "2026-09-13" }).ueberfaellig, false);
  // Ein leerer Plan ist nicht "fertig".
  assert.equal(planStand([], {}).fertig, false);
  assert.equal(planStand([schritte[3]], { haken: { d: {} } }).fertig, true);

  // Wer darf abhaken?
  assert.equal(darfAbhaken(schritte[0], { istLeitung: true }), false);       // automatisch: niemand
  assert.equal(darfAbhaken(schritte[2], { istLeitung: true }), true);
  assert.equal(darfAbhaken(schritte[2], { istEigene: true }), false);        // Leitungsschritt
  assert.equal(darfAbhaken(schritte[3], { istEigene: true }), true);
  assert.equal(darfAbhaken(schritte[3], { istEigene: false }), false);       // fremder Plan

  // Eingaben
  assert.match(pruefeSchritt({ titel: "  " }).fehler, /Titel/);
  assert.match(pruefeSchritt({ titel: "X", automatisch: "anwahlen" }).fehler, /Anwahlen/);
  assert.match(pruefeSchritt({ titel: "X", automatisch: "hacken" }).fehler, /Unbekannte/);
  assert.match(pruefeSchritt({ titel: "X", faellig_tag: "-1" }).fehler, /0 bis 365/);
  assert.deepEqual(pruefeSchritt({ titel: " Telegram ", automatisch: "telegram", wer: "leitung", ziel_anzahl: 9, faellig_tag: "2" }).schritt,
    { titel: "Telegram", beschreibung: null, wer: "vertrieb", automatisch: "telegram", ziel_anzahl: null, faellig_tag: 2 });
  assert.equal(pruefeSchritt({ titel: "X", faellig_tag: "" }).schritt.faellig_tag, null);

  // Texte
  assert.equal(datumKurz("2026-09-05"), "5.9.");
  const eintraege = [{ titel: "Probetelefonat", faelligAm: "2026-09-13" }];
  assert.match(erinnerungsText({ name: "Anna Muster", eintraege }), /^⏰ Dein Onboarding: Dieser Schritt ist überfällig\./);
  assert.match(erinnerungsText({ name: "Anna Muster", eintraege, fuerLeitung: true }), /^⏰ Onboarding von Anna Muster: Ein Schritt ist überfällig\./);
  assert.match(erinnerungsText({ name: "A", eintraege }), /• Probetelefonat \(fällig bis 13\.9\.\)/);
  assert.match(fertigText({ name: "Anna Muster" }), /Glückwunsch, Anna!/);
});

test("Die Onboarding-Übersicht zeigt Rückstand, Dauer und Engpässe", async () => {
  const { onboardingUebersicht, tageZwischen } = await import("../lib/onboarding.js");
  const person = (name, prozent, ueberfaellig, liste, extra = {}) => ({
    person: { full_name: name },
    gestartet_am: "2026-09-01",
    stand: { prozent, ueberfaellig, fertig: prozent === 100, liste },
    ...extra,
  });
  const offen = (id, titel, ueberfaellig = false) => ({ schritt: { id, titel }, erledigt: false, ueberfaellig });
  const fertig = (id, titel) => ({ schritt: { id, titel }, erledigt: true, ueberfaellig: false });

  const u = onboardingUebersicht([
    person("Anna", 50, 1, [fertig("a", "Profil"), offen("b", "Probetelefonat", true)]),
    person("Ben", 0, 0, [offen("a", "Profil"), offen("b", "Probetelefonat")]),
    person("Cem", 100, 0, [fertig("a", "Profil"), fertig("b", "Probetelefonat")], { abgeschlossen_am: "2026-09-15T09:00:00Z" }),
  ]);
  assert.equal(u.laufend, 2);
  assert.equal(u.fertig, 1);
  assert.equal(u.prozent, 25);              // (50 + 0) / 2
  assert.equal(u.ueberfaellig, 1);
  assert.equal(u.mitRueckstand, 1);
  assert.equal(u.dauerSchnitt, 14);         // 1.9. bis 15.9.
  // Der Schritt mit Überfälligem steht oben, obwohl beide gleich oft offen sind.
  assert.deepEqual(u.engpaesse.map((e) => [e.titel, e.offen, e.ueberfaellig]),
    [["Probetelefonat", 2, 1], ["Profil", 1, 0]]);

  // Ohne Leute im Onboarding steht überall 0, nichts bricht.
  const leer = onboardingUebersicht([]);
  assert.deepEqual([leer.laufend, leer.prozent, leer.ueberfaellig, leer.dauerSchnitt, leer.engpaesse.length], [0, 0, 0, null, 0]);
  assert.equal(tageZwischen("2026-09-10", "2026-09-14"), 4);
  assert.equal(tageZwischen(null, "2026-09-14"), null);
});

test("Die Willkommensnachricht grüsst mit der Organisation, erklärt die Haltung und zeigt den Weg", async () => {
  const { willkommensText } = await import("../lib/telegramPersoenlich.js");

  const text = willkommensText({
    organisation: "VolkWork", name: "Anna Muster", appUrl: "https://app.example.de", imOnboarding: true, tag: "2026-09-18",
  });
  assert.match(text, /^👋 Herzlich willkommen bei VolkWork, Anna!/);
  // Rechtschreibung: "Diese Nachrichten sieht nur du" war falsch.
  assert.match(text, /Diese Nachrichten siehst nur du\./);
  assert.ok(!/Nachrichten sieht nur du/.test(text));

  // Wofür die Academy da ist und wie hier gearbeitet wird.
  assert.match(text, /Werkzeug für den Vertriebsalltag/);
  assert.match(text, /^So arbeiten wir hier:$/m);
  assert.match(text, /Nachfassen ist die halbe Miete/);
  assert.match(text, /Kein Abschluss ist kein Scheitern/);

  // Was ankommt …
  assert.match(text, /• Follow-ups:/);
  assert.match(text, /• Deine Auswertung: Montag bis Freitag/);
  assert.match(text, /• Onboarding: wenn ein Schritt überfällig ist/);
  // … wo man hinkommt …
  assert.match(text, /• Call Tracker: .*\n {2}https:\/\/app\.example\.de\/call-tracker/);
  assert.match(text, /• Kurse und Training:/);
  // … und womit man anfängt.
  assert.match(text, /Onboarding-Plan/);
  assert.match(text, /Einstellungen → Telegram/);
  assert.match(text, /\n💬 „.+“ — .+$/);
  // Telegram nimmt höchstens 4096 Zeichen.
  assert.ok(text.length < 4000, `zu lang: ${text.length}`);
  // Ohne Führungsrolle nichts über fremde Leute.
  assert.ok(!/Zahlen des Teams/.test(text));

  // Die Leitung bekommt ihre Bereiche dazu.
  const leitung = willkommensText({ organisation: "VolkWork", name: "Houman", appUrl: "https://app.example.de", istLeitung: true, tag: "2026-09-18" });
  assert.match(leitung, /• Onboarding: neue Leute einarbeiten/);
  assert.match(leitung, /• Auswertung: die Zahlen des Teams/);
  assert.match(leitung, /beim Onboarding deiner Leute etwas liegen bleibt/);
  assert.ok(leitung.length < 4000, `zu lang: ${leitung.length}`);

  // Wer noch kein Onboarding hat, bekommt drei konkrete erste Schritte.
  const ohnePlan = willkommensText({ organisation: "VolkWork", name: "Ben", tag: "2026-09-18" });
  assert.match(ohnePlan, /1\. Profil ausfüllen/);
  assert.match(ohnePlan, /2\. .*Call Tracker/);
  assert.ok(!/Onboarding/.test(ohnePlan));

  // Ohne Organisation, Namen und Adresse bleibt die Nachricht heil.
  const knapp = willkommensText({ tag: "2026-09-18" });
  assert.match(knapp, /^👋 Herzlich willkommen!/);
  assert.ok(!/undefined|https/.test(knapp));
});

test("Die Seitenhinweise erklären kurz und genau dort, wo man ist", async () => {
  const { SEITEN_HINWEISE, hinweisFuer } = await import("../lib/seitenHinweise.js");

  assert.equal(hinweisFuer("/call-tracker").text.length > 0, true);
  assert.equal(hinweisFuer("/gibtsnicht"), null);
  assert.equal(hinweisFuer(undefined), null);

  const pfade = SEITEN_HINWEISE.map((h) => h.pfad);
  assert.equal(new Set(pfade).size, pfade.length, "ein Pfad steht doppelt");
  SEITEN_HINWEISE.forEach((h) => {
    assert.match(h.pfad, /^\/[a-z-]+$/, h.pfad);
    // Ein Satz, kein Handbuch: zwei Sätze liest niemand.
    assert.ok(h.text.length <= 170, `zu lang (${h.text.length}): ${h.pfad}`);
    assert.ok(h.text.trim().endsWith("."), h.pfad);
  });
  // Die Seiten, auf denen ein Neuer am ersten Tag landet, haben einen.
  ["/call-tracker", "/termine", "/follow-up", "/courses", "/settings"].forEach((p) =>
    assert.ok(hinweisFuer(p), p));
});

test("Der Wochenimpuls rechnet die Woche zusammen und erfindet keine Zahl", async () => {
  const { impulsWochen, summiereTage, zahlenBlock, impulsNachricht, impulsFallback, impulsFrage, istImpulsTag, hatWochenaktivitaet } =
    await import("../lib/wochenimpuls.js");
  const { leereZahlen } = await import("../lib/tagesauswertung.js");

  // Mittwoch, 16.9.2026: Montag bis Mittwoch, Vorwoche voll.
  const w = impulsWochen(new Date("2026-09-16T07:00:00Z"));
  assert.equal(w.woche, "2026-09-14");
  assert.deepEqual(w.diese, ["2026-09-14", "2026-09-15", "2026-09-16"]);
  assert.equal(w.vorher.length, 7);
  assert.equal(w.vorher[0], "2026-09-07");
  assert.equal(istImpulsTag(new Date("2026-09-18T07:00:00Z")), true);   // Freitag
  assert.equal(istImpulsTag(new Date("2026-09-16T07:00:00Z")), false);

  const tagesZahlen = (werte) => ({ ...leereZahlen(), ...werte });
  const proTag = new Map([
    ["2026-09-14", new Map([["anna", tagesZahlen({ anwahlen: 40, terminiert: 1 })]])],
    ["2026-09-15", new Map([["anna", tagesZahlen({ anwahlen: 35 })], ["ben", tagesZahlen({ anwahlen: 10 })]])],
    ["2026-09-16", new Map()],
  ]);
  const summe = summiereTage(proTag, w.diese, "anna");
  assert.equal(summe.anwahlen, 75);
  assert.equal(summe.terminiert, 1);
  assert.equal(summiereTage(proTag, w.diese, "cem").anwahlen, 0);
  assert.equal(hatWochenaktivitaet(summe), true);
  assert.equal(hatWochenaktivitaet(leereZahlen()), false);

  // Der Zahlenblock zeigt nur Zeilen mit Inhalt, mit Richtungspfeil.
  const block = zahlenBlock(summe, tagesZahlen({ anwahlen: 90 }));
  assert.deepEqual(block, ["Anwahlen: 75 (Vorwoche: 90) ↓", "Terminiert: 1 (Vorwoche: 0) ↑"]);

  // Die Nachricht setzt Zahlen, KI-Text, Anknüpfung und Frage zusammen.
  const text = impulsNachricht({
    name: "Anna Muster", zahlen: summe, vorher: tagesZahlen({ anwahlen: 90 }),
    frage: "Wie lief die Woche?", kiText: "Die Anwahlen sind etwas runter.", anknuepfung: "Letzte Woche wolltest du: früher anfangen",
  });
  assert.match(text, /^🎯 Deine Woche, Anna/);
  assert.match(text, /Anwahlen: 75 \(Vorwoche: 90\) ↓/);
  assert.match(text, /🔁 Letzte Woche wolltest du: früher anfangen/);
  assert.match(text, /❓ Wie lief die Woche\?/);
  assert.match(text, /Antworte einfach hier im Chat/);
  assert.ok(!/\n\n\n/.test(text), "doppelte Leerzeilen");

  // Ohne KI geht trotzdem etwas raus — mit denselben Zahlen.
  const ersatz = impulsFallback({ name: "Anna", zahlen: summe, vorher: tagesZahlen({ anwahlen: 90 }), frage: "Und?" });
  assert.match(ersatz, /Anwahlen: 75 \(Vorwoche: 90\)/);
  assert.match(ersatz, /❓ Und\?/);

  // Jede Woche eine andere Frage, dieselbe Woche dieselbe.
  assert.equal(impulsFrage("2026-09-14"), impulsFrage("2026-09-14"));
  assert.notEqual(impulsFrage("2026-09-14"), impulsFrage("2026-09-21"));
});

test("Der Wochenrückblick liest Herausforderungen heraus, auch aus unsauberem JSON", async () => {
  const { leseRueckblick, anknuepfung, gedaechtnisZeilen, haeufigeHerausforderungen, stimmungsBild, HOECHSTENS_HERAUSFORDERUNGEN } =
    await import("../lib/buddyRueckblick.js");

  // Sprach-KIs verpacken JSON gern in Codeblöcke oder schreiben davor.
  const roh = 'Klar, hier:\n```json\n{"herausforderungen": ["Kommt selten am Vorzimmer vorbei", "Zu wenig Zeit zum Telefonieren"], "stimmung": "gemischt", "vorhaben": "Morgens vor 10 Uhr starten", "zusammenfassung": "Woche war zäh, Motivation aber da."}\n```';
  const r = leseRueckblick(roh);
  assert.deepEqual(r.herausforderungen, ["Kommt selten am Vorzimmer vorbei", "Zu wenig Zeit zum Telefonieren"]);
  assert.equal(r.stimmung, "gemischt");
  assert.equal(r.vorhaben, "Morgens vor 10 Uhr starten");

  // Unsinn ergibt nichts, statt halbe Wahrheiten zu speichern.
  assert.equal(leseRueckblick("Ich kann das nicht beantworten."), null);
  assert.equal(leseRueckblick(""), null);
  assert.equal(leseRueckblick('{"stimmung": "euphorisch"}'), null);

  // Zu viele, zu lange Einträge werden gekappt.
  const viele = leseRueckblick(JSON.stringify({
    herausforderungen: ["a".repeat(200), "b", "c", "d", "e"], stimmung: "schwer",
  }));
  assert.equal(viele.herausforderungen.length, HOECHSTENS_HERAUSFORDERUNGEN);
  assert.equal(viele.herausforderungen[0].length, 80);

  assert.match(anknuepfung(r), /^Letzte Woche wolltest du: Morgens vor 10 Uhr starten$/);
  assert.equal(anknuepfung(null), "");
  assert.ok(gedaechtnisZeilen(r).some((z) => z.startsWith("Hakte bei:")));

  // Für die Leitung: gleiche Themen zusammengefasst, je Person einmal gezählt.
  const haeufig = haeufigeHerausforderungen([
    { user_id: "a", herausforderungen: ["Kommt selten am Vorzimmer vorbei.", "kommt selten am vorzimmer vorbei"] },
    { user_id: "b", herausforderungen: ["Kommt selten am Vorzimmer vorbei"] },
    { user_id: "c", herausforderungen: ["Zu wenig Zeit zum Telefonieren"] },
  ]);
  assert.equal(haeufig[0].personen, 2);
  assert.equal(haeufig[0].anzahl, 2);
  assert.equal(haeufig.length, 2);

  assert.deepEqual(stimmungsBild([{ stimmung: "gut" }, { stimmung: "gut" }, { stimmung: "schwer" }, {}]),
    { gut: 2, gemischt: 0, schwer: 1, ohne: 1 });
});

test("Die Mini-Schulung trifft das Thema und liefert Lektion, Übung und Fazit", async () => {
  const { SCHULUNGEN, schulungVon, themaAusText, themaAusZahlen, naechstesThema, lektionsText, uebungsText, fazitZeile } =
    await import("../lib/schulung.js");

  // Jeder Baustein ist vollständig — halbe Schulungen helfen niemandem.
  SCHULUNGEN.forEach((s) => {
    ["key", "titel", "kern", "formulierung", "uebung"].forEach((feld) => assert.ok(s[feld], `${s.key}: ${feld} fehlt`));
    assert.ok(s.erkennung.length > 0, s.key);
    assert.ok(s.link?.pfad?.startsWith("/"), s.key);
  });
  assert.equal(new Set(SCHULUNGEN.map((s) => s.key)).size, SCHULUNGEN.length);

  // Aus dem, was jemand schreibt.
  assert.equal(themaAusText("Ich komme am Vorzimmer einfach nicht vorbei"), "vorzimmer");
  assert.equal(themaAusText("Die sagen alle sofort kein Interesse"), "einwand");
  assert.equal(themaAusText("zwei Termine sind diese Woche geplatzt"), "noshow");
  assert.equal(themaAusText("ok"), null);
  assert.equal(themaAusText(""), null);

  // Aus den Zahlen — der Reihe nach: erst die Menge, dann das Durchkommen,
  // dann der Termin, dann der Abschluss.
  const z = (w) => ({ anwahlen: 0, entscheider: 0, terminiert: 0, setting: 0, closing: 0, kunden: 0, mails: 0, followups: 0, ...w });
  assert.equal(themaAusZahlen(z({ anwahlen: 20 })), "telefonzeit");
  assert.equal(themaAusZahlen(z({ anwahlen: 200, entscheider: 8 })), "vorzimmer");
  assert.equal(themaAusZahlen(z({ anwahlen: 200, entscheider: 40, terminiert: 3 })), "einstieg");
  assert.equal(themaAusZahlen(z({ anwahlen: 200, entscheider: 40, terminiert: 10, setting: 4 })), "noshow");
  assert.equal(themaAusZahlen(z({ anwahlen: 200, entscheider: 40, terminiert: 10, setting: 9, closing: 3, kunden: 0 })), "abschluss");
  assert.equal(themaAusZahlen(z({ anwahlen: 200, entscheider: 40, terminiert: 10, setting: 9, mails: 5, followups: 0 })), "nachfassen");
  assert.equal(themaAusZahlen(z({})), null);

  // Das Gespräch schlägt die Zahlen, und nichts wird zweimal geschult.
  assert.equal(naechstesThema({ text: "das Vorzimmer blockt immer", zahlen: z({ anwahlen: 10 }) }), "vorzimmer");
  assert.equal(naechstesThema({ text: "das Vorzimmer blockt immer", zahlen: z({ anwahlen: 10 }), ausser: ["vorzimmer"] }), "telefonzeit");
  assert.equal(naechstesThema({ text: "alles gut", zahlen: z({}) }), null);

  // Die Texte
  const s = schulungVon("vorzimmer");
  const lektion = lektionsText(s, "https://app.example.de");
  assert.match(lektion, /^📘 Kurz was für dich: Am Vorzimmer vorbei/);
  assert.match(lektion, /So sagst du es:/);
  assert.match(lektion, /https:\/\/app\.example\.de\/scripts/);
  assert.match(lektion, /Morgen schicke ich dir die passende Übung/);
  // Ohne Adresse kein kaputter Link.
  assert.ok(!/https|undefined/.test(lektionsText(s)));

  assert.match(uebungsText(s), /^🎯 Deine Übung: Am Vorzimmer vorbei/);
  assert.match(uebungsText(s), /Schreib mir danach kurz/);

  assert.match(fazitZeile(s, true), /Übung gemacht/);
  assert.match(fazitZeile(s, false), /liegen geblieben/);
  assert.match(fazitZeile(s, null), /Thema der Woche war/);
  assert.equal(fazitZeile(null, true), "");
});

test("Der Rückblick sagt nur bei klarer Lage, ob die Übung gemacht wurde", async () => {
  const { leseRueckblick } = await import("../lib/buddyRueckblick.js");
  const basis = { herausforderungen: ["Kommt selten durch"], stimmung: "gemischt" };
  assert.equal(leseRueckblick(JSON.stringify({ ...basis, uebung_gemacht: "ja" })).uebungGemacht, true);
  assert.equal(leseRueckblick(JSON.stringify({ ...basis, uebung_gemacht: "nein" })).uebungGemacht, false);
  assert.equal(leseRueckblick(JSON.stringify({ ...basis, uebung_gemacht: "unklar" })).uebungGemacht, null);
  assert.equal(leseRueckblick(JSON.stringify(basis)).uebungGemacht, null);
});

test("Der Telegram-Eingang weist sich mit einem abgeleiteten Geheimnis aus", async () => {
  const { webhookGeheimnis, webhookAdresse, geheimnisPasst, leseUpdate, verbindungsCodeAus } =
    await import("../lib/telegramWebhook.js");

  // Aus dem Serverschlüssel abgeleitet: kein zusätzliches Passwort, das
  // jemand abtippen und verlieren könnte.
  const g = webhookGeheimnis("service-role-abc");
  assert.match(g, /^[0-9a-f]{48}$/);
  assert.equal(webhookGeheimnis("service-role-abc"), g);
  assert.notEqual(webhookGeheimnis("anderer-schluessel"), g);
  assert.equal(webhookGeheimnis(""), null);

  assert.equal(geheimnisPasst(g, g), true);
  assert.equal(geheimnisPasst("falsch", g), false);
  assert.equal(geheimnisPasst("", g), false);
  assert.equal(geheimnisPasst(g, ""), false);

  // Nur https, ohne Schrägstrich am Ende.
  assert.equal(webhookAdresse("https://app.example.de/"), "https://app.example.de/api/telegram-eingang");
  assert.equal(webhookAdresse("http://app.example.de"), null);
  assert.equal(webhookAdresse(""), null);

  // Aus einer Meldung wird das Wesentliche.
  const nachricht = leseUpdate({
    update_id: 42,
    message: { date: 1789000000, text: "Hallo", chat: { id: -100123, type: "group", title: "Vertrieb" } },
  });
  assert.equal(nachricht.update_id, 42);
  assert.equal(nachricht.art, "message");
  assert.equal(nachricht.chat_id, "-100123");
  assert.equal(nachricht.chat_name, "Vertrieb");
  assert.equal(nachricht.chat_typ, "group");
  assert.match(nachricht.gesendet_am, /^\d{4}-\d{2}-\d{2}T/);

  const beigetreten = leseUpdate({ update_id: 43, my_chat_member: { chat: { id: 7, type: "supergroup", title: "Neu" } } });
  assert.equal(beigetreten.art, "my_chat_member");
  assert.equal(leseUpdate({ update_id: 44 }), null);
  assert.equal(leseUpdate({}), null);

  // Der Verbindungs-Code, egal ob per Knopf oder abgetippt.
  assert.equal(verbindungsCodeAus("/start HB7K3Q9MX2"), "HB7K3Q9MX2");
  assert.equal(verbindungsCodeAus("hb7k3q9mx2"), "HB7K3Q9MX2");
  assert.equal(verbindungsCodeAus("Hallo, wie geht's?"), null);
});

test("Die Sofort-Antworten richten sich von selbst ein", async () => {
  const { stelleWebhookSicher } = await import("../lib/telegramWebhook.js");
  const ziel = "https://app.example.de/api/telegram-eingang";

  // Steht der Webhook schon richtig, wird nichts gesetzt.
  let aufrufe = [];
  const antwort = (daten) => Promise.resolve({ json: async () => daten });
  let ergebnis = await stelleWebhookSicher({
    token: "t", appUrl: "https://app.example.de", geheimnis: "g".repeat(48),
    fetchFn: (url) => { aufrufe.push(url); return antwort({ ok: true, result: { url: ziel } }); },
  });
  assert.deepEqual([ergebnis.aktiv, ergebnis.schonGesetzt], [true, true]);
  assert.equal(aufrufe.filter((u) => u.includes("setWebhook")).length, 0);

  // Steht er falsch oder gar nicht, wird er gesetzt — mit Geheimnis.
  aufrufe = [];
  let gesendet = null;
  ergebnis = await stelleWebhookSicher({
    token: "t", appUrl: "https://app.example.de", geheimnis: "g".repeat(48),
    fetchFn: (url, opt) => {
      aufrufe.push(url);
      if (url.includes("setWebhook")) { gesendet = JSON.parse(opt.body); return antwort({ ok: true }); }
      return antwort({ ok: true, result: { url: "" } });
    },
  });
  assert.equal(ergebnis.gesetzt, true);
  assert.equal(gesendet.url, ziel);
  assert.ok(gesendet.secret_token?.length >= 32);
  assert.equal(gesendet.drop_pending_updates, true);

  // Ohne Adresse oder Bot passiert nichts, und es fliegt nichts.
  assert.equal((await stelleWebhookSicher({ token: "", appUrl: "https://app.example.de", geheimnis: "g" })).aktiv, false);
  assert.match((await stelleWebhookSicher({ token: "t", appUrl: "", geheimnis: "g" })).grund, /NEXT_PUBLIC_APP_URL/);
  assert.match((await stelleWebhookSicher({ token: "t", appUrl: "https://app.example.de", geheimnis: "" })).grund, /Service-Role/);
  // Antwortet Telegram nicht, kommt der Grund zurück statt eines Absturzes.
  const kaputt = await stelleWebhookSicher({
    token: "t", appUrl: "https://app.example.de", geheimnis: "g".repeat(48),
    fetchFn: () => { throw new Error("Netz weg"); },
  });
  assert.deepEqual([kaputt.aktiv, kaputt.grund], [false, "Netz weg"]);
});

test("Die Teamlage zeigt Zahlen und Frühwarnungen — nie ein Wort aus dem Chat", async () => {
  const { teamlageText, fruehwarnungen, teamZeilenFuerKI } = await import("../lib/teamlage.js");
  const { leereZahlen } = await import("../lib/tagesauswertung.js");
  const z = (w) => ({ ...leereZahlen(), ...w });

  const personen = [
    {
      name: "Anna Muster", zahlen: z({ anwahlen: 214, terminiert: 6, setting: 4, kunden: 1 }),
      vorwoche: z({ anwahlen: 180, terminiert: 4, setting: 5 }), stimmung: "gut", stimmungsFolge: 0,
      herausforderungen: ["Kommt selten am Vorzimmer vorbei"], schulung: "vorzimmer",
      verbunden: true, letzteAntwortTage: 1, onboardingUeberfaellig: 0,
    },
    {
      name: "Ben Beispiel", zahlen: z({ anwahlen: 40 }), vorwoche: z({ anwahlen: 140, terminiert: 3 }),
      stimmung: "schwer", stimmungsFolge: 2, herausforderungen: [], schulung: null,
      verbunden: true, letzteAntwortTage: 20, onboardingUeberfaellig: 2,
    },
    {
      name: "Cem Ruhig", zahlen: z({}), vorwoche: z({}), stimmung: null, stimmungsFolge: 0,
      herausforderungen: [], schulung: null, verbunden: false, letzteAntwortTage: null, onboardingUeberfaellig: 0,
    },
  ];

  const warnungen = fruehwarnungen(personen);
  const gruende = warnungen.map((w) => `${w.name}: ${w.grund}`);
  assert.ok(gruende.some((g) => /Ben Beispiel: Anwahlen von 140 auf 40 gefallen/.test(g)));
  assert.ok(gruende.some((g) => /Ben Beispiel: 2\. Woche in Folge als schwer/.test(g)));
  assert.ok(gruende.some((g) => /Ben Beispiel: seit 20 Tagen keine Antwort/.test(g)));
  assert.ok(gruende.some((g) => /Ben Beispiel: 2 überfällige Onboarding-Schritte/.test(g)));
  // Wer ruhig arbeitet, ist kein Alarm.
  assert.ok(!gruende.some((g) => /Cem/.test(g)));
  // Und eine gute Woche erst recht nicht.
  assert.ok(!gruende.some((g) => /Anna/.test(g)));

  const text = teamlageText({ organisation: "VolkWork", woche: "2026-09-14", personen, name: "Houman Honarmand" });
  assert.match(text, /^📊 Teamlage — VolkWork/);
  assert.match(text, /Anwahlen 254 \(320\) ↓/);        // Summe des Teams
  assert.match(text, /2 von 3 haben diese Woche telefoniert/);
  assert.match(text, /• Anna Muster: Anwahlen 214 \(180\) ↑/);
  assert.match(text, /Themen: Kommt selten am Vorzimmer vorbei/);
  assert.match(text, /Training: Am Vorzimmer vorbei/);
  assert.match(text, /⚠️ Achte auf:/);
  assert.match(text, /Frag mich einfach/);

  // Ohne Auffälligkeit steht das auch da.
  const ruhig = teamlageText({ woche: "2026-09-14", personen: [personen[0]] });
  assert.match(ruhig, /✅ Nichts, das sofort ein Gespräch braucht\./);

  // Was die KI für Rückfragen bekommt: Zahlen und Stichpunkte, plus die
  // ausdrückliche Grenze.
  const zeilen = teamZeilenFuerKI(personen);
  assert.match(zeilen.join("\n"), /- Anna Muster:\n {2}· diese Woche: Anwahlen 214 \(Vorwoche 180\)/);
  assert.match(zeilen[zeilen.length - 1], /Gespräche der Leute kennst du nicht/);
  assert.deepEqual(teamZeilenFuerKI([]), []);
});

test("Ein Closing Call ist kein Abschluss — und die Leitung bekommt keine eigene Bewertung", async () => {
  const { closingSatz, personenZeile, teamZeilenFuerKI, leitungsAnweisung, teamlageText } = await import("../lib/teamlage.js");
  const { leereZahlen } = await import("../lib/tagesauswertung.js");
  const z = (w) => ({ ...leereZahlen(), ...w });

  // Der Satz, an dem es hing.
  assert.equal(closingSatz(z({ closing: 1, kunden: 0 })), "1 Closing Call geführt, daraus kein Abschluss");
  assert.equal(closingSatz(z({ closing: 3, kunden: 1 })), "3 Closing Calls geführt, davon 1 mit Abschluss");
  assert.equal(closingSatz(z({ closing: 0, kunden: 2 })), "2 neue Kunden");
  assert.equal(closingSatz(z({})), "");

  const monoke = {
    name: "Monoke", zahlen: z({ anwahlen: 80, terminiert: 2, setting: 2, closing: 1, kunden: 0 }),
    vorwoche: z({ anwahlen: 75 }), stimmung: "gut", stimmungsFolge: 0, herausforderungen: [],
    schulung: null, verbunden: true, letzteAntwortTage: 2, onboardingUeberfaellig: 0,
  };

  // In der Teamlage steht das Ergebnis direkt unter der Zeile.
  const zeile = personenZeile(monoke);
  assert.match(zeile, /Closing Calls geführt 1 \(0\)/);
  assert.match(zeile, /1 Closing Call geführt, daraus kein Abschluss/);
  assert.match(teamlageText({ woche: "2026-09-14", personen: [monoke] }), /daraus kein Abschluss/);

  // Und genauso in dem, was die KI zu sehen bekommt.
  assert.match(teamZeilenFuerKI([monoke]).join("\n"), /· diese Woche: .*— 1 Closing Call geführt, daraus kein Abschluss/);

  // Die Regeln für das Gespräch mit der Leitung.
  const regeln = leitungsAnweisung().join("\n");
  assert.match(regeln, /NUR über diese Person/);
  assert.match(regeln, /eigenen Zahlen der Leitung bewertest du nicht/);
  assert.match(regeln, /Ein Closing Call ist KEIN Abschluss/);
  assert.match(regeln, /ausschliesslich unter "Neue Kunden"/);
  assert.match(regeln, /Schreibe die Zahlen aus/);
});

test("Die Leitung sieht, wer mit dem Bot verbunden ist — und wer noch nicht", async () => {
  const { verbindungsUebersicht } = await import("../lib/botVerbindungen.js");
  const jetzt = new Date("2026-09-18T10:00:00Z");
  const u = verbindungsUebersicht(
    [{ id: "a", full_name: "Zora" }, { id: "b", full_name: "Anna" }, { id: "c", full_name: "Ben" }, { id: "d", full_name: null }],
    [
      { user_id: "a", chat_id: "1", verbunden_am: "2026-09-10T08:00:00Z", buddy: true, tagesauswertung: false },
      { user_id: "b", chat_id: "2", verbunden_am: "2026-09-12T08:00:00Z", buddy: false },
      // Getrennt: Die Zeile gibt es noch, die Chat-Kennung nicht mehr.
      { user_id: "c", chat_id: null, verbunden_am: null },
    ],
    [
      { user_id: "a", created_at: "2026-09-16T09:00:00Z" },
      { user_id: "a", created_at: "2026-09-01T09:00:00Z" },
    ],
    jetzt,
  );
  assert.equal(u.gesamt, 4);
  // Alphabetisch.
  assert.deepEqual(u.verbunden.map((p) => p.name), ["Anna", "Zora"]);
  assert.deepEqual(u.offen.map((p) => p.name), ["Ben", "Unbenannt"]);

  const zora = u.verbunden.find((p) => p.name === "Zora");
  assert.equal(zora.letzteAntwortTage, 2);            // die neueste Antwort zählt
  assert.equal(zora.tagesauswertung, false);
  const anna = u.verbunden.find((p) => p.name === "Anna");
  assert.equal(anna.buddy, false);
  assert.equal(anna.letzteAntwortTage, null);          // noch nie geantwortet
  // Keine Chat-Kennung in der Ausgabe.
  assert.ok(!JSON.stringify(u).includes("chat_id"));
});

test("Der Buddy trennt für die Leitung Tages- und Wochenzahlen", async () => {
  const { teamZeilenFuerKI, leitungsAnweisung } = await import("../lib/teamlage.js");
  const { leereZahlen } = await import("../lib/tagesauswertung.js");
  const z = (w) => ({ ...leereZahlen(), ...w });

  // Ernestine: heute wenig, gestern viel, in der Woche noch mehr. Genau
  // diese drei Zahlen durften nicht ineinander verrutschen.
  const ernestine = {
    name: "Ernestine",
    heute: z({ anwahlen: 12 }),
    letzterTag: z({ anwahlen: 41, terminiert: 2, closing: 1 }),
    zahlen: z({ anwahlen: 150, terminiert: 5, closing: 1 }),
    vorwoche: z({ anwahlen: 160, terminiert: 4 }),
  };
  const text = teamZeilenFuerKI([ernestine], { heuteTag: "2026-09-18", letzterTag: "2026-09-17", woche: "2026-09-14" }).join("\n");
  assert.match(text, /· heute bisher \(Freitag, 18\.9\.\): Anwahlen 12\n/);
  assert.match(text, /· letzter Arbeitstag \(Donnerstag, 17\.9\.\): Anwahlen 41, Terminiert 2, Closing Calls geführt 1 — 1 Closing Call geführt, daraus kein Abschluss/);
  assert.match(text, /· diese Woche ab Montag, 14\.9\.: Anwahlen 150 \(Vorwoche 160\)/);
  assert.match(text, /heute bisher" ist der Stand der letzten Speicherung/);

  // Ohne Eintrag an einem Tag steht das auch so da — nicht die Wochenzahl.
  const leer = teamZeilenFuerKI([{ ...ernestine, heute: z({}) }], { heuteTag: "2026-09-18" }).join("\n");
  assert.match(leer, /· heute bisher \(Freitag, 18\.9\.\): nichts eingetragen/);

  // Und kein "vor 1 Tagen".
  const { vorTagen } = await import("../lib/teamlage.js");
  assert.deepEqual([vorTagen(0), vorTagen(1), vorTagen(5)], ["heute", "gestern", "vor 5 Tagen"]);

  const regeln = leitungsAnweisung().join("\n");
  assert.match(regeln, /Nenne zu JEDER Zahl ihren Zeitraum/);
  assert.match(regeln, /niemals die Wochensumme als Tageszahl/);
  assert.match(regeln, /Gibt es für den gefragten Zeitraum keine Zahlen, sag genau das/);
});

test("Ein gespeicherter Datei-Link wird sicher in Bereich und Pfad zerlegt", async () => {
  const { bereichUndPfad, DATEI_QUELLEN } = await import("../lib/dateiQuellen.js");
  const basis = "https://abc.supabase.co/storage/v1/object";

  assert.deepEqual(bereichUndPfad(`${basis}/public/script-files/u1/1700000000.pdf`), { bereich: "script-files", pfad: "u1/1700000000.pdf" });
  // Leerzeichen und Umlaute im Namen, Abfrageteil gehört nicht dazu.
  assert.deepEqual(bereichUndPfad(`${basis}/public/content-files/u1/Leitfaden%20B%C3%BCro.pdf?t=1`),
    { bereich: "content-files", pfad: "u1/Leitfaden Büro.pdf" });
  // Nur die geschützten Bereiche — alles andere ist keine Datei dieser Art.
  assert.equal(bereichUndPfad(`${basis}/public/avatars/u1/bild.jpg`), null);
  assert.equal(bereichUndPfad("https://example.com/datei.pdf"), null);
  assert.equal(bereichUndPfad(""), null);
  // Kein Ausweg aus dem Bereich.
  assert.equal(bereichUndPfad(`${basis}/public/script-files/../email-anhaenge/x.pdf`), null);
  assert.equal(bereichUndPfad(`${basis}/public/script-files/u1/%2E%2E/x.pdf`), null);

  // Jede Datei gehört zu mindestens einem Eintrag, an dem die Rechte hängen.
  Object.values(DATEI_QUELLEN).forEach((quellen) => assert.ok(quellen.length > 0));
});

test("Die Seiten halten sich aktuell, ohne eine Eingabe zu stören", async () => {
  const { vorZeit, ABSTAND } = await import("../lib/autoRefresh.js");
  const jetzt = Date.parse("2026-09-20T12:00:00Z");
  assert.equal(vorZeit(jetzt - 10000, jetzt), "gerade eben");
  assert.equal(vorZeit(jetzt - 60000, jetzt), "vor 1 Minute");
  assert.equal(vorZeit(jetzt - 5 * 60000, jetzt), "vor 5 Minuten");
  assert.equal(vorZeit(jetzt - 2 * 3600000, jetzt), "vor 2 Stunden");
  assert.equal(vorZeit(null), "");
  assert.ok(ABSTAND.LAUFEND >= 30000);

  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
  const auto = lies("lib/autoRefresh.js");
  // Pausiert wird nicht verschluckt: Was ausfiel, wird danach nachgeholt.
  assert.match(auto, /if \(pausiertRef\.current\) \{ versaeumt\.current = true; return; \}/);
  assert.match(auto, /if \(!pausiert && versaeumt\.current\)/);
  // Nur bei sichtbarem Tab.
  assert.match(auto, /if \(!document\.hidden\) hole\(true\)/);

  // Die Seiten mit laufenden Eingaben pausieren währenddessen.
  const termine = lies("pages/termine.js");
  assert.match(termine, /const inArbeit = !!\(followUpId \|\| editingLeadId/);
  assert.match(termine, /pausiert: inArbeit/);
  assert.match(termine, /<AktualisierenKnopf /);
  ["pages/kunden.js", "pages/recordings.js"].forEach((datei) => {
    assert.match(lies(datei), /useAutoAktualisieren\(/, datei);
    assert.match(lies(datei), /<AktualisierenKnopf /, datei);
    assert.match(lies(datei), /pausiert:/, datei);
  });
  // Kein Doppel-Takt: Der alte Zeitgeber ist raus.
  ["pages/termine.js", "pages/kunden.js", "pages/recordings.js"].forEach((datei) => {
    assert.ok(!/setInterval\(\(\) => \{ if \(!document\.hidden\)/.test(lies(datei)), datei);
  });
});

test("Vergangene Termine stehen aufgeräumt: nach Monat gebündelt, eine Zeile je Termin", async () => {
  const { gruppiereNachMonat, monatsTitel, gruppiereNachTag } = await import("../lib/terminGruppen.js");

  assert.equal(monatsTitel("2026-09-22"), "September 2026");
  assert.equal(monatsTitel(null), "Ohne Zeitpunkt");

  const leads = [
    { id: "a", appointment_at: "2026-09-22T09:00:00Z" },
    { id: "b", appointment_at: "2026-09-15T09:00:00Z" },
    { id: "c", appointment_at: "2026-08-31T09:00:00Z" },
    { id: "d", appointment_at: null },
  ];
  const monate = gruppiereNachMonat(leads);
  assert.deepEqual(monate.map((g) => g.titel), ["September 2026", "August 2026", "Ohne Zeitpunkt"]);
  assert.deepEqual(monate[0].leads.map((l) => l.id), ["a", "b"]);
  // Ohne Zeitpunkt bleibt am Ende, wie bei der Tagesgruppierung.
  assert.equal(monate[monate.length - 1].leads[0].id, "d");
  // Dieselben Termine nach Tagen ergäben vier Überschriften — genau das war
  // das Problem.
  assert.ok(gruppiereNachTag(leads).length > monate.length);

  // Die Seite bündelt die Vergangenheit nach Monat und zeichnet Zeilen.
  const seite = readFileSync(new URL("../pages/termine.js", import.meta.url), "utf8");
  assert.match(seite, /ansicht === "vergangen" \? gruppiereNachMonat\(sichtbareLeads\) : gruppiereNachTag\(sichtbareLeads\)/);
  const stelle = seite.indexOf('if (ansicht === "vergangen" && !isExpanded)');
  assert.ok(stelle > 0);
  const zeile = seite.slice(stelle, stelle + 2600);
  // Volle Breite statt Kachel, kein Fortschrittsbalken, dafür das Ergebnis.
  assert.match(zeile, /sm:col-span-2 lg:col-span-3/);
  assert.ok(!/Fortschrittsbalken/.test(zeile));
  assert.match(zeile, /OUTCOME_LABELS\[lead\.outcome\]/);
  // Angetippt öffnet sich die vollständige Ansicht.
  assert.match(zeile, /setExpandedLeadId\(lead\.id\)/);
});

test("Kennzahlen sehen überall gleich aus, und die Veränderung zeigt die richtige Richtung", async () => {
  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
  const kennzahl = lies("components/Kennzahl.js");
  // Eine Beschriftung, eine Zahl, ein Zeitraum — aus den zentralen Klassen.
  assert.match(kennzahl, /className="label"/);
  assert.match(kennzahl, /kennzahl text-\[32px\]/);
  // Bei Absagen ist ein Plus keine gute Nachricht.
  assert.match(kennzahl, /const besser = gut === "hoch" \? delta > 0 : delta < 0;/);
  assert.match(kennzahl, /besser \? "text-teal" : "text-coral"/);
  // Zahlen mit gleicher Zeichenbreite, damit Spalten nicht springen.
  assert.match(kennzahl, /zahl/);

  // Die Auswertung zeigt vier Zählwerte über der Tabelle, keine Quoten:
  // die Differenz zweier Quoten wäre irreführend.
  const auswertung = lies("pages/auswertung.js");
  assert.match(auswertung, /const KOPF_KENNZAHLEN = \[/);
  assert.match(auswertung, /label: "Neue Kunden".*ohneVergleich: true/s);
  assert.ok(!/KOPF_KENNZAHLEN[\s\S]{0,400}quote: true/.test(auswertung));
  assert.match(auswertung, /<KartenKopf/);
  // Der Startbildschirm nutzt dieselben Kacheln.
  assert.match(lies("pages/index.js"), /<Kennzahl label="Heute"/);

  // Die zentralen Klassen gibt es wirklich.
  const css = lies("styles/globals.css");
  assert.match(css, /\.label \{/);
  assert.match(css, /\.kennzahl \{/);
  assert.match(css, /\.zahl \{ font-variant-numeric: tabular-nums; \}/);
});

test("Die Verlaufskurve rechnet richtig: Maßstab ab null, lückenlose Tage, keine Schwünge ins Negative", async () => {
  const { punkteFuer, weicherPfad, flaechenPfad, tagesReihe } = await import("../lib/kurve.js");

  // Maßstab immer ab 0: Aus 48 und 50 darf kein Berg werden.
  const { punkte, hoechster } = punkteFuer([48, 50], 100, 100, 0);
  assert.equal(hoechster, 50);
  assert.equal(Math.round(punkte[1].y), 0);
  assert.equal(Math.round(punkte[0].y), 4);

  // Ein einzelner Punkt steht in der Mitte, und es gibt keinen Pfad.
  assert.equal(punkteFuer([7], 100, 50).punkte[0].x, 50);
  assert.equal(weicherPfad(punkteFuer([7], 100, 50).punkte), "");
  assert.equal(flaechenPfad([], 50), "");

  // Die gezeichnete Kurve bleibt zwischen null und dem Höchstwert. Geprüft
  // wird die Kurve selbst, nicht die Kontrollpunkte: Ein Sprung (zwei
  // gleiche Werte, dann ein hoher) liess sie früher unter null tauchen —
  // also Anwahlen behaupten, die es nicht gab.
  const abtasten = (d) => {
    const start = d.match(/M ([\d.-]+) ([\d.-]+)/);
    let p0 = Number(start[2]);
    const ys = [p0];
    [...d.matchAll(/C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)/g)].forEach((c) => {
      const [c1y, c2y, p1y] = [Number(c[2]), Number(c[4]), Number(c[6])];
      for (let i = 0; i <= 20; i += 1) {
        const u = i / 20;
        ys.push(((1 - u) ** 3) * p0 + 3 * ((1 - u) ** 2) * u * c1y + 3 * (1 - u) * u * u * c2y + (u ** 3) * p1y);
      }
      p0 = p1y;
    });
    return ys;
  };
  [[0, 0, 90, 90, 0], [0, 90, 0, 90, 0], [0, 10, 90, 20], [10, 70, 20, 90, 30]].forEach((werte) => {
    const ys = abtasten(weicherPfad(punkteFuer(werte, 400, 100, 4).punkte));
    assert.ok(Math.min(...ys) >= 4 - 0.01, `${werte}: schwingt über den Höchstwert hinaus (${Math.min(...ys).toFixed(1)})`);
    assert.ok(Math.max(...ys) <= 96 + 0.01, `${werte}: taucht unter null (${Math.max(...ys).toFixed(1)})`);
  });
  const zacken = punkteFuer([0, 90, 0, 90, 0], 400, 100, 4).punkte;
  // Die Fläche ist unten geschlossen.
  assert.match(flaechenPfad(zacken, 100), /L 400\.00 100 L 0\.00 100 Z$/);

  // Tageswerte: Lücken werden 0, nicht übersprungen.
  const zeilen = [
    { log_date: "2026-09-14", counts: { anwahlen: 10, termin: 1 } },
    { log_date: "2026-09-14", counts: { anwahlen: 5 } },
    { log_date: "2026-09-16", counts: { anwahlen: 7 } },
  ];
  const reihe = tagesReihe(zeilen, "anwahlen");
  assert.deepEqual(reihe, [
    { tag: "2026-09-14", wert: 15 },
    { tag: "2026-09-15", wert: 0 },
    { tag: "2026-09-16", wert: 7 },
  ]);
  // Mit Zeitraum: auch Tage ohne jeden Eintrag am Rand.
  assert.equal(tagesReihe(zeilen, "anwahlen", "2026-09-13", "2026-09-17").length, 5);
  assert.deepEqual(tagesReihe([], "anwahlen"), []);
  // Ein falsch gesetzter Zeitraum zeichnet nicht zehntausend Punkte.
  assert.ok(tagesReihe(zeilen, "anwahlen", "2020-01-01", "2030-01-01").length <= 400);

  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
  // Mehrere Reihen teilen einen Maßstab — sonst ist der Vergleich gelogen.
  const kurve = lies("components/Kurve.js");
  assert.match(kurve, /Ein Maßstab für alle Reihen/);
  assert.match(kurve, /const faktor = eigenerHoechster \/ hoechster;/);
  // Startbildschirm und Auswertung nutzen sie.
  assert.match(lies("pages/index.js"), /<Kurve/);
  assert.match(lies("pages/auswertung.js"), /<Kurve/);
  // Und die Auswertung mischt bewusst: Kurve, Ring, Balken.
  const auswertung = lies("pages/auswertung.js");
  assert.match(auswertung, /<Kreisdiagramm/);
  assert.match(auswertung, /<VergleichsDiagramm/);
});

test("Das Design trägt eine eigene Handschrift: keine Regenbogen-Palette, gemischte Rundungen, Icons statt Emoji", async () => {
  const { PALETTE, JETZT, feldFarbe } = await import("../lib/diagrammFarben.js");
  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");

  // Karmesin ist die Farbe für Aktionen und für "jetzt" — nicht eine von
  // zehn in der Verteilungsreihe.
  assert.ok(!PALETTE.some((f) => /org-accent|CE3A5C/.test(f)), "Karmesin gehört nicht in die Palette");
  // Und kein Violett mehr, das ist der Ton, der überall nach Vorlage aussieht.
  assert.ok(!PALETTE.some((f) => /4C5DC9|9E8CF0|org-color-1/.test(f)), "Violett/Indigo raus aus der Palette");
  assert.match(JETZT, /org-accent/);
  assert.equal(feldFarbe("termin"), "#3FBFA6");

  // Gemischte Rundungen statt eines Radius auf allem.
  const css = lies("styles/globals.css");
  const radius = (block) => {
    const stelle = css.indexOf(block);
    const treffer = css.slice(stelle, stelle + 1400).match(/border-radius: (\d+)px/);
    assert.ok(treffer, `${block} hat keinen Radius`);
    return Number(treffer[1]);
  };
  assert.equal(radius(".card {"), 10);
  assert.equal(radius(".btn {"), 6);
  assert.equal(radius(".input {"), 6);

  // Abzeichen tragen Icons; das Emoji bleibt nur als Rückfall für Text.
  const { BADGE_DEFS } = await import("../lib/badges.js");
  BADGE_DEFS.forEach((b) => assert.ok(b.icon, `${b.id} ohne Icon`));
  const icons = lies("components/Icon.js");
  BADGE_DEFS.forEach((b) => assert.match(icons, new RegExp(`\\b${b.icon}:`), `Icon ${b.icon} fehlt`));
  assert.match(lies("components/ProfileModal.js"), /<Icon name=\{b\.icon\}/);

  // In den Terminlisten stehen keine Emoji mehr.
  const termine = lies("pages/termine.js");
  assert.ok(!/📎|📝|💬 \{|✅ \{/.test(termine), "Emoji in der Terminliste");
});

test("Die Statistiken mischen die Darstellung: Kurve, Balken, Ring und Raster", () => {
  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");

  const balken = lies("components/Balkenliste.js");
  // Ein gemeinsamer Maßstab und eine Rangfolge — sonst ist es kein Vergleich.
  assert.match(balken, /const groesster = gefuellt\[0\]\.wert;/);
  assert.match(balken, /\.sort\(\(a, b\) => b\.wert - a\.wert\)/);
  // Lange Listen laufen nicht ins Endlose.
  assert.match(balken, /hoechstens = 12/);

  const tracker = lies("pages/call-tracker.js");
  // Gründe jetzt als Balken, Verlauf als Kurve — der Ring bleibt für die
  // Verteilung der Gespräche.
  assert.match(tracker, /<Balkenliste daten=\{gruendeDaten\}/);
  assert.match(tracker, /<Kurve/);
  assert.match(tracker, /<Kreisdiagramm/);
  assert.match(tracker, /<WochentagAnalyse/);
  assert.match(tracker, /<TageszeitAnalyse/);

  const auswertung = lies("pages/auswertung.js");
  assert.match(auswertung, /titel="Teams im Vergleich"/);
  assert.match(auswertung, /<Balkenliste/);
  // Die Kopfzahlen tragen eine kleine Kurve.
  assert.match(auswertung, /verlauf=\{k\.reihe \? tagesReihe\(zeilen, k\.reihe/);

  // Die Sparkline zeichnet nur mit mindestens zwei Punkten.
  const kennzahl = lies("components/Kennzahl.js");
  assert.match(kennzahl, /verlauf && verlauf\.length >= 2/);
  assert.match(kennzahl, /if \(punkte\.length < 2\) return null;/);
});

test("Die Anwahl-Serie zählt Arbeitstage, nicht Kalendertage", async () => {
  const s = await import("../lib/anwahlSpiel.js");
  const tag = (d, anwahlen) => ({ log_date: d, counts: { anwahlen } });
  // Freitag 18.9.2026, Montag 21.9., Dienstag 22.9. (heute)
  const jetzt = new Date("2026-09-22T10:00:00Z");

  // Das Wochenende bricht die Serie nicht.
  const serie = s.anwahlSerie([tag("2026-09-17", 30), tag("2026-09-18", 25), tag("2026-09-21", 22), tag("2026-09-22", 21)], { jetzt });
  assert.equal(serie.laenge, 4);
  assert.equal(serie.heuteGeschafft, true);

  // Heute noch nicht geschafft: Die Serie der Vortage bleibt stehen, der
  // heutige Tag zählt noch nicht mit.
  const offen = s.anwahlSerie([tag("2026-09-18", 25), tag("2026-09-21", 22), tag("2026-09-22", 5)], { jetzt });
  assert.equal(offen.laenge, 2);
  assert.equal(offen.heuteGeschafft, false);
  assert.equal(offen.anwahlenHeute, 5);

  // Ein verpasster Arbeitstag bricht sie.
  assert.equal(s.anwahlSerie([tag("2026-09-17", 30), tag("2026-09-18", 3), tag("2026-09-21", 22)], { jetzt }).laenge, 1);
  assert.equal(s.anwahlSerie([], { jetzt }).laenge, 0);
  // Mehrere Zeilen am selben Tag werden addiert (zwei Geräte).
  assert.equal(s.anwahlenAm([tag("2026-09-22", 12), tag("2026-09-22", 9)], "2026-09-22"), 21);

  // Bestwert über die ganze Zeit, mit Lücke dazwischen.
  assert.equal(s.besteSerie([tag("2026-09-01", 30), tag("2026-09-02", 30), tag("2026-09-03", 30), tag("2026-09-07", 30)]), 3);

  // Meilensteine: weit auseinander, und der nächste steht mit Reststand da.
  assert.deepEqual(s.naechsterMeilenstein(120), { ziel: 500, fehlt: 380, anteil: 24 });
  assert.equal(s.naechsterMeilenstein(99999), null);

  // Das Tagesziel kommt aus dem laufenden persönlichen Ziel mit dem
  // kleinsten Zeitraum, geteilt auf die Arbeitstage.
  const ziel = s.tagesZiel([
    { metric: "anwahlen", target_count: 100, starts_on: "2026-09-21", ends_on: "2026-09-25", title: "Woche" },
    { metric: "anwahlen", target_count: 1000, starts_on: "2026-09-01", ends_on: "2026-09-30", title: "Monat" },
  ], { jetzt });
  assert.equal(ziel.titel, "Woche");
  assert.equal(ziel.arbeitstage, 5);
  assert.equal(ziel.proTag, 20);
  // Ziele auf andere Kennzahlen oder ausserhalb des Zeitraums zählen nicht.
  assert.equal(s.tagesZiel([{ metric: "termin", target_count: 5, starts_on: "2026-09-21", ends_on: "2026-09-25" }], { jetzt }), null);
  assert.equal(s.tagesZiel([{ metric: "anwahlen", target_count: 50, starts_on: "2026-08-01", ends_on: "2026-08-07" }], { jetzt }), null);

  // Der Stand: nie über 100 %, und ohne Ziel keine Division.
  assert.deepEqual(s.zielStand(20, 5), { ziel: 20, wert: 5, anteil: 25, fehlt: 15, erreicht: false });
  assert.equal(s.zielStand(20, 40).anteil, 100);
  assert.equal(s.zielStand(20, 40).erreicht, true);
  assert.equal(s.zielStand(0, 10).anteil, 0);

  // Der Block zählt die Differenz des Tageszählers.
  assert.deepEqual(s.blockErgebnis({ start: 12, ende: 31, minuten: 25 }), { anwahlen: 19, minuten: 25, proStunde: 46 });
  // Eine Korrektur nach unten ergibt keine negative Runde.
  assert.equal(s.blockErgebnis({ start: 30, ende: 20 }).anwahlen, 0);
  // Kein Tadel bei einer schwachen Runde.
  assert.match(s.blockText({ anwahlen: 0 }), /neuer Anfang/);
  assert.match(s.blockText({ anwahlen: 20, minuten: 25, bestwert: 12 }), /neuer Bestwert/);
  assert.match(s.blockText({ anwahlen: 8, minuten: 25, bestwert: 12 }), /4 mehr/);
});

test("Das eigene Anwahl-Ziel: selbst setzbar, geprüft, und ein zugewiesenes hat Vorrang", async () => {
  const s = await import("../lib/anwahlSpiel.js");
  const jetzt = new Date("2026-09-22T10:00:00Z");
  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");

  // Ohne alles: kein Pensum.
  assert.equal(s.pensumFuerHeute({ jetzt }), null);
  // Nur eigenes Ziel: es gilt, mit Herkunft.
  const eigen = s.pensumFuerHeute({ eigenes: 60, jetzt });
  assert.equal(eigen.proTag, 60);
  assert.equal(eigen.quelle, "eigenes");
  // Zugewiesenes Ziel hat Vorrang — eine Absprache überschreibt man nicht still.
  const beides = s.pensumFuerHeute({
    eigenes: 60,
    ziele: [{ metric: "anwahlen", target_count: 100, starts_on: "2026-09-21", ends_on: "2026-09-25", title: "Woche" }],
    jetzt,
  });
  assert.equal(beides.quelle, "zugewiesen");
  assert.equal(beides.proTag, 20);
  // Ein ausgelaufenes zugewiesenes Ziel lässt das eigene wieder greifen.
  assert.equal(s.pensumFuerHeute({
    eigenes: 60,
    ziele: [{ metric: "anwahlen", target_count: 100, starts_on: "2026-08-01", ends_on: "2026-08-07" }],
    jetzt,
  }).quelle, "eigenes");

  // Eingabe: leer entfernt das Ziel, Unsinn und Vertipper werden abgelehnt.
  assert.deepEqual(s.leseZielEingabe(""), { wert: null });
  assert.deepEqual(s.leseZielEingabe("  "), { wert: null });
  assert.deepEqual(s.leseZielEingabe("60"), { wert: 60 });
  assert.match(s.leseZielEingabe("sechzig").fehler, /ganze Zahl/);
  assert.match(s.leseZielEingabe("0").fehler, /Zwischen 1 und 500/);
  assert.match(s.leseZielEingabe("6000").fehler, /Zwischen 1 und 500/);
  assert.match(s.leseZielEingabe("-5").fehler, /ganze Zahl/);
  assert.match(s.leseZielEingabe("12,5").fehler, /ganze Zahl/);

  // Die Datenbank hält dieselbe Grenze — nicht nur das Formular.
  const migration = lies("supabase/migration_177_anwahl_tagesziel.sql");
  assert.match(migration, /anwahl_tagesziel > 0 and anwahl_tagesziel <= 500/);
  // Und die Spalte steht nicht unter dem Rechte-Schutz von migration_166:
  // ein eigenes Vorhaben darf jede Person selbst setzen.
  assert.ok(!/anwahl_tagesziel/.test(lies("supabase/migration_166_profilrechte_und_freischaltung.sql")));

  // Im Call Tracker: Eingabe, Prüfung, und die Änderung läuft über
  // aendereGeprueft, damit eine Ablehnung nicht still verschwindet.
  const tracker = lies("pages/call-tracker.js");
  assert.match(tracker, /async function speichereZiel\(\)/);
  assert.match(tracker, /aendereGeprueft\(\s*supabase\.from\("profiles"\)\.update\(\{ anwahl_tagesziel: gelesen\.wert \}\)/);
  assert.match(tracker, /"Tagesziel setzen"/);
  assert.match(tracker, /migration_177/);
});

test("Neue Funktionen werden erklärt — einmal, auch wenn man die Seite längst kennt", async () => {
  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
  const hinweis = lies("components/NeuHinweis.js");
  // Gemerkt im Browser, nicht am Konto: eine Erklärung ist keine Einstellung.
  assert.match(hinweis, /localStorage\.setItem\(speicher, "1"\)/);
  assert.match(hinweis, /hb-neu:\$\{id\}/);
  // Ohne Punkte keine leere Karte.
  assert.match(hinweis, /if \(!zeigen \|\| !punkte\.length\) return null;/);

  const tracker = lies("pages/call-tracker.js");
  assert.match(tracker, /<NeuHinweis/);
  assert.match(tracker, /id="anwahl-anreiz"/);
  // Alle vier neuen Dinge werden benannt.
  ["Tagesziel:", "Serie:", "Telefonblock:", "Heute im Team:"].forEach((was) => assert.match(tracker, new RegExp(was)));
  // Und es steht dabei, was NICHT passiert — das ist die Frage, die
  // niemand stellt und jeder hat.
  assert.match(tracker, /bleibt auf diesem Gerät/);

  // Der Ring ist wieder gross genug, um erkennbar zu sein, und trägt eine
  // Beschriftung.
  assert.match(tracker, /groesse=\{96\}/);
  assert.match(tracker, /label=\{`Tagesziel · \$\{ziel\.titel\}`\}/);
  // Der Telefonblock steht offen da statt hinter einem Aufklapper.
  const blockStelle = tracker.indexOf('<div className="label mb-2">Telefonblock</div>');
  assert.ok(blockStelle > 0);
  // Der Seitenhinweis nennt das Ziel mit.
  assert.match(lies("lib/seitenHinweise.js"), /Tagesziel-Ring/);
});
