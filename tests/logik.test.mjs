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
import { storagePrefix, dayKey, dateKeyOf, loadDay, saveDay, aggregateRange, buildReport, FIELDS } from "../lib/callTracker.js";
import { textColorForColors, contrastRatio, relativeLuminance, hexToRgb } from "../lib/colorMath.js";
import { resolveObjectionCategories } from "../lib/objectionCategories.js";
import { GOAL_METRICS, GOAL_METRIC_KEYS } from "../lib/goalMetrics.js";
import { FUEHRUNGSROLLEN } from "../lib/rollen.js";
import { eigeneFlaechenGelten, istHellerTon } from "../lib/orgBranding.js";

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
  const sql = readFileSync(new URL("../supabase/migration_99_ziel_kennzahlen.sql", import.meta.url), "utf8");
  const block = sql.slice(sql.indexOf("metric in ("), sql.indexOf("));", sql.indexOf("metric in (")));
  const erlaubt = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(erlaubt, [...GOAL_METRIC_KEYS].sort());
});

test("der Wettbewerbs-Maßstab kennt dieselben Kennzahlen plus XP", () => {
  // Zweite check-Regel, zweite Gelegenheit zum Auseinanderlaufen: stimmt sie
  // nicht, lässt sich die Einstellung in der Verwaltung schlicht nicht
  // speichern.
  const sql = readFileSync(new URL("../supabase/migration_99_ziel_kennzahlen.sql", import.meta.url), "utf8");
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
