# HB Sales Academy

Multi-Tenant White-Label-SaaS-Plattform (Next.js 14 Pages Router + Supabase)
für Vertriebstraining. Eine einzige Anwendung bedient beliebig viele
Kunden-Organisationen — jede meldet sich über einen eigenen **Firmencode**
an, sieht ausschließlich ihre eigenen Mitglieder/Inhalte und kann Logo,
Farben und komplettes Erscheinungsbild individuell brandbar machen.

## Inhaltsverzeichnis

- [Was die Plattform kann](#was-die-plattform-kann)
- [Multi-Tenant-Architektur](#multi-tenant-architektur)
- [Rollen & Rechte](#rollen--rechte)
- [Organisations-Branding (White-Label)](#organisations-branding-white-label)
- [Tech-Stack](#tech-stack)
- [Setup](#setup)
- [Deployment (Vercel)](#deployment-vercel)
- [Datenbank & Migrationen](#datenbank--migrationen)
- [Projektstruktur](#projektstruktur)
- [Kosten](#kosten)

## Was die Plattform kann

**Lernen**
- 5 Kurse, 17 Module, Multiple-Choice-Fragen + offene Fallstudien (von Claude
  anhand einer Bewertungs-Rubrik benotet), Kursprüfungen mit Bestehensgrenzen,
  PDF-Zertifikate.
- KI-Rollenspiel (Cold Call / Closing Call) mit mehreren Personas, Szenarien
  und Schwierigkeitsgraden, serverseitig über Claude ausgewertet inkl.
  konkreter Formulierungsvorschläge.
- Leitfaden-Generator: individuelle Gesprächsleitfäden statt starrer Skripte.
- Szenario-Simulator, Skript-Bibliothek, Wissensdatenbank (mit
  Vorschlags-/Freigabe-Workflow), Flashcards (Spaced Repetition), Tages-
  Challenge, XP/Level/Streak-System, Rangliste.

**Vertriebs-Tools**
- Cold Call Tracker (Anwahlen, Erreichbarkeits-/Abschlussquote, Einwand-
  Verteilung, Team-Ansicht für Manager).
- Einwandbehandlungstrainer (KI-gestütztes Training einzelner Einwände).
- "Einwandbehandlung" als eigener Community-Bereich: Mitglieder posten reale
  Kundeneinwände, andere antworten mit Formulierungen — Antworten sind
  einzeln likebar, die meistgelikte wird als "🏆 Top-Antwort" markiert.

**Team & Zusammenarbeit**
- Echte Mehrfach-Team-Struktur (`teams`/`team_members`) mit manueller
  Mentoring-Zuordnung (kein Auto-Matching).
- Mitglieder der eigenen Organisation sehen sich gegenseitig und können ohne
  Freundschaftsanfrage direkt chatten (1:1 und Gruppen, mit Datei-/Sprach-
  nachrichten, Lesebestätigungen). Kontakt zu Mitgliedern **anderer**
  Organisationen läuft über eine globale Namenssuche + Freundschafts-
  anfrage — Chat erst nach Annahme.
- Community mit zwei Ebenen: **"Meine Organisation"** (Standard, strikt auf
  die eigene Organisation beschränkt) und **"Global"** (bewusst mit allen
  Organisationen geteilte Beiträge, Opt-in beim Posten). Beiträge, Kommentare,
  Kudos und die wöchentliche Kudos-Wall respektieren dieselbe Trennung.
- Manager-Dashboard, Insights (Team-weite Statistiken), Aktivitäts-Feed.

## Multi-Tenant-Architektur

- **Firmencode statt eigener Domains.** Die Login-Seite fragt zuerst nach
  dem Firmencode (`organizations.slug`); erst danach erscheinen Login/
  Registrierung mit dem Branding der erkannten Organisation. Registrieren
  ordnet automatisch der passenden Organisation zu (`handle_new_user()`-
  Trigger, liest `org_slug` aus den Signup-Metadaten).
- **Kein Selbstbedienungs-Signup für neue Organisationen.** Ausschließlich
  Plattform-Admins legen neue Kunden an — über `/admin/organization`, nicht
  per SQL: das Formular erstellt Organisation **und** den ersten
  Organisations-Manager-Account (Name/E-Mail/Passwort) in einem Schritt.
- **Datentrennung ohne `organization_id` in jeder Tabelle.** Eine
  `same_org(a, b)`-Funktion vergleicht `profiles.organization_id` beider
  Seiten transitiv über die jeweils vorhandene `user_id`/`created_by`-Spalte;
  RLS-Policies nutzen `same_org()` statt einer eigenen Organisationsspalte
  pro Tabelle.
- **Bewusste Ausnahme:** die globale Community-Ebene, globale Namenssuche und
  Freundschaftsanfragen sind ausdrücklich organisationsübergreifend — alles
  andere ist strikt getrennt.
- Service-Role-Routen (`pages/api/admin/*`, `pages/api/platform/*`) umgehen
  RLS vollständig und müssen Organisationsgrenzen **explizit** selbst prüfen.

## Rollen & Rechte

| Rolle | Umfang | Rechte |
|---|---|---|
| **Administrator** (`is_platform_admin`) | plattformweit | Organisationen anlegen/bearbeiten/löschen, Nutzer jeder Organisation freigeben/verwalten, Rollen aller Nutzer vergeben, Organisations-Manager ändern/ersetzen |
| **Organisations-Manager** (`role='manager'` + `is_admin`) | eigene Organisation | Nutzer freigeben/ablehnen/verwalten, Rollen innerhalb der Organisation vergeben, Logo/Branding verwalten |
| **Manager** (`role='manager'`) | eigene Organisation | Registrierungen freigeben/ablehnen |
| **Trainer** (`role='trainer'`) | eigene Organisation | Trainingsinhalte verwalten (Wissensdatenbank-Vorschläge, individuelle Kurse, Navigation) — keine Nutzerfreigabe |
| **Standard-Benutzer** (`role='rep'`) | eigene Organisation | normales Mitglied, kein Verwaltungszugriff |
| **Teamleiter** | — | kein eigenes Recht, sondern ein abgeleitetes Info-Badge (hat mindestens ein Team gegründet) |

Ein Plattform-Admin, der sich mit dem Firmencode einer anderen Organisation
anmeldet, sieht deren Branding sitzungsgebunden, ohne die eigene
Organisationszugehörigkeit zu ändern (`sessionStorage`-Override, siehe
`components/Layout.js`).

## Organisations-Branding (White-Label)

Jede Organisation kann eigenes Logo + vollständiges Farbschema hinterlegen
(`/admin/organization`, mit Live-Vorschau vor dem Speichern):

- **Marken-Verlauf:** Sekundär- → Primär- (Akzent-) → Tertiärfarbe. Beim
  Logo-Upload werden bis zu 3 dominante Farben automatisch erkannt und als
  Vorschlag übernommen (Canvas-Histogramm, keine externe Bibliothek) — danach
  frei änderbar.
- **Optional vollständiges Theme:** Hintergrund-, Karten-/Flächen-, Text-,
  gedämpfte Text- und Rahmenfarbe (`organizations.background_color` /
  `surface_color` / `text_color` / `muted_color` / `border_color`). Ohne
  diese Angaben bleibt das aktuelle HB-Sales-Academy-Design als neutraler
  Standard erhalten.
- **Automatischer Kontrast, geprüft an mehreren Stellen — nicht nur am
  Button:**
  - Button-, Karten- und allgemeine Textfarbe werden per echter WCAG-
    Kontrastberechnung (schlechtester Punkt im Farbverlauf, nicht nur
    Durchschnitt) automatisch hell oder dunkel gewählt.
  - Überschriften (`.brand-text-gradient`) fallen automatisch auf eine
    einfarbige, sichere Textfarbe zurück, falls der Marken-Verlauf gegen den
    Seitenhintergrund nicht lesbar wäre (z.B. bei sehr dunklem Branding).
  - Der aktive Sidebar-Menüpunkt nutzt eine gegen den tatsächlichen Sidebar-
    Hintergrund geprüfte Text-/Icon-Farbe statt der rohen Akzentfarbe.
  - Eine Organisation kann die Anwendung dadurch nie unabsichtlich unlesbar
    machen — getestet u.a. mit sehr hellem, sehr dunklem und kräftigem
    Branding. Manuell gesetzte Textfarben haben dabei immer Vorrang vor der
    automatischen Berechnung.
- **Zentral statt Seite für Seite:** Alles läuft über CSS-Variablen
  (`lib/orgBranding.js` setzt sie beim Login/Organisationswechsel), an die
  sowohl `styles/globals.css` (Karten, Buttons, Inputs, Sidebar, Scrollbar)
  als auch `tailwind.config.js` (Basisfarben `bg`/`surface`/`line`/
  `textMain`/`textMuted` sowie die Akzentfarben `amber`/`violet`) gekoppelt
  sind. Jede bestehende Tailwind-Klasse im Projekt (`bg-surface`,
  `border-line`, `text-amber` usw.) ist dadurch automatisch
  organisationsspezifisch — neue Module brauchen keine eigene Anpassung.
  Erfolgs- (`teal`) und Gefahrenfarben (`coral`) bleiben bewusst fest, damit
  ihre Bedeutung nicht kippt.
- **Kein Cache-Leck zwischen Organisationen:** Logout und Organisations-
  wechsel setzen alle Branding-Variablen vollständig zurück, bevor die neue
  Organisation geladen wird.

## Tech-Stack

- **Next.js 14** (Pages Router), **React 18**, **Tailwind CSS**
- **Supabase**: Postgres + Row-Level-Security, Auth (GoTrue), Storage,
  Realtime
- **Anthropic Claude**: Rollenspiel-Dialoge, Fallstudien-Bewertung,
  Leitfaden-Generierung (serverseitig über `pages/api/*`, Key nie im Browser)
- **pdf-lib**: serverseitige PDF-Zertifikate

## Setup

### 1. Supabase-Projekt anlegen
1. Auf [supabase.com](https://supabase.com) ein neues Projekt erstellen.
2. Im SQL-Editor den kompletten Inhalt von `supabase/schema_v2.sql`
   ausführen — legt alle Tabellen, Funktionen und RLS-Policies an.
3. Unter **Project Settings → API** `Project URL`, `anon public` Key und
   `service_role` Key kopieren.

### 2. Anthropic API-Key
Unter [console.anthropic.com](https://console.anthropic.com) erstellen.

### 3. Lokal einrichten
```bash
npm install
cp .env.example .env.local
# .env.local mit den Werten aus Schritt 1 und 2 befüllen
npm run dev
```
App läuft auf `http://localhost:3000`.

### 4. Erste Organisation + Plattform-Admin einrichten
Da anfangs noch keine Organisation existiert, einmalig per SQL:
```sql
insert into organizations (name, slug) values ('HB Intern', 'hb-intern');
```
Danach mit dem Firmencode `hb-intern` registrieren und das eigene Konto
einmalig zum Plattform-Admin machen:
```sql
update profiles set is_platform_admin = true, is_admin = true, role = 'manager', status = 'approved'
where id = '<eigene-user-uuid>';
```
Ab jetzt läuft alles Weitere (neue Kunden-Organisationen samt deren erstem
Manager-Account, Rollenvergabe, Branding) über `/admin/organization` und
`/admin` — kein weiteres manuelles SQL nötig.

## Deployment (Vercel)

1. Projekt zu GitHub pushen.
2. Auf [vercel.com](https://vercel.com) importieren.
3. Environment Variables aus `.env.example` eintragen (inkl.
   `SUPABASE_SERVICE_ROLE_KEY` und `ANTHROPIC_API_KEY`).
4. Deploy.

## Datenbank & Migrationen

`supabase/schema_v2.sql` ist die vollständige, autoritative Schema-Datei —
einmalig gegen ein neues/leeres Projekt ausführbar. Jede spätere Änderung
existiert **zusätzlich** als eigene, nummerierte Datei in `supabase/`
(`migration_<n>_<name>.sql`), die im SQL Editor der laufenden Datenbank
ausgeführt wird — und wird in `schema_v2.sql` nachgezogen, damit beide nie
auseinanderdriften. Details und Historie: `supabase/README.md`.

## Projektstruktur

```
components/            Layout (Sidebar/Branding/Badges), Icon, Avatar, Modals
lib/curriculum.js       Kurse, Module, Fragen, Fallstudien
lib/personas.js         Rollenspiel-Personas, Szenarien, Schwierigkeitsgrade
lib/orgBranding.js       Zentrales Organisations-Theme (CSS-Variablen, Kontrast)
lib/roles.js            Rollen-Beschreibungen (Administrator/Manager/Trainer/...)
lib/supabaseAdmin.js    Service-Role-Client (nur serverseitig, umgeht RLS)
lib/supabaseServer.js   requireUser()-Hilfsfunktion für API-Routen
pages/api/*.js          Serverseitige Routen (Claude-Aufrufe, PDF, Admin-Aktionen)
pages/api/admin/*.js    Organisations-Manager-Aktionen (Freigabe, Rollen, Löschen)
pages/api/platform/*.js Plattform-Admin-Aktionen (Organisationen, Mitglieder verteilen)
public/tools/*.html     Eigenständige HTML-Tools (Call Tracker, Einwand-Trainer), per iframe eingebunden
supabase/schema_v2.sql  Vollständiges Schema + RLS (autoritativ)
supabase/migration_*.sql Einzelne, nummerierte Änderungen seit schema_v2.sql
styles/globals.css      Basis-Styles, an Organisations-Theme gekoppelt
tailwind.config.js      Farbpalette, an Organisations-Theme gekoppelt
```

## Kosten

Bei normaler Team-Nutzung (Supabase Free/Pro Tier je nach Datenvolumen,
Vercel Hobby/Pro-Plan) fallen die üblichen Hosting-Kosten der jeweiligen
Plattform an. Zusätzlich laufende Kosten: Anthropic-API-Nutzung
(Rollenspiel, Fallstudien-Bewertung, Leitfaden-Generierung), abhängig vom
tatsächlichen Nutzungsvolumen aller Organisationen zusammen.
