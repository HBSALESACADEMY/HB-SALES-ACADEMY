# HB Sales Academy

Vollständige Web-App (Next.js + Supabase) für Vertriebspsychologie-Training.

## Was neu ist gegenüber dem HTML-Prototyp

- **Rollenspiel funktioniert jetzt wirklich.** Der Prototyp rief `api.anthropic.com` direkt aus dem Browser auf — das kann grundsätzlich nicht funktionieren (kein API-Key im Browser, CORS blockiert die Anfrage). Jetzt läuft der Anthropic-Aufruf serverseitig über `/api/roleplay-turn`, der Key steckt nur in einer Server-Umgebungsvariable.
- **PDF-Zertifikate** statt .txt, generiert serverseitig mit `pdf-lib` (`/api/certificate`), Download als echtes PDF.
- **102 Multiple-Choice-Fragen** (statt 68) über 17 Module, Antwortreihenfolge wird bei jedem Versuch zufällig gemischt.
- **17 zusätzliche offene Fallstudien-Fragen** (eine pro Modul) — echte Freitext-Antworten, die von Claude anhand einer Bewertungs-Rubrik benotet werden. Hier lässt sich die richtige Antwort nicht einfach anklicken, man muss wirklich selbst formulieren.
- **5 Kursprüfungen** mit gemischten Fragen aus allen Modulen des Kurses + einer integrativen Abschluss-Fallstudie. Bestehensgrenze: 80% Multiple-Choice **und** 60% Fallstudie.
- **Echtes Backend (Supabase)**: Login/Registrierung, Fortschritt pro Nutzer in der Datenbank statt localStorage, Team-/Manager-Ansicht.

## Setup (ca. 20–30 Minuten)

### 1. Supabase-Projekt anlegen
1. Auf [supabase.com](https://supabase.com) kostenlos ein neues Projekt erstellen.
2. Im SQL-Editor den Inhalt von `supabase/schema_v2.sql` einfügen und ausführen. Das legt alle Tabellen, Trigger und Row-Level-Security-Policies an.
3. Unter **Project Settings → API** die `Project URL` und den `anon public` Key kopieren.

### 2. Anthropic API-Key
Einen Key unter [console.anthropic.com](https://console.anthropic.com) erstellen.

### 3. Lokal einrichten
```bash
npm install
cp .env.example .env.local
# .env.local mit den drei Werten aus Schritt 1 und 2 befüllen
npm run dev
```
App läuft auf `http://localhost:3000`. Registrieren, loslegen.

### 4. Deployment (Vercel, kostenlos)
1. Projekt zu GitHub pushen.
2. Auf [vercel.com](https://vercel.com) importieren.
3. Unter **Environment Variables** die vier Werte aus `.env.example` eintragen (inkl. `SUPABASE_SERVICE_ROLE_KEY`, nötig für die Nutzerverwaltung).
4. Deploy. Fertig — die App läuft dauerhaft online, Teammitglieder können sich von überall einloggen.

## Erste Manager-Rolle einrichten

Die Nutzerverwaltung (`/admin`, siehe unten) ist nur für Konten mit der Rolle `manager` sichtbar. Da ganz am Anfang noch niemand Manager ist, muss die allererste Person einmalig per SQL befördert werden — danach läuft alles Weitere über die UI.

```sql
update profiles set role = 'manager' where id = '<deine-uuid>';
```

Die eigene User-ID findest du unter **Authentication → Users** in Supabase.

## Nutzerverwaltung (`/admin`)

Für jedes Konto mit der Rolle `manager` erscheint in der Sidebar der Punkt "Nutzerverwaltung". Dort lässt sich, ohne SQL:

- eine Liste **aller** registrierten Nutzer einsehen (Name, E-Mail, Rolle, Team-Zugehörigkeit)
- jemandem die **Manager-Rolle geben oder entziehen**
- Nutzer dem **eigenen Team hinzufügen oder daraus entfernen** (steuert, wer in "Team (Manager)" auftaucht)
- ein Konto **vollständig löschen** (inkl. aller Quiz-/Prüfungs-/Rollenspiel-Daten, mit Sicherheitsabfrage)

Diese Funktionen laufen serverseitig über den `SUPABASE_SERVICE_ROLE_KEY` und sind auf Konten mit `role = 'manager'` beschränkt — ein normaler Nutzer kann `/admin` nicht aufrufen. Ein Manager kann sich selbst nicht versehentlich die Rolle entziehen oder das eigene Konto löschen (dafür bräuchte es einen zweiten Manager oder direkten SQL-Zugriff).

Der Fortschritt der zugeordneten Team-Mitglieder bleibt weiterhin unter "Team (Manager)" sichtbar — Row-Level-Security sorgt dort dafür, dass jeder Manager nur sein eigenes Team sieht.

## Struktur

```
lib/curriculum.js       5 Kurse, 17 Module, 102 MC-Fragen, 17 Fallstudien, 5 Kursprüfungs-Fallstudien
lib/personas.js         6 Rollenspiel-Personas, 5 Szenarien, 3 Schwierigkeitsgrade
pages/api/*.js          Serverseitige Routen (Anthropic-Aufrufe, PDF-Erstellung, Speichern in Supabase)
supabase/schema_v2.sql  Tabellen + Row-Level-Security (inkl. Manager-Sichtbarkeit)
```

Weitere Fragen/Module lassen sich einfach in `lib/curriculum.js` ergänzen — die Datenstruktur ist bewusst so gehalten, dass neue Module/Fragen ohne Codeänderung an anderer Stelle funktionieren.

## Kosten

Bei normaler Team-Nutzung (Supabase Free Tier, Vercel Hobby-Plan) fallen keine Hosting-Kosten an. Einzige laufende Kosten: Anthropic-API-Nutzung (Rollenspiel-Nachrichten + Fallstudien-Bewertung), abhängig vom Nutzungsvolumen — für ein internes Team im niedrigen einstelligen Cent-Bereich pro Trainingssession.
