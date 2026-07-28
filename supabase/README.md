# Supabase-Schema

## `schema_v2.sql` — die aktuelle, autoritative Datei

`schema_v2.sql` ist das vollständige, konsolidierte Datenbank-Schema. Es
wurde am **2026-07-28** durch direkte Introspektion der laufenden
Produktions-Datenbank erzeugt (Tabellen, Spalten, Constraints, Indizes,
RLS-Policies, Funktionen, Realtime-Publikation) und bildet damit den
**echten** Stand ab — nicht nur das, was zufällig als Datei im Repo lag.

**Verwendung:** Einmalig komplett im SQL Editor eines neuen/leeren
Supabase-Projekts ausführen, um die Datenbank von Grund auf aufzubauen.

Gegen die bestehende Produktions-DB ist die Datei ungefährlich erneut
ausführbar (alle `create table` sind mit `if not exists` abgesichert,
Policies werden per `drop … if exists` + `create` ersetzt) — außer dem
Realtime-Abschnitt ganz am Ende: dort schlagen die `alter publication`-
Zeilen fehl, weil die Tabellen schon Mitglied sind. Das ist ungefährlich,
einfach ignorieren.

## `archive/` — historische Dateien, NICHT mehr verwenden

Der Ordner `archive/` enthält `schema.sql` und `migration_2` bis
`migration_11` — die einzigen SQL-Dateien, die je im Git-Verlauf dieses
Repos existierten. Sie decken nur einen Bruchteil der echten Datenbank ab:
**13 Tabellen** (`blocks`, `call_log_days`, `chat_group_members`,
`chat_groups`, `conversation_reads`, `login_attempts`, `login_events`,
`mentor_pairs`, `page_views`, `scripts`, `team_goals`, `team_requests`,
`xp_log`) sowie die RLS-Hilfsfunktionen `is_group_member()` und
`can_view_profile()` wurden nie als Datei committet, sondern direkt per
Copy-Paste im Supabase SQL Editor angelegt.

Diese Dateien bleiben nur zur historischen Nachvollziehbarkeit erhalten.
Für den Aufbau einer neuen Datenbank oder als Referenz für die aktuelle
Struktur bitte ausschließlich `schema_v2.sql` verwenden.

## Multi-Tenant: neue Kunden-Organisation anlegen

Seit `migration_15_organizations.sql` ist die App Multi-Tenant/White-Label:
jede Zeile in praktisch jeder Tabelle ist implizit einer `organizations`-Zeile
zugeordnet (über `profiles.organization_id`), Kunden sehen sich gegenseitig
nicht (Ausnahme: die Community bleibt bewusst unternehmensübergreifend).

Es gibt **kein Selbstbedienungs-Signup** für neue Organisationen — Houman legt
jede neue Kunden-Organisation manuell per SQL an:

```sql
insert into organizations (name, slug) values ('<Kundenname>', '<slug-ohne-leerzeichen>');
```

Danach:
1. Dem Kunden den `slug` mitteilen ("Firmen-Code").
2. Der erste Nutzer des Kunden registriert sich über das normale Signup-
   Formular mit genau diesem Firmen-Code — landet automatisch (Status
   `pending`) in der neuen Organisation.
3. Diesen ersten Nutzer wie gehabt per SQL befördern:
   ```sql
   update profiles set role = 'manager', is_admin = true where id = '<user-uuid>';
   ```
4. Ab jetzt kann dieser Manager/Admin innerhalb `/admin/organization` selbst
   Logo, Name und Akzentfarbe setzen, und über `/admin` weitere Registrierungen
   seiner eigenen Organisation genehmigen — alles automatisch auf die eigene
   Organisation begrenzt, ohne weiteres Zutun von Houman.

Bekannte, bewusste Einschränkungen dieser ersten Version (siehe auch Kommentare
in `migration_15_organizations.sql`): keine eigenen (Sub-)Domains pro Kunde,
kein automatisches Erkennen der Akzentfarbe aus einem hochgeladenen Logo,
eingebaute Sidebar-Einträge (`nav_items` mit `is_builtin = true`) bleiben
plattformweit geteilt statt pro Organisation eigenständig anpassbar.

## Wichtig für künftige Änderungen

Wenn ab jetzt neue Tabellen/Spalten/Policies per SQL Editor angelegt
werden, bitte das SQL zusätzlich als neue, nummerierte Datei in diesem
Ordner committen (z.B. `migration_12_xyz.sql`) **und** `schema_v2.sql`
entsprechend ergänzen — sonst driftet die Datei wieder von der echten
Datenbank auseinander, wie es hier über viele Monate passiert ist.
