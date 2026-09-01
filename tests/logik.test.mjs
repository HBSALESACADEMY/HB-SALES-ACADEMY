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
import { storagePrefix, dayKey, dateKeyOf, loadDay, saveDay, aggregateRange, zaehlerZusammenfuehren, buildReport, FIELDS, istOffenerAnruf, merkeSchritt, offenerSchritt } from "../lib/callTracker.js";
import { textColorForColors, contrastRatio, relativeLuminance, hexToRgb } from "../lib/colorMath.js";
import { resolveObjectionCategories } from "../lib/objectionCategories.js";
import { GOAL_METRICS, GOAL_METRIC_KEYS } from "../lib/goalMetrics.js";
import { FUEHRUNGSROLLEN } from "../lib/rollen.js";
import { eigeneFlaechenGelten, istHellerTon } from "../lib/orgBranding.js";
import { PFLICHTFELDER, fehlendeProfilangaben, profilVollstaendig } from "../lib/profilPflicht.js";
import { pfadAusOeffentlicherUrl } from "../lib/speicherPfad.js";
import { DASHBOARD_KACHELN, sichtbareKacheln } from "../lib/dashboardKacheln.js";
import { baueIcs, icsDateiname } from "../lib/ics.js";
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
  const schreibstelle = quelle.slice(quelle.indexOf('from("call_log_days").upsert'), quelle.indexOf('from("call_log_days").upsert') + 500);
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
