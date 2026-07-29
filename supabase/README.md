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

Die App ist Multi-Tenant/White-Label: jede Zeile in praktisch jeder Tabelle
ist implizit einer `organizations`-Zeile zugeordnet (transitiv über
`profiles.organization_id`, per `same_org()`-Funktion), Kunden sehen sich
gegenseitig nicht (Ausnahme: die globale Community-Ebene und Freundschafts-
anfragen bleiben bewusst unternehmensübergreifend).

Es gibt **kein Selbstbedienungs-Signup** für neue Organisationen — nur
Plattform-Admins (`is_platform_admin = true`) legen neue Kunden an, und zwar
**nicht mehr per SQL**, sondern über die Oberfläche unter
`/admin/organization` ("Neuen Kunden einrichten"): Das Formular legt in
einem Schritt sowohl die Organisation (inkl. eindeutigem Firmencode-Slug)
als auch den ersten Organisations-Manager-Account (Name, E-Mail, Passwort)
an — dieser kann sich sofort anmelden, eigene Registrierungen freigeben und
Logo/Branding seiner Organisation selbst verwalten. Der Organisations-
Manager lässt sich später jederzeit über dieselbe Seite durch ein anderes
Mitglied ersetzen.

Bekannte, bewusste Einschränkung: keine eigenen (Sub-)Domains pro Kunde
(Zugang läuft ausschließlich über den Firmencode auf der gemeinsamen Login-
Seite); eingebaute Sidebar-Einträge (`nav_items` mit `is_builtin = true`)
bleiben plattformweit geteilt statt pro Organisation eigenständig anpassbar.

## Wichtig für künftige Änderungen

Wenn ab jetzt neue Tabellen/Spalten/Policies per SQL Editor angelegt
werden, bitte das SQL zusätzlich als neue, nummerierte Datei in diesem
Ordner committen (z.B. `migration_12_xyz.sql`) **und** `schema_v2.sql`
entsprechend ergänzen — sonst driftet die Datei wieder von der echten
Datenbank auseinander, wie es hier über viele Monate passiert ist.
