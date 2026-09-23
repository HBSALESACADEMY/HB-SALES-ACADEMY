---
name: migration-anlegen
description: Eine neue Supabase-Migration für die HB Sales Academy anlegen — SQL-Datei, Eintrag im Systemstatus, Rückfall für die Zeit ohne Migration, Tests und der fertige SQL-Block zum Einfügen. Immer benutzen, wenn eine neue Spalte oder Tabelle gebraucht wird.
---

# Eine Migration anlegen

Die Datenbank der Academy wird **von Hand** gepflegt: Der Betreiber kopiert
SQL in den Supabase-Editor. Zwischen dem Ausliefern des Codes und dem
Einspielen der Migration liegen deshalb Stunden oder Tage — und in dieser
Zeit läuft die Academy mit einem Code, der eine Spalte erwartet, die es
noch nicht gibt.

**Diese Lücke ist der eigentliche Inhalt dieses Skills.** Am 23.09.2026
sind an einem Tag drei Fehler daraus entstanden, jeder davon beim Team des
Kunden und nicht beim Betreiber:

- Das ganze Team sah beim Öffnen des Call Trackers „Could not find the
  table 'public.telefon_bloecke'" — mehrmals am Tag, für etwas, das
  niemand von ihnen beheben konnte.
- Beim Beenden eines Telefonblocks kam eine Störungsmeldung mit dem Text
  „In der Datenbank fehlt noch eine Änderung (migration_181)".
- Die Verwaltung liess sich **überhaupt nicht mehr speichern**: Postgres
  lehnt die ganze Änderung ab, wenn eine Spalte darin unbekannt ist. Nicht
  nur die neue Einstellung war betroffen, sondern Firmenname, Farben und
  Vorlagen mit.

## Die Schritte

### 1. Nummer bestimmen

```bash
ls supabase/ | grep -oE "migration_[0-9]+" | grep -oE "[0-9]+" | sort -n | tail -1
```

Die nächste freie Nummer nehmen. Dateiname:
`supabase/migration_<nr>_<kurzer_zweck>.sql`

**Vorsicht:** In `supabase/archive/` liegen Dateien einer ALTEN Nummernreihe
mit denselben Nummern. Sie sind nur Geschichte und nie eine Vorlage für die
nächste Nummer.

### 2. Die SQL-Datei schreiben

- `add column if not exists` beziehungsweise `create table if not exists` —
  die Datei muss zweimal laufen können, ohne Schaden anzurichten.
- `check`-Bedingungen für alles, was ein Vertipper kaputt machen kann
  (Grenzen wie `> 0 and <= 500`).
- Ein Standardwert, der die Academy **nicht** verändert: Eine Migration,
  die stillschweigend etwas abschaltet, ist schlimmer als keine.
- Bei einer neuen Tabelle: Indizes, `enable row level security` und die
  Regeln. Als Vorlage dient `supabase/migration_128_call_events.sql`.
- **Die Regel, die in diesem Projekt schon zweimal Leute aus ihren eigenen
  Daten ausgesperrt hat:** Ein Zweig mit `auth.uid() = user_id` trägt NIE
  zusätzlich eine Organisationsbedingung. Für die Leitung gibt es eine
  eigene Regel mit `sieht_person(user_id)`.
- Oben in die Datei ein Kommentar, der das WARUM festhält — nicht das WAS.
  Das WAS steht im SQL.

### 3. In den Systemstatus eintragen

In `lib/schemaErwartung.js` eine Zeile je neuer Spalte oder Tabelle
ergänzen:

```js
{ migration: 182, zweck: "Kurz, was sie ermöglicht", tabelle: "…", spalte: "…" },
```

Damit erscheint sie in Verwaltung → Betrieb → Systemstatus als fehlend,
solange sie fehlt. **Das ist der richtige Ort für eine offene Migration** —
nicht der Bildschirm einer Vertriebsperson.

### 4. Den Rückfall bauen — der wichtigste Schritt

Der Code muss **ohne** die Migration harmlos sein:

- **Lesen:** Fehlt die Tabelle oder Spalte, gibt die Funktion einen leeren
  Wert zurück und meldet **keine** Störung. Vorlage:
  `tabelleFehlt()` in `lib/telefonblockSpeicher.js`. Erkannt werden die
  Meldung von PostgREST („Could not find the …", „schema cache") und der
  Fehlercode `42P01` beziehungsweise `42703`.
- **Schreiben in eine bestehende Maske:** Unbekannte Spalten weglassen und
  den Rest speichern. Dafür gibt es
  `schreibeOhneFehlendeSpalten()` in `lib/spaltenFehler.js`. Danach mit
  `fehlendeSpaltenText()` sagen, was nicht angekommen ist — mit der Nummer
  der Migration, denn „eine Spalte fehlt" kann niemand beheben.
- **Standardwert im Code:** Eine Lesefunktion wie
  `emailMarketingAktiv(org)` gibt bei fehlender Spalte den Wert zurück, der
  dem bisherigen Verhalten entspricht.
- **Niemals** `meldeStoerung()` für eine fehlende Migration. Jeder andere
  Fehler wird weiterhin gemeldet — stumm scheitern ist schlimmer als eine
  Meldung.

### 5. Tests und Gegenprobe

- Reine Logik in eine Datei **ohne** `supabaseClient` legen, sonst lässt
  sie sich im Test nicht laden (die Tests laufen mit `node --test`, ohne
  Browser). Muster: `lib/telefonblock.js` (rechnet) neben
  `lib/telefonblockSpeicher.js` (spricht mit der Datenbank).
- Zusicherungen: Standardwert ohne Spalte, Verhalten mit Spalte, und dass
  die fehlende Spalte **nicht** gemeldet wird.
- Danach die Gegenprobe: die Zusicherung einzeln kaputt machen und prüfen,
  dass der Test rot wird. Ein Wächter, der beim Sabotieren grün bleibt, ist
  kein Wächter.

```bash
node --test tests/*.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"
npx eslint --config eslint.variablen.config.mjs pages lib components
npm run pruefe
```

### 6. Ausliefern und den Block mitschicken

Committen und pushen, dann den **vollständigen SQL-Block** in die Antwort
schreiben — zum Einfügen, ohne Platzhalter, ohne „hier deine ID eintragen".
Bei einer neuen Tabelle die **ganze Datei** zeigen, nicht nur das
`create table`: Indizes und Zugriffsregeln gehören dazu, und wer nur den
Ausschnitt einspielt, hat eine Tabelle ohne Schutz.

Dazu in einem Satz, was ohne die Migration nicht geht — und dass nichts
kaputt ist, solange sie fehlt.

## Woran man nach dem Einspielen erkennt, dass es geklappt hat

Verwaltung → Betrieb → Systemstatus muss „Alle erwarteten Tabellen und
Spalten sind vorhanden" zeigen. Steht die Nummer noch da, hält Supabase
sein Schema-Abbild noch im Zwischenspeicher — einmal neu laden.

**Und der Schritt, den man leicht vergisst:** Einstellungen, die vor der
Migration gespeichert wurden, sind NICHT angekommen — der Rückfall aus
Schritt 4 hat sie weggelassen. Nach dem Einspielen muss die Leitung sie
einmal neu setzen. Das gehört in die Antwort.
