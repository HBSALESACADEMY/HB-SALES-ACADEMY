// Prüft die Zugriffsregeln der Datenbank, ohne dass eine Datenbank laufen
// muss: das Schema wird gelesen und auf die Fehlerklassen untersucht, die uns
// tatsächlich getroffen haben.
//
// Hintergrund: In dieser Codebasis sind zwei ernste Fehler entstanden, die
// erst im laufenden Betrieb auffielen — eine Endlosschleife zwischen zwei
// Regeln (Termine liessen sich gar nicht mehr speichern) und eine Tabelle
// ohne Schutz. Genau diese beiden Klassen sind hier abgesichert.
//
// Was das NICHT leisten kann: inhaltliche Fehler in einer einzelnen Regel
// (etwa das Datenleck, bei dem eine Aufgabe an eine fremde Organisation
// zugewiesen werden konnte). Dafür bräuchte es eine Testdatenbank mit echten
// Nutzern. Ehrlich benannt, damit niemand sich in falscher Sicherheit wiegt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../supabase/schema_v2.sql", import.meta.url), "utf8");

// Kommentare entfernen, sonst zählen Beispiele in Erklärtexten als Treffer.
const ohneKommentare = schema.replace(/^\s*--.*$/gm, "");

const tabellen = [...ohneKommentare.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);
const mitRls = new Set([...ohneKommentare.matchAll(/alter table (\w+) enable row level security/g)].map((m) => m[1]));

// Jede Regel mit ihrem Rumpf einsammeln.
const regeln = [...ohneKommentare.matchAll(/create policy "([^"]+)" on (\w+)([\s\S]*?);\s*(?=drop policy|create policy|create table|alter table|create index|create or replace|--- |$)/g)]
  .map((m) => ({ name: m[1], tabelle: m[2], rumpf: m[3] }));

test("jede Tabelle ist durch Zugriffsregeln geschützt", () => {
  const ungeschuetzt = tabellen.filter((t) => !mitRls.has(t));
  assert.deepEqual(ungeschuetzt, [],
    `Ohne Schutz wären diese Tabellen für jede angemeldete Person frei lesbar: ${ungeschuetzt.join(", ")}`);
});

// Manche Tabellen haben BEWUSST keine Regeln: Schutz ohne Regeln sperrt alle
// angemeldeten Personen komplett aus, nur der Server kommt noch durch. Das ist
// im Schema so vermerkt und wird hier respektiert.
const absichtlichOhneRegeln = new Set(
  [...schema.matchAll(/--- (\w+) ---\s*\n\s*-- bewusst keine Policies/g)].map((m) => m[1])
);

test("jede geschützte Tabelle hat eine Leseregel — oder ist bewusst gesperrt", () => {
  const ohneLeseregel = [...mitRls].filter((t) =>
    !absichtlichOhneRegeln.has(t) &&
    !regeln.some((r) => r.tabelle === t && /\bfor select\b/.test(r.rumpf)));
  assert.deepEqual(ohneLeseregel, [],
    `Ohne Leseregel sieht niemand etwas — vermutlich vergessen: ${ohneLeseregel.join(", ")}`);
});

test("keine Endlosschleife zwischen Regeln verschiedener Tabellen", () => {
  // Nur LESEregeln bilden den Graphen: wer in einer Regel "from X" schreibt,
  // löst damit die LESEregel von X aus — nicht deren Schreibregel. Ein Kreis
  // kann deshalb nur über Leseregeln entstehen. (Ohne diese Unterscheidung
  // meldet der Test die Gruppenchats fälschlich, wo die Rückrichtung nur in
  // einer Einfügeregel steht.)
  // Aufrufe von security-definer-Funktionen (same_org, is_group_member,
  // has_lead_task_or_mention, ...) zählen bewusst NICHT — die lösen keine
  // erneute Regelprüfung aus und sind genau deshalb das Mittel gegen Schleifen.
  const kanten = new Map();
  for (const r of regeln.filter((x) => /\bfor select\b/.test(x.rumpf))) {
    const ziele = new Set([...r.rumpf.matchAll(/\bfrom\s+(\w+)/g)].map((m) => m[1])
      .filter((t) => mitRls.has(t) && t !== r.tabelle));
    if (!kanten.has(r.tabelle)) kanten.set(r.tabelle, new Set());
    ziele.forEach((z) => kanten.get(r.tabelle).add(z));
  }

  // Tiefensuche nach einem Kreis.
  const zustand = new Map();
  const pfad = [];
  let kreis = null;
  function suche(knoten) {
    if (kreis) return;
    zustand.set(knoten, "laeuft");
    pfad.push(knoten);
    for (const naechster of kanten.get(knoten) || []) {
      if (zustand.get(naechster) === "laeuft") {
        kreis = [...pfad.slice(pfad.indexOf(naechster)), naechster];
        return;
      }
      if (!zustand.has(naechster)) suche(naechster);
      if (kreis) return;
    }
    pfad.pop();
    zustand.set(knoten, "fertig");
  }
  for (const t of kanten.keys()) if (!zustand.has(t)) suche(t);

  assert.equal(kreis, null,
    kreis ? `Regeln prüfen sich gegenseitig endlos: ${kreis.join(" -> ")}. ` +
            `Postgres bricht das mit "infinite recursion detected in policy" ab — betroffene Seiten funktionieren dann gar nicht. ` +
            `Lösung: die Rückfrage in eine security-definer-Funktion auslagern (Vorbild: has_lead_task_or_mention).` : "");
});
