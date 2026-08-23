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
import { PFLICHTFELDER, fehlendeProfilangaben, profilVollstaendig } from "../lib/profilPflicht.js";
import { pfadAusOeffentlicherUrl } from "../lib/speicherPfad.js";
import { DASHBOARD_KACHELN, sichtbareKacheln } from "../lib/dashboardKacheln.js";
import { baueIcs, icsDateiname } from "../lib/ics.js";
import { FENSTER_MS, istMeldenswert, meldungsSchluessel, sollMelden } from "../lib/fehlerMeldung.js";
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
