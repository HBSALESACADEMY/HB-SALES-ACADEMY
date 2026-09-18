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

// Ein Platzhalter ohne Wert lässt seine Zeile ersatzlos wegfallen
// (lib/marketingVorlage.js). Das ist richtig — "Firma:" ohne Firma verrät
// die Serienmail. Es heisst aber auch: fehlt der Name in den Daten, geht
// die Mail ohne Absendernamen raus und SIEHT VOLLSTÄNDIG AUS. Genau so ist
// es im Call Tracker passiert: das Profil wurde ohne full_name geladen,
// während an anderer Stelle derselben Datei Namen geladen wurden — deshalb
// fiel es beim Lesen nicht auf.
test("Wo eine Mail entsteht, wird der Name des Absenders mitgeladen", () => {
  const stellen = [
    {
      datei: "../pages/call-tracker.js",
      verwendung: "vertriebler: meinProfil?.full_name",
      // Genau die Abfrage, die dieses Profil füllt — nicht irgendeine.
      abfrage: /const \{ data: meineRolle \} = await supabase\s*\.?\s*\n?\s*\.from\("profiles"\)\s*\n?\s*\.select\("([^"]*)"\)/,
    },
    {
      // Beim Versand zählt die Person, der der Kontakt GEHÖRT: mit ihr hat
      // der Kunde telefoniert, ihr Name steht unter der Mail.
      datei: "../pages/api/marketing-mail.js",
      verwendung: "besitzer?.full_name",
      abfrage: /const \{ data: besitzer \} = await admin\.from\("profiles"\)\s*\n?\s*\.select\("([^"]*)"\)/,
    },
  ];

  stellen.forEach(({ datei, verwendung, abfrage }) => {
    const quelle = readFileSync(new URL(datei, import.meta.url), "utf8");
    assert.ok(quelle.includes(verwendung), `${datei}: "${verwendung}" nicht gefunden — Test veraltet?`);

    const treffer = quelle.match(abfrage);
    assert.ok(treffer, `${datei}: die Abfrage für dieses Profil nicht gefunden — Test veraltet?`);
    assert.ok(treffer[1].includes("full_name"),
      `${datei} baut eine Mail mit dem Absendernamen, lädt ihn aber nicht mit: "${treffer[1]}". `
      + "Die Zeile mit dem Platzhalter fällt dann weg, und die Mail geht ohne Namen raus.");
  });
});

// Ein Kalender beantwortet "was habe ICH heute zu tun". Die Datenbank gibt
// der Führung auch die Follow-ups der geführten Personen heraus — richtig
// für Listen und Auswertungen, falsch im Kalender: zwanzig fremde Rückrufe
// verdecken die eigenen drei, und dann macht man den Kalender nicht mehr auf.
test("Im Kalender steht nur das eigene Follow-up", () => {
  const stellen = [
    ["../pages/api/org-kalender.js", 'eq("zustaendig", auth.user.id)'],
    ["../pages/api/kalender-abo.js", 'eq("zustaendig", profil.id)'],
  ];

  stellen.forEach(([datei, eingrenzung]) => {
    const quelle = readFileSync(new URL(datei, import.meta.url), "utf8");
    const abfrage = quelle.match(/from\("nachfass_termine"\)[\s\S]{0,400}?;/);
    assert.ok(abfrage, `${datei}: keine Abfrage auf die Follow-ups gefunden — Test veraltet?`);
    assert.ok(abfrage[0].includes(eingrenzung),
      `${datei} holt Follow-ups ohne Eingrenzung auf die eigene Person. `
      + "Die Führung bekäme die Rückrufe des ganzen Teams in den eigenen Kalender.");
  });
});

// Wer verkauft hat, ist nicht die Person, die beurteilt, ob geliefert wurde.
// Diese Grenze darf nicht nur in der Maske stehen: ein deaktiviertes
// Kästchen hält genau so lange, bis jemand den Weg daran vorbei findet.
test("Die Projektumsetzung ist in der Datenbank der Leitung vorbehalten", () => {
  const sql = readFileSync(new URL("../supabase/migration_157_schritte.sql", import.meta.url), "utf8");

  assert.match(sql, /alter table leads add column if not exists schritte/);

  // Ein Auslöser, der genau diesen einen Schlüssel schützt — und nicht die
  // ganze Zeile sperrt, sonst könnte der Vertrieb seinen eigenen Termin
  // nicht mehr bearbeiten.
  assert.match(sql, /create trigger leads_schritte_pruefen[\s\S]*?before update on leads/);
  assert.match(sql, /schritte -> 'projektumsetzung'/);
  assert.match(sql, /not ist_fuehrungsrolle\(auth\.uid\(\)\)/);
  assert.match(sql, /raise exception/);

  // Ohne angemeldete Person läuft der Server mit erweiterten Rechten
  // (Cron). Dort greift die Grenze nicht — sonst stünden Wartungsläufe.
  assert.match(sql, /if auth\.uid\(\) is null then/);

  // Und die Maske deaktiviert das Kästchen zusätzlich: eine Fehlermeldung
  // nach dem Klick ist schlechter als ein Kästchen, das gar nicht erst
  // klickbar aussieht.
  const seite = readFileSync(new URL("../pages/termine.js", import.meta.url), "utf8");
  assert.match(seite, /darfSchritt\(schritt, canSeeTeam\)/);
  assert.match(seite, /disabled=\{!darf\}/);
});

// "active_org" ist eine eigene TABELLE und keine Spalte in profiles. Wer
// sie mitselektiert, bekommt von Supabase einen Fehler zurück — das Profil
// ist dann leer, aktiveOrgId() liefert null, und die Route bricht mit
// "Keine aktive Organisation gefunden" ab. Genau so ist die
// Telegram-Meldung beim Abhaken einer Bestätigung ausgefallen.
test("Keine Route fragt active_org als Spalte des Profils ab", () => {
  const ordner = new URL("../pages/api/", import.meta.url);
  const dateien = readdirSync(ordner, { recursive: true })
    .filter((n) => typeof n === "string" && n.endsWith(".js"));

  const treffer = [];
  dateien.forEach((name) => {
    const quelle = readFileSync(new URL(name, ordner), "utf8");
    // Nur Abfragen AUF profiles: die Tabelle active_org selbst darf
    // natürlich ihre eigene Spalte lesen.
    [...quelle.matchAll(/from\("profiles"\)\s*\n?\s*\.select\("([^"]*)"\)/g)].forEach((m) => {
      if (/\bactive_org\b/.test(m[1])) treffer.push(`${name}: ${m[1]}`);
    });
  });

  assert.deepEqual(treffer, [],
    `Diese Abfragen holen "active_org" aus profiles und liefern deshalb gar kein Profil: ${treffer.join(", ")}`);
});

// aktiveOrgId() unterscheidet Plattform-Admins von allen anderen. Fehlt
// is_platform_admin im Profil, gilt jeder als normaler Nutzer — ein
// Plattform-Admin unter fremdem Firmencode landet dann still in seiner
// Heimat-Organisation, und die Meldung geht an das falsche Team.
test("Wer aktiveOrgId nutzt, lädt is_platform_admin mit", () => {
  const ordner = new URL("../pages/api/", import.meta.url);
  const dateien = readdirSync(ordner, { recursive: true })
    .filter((n) => typeof n === "string" && n.endsWith(".js"));

  const fehlend = [];
  dateien.forEach((name) => {
    const quelle = readFileSync(new URL(name, ordner), "utf8");
    if (!/aktiveOrgId\(/.test(quelle)) return;

    // Nur Abfragen auf das EIGENE Profil. Eine Route liest oft auch das
    // Profil anderer Personen — das hat mit der aktiven Organisation
    // nichts zu tun. Und manche holen ihr Profil über einen Helfer in
    // einer anderen Datei; die haben hier gar keinen Treffer.
    const eigene = [...quelle.matchAll(
      /from\("profiles"\)\s*\n?\s*\.select\("([^"]*)"\)[\s\S]{0,120}?\.eq\("id",\s*(?:auth\.)?user(?:Id)?\.?i?d?\)/g,
    )].map((m) => m[1]);
    if (!eigene.length) return;
    if (!eigene.some((p) => p.includes("is_platform_admin"))) fehlend.push(name);
  });

  assert.deepEqual(fehlend, [],
    `Diese Routen bestimmen die aktive Organisation ohne is_platform_admin: ${fehlend.join(", ")}`);
});

// Ein Bot bedient alle Organisationen dieser Academy, und Telegram gibt
// über getUpdates alles heraus, was er zuletzt gesehen hat — auch die
// Gruppen anderer Kunden. Ohne Nachweis sähe die Leitung von Firma A die
// Gruppennamen und Kennungen von Firma B und könnte eine fremde Kennung in
// ihr eigenes Feld eintragen. Dann gingen die Meldungen von A in die
// Telegram-Gruppe von B.
test("Die Gruppensuche findet nur Gruppen der eigenen Organisation", async () => {
  const { gruppenCode, codePasst } = await import("../lib/gruppenCode.js");

  // Je Organisation ein eigener Code, und er lässt sich nicht aus der
  // Organisations-Kennung ausrechnen: ein Geheimnis des Servers geht mit
  // ein. Die Kennung steht in mancher Adresszeile.
  const a = gruppenCode("11111111-1111-1111-1111-111111111111", "geheim");
  const b = gruppenCode("22222222-2222-2222-2222-222222222222", "geheim");
  assert.notEqual(a, b);
  assert.match(a, /^HB-[A-Z0-9]{6}$/);
  assert.notEqual(a, gruppenCode("11111111-1111-1111-1111-111111111111", "anderes-geheimnis"));
  assert.equal(gruppenCode(null), null);

  // Gross- und Kleinschreibung egal: der Code wird abgetippt.
  assert.equal(codePasst(`hallo ${a.toLowerCase()} @bot`, a), true);
  assert.equal(codePasst("nur text", a), false);
  assert.equal(codePasst(`text ${b}`, a), false);

  // Und die Route prüft den Code, statt alles zu listen, was der Bot
  // gesehen hat.
  const quelle = readFileSync(new URL("../pages/api/admin/telegram-chats.js", import.meta.url), "utf8");
  assert.match(quelle, /codePasst\(/, "Ohne Code-Prüfung listet die Suche fremde Gruppen.");
  assert.match(quelle, /is_platform_admin \? gewuenscht : null/,
    "Eine fremde orgId darf nur ein Plattform-Admin angeben.");
});

// Ein von Hand im E-Mail-Marketing angelegter Kontakt ist keine Übergabe:
// wer ihn einträgt, sitzt schon dort, wo die Telegram-Meldung hinführt.
// Aus dem Gespräch dagegen muss jemand anderes handeln — dort bleibt sie.
test("Nur ein Kontakt aus dem Gespräch meldet sich in Telegram", () => {
  const quelle = readFileSync(new URL("../pages/api/email-kontakt.js", import.meta.url), "utf8");
  const vonHand = quelle.indexOf("if (vonHand) return");
  const meldung = quelle.indexOf("sendeAlarm(");
  assert.ok(vonHand > 0, "Die Route unterscheidet nicht mehr zwischen Hand und Gespräch.");
  assert.ok(vonHand < meldung, "Der Ausstieg für von Hand angelegte Kontakte muss VOR der Meldung stehen.");
  // Und die Adresse wird für beide Wege gleich gesäubert — der Ausstieg
  // steht erst NACH dem Speichern.
  assert.ok(quelle.indexOf("bereinigeAdresse(email)") < vonHand);
});

// Die Einträge in email_anhaenge waren je Organisation getrennt, die
// DATEIEN im Speicher nicht: die Regeln prüften nur "angemeldet" oder
// "Führungsrolle irgendeiner Organisation". Die Leitung von Firma B hätte
// eine Datei von Firma A überschreiben oder löschen können — und beim
// Versand ginge dann Bs Datei an As Kunden.
test("Anhang-Dateien sind im Speicher je Organisation abgeschottet", () => {
  const sql = readFileSync(new URL("../supabase/migration_163_anhaenge_je_organisation.sql", import.meta.url), "utf8");
  const regel = (name) => sql.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`))?.[0] || "";

  ["email_anhaenge_lesen", "email_anhaenge_schreiben", "email_anhaenge_entfernen"].forEach((name) => {
    const r = regel(name);
    assert.ok(r, `${name} fehlt.`);
    assert.match(r, /bucket_id = 'email-anhaenge'/);
    // Der erste Ordner des Pfads ist die Organisation.
    assert.match(r, /\(storage\.foldername\(name\)\)\[1\] = aktive_org\(auth\.uid\(\)\)::text/,
      `${name} prüft nicht, ob die Datei zur aktiven Organisation gehört.`);
    // Keine Pauschalausnahme, die die Grenze wieder aushebelt.
    assert.ok(!/is_platform_admin/.test(r), `${name} hebt die Grenze für Plattform-Admins auf.`);
  });

  // Schreiben und Löschen bleiben der Leitung vorbehalten.
  assert.match(regel("email_anhaenge_schreiben"), /ist_fuehrungsrolle\(auth\.uid\(\)\)/);
  assert.match(regel("email_anhaenge_entfernen"), /ist_fuehrungsrolle\(auth\.uid\(\)\)/);

  // Und der Upload legt die Dateien wirklich unter der Organisation ab —
  // sonst sperrte die neue Regel jeden Upload aus.
  const seite = readFileSync(new URL("../pages/email-marketing.js", import.meta.url), "utf8");
  assert.match(seite, /const pfad = `\$\{org\.id\}\//);
});

test("Beim Check-in lässt sich das Ergebnis Kunde nicht versehentlich zurücknehmen", () => {
  // Ein zweites Tippen auf "Kunde geworden" nimmt das Ergebnis zurück. Beim
  // Check-in stünde der Kunde danach ohne Abschluss da, und der Balken fiele
  // zurück. Deshalb gibt es die Ergebnis-Zeile dort nicht.
  const quelle = readFileSync(new URL("../pages/termine.js", import.meta.url), "utf8");
  const zeile = quelle.indexOf(">Ergebnis</span>");
  assert.ok(zeile > 0);
  const davor = quelle.slice(Math.max(0, zeile - 700), zeile);
  assert.match(davor, /kundentermin && art\.key !== "checkin" && \(/);
});

test("Follow-ups aus dem E-Mail-Marketing gehen nicht an Telegram-Gruppen", () => {
  // Anlegen, fällig werden, liegengebliebene Kontakte, abhaken: Keine
  // dieser Stellen darf in eine Telegram-GRUPPE schreiben. Persönlich an
  // die zuständige Person ist erlaubt — nur über die Verknüpfung.
  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
  for (const pfad of ["pages/api/nachfass.js", "lib/nachfassTermineErinnerung.js", "lib/nachfassErinnerung.js", "lib/nachfassMail.js"]) {
    const code = lies(pfad).replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/sendeAlarm|telegram_/i.test(code), `${pfad} schickt noch an Telegram`);
  }
  // Das Abhaken meldet nichts mehr an den Bestätigungs-Kanal.
  for (const pfad of ["pages/kalender.js", "pages/email-marketing.js"]) {
    assert.ok(!/nachfassId/.test(lies(pfad)), `${pfad} meldet erledigte Follow-ups noch an Telegram`);
  }
  assert.ok(!/nachfass_termine|nachfassId/.test(lies("pages/api/bestaetigung-melden.js").replace(/^\s*\/\/.*$/gm, "")));
});

test("Die persönliche Telegram-Verknüpfung schreibt nur der Server", () => {
  const sql = readFileSync(new URL("../supabase/migration_165_telegram_persoenlich_und_tagesauswertung.sql", import.meta.url), "utf8")
    .replace(/--.*$/gm, "");
  // Stünde die Chat-Kennung in einer Tabelle, die man selbst beschreiben
  // darf, liesse sich eine fremde Kennung eintragen — und die eigenen
  // Meldungen landeten in einem fremden Chat.
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for select using \(user_id = auth\.uid\(\)\)/);
  assert.ok(!/on telegram_verknuepfungen\s+for (insert|update|delete|all)/.test(sql));
  // Der Zeitpunkt des Abschlusses lässt sich nicht nachträglich verschieben.
  assert.match(sql, /new\.kunde_am := old\.kunde_am/);

  // Die Kennung kommt nur aus Telegram, nie aus der Anfrage.
  const route = readFileSync(new URL("../pages/api/telegram-verbindung.js", import.meta.url), "utf8");
  assert.ok(!/req\.body[^\n]*chat_?id/i.test(route));
  assert.match(route, /chat_id: treffer\.chatId/);

  // Die Follow-up-Stellen schreiben persönlich nur über die Verknüpfung.
  for (const pfad of ["pages/api/nachfass.js", "lib/nachfassTermineErinnerung.js", "lib/nachfassErinnerung.js"]) {
    const code = readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
    assert.match(code, /sendePersoenlich\(admin, chat,/, pfad);
  }
});

test("Die Einstellungen sind am Rechner und am Handy erreichbar", () => {
  // Dort verbindet man sein Telegram. Stand der Link nur im Handy-Menü,
  // fand ihn am Schreibtisch niemand.
  const layout = readFileSync(new URL("../components/Layout.js", import.meta.url), "utf8");
  const links = layout.match(/router\.push\("\/settings"\)/g) || [];
  assert.ok(links.length >= 2, `nur ${links.length} Link(s) zu den Einstellungen`);
});

test("Benachrichtigungs-Mails setzen Eingaben nur maskiert ins HTML", () => {
  // Namen, Notizen, Kommentare, Firmen: alles, was jemand eintippt. Ohne
  // Maskierung wird aus "<a href=...>" in der Mail an die Leitung ein echter
  // Link — bei der Registrierung sogar von jemandem, den noch niemand kennt.
  const dateien = [
    "pages/api/lead-comment.js", "pages/api/lead-created.js", "pages/api/lead-reminder.js",
    "pages/api/lead-task.js", "pages/api/marketing-termin.js", "pages/api/exam-submit.js",
    "pages/api/notify-pending-approval.js", "pages/api/nachfass.js",
  ];
  // Erlaubt ohne Maskierung: selbst gebaute Werte und Bedingungen, deren
  // Inhalt an seiner eigenen Stelle geprüft wird.
  const erlaubt = [/^maskiere\(/, /^link\b/, /^appUrl\b/, /^terminText\(/, /^appointmentFuer\(/, /^combinedScore\b/,
    /^wann\b/, /^new Date\(/, /^[\w.?]+\s+\?\s/, /^extraLines\.length\s+\?/,
    /^extraLines\.map\(\(z\) => maskiere\(z\)\)/];
  const verstoesse = [];
  for (const pfad of dateien) {
    const zeilen = readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8").split("\n");
    zeilen.forEach((zeile, i) => {
      if (!/<(p|br|strong)\b/.test(zeile)) return;
      let ab = zeile.indexOf("${");
      while (ab !== -1) {
        const ausdruck = zeile.slice(ab + 2).trimStart();
        if (!erlaubt.some((r) => r.test(ausdruck))) verstoesse.push(`${pfad}:${i + 1}: \${${ausdruck.slice(0, 40)}`);
        ab = zeile.indexOf("${", ab + 2);
      }
    });
  }
  assert.deepEqual(verstoesse, []);
});

test("Die tägliche Challenge rechnet Browser und Server mit demselben Tag und derselben Frage", () => {
  const server = readFileSync(new URL("../pages/api/daily-challenge-submit.js", import.meta.url), "utf8");
  const browser = readFileSync(new URL("../pages/daily-challenge.js", import.meta.url), "utf8");
  const frage = "Math.floor(Date.parse(`${todayStr()}T00:00:00Z`) / 86400000)";
  assert.ok(server.includes(frage) && browser.includes(frage));
  assert.match(server, /return berlinHeute\(\);/);
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(server));
});

test("Auswertung, Teamziele und Org-Kalender laden über tausend Zeilen hinaus", () => {
  // Supabase schneidet bei 1000 Zeilen still ab. Genau diese Stellen lesen
  // wachsende Tabellen über ganze Zeiträume.
  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
  const auswertung = lies("pages/api/auswertung.js");
  for (const tabelle of ["call_log_days", "leads", "call_events"]) {
    assert.match(auswertung, new RegExp(`alleZeilen\\(\\(\\) => admin\\.from\\("${tabelle}"\\)`), tabelle);
  }
  const ziele = lies("pages/api/team-goals.js");
  assert.match(ziele, /alleZeilen\(\(\) => admin\.from\("quiz_results"\)/);
  assert.match(ziele, /alleZeilen\(\(\) => admin\.from\("exam_results"\)/);
  assert.match(lies("pages/api/org-kalender.js"), /alleZeilen\(\(\) => auth\.client\.from\("leads"\)/);
});

test("Niemand befördert sich selbst über das eigene Profil", () => {
  const sql = readFileSync(new URL("../supabase/migration_166_profilrechte_und_freischaltung.sql", import.meta.url), "utf8")
    .replace(/--.*$/gm, "");
  const geschuetzt = ["role", "status", "is_admin", "is_platform_admin", "can_view_call_stats", "vorgesetzter_id",
    "manager_id", "kalender_token", "kalender_umfang", "kalender_personen", "xp"];
  for (const spalte of geschuetzt) {
    assert.match(sql, new RegExp(`new\\.${spalte} is distinct from old\\.${spalte}`), spalte);
  }
  // Nur der Server (ohne auth.uid()) darf diese Spalten schreiben.
  assert.match(sql, /if auth\.uid\(\) is null then\s+return new;/);
  assert.match(sql, /before update on profiles/);

  // Ohne Freischaltung keine Organisation — Plattform-Admins ausgenommen.
  assert.match(sql, /status = 'approved' or coalesce\(is_platform_admin, false\)/);
  assert.match(sql, /when not public\.ist_freigeschaltet\(uid\) then null/);

  // Und der Browser schreibt keine dieser Spalten — sonst bricht dort
  // etwas, sobald die Migration läuft.
  const quellen = [];
  const sammle = (ordner) => readdirSync(new URL(`../${ordner}/`, import.meta.url), { withFileTypes: true }).forEach((e) => {
    const pfad = `${ordner}/${e.name}`;
    if (e.isDirectory()) { if (pfad !== "pages/api") sammle(pfad); } else if (e.name.endsWith(".js")) quellen.push(pfad);
  });
  sammle("pages"); sammle("components");
  const verstoesse = [];
  for (const pfad of quellen) {
    const code = readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
    for (const m of code.matchAll(/\.from\("profiles"\)\s*\.(update|upsert)\(\s*\{([\s\S]{0,400}?)\}\s*\)/g)) {
      const keys = [...m[2].matchAll(/(?:^|[{,\s])([a-z_]+)\s*:/g)].map((k) => k[1]);
      keys.filter((k) => geschuetzt.includes(k)).forEach((k) => verstoesse.push(`${pfad}: ${k}`));
    }
  }
  assert.deepEqual(verstoesse, []);
  const layout = readFileSync(new URL("../components/Layout.js", import.meta.url), "utf8");
  assert.ok(!/rpc\("increment_xp"/.test(layout), "Der Browser ruft increment_xp auf — das darf nur der Server");
});

test("Was der Server beim Mailversand meldet, kommt auf den Bildschirm", () => {
  // Die Route antwortet "ok" mit einem Hinweis, wenn die Mail raus ist, der
  // Status aber nicht gespeichert wurde. Wer die Antwort verwirft, macht
  // daraus wieder einen stillen Fehler.
  for (const pfad of ["pages/email-marketing.js", "pages/call-tracker.js"]) {
    const code = readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
    assert.match(code, /const antwort = await apiPost\("\/api\/marketing-mail"/, pfad);
    assert.match(code, /if \(antwort\?\.hinweis\) set(Fehler|EmailFehler)\(antwort\.hinweis\)/, pfad);
  }
});

test("Onboarding: Schreiben nur über den Server, und dort nur in der eigenen Organisation", () => {
  const sql = readFileSync(new URL("../supabase/migration_167_onboarding.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  for (const tabelle of ["onboarding_schritte", "onboarding_zuweisungen", "onboarding_haken"]) {
    assert.match(sql, new RegExp(`alter table ${tabelle} enable row level security`), tabelle);
    assert.ok(!new RegExp(`on ${tabelle}\\s+for (insert|update|delete|all)`).test(sql), `${tabelle} hat Schreibregeln`);
  }
  // Die eigene Zuweisung ohne Bedingung an die Organisation.
  assert.match(sql, /"onboarding_zuweisung_eigene" on onboarding_zuweisungen\s+for select using \(user_id = auth\.uid\(\)\);/);
  assert.match(sql, /'onboarding', 'Onboarding', 'check', '\/onboarding', true, true, true/);

  const route = readFileSync(new URL("../pages/api/onboarding.js", import.meta.url), "utf8");
  // Jede Abfrage auf Plan und Zuweisungen ist an die aktive Organisation gebunden.
  for (const m of route.matchAll(/\.from\("onboarding_(schritte|zuweisungen)"\)([\s\S]*?)(;|\)\),|\]\);)/g)) {
    assert.match(m[2], /organization_id/, `ohne Organisation: ${m[0].slice(0, 90)}`);
  }
  // Abhaken nach der gemeinsamen Regel; alles andere nur für die Leitung.
  assert.match(route, /darfAbhaken\(schritt, \{ istLeitung: leitung, istEigene: zuweisung\.user_id === profil\.id \}\)/);
  const leitungsSperre = route.indexOf('if (!leitung) return res.status(403)');
  assert.ok(leitungsSperre > route.indexOf('b.aktion === "haken"'));
  for (const aktion of ["schritt_speichern", "schritt_loeschen", "reihenfolge", "zuweisen", "startdatum", "zuweisung_entfernen"]) {
    assert.ok(route.indexOf(`b.aktion === "${aktion}"`) > leitungsSperre, aktion);
  }
  // Nur freigeschaltete Personen der eigenen Organisation lassen sich verbinden.
  assert.match(route, /person\.organization_id !== orgId \|\| person\.status !== "approved"/);
});

test("Das Onboarding ist ein eigener Bereich, keine Unterseite der Verwaltung", () => {
  const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");
  const layout = lies("components/Layout.js");
  // Ohne Gruppe landet ein Menüpunkt unter "Weiteres" — dort sucht ihn niemand.
  assert.match(layout, /onboarding: "Führung"/);
  assert.match(layout, /id: "onboarding", label: "Onboarding"[^}]*requires_manager: true/);

  // Nicht in den Verwaltungsreitern, und die Seite zeigt sie auch nicht.
  assert.ok(!/onboarding/i.test(lies("components/AdminTabs.js")));
  const seite = lies("pages/onboarding.js");
  assert.ok(!/AdminTabs/.test(seite));
  // Stattdessen eigene Reiter.
  assert.match(seite, /const REITER = \[/);
  ["uebersicht", "personen", "plan"].forEach((r) => assert.match(seite, new RegExp(`key: "${r}"`), r));
});

test("Die Begrüssung nennt die aktive Organisation, nicht die Heimat-Organisation", () => {
  const route = readFileSync(new URL("../pages/api/telegram-verbindung.js", import.meta.url), "utf8");
  assert.match(route, /const orgId = await aktiveOrgId\(admin, profil, userId\)/);
  assert.match(route, /await sendeAlarm\(await begruessung\(admin, userId\), treffer\.chatId\)/);
});
