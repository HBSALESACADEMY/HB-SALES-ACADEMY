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
import { readFileSync, readdirSync } from "node:fs";

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

// Der pauschale Zweig "oder ist Plattform-Admin" hebt in derselben Regel
// wieder auf, was der Rest sorgfältig eingrenzt: die Mandanten-Grenze.
// Er ist dreimal entfernt worden (migration_95, 115, 116) und dreimal an
// neuer Stelle wieder aufgetaucht — deshalb hier festgenagelt.
//
// Erlaubt bleibt der Plattform-Admin als ROLLE (etwa "darf verwalten"),
// solange die Regel zusätzlich prüft, ob es um die aktive Organisation geht.
test("keine Regel hebt die Mandanten-Grenze für Plattform-Admins auf", () => {
  const pauschal = /or\s+exists\s*\(\s*select 1 from profiles where (profiles\.)?id = auth\.uid\(\) and (profiles\.)?is_platform_admin\s*\)/;
  const treffer = regeln.filter((r) => pauschal.test(r.rumpf)).map((r) => `${r.tabelle}.${r.name}`);
  assert.deepEqual(treffer, [],
    `Diese Regeln lassen einen Plattform-Admin an der Organisationsgrenze vorbei: ${treffer.join(", ")}`);
});

// Die Management-Auswertung ist die einzige Stelle, die Menschen einer
// Organisation namentlich nebeneinanderstellt und benennt, wer zurückliegt.
// Sie läuft mit erweiterten Rechten und umgeht damit sämtliche Regeln der
// Datenbank — beide Schranken müssen deshalb im Code der Route stehen und
// dürfen dort nicht still verschwinden.
test("Die Auswertungs-Route prüft Rolle und Organisation selbst", () => {
  const quelle = readFileSync(new URL("../pages/api/auswertung.js", import.meta.url), "utf8");

  assert.match(quelle, /istFuehrungsrolle\(profil\)/,
    "Ohne Rollenprüfung sieht jede Vertriebsperson die Leistungsvergleiche aller Kolleg:innen.");
  assert.match(quelle, /aktiveOrgId\(admin, profil, user\.id\)/,
    "Ohne die aktive Organisation vom Server mischen sich die Mandanten — die Route umgeht die Regeln der Datenbank.");

  // Die Organisation darf NICHT aus der Anfrage kommen: sonst schreibt man
  // sie in der Adresszeile einfach um und liest fremde Mandanten aus.
  const ausDerAnfrage = /orgId\s*=\s*req\.(query|body)/;
  assert.ok(!ausDerAnfrage.test(quelle),
    "Die Organisation stammt aus der Anfrage und lässt sich damit von aussen umschreiben.");

  // Jede Abfrage auf Personen und Termine muss die Organisation eingrenzen.
  assert.match(quelle, /from\("profiles"\)[\s\S]{0,200}eq\("organization_id", orgId\)/);
  assert.match(quelle, /from\("leads"\)[\s\S]{0,300}eq\("organization_id", orgId\)/);
});

// Zweimal hat eine Regel Leute aus ihren EIGENEN Daten ausgesperrt: bei den
// Duellen und bei den Aufnahmen. Beide Male stand neben "= auth.uid()"
// zusätzlich eine Organisationsbedingung — und ein Plattform-Admin unter
// fremdem Firmencode sah seine eigenen Einträge nicht mehr. Die neue
// Ereignis-Tabelle wiederholt das nicht.
test("call_events sperrt niemanden aus den eigenen Zeilen aus", () => {
  const sql = readFileSync(new URL("../supabase/migration_128_call_events.sql", import.meta.url), "utf8");
  const eigene = sql.match(/create policy "call_events_(select|insert|delete)_own"[\s\S]*?;/g) || [];
  assert.equal(eigene.length, 3, "Eigene Zeilen brauchen Lesen, Schreiben und Löschen.");
  eigene.forEach((regel) => {
    assert.match(regel, /auth\.uid\(\) = user_id/);
    assert.ok(!/sieht_person|aktive_org|organization_id/.test(regel),
      `Diese Regel hängt eine Organisationsbedingung an die eigenen Zeilen: ${regel.slice(0, 80)}`);
  });
  // Und die Führungsrolle bleibt an die Mandanten-Grenze gebunden.
  assert.match(sql, /call_events_select_managers[\s\S]*?sieht_person\(user_id\)/);
});

test("Ein Folgetermin für jemand anderen bleibt bei dieser Person", () => {
  // Der Folgetermin behält den ursprünglichen Vertriebler als created_by,
  // sonst stünde er plötzlich in der Statistik der Führungskraft und fehlte
  // in seiner eigenen. Die Insert-Regel muss das zulassen — und zwar nur
  // innerhalb der eigenen Organisation und nur für Menschen, die man führt.
  const sql = readFileSync(new URL("../supabase/migration_130_folgetermin.sql", import.meta.url), "utf8");
  assert.match(sql, /create policy "leads_insert"/);
  assert.match(sql, /created_by = auth\.uid\(\)/);
  assert.match(sql, /sieht_person\(created_by\)/);
  assert.match(sql, /ist_fuehrungsrolle\(auth\.uid\(\)\)|is_team_lead_of\(created_by, auth\.uid\(\)\)/);
  // Die Mandanten-Grenze bleibt.
  assert.match(sql, /organization_id is not distinct from aktive_org\(auth\.uid\(\)\)/);
});

// Dreimal dieselbe Falle: Duelle, Aufnahmen, E-Mail-Kontakte. Wer seine
// eigenen Zeilen LESEN darf, muss sie auch ändern und löschen dürfen —
// sonst sieht man seine Daten und kommt nicht an sie heran, sobald man
// unter einem fremden Firmencode arbeitet.
test("Wer eigene Zeilen sehen darf, darf sie auch ändern und löschen", () => {
  const ordner = new URL("../supabase/", import.meta.url);
  const alles = readdirSync(ordner)
    .filter((n) => /^(migration_\d+|schema_v2)/.test(n))
    .map((n) => readFileSync(new URL(n, ordner), "utf8"))
    .join("\n");

  // Tabellen, bei denen eigene Zeilen erklärtermassen bearbeitet werden.
  const pflicht = ["email_kontakte", "call_events"];
  const fehlend = [];
  pflicht.forEach((tabelle) => {
    ["select", "delete"].forEach((art) => {
      const regel = new RegExp(`create policy "${tabelle}_${art}_own"[\\s\\S]*?auth\\.uid\\(\\) = user_id`);
      if (!regel.test(alles)) fehlend.push(`${tabelle}.${art}_own`);
    });
  });
  assert.deepEqual(fehlend, [],
    `Diese Zugriffsregeln für eigene Zeilen fehlen — Betroffene kommen an ihre eigenen Daten nicht heran: ${fehlend.join(", ")}`);

  // Und keine dieser Regeln trägt eine Organisationsbedingung.
  const eigenRegeln = alles.match(/create policy "(?:email_kontakte|call_events)_\w+_own"[\s\S]*?;/g) || [];
  eigenRegeln.forEach((r) => {
    assert.ok(!/sieht_person|aktive_org|organization_id/.test(r),
      `Eine Regel für eigene Zeilen prüft zusätzlich die Organisation: ${r.slice(0, 90)}`);
  });
});

test("Das Nachfassen sperrt niemanden aus den eigenen Zeilen aus", () => {
  const sql = readFileSync(new URL("../supabase/migration_156_nachfass_termine.sql", import.meta.url), "utf8");

  // Ohne Schutz wäre die Tabelle für jede angemeldete Person frei lesbar —
  // samt Kundennamen aus fremden Organisationen.
  assert.match(sql, /alter table nachfass_termine enable row level security/);

  // Dieselbe Falle wie bei Duellen, Aufnahmen und E-Mail-Kontakten: neben
  // "= auth.uid()" stand dort zusätzlich eine Organisationsbedingung, und
  // wer unter einem fremden Firmencode arbeitete, kam an seine eigenen
  // Zeilen nicht mehr heran.
  const eigene = sql.match(/create policy "nachfass_termine_(select|update|delete)_own"[\s\S]*?;/g) || [];
  assert.equal(eigene.length, 3, "Eigene Zeilen brauchen Lesen, Ändern und Löschen.");
  eigene.forEach((regel) => {
    assert.match(regel, /auth\.uid\(\) = zustaendig/);
    assert.ok(!/sieht_person|aktive_org|organization_id/.test(regel),
      `Diese Regel hängt eine Organisationsbedingung an die eigenen Zeilen: ${regel.slice(0, 90)}`);
  });

  // Zuweisen nur an Personen, die man führt — sonst schiebt jede
  // Vertriebsperson jeder anderen Arbeit in den Kalender. Und die
  // Mandanten-Grenze steht davor.
  const insert = sql.match(/create policy "nachfass_termine_insert"[\s\S]*?;/)?.[0] || "";
  assert.match(insert, /organization_id is not distinct from aktive_org\(auth\.uid\(\)\)/);
  assert.match(insert, /erstellt_von = auth\.uid\(\)/);
  assert.match(insert, /sieht_person\(zustaendig\)/);
  assert.match(insert, /ist_fuehrungsrolle\(auth\.uid\(\)\)|is_team_lead_of\(zustaendig, auth\.uid\(\)\)/);

  // Und die Führungsrolle bleibt an die Mandanten-Grenze gebunden.
  assert.match(sql, /nachfass_termine_select_leitung[\s\S]*?sieht_person\(zustaendig\)/);
});

// Die häufigste Fehlerursache in diesem Projekt: Supabase WIRFT nicht,
// es gibt den Fehler als Feld zurück. Wer ihn nicht abfragt, sieht eine
// abgelehnte Änderung als Erfolg — die Seite meldet nichts, und beim
// nächsten Laden ist die Änderung einfach weg. Genau so sind hier ein
// halbes Dutzend Fehler entstanden, die jedes Mal erst im Betrieb
// aufgefallen sind.
//
// Schreibende Aufrufe müssen deshalb entweder über die geprüften Helfer
// laufen (aendereGeprueft/loescheGeprueft) oder ihren Fehler selbst
// auswerten.
test("Kein schreibender Datenbankaufruf verschluckt seinen Fehler", () => {
  const ordner = new URL("../pages/", import.meta.url);
  // Nur die Seiten, nicht die API-Routen. In einer Route geht das Ergebnis
  // als Antwort an den Aufrufer zurück, und manche Schreibvorgänge dort
  // sind bewusst nebenläufig (eine fehlgeschlagene Meldung darf einen
  // Termin nicht rückgängig machen). Im Browser dagegen ist ein
  // verschluckter Fehler immer falsch: die Person sieht ihre Änderung auf
  // dem Bildschirm und beim nächsten Laden ist sie weg.
  const dateien = readdirSync(ordner, { recursive: true })
    .filter((n) => typeof n === "string" && n.endsWith(".js") && !n.startsWith("api/"));

  const ungeprueft = [];
  for (const name of dateien) {
    const quelle = readFileSync(new URL(name, ordner), "utf8");
    const zeilen = quelle.split("\n");
    zeilen.forEach((zeile, i) => {
      // Schreibende Aufrufe im Browser-Teil der Seiten.
      if (!/\.(insert|update|delete|upsert)\(/.test(zeile)) return;
      if (!/supabase\.from\(/.test(zeile) && !/from\("[a-z_]+"\)/.test(zeile)) return;

      // Der Aufruf und die zwei Zeilen davor und danach — der Fehler wird
      // oft eine Zeile weiter ausgewertet.
      const umfeld = zeilen.slice(Math.max(0, i - 3), i + 4).join("\n");
      const geprueft = /aendereGeprueft|loescheGeprueft|error|Fehler|catch/i.test(umfeld);
      if (!geprueft) ungeprueft.push(`${name}:${i + 1}`);
    });
  }

  assert.deepEqual(ungeprueft, [],
    `Diese Schreibvorgänge prüfen ihr Ergebnis nicht — eine abgelehnte Änderung sieht dort aus wie ein Erfolg: ${ungeprueft.join(", ")}`);
});

// Ein gelöschter Termin liegt im Papierkorb (migration_145): die Zeile
// bleibt stehen, damit ein Versehen rückgängig zu machen ist. Genau das
// macht ihn aber gefährlich — wer beim Lesen nicht danach fragt, bekommt
// ihn zurück, und der gelöschte Termin steht weiter im Kalender, auf dem
// Startbildschirm und in der Auswertung. Sichtbar gelöscht ist er erst,
// wenn JEDE Abfrage ihn ausschliesst.
test("Kein Lesezugriff holt gelöschte Termine zurück", () => {
  // Wo ein gelöschter Termin absichtlich dazugehört.
  const ausnahmen = {
    "pages/api/export-data.js":
      "Datenauskunft: sie muss alles enthalten, was über die Person gespeichert ist — auch den Papierkorb.",
    "lib/aufnahmenAufraeumen.js":
      "Der Aufräumjob muss gelöschte Termine gerade sehen, um ihre Aufnahmen wegzuräumen.",
    "pages/api/delete-own-account.js":
      "Beim Kontolöschen müssen die Aufnahmen ALLER Termine weg, auch die im Papierkorb.",
  };

  const ordner = [new URL("../pages/", import.meta.url), new URL("../lib/", import.meta.url)];
  const offen = [];

  for (const basis of ordner) {
    const dateien = readdirSync(basis, { recursive: true })
      .filter((n) => typeof n === "string" && n.endsWith(".js"));
    for (const name of dateien) {
      const pfad = `${basis.pathname.endsWith("/pages/") ? "pages" : "lib"}/${name}`;
      if (ausnahmen[pfad]) continue;
      const zeilen = readFileSync(new URL(name, basis), "utf8").split("\n");
      zeilen.forEach((zeile, i) => {
        if (!/from\("leads"\)\s*\.?\s*$|from\("leads"\)\.select\(/.test(zeile)) return;
        // Die Abfrage steht selten in einer Zeile — die folgenden Zeilen
        // gehören dazu, bis der Aufruf endet.
        const umfeld = zeilen.slice(i, i + 8).join("\n");
        if (!umfeld.includes('geloescht_am')) offen.push(`${pfad}:${i + 1}`);
      });
    }
  }

  assert.deepEqual(offen, [],
    `Diese Abfragen holen gelöschte Termine mit — sie stehen dann weiter im Kalender und in den Zahlen: ${offen.join(", ")}`);
});
