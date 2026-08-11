import Link from "next/link";

export default function Datenschutz() {
  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "var(--org-bg, #14151C)", color: "var(--org-text, #EDEDF4)" }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/login" className="text-textMuted text-xs underline">← Zurück zum Login</Link>
        </div>

        <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Datenschutzerklärung</h1>
        <div className="brand-stripe w-16 mb-6" />

        <div className="card mb-6 border border-amber/40 text-sm text-textMuted leading-relaxed">
          <strong className="text-textMain">Hinweis:</strong> Dies ist ein Entwurf zur eigenen Verwendung und ersetzt keine
          rechtliche Beratung. Vor dem produktiven Einsatz sollte dieser Text von einer Rechtsanwältin/einem
          Rechtsanwalt für Datenschutzrecht geprüft werden — insbesondere die Auftragsverarbeitungsverträge mit den
          unten genannten Dienstleistern müssen noch tatsächlich abgeschlossen werden. Mit „[Platzhalter]" markierte
          Stellen müssen vor Veröffentlichung ausgefüllt werden.
        </div>

        <div className="flex flex-col gap-6 text-sm text-textMuted leading-relaxed">
          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">1. Verantwortlicher</h2>
            <p>
              Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:<br />
              [Platzhalter: Firmenname, Rechtsform, Anschrift, E-Mail-Adresse, ggf. Telefonnummer]
            </p>
            <p className="mt-2">
              Falls ein/e Datenschutzbeauftragte/r bestellt ist: [Platzhalter: Name und Kontaktdaten der/des
              Datenschutzbeauftragten, sonst diesen Absatz entfernen].
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">2. Welche Daten wir verarbeiten</h2>
            <p>Im Rahmen der Nutzung der Plattform „HB Sales Academy" verarbeiten wir insbesondere folgende Kategorien personenbezogener Daten:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong className="text-textMain">Kontodaten:</strong> Name, E-Mail-Adresse, Passwort (verschlüsselt), Profilbild, optionale Angaben (Bio, Unternehmen, Position, Kontaktdaten);</li>
              <li><strong className="text-textMain">Nutzungs-/Lerndaten:</strong> Kursfortschritt, Quiz-/Prüfungsergebnisse, Rollenspiel-Transkripte und -Bewertungen, XP/Level, Flashcard-Fortschritt;</li>
              <li><strong className="text-textMain">Kundendaten Dritter (Leads):</strong> von Nutzer:innen selbst im Call Tracker erfasste Daten von deren Kund:innen/Interessent:innen (Name, Telefon, E-Mail, Gesprächsnotizen, optionale Anruf-Aufnahmen);</li>
              <li><strong className="text-textMain">Anruf-Aufnahmen:</strong> freiwillig hochgeladene Audiodateien eigener Verkaufsgespräche zu Trainingszwecken;</li>
              <li><strong className="text-textMain">Kommunikationsdaten:</strong> Nachrichten, Community-Beiträge/-Kommentare, sofern innerhalb der Plattform verfasst;</li>
              <li><strong className="text-textMain">Protokolldaten:</strong> Zeitpunkt von Logins, aufgerufene Seiten, technische Metadaten (z.B. zur Erkennung von Missbrauch).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">3. Zwecke und Rechtsgrundlagen der Verarbeitung</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Bereitstellung und Betrieb der Plattform sowie Erfüllung des Nutzungsvertrags — Art. 6 Abs. 1 lit. b DSGVO;</li>
              <li>Verwaltung von Nutzerkonten und Organisationen durch berechtigte Manager:innen/Admins innerhalb derselben Organisation — Art. 6 Abs. 1 lit. b, f DSGVO;</li>
              <li>KI-gestützte Auswertung von Rollenspielen, Prüfungen und Anruf-Aufnahmen als Trainingsfunktion — Art. 6 Abs. 1 lit. b DSGVO (vertraglich vereinbarte Kernfunktion der Plattform);</li>
              <li>Sicherheit, Missbrauchserkennung und Fehlerbehebung (Protokolldaten) — Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse);</li>
              <li>Erfüllung gesetzlicher Pflichten, soweit einschlägig — Art. 6 Abs. 1 lit. c DSGVO.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">4. KI-gestützte Auswertungen</h2>
            <p>
              Rollenspiele, Prüfungs-Freitextantworten und Anruf-Aufnahmen werden zur automatischen Bewertung an ein
              KI-Sprachmodell (Google Gemini, Google Ireland Limited bzw. Google LLC) übermittelt. Dabei kann es zu
              einer Übermittlung in ein Land außerhalb der EU/des EWR (insbesondere USA) kommen; wir stützen dies auf
              die von Google bereitgestellten EU-Standardvertragsklauseln (Art. 46 DSGVO) [Platzhalter: bitte prüfen
              und ggf. konkretisieren, welche Garantie tatsächlich vorliegt].
            </p>
            <p className="mt-2">
              Die daraus resultierenden Scores (z.B. Prüfungsergebnis, Bestehen/Nichtbestehen) wirken sich auf den
              sichtbaren Lernfortschritt und die Zertifikatsvergabe aus. Es handelt sich dabei nicht um eine
              Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung im Sinne von Art. 22 DSGVO (kein
              Vertragsschluss, keine automatisierte Personalentscheidung) — die KI-Bewertung ist eine Trainingshilfe;
              die inhaltliche Auswertung bleibt bei den Organisationen/Trainer:innen [Platzhalter: bitte anhand der
              tatsächlichen internen Nutzung prüfen, ob Prüfungsergebnisse irgendwo automatisiert personalrelevante
              Folgen auslösen — falls ja, ist Art. 22 DSGVO gesondert zu adressieren].
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">5. Empfänger und Auftragsverarbeiter</h2>
            <p>Wir setzen folgende Dienstleister ein, mit denen jeweils ein Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO besteht bzw. abzuschließen ist:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong className="text-textMain">Supabase</strong> (Datenbank, Authentifizierung, Datei-Speicher) — [Platzhalter: Supabase-Projektregion prüfen/eintragen, AVV mit Supabase Inc. abschließen];</li>
              <li><strong className="text-textMain">Vercel</strong> (Hosting der Anwendung) — [Platzhalter: AVV mit Vercel Inc. abschließen];</li>
              <li><strong className="text-textMain">Google (Gemini API)</strong> (KI-gestützte Auswertungen, siehe Ziffer 4) — [Platzhalter: AVV/Datenverarbeitungsbedingungen mit Google abschließen].</li>
            </ul>
            <p className="mt-2">
              Innerhalb der eigenen Organisation sind bestimmte Daten (z.B. Name, Lernfortschritt, freigegebene
              Kontaktangaben) für berechtigte Kolleg:innen, Team-Leads, Manager:innen und Admins sichtbar — dies ist
              für den organisationsinternen Trainingsbetrieb erforderlich und richtet sich nach der jeweiligen Rolle.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">6. Speicherdauer</h2>
            <p>
              Kontodaten, Lerndaten, Kundendaten (Leads) und Anruf-Aufnahmen speichern wir, solange das Nutzerkonto
              bzw. die Organisation besteht, bzw. bis eine Löschung durch die Nutzer:in selbst oder eine berechtigte
              Administratorin/einen berechtigten Administrator erfolgt. Wird ein Nutzerkonto gelöscht, werden auch die
              zugehörigen Aufnahmen im Datei-Speicher entfernt.
            </p>
            <p className="mt-2">
              Reine Protokolldaten (Login-Verlauf, Seitenaufrufe, technische Anfrage-Protokolle) werden automatisiert
              nach 180 Tagen (KI-Anfrage-Protokolle nach 90 Tagen) gelöscht, soweit keine gesetzlichen
              Aufbewahrungspflichten entgegenstehen.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">7. Cookies und lokale Speicherung</h2>
            <p>
              Diese Plattform setzt keine Cookies zu Analyse- oder Marketingzwecken ein und bindet keine
              Drittanbieter-Tracking-Dienste ein. Zur Anmeldung wird ein Sitzungs-Token technisch notwendig im lokalen
              Speicher (Local Storage) deines Browsers abgelegt — dieser verlässt dein Gerät nicht und dient
              ausschließlich dazu, dich eingeloggt zu halten. Er wird gelöscht, wenn du dich abmeldest oder die
              Browser-Daten leerst.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">8. Deine Rechte</h2>
            <p>Dir stehen nach Maßgabe der gesetzlichen Bestimmungen folgende Rechte zu:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Auskunft über die zu dir gespeicherten Daten (Art. 15 DSGVO) — du kannst deine Daten jederzeit selbst unter „Einstellungen → Meine Daten" als Datei herunterladen;</li>
              <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO) — direkt im eigenen Profil möglich;</li>
              <li>Löschung (Art. 17 DSGVO) — auf Anfrage bei [Platzhalter: Kontakt] oder durch deine Organisationsverwaltung;</li>
              <li>Einschränkung der Verarbeitung (Art. 18 DSGVO);</li>
              <li>Datenübertragbarkeit (Art. 20 DSGVO) — ebenfalls über den Datenexport in den Einstellungen;</li>
              <li>Widerspruch gegen Verarbeitungen auf Grundlage berechtigten Interesses (Art. 21 DSGVO);</li>
              <li>Beschwerde bei einer Datenschutz-Aufsichtsbehörde (Art. 77 DSGVO), z.B. der für [Platzhalter: Sitz des Anbieters] zuständigen Landesdatenschutzbehörde.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">9. Datensicherheit</h2>
            <p>
              Die Übertragung erfolgt verschlüsselt (TLS). Der Zugriff auf Daten anderer Organisationen ist technisch
              durch Zugriffsregeln auf Datenbankebene unterbunden (Mandantentrennung). Passwörter werden ausschließlich
              in verschlüsselter Form gespeichert.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">10. Änderungen dieser Erklärung</h2>
            <p>
              Wir passen diese Datenschutzerklärung an, wenn sich die Datenverarbeitung oder die Rechtslage ändert.
              Es gilt jeweils die zum Zeitpunkt deines Besuchs aktuelle Fassung.
            </p>
          </section>

          <p className="text-[11px] text-[#5B5E70] mt-2">Stand: [Platzhalter: Datum der Veröffentlichung]</p>
        </div>
      </div>
    </div>
  );
}
