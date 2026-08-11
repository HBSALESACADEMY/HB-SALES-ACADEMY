import Link from "next/link";

export default function AGB() {
  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "var(--org-bg, #14151C)", color: "var(--org-text, #EDEDF4)" }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/login" className="text-textMuted text-xs underline">← Zurück zum Login</Link>
        </div>

        <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Allgemeine Geschäftsbedingungen</h1>
        <div className="brand-stripe w-16 mb-6" />

        <div className="card mb-6 border border-amber/40 text-sm text-textMuted leading-relaxed">
          <strong className="text-textMain">Hinweis:</strong> Dies ist ein Entwurf zur eigenen Verwendung und ersetzt keine
          rechtliche Beratung. Vor dem produktiven Einsatz sollte dieser Text von einer Rechtsanwältin/einem
          Rechtsanwalt für IT-/SaaS-Recht geprüft und an die konkreten Gegebenheiten (Preise, Kündigungsfristen,
          Rechtsform, Anschrift) angepasst werden. Mit „[Platzhalter]" markierte Stellen müssen vor Veröffentlichung
          ausgefüllt werden.

        </div>

        <div className="flex flex-col gap-6 text-sm text-textMuted leading-relaxed">
          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 1 Geltungsbereich, Vertragspartner</h2>
            <p>
              (1) Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der Vertriebstrainings-Plattform
              „HB Sales Academy" (nachfolgend „Plattform"), betrieben von [Platzhalter: Firmenname, Rechtsform, Anschrift]
              (nachfolgend „Anbieter"), durch Unternehmen und deren Mitarbeitende (nachfolgend „Nutzer").
            </p>
            <p className="mt-2">
              (2) Die Plattform richtet sich ausschließlich an Unternehmer im Sinne von § 14 BGB, nicht an Verbraucher.
              Mit der Registrierung bestätigt der Nutzer, im Rahmen seiner gewerblichen oder selbständigen beruflichen
              Tätigkeit zu handeln.
            </p>
            <p className="mt-2">
              (3) Abweichende, entgegenstehende oder ergänzende Bedingungen des Kunden werden nicht Vertragsbestandteil,
              es sei denn, der Anbieter stimmt ihrer Geltung ausdrücklich schriftlich zu.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 2 Leistungsbeschreibung</h2>
            <p>
              (1) Der Anbieter stellt über die Plattform Funktionen zum Vertriebstraining bereit, insbesondere Lerninhalte,
              interaktive Rollenspiele und KI-gestützte Auswertungen, Community-Funktionen sowie Auswertungs- und
              Verwaltungswerkzeuge für Organisationen. Der konkrete Funktionsumfang ergibt sich aus der jeweils aktuellen
              Produktbeschreibung.
            </p>
            <p className="mt-2">
              (2) Der Anbieter ist berechtigt, den Funktionsumfang der Plattform im Rahmen einer kontinuierlichen
              Weiterentwicklung anzupassen, zu erweitern oder einzelne Funktionen einzustellen, sofern dies dem Nutzer
              unter Berücksichtigung seiner berechtigten Interessen zumutbar ist.
            </p>
            <p className="mt-2">
              (3) Einzelne Funktionen der Plattform nutzen Sprachmodelle Dritter (KI-Dienste) zur automatischen
              Auswertung oder Erstellung von Inhalten (z.B. Rollenspiel-Bewertung, Leitfaden-Erstellung). Die Ergebnisse
              dieser KI-gestützten Funktionen stellen Trainingshilfen dar und werden ohne Gewähr für Richtigkeit oder
              Vollständigkeit bereitgestellt.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 3 Registrierung, Nutzerkonto</h2>
            <p>
              (1) Die Nutzung der Plattform setzt eine Registrierung mit einem gültigen, der jeweiligen Organisation
              zugeordneten Firmencode voraus. Die Freischaltung einzelner Nutzerkonten kann durch eine
              organisationsinterne Freigabe (z.B. durch eine Managerin/einen Manager) erfolgen.
            </p>
            <p className="mt-2">
              (2) Der Nutzer ist verpflichtet, bei der Registrierung wahrheitsgemäße Angaben zu machen und seine
              Zugangsdaten geheim zu halten. Für Aktivitäten, die unter Verwendung der Zugangsdaten des Nutzers
              vorgenommen werden, haftet der Nutzer, sofern er die missbräuchliche Nutzung zu vertreten hat.
            </p>
            <p className="mt-2">
              (3) Der Verdacht einer missbräuchlichen Nutzung des eigenen Kontos ist dem Anbieter unverzüglich
              mitzuteilen.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 4 Pflichten der Nutzer</h2>
            <p>Der Nutzer verpflichtet sich, die Plattform nicht missbräuchlich zu nutzen. Insbesondere ist untersagt:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>das Einstellen rechtswidriger, beleidigender, diskriminierender oder die Rechte Dritter verletzender Inhalte;</li>
              <li>der Versuch, Sicherheitsmechanismen der Plattform zu umgehen oder unautorisiert auf fremde Organisationsdaten zuzugreifen;</li>
              <li>das Hochladen von Schadsoftware oder Dateien, die geeignet sind, den Betrieb der Plattform zu stören;</li>
              <li>die automatisierte Massenauswertung oder das Auslesen der Plattform (Scraping) ohne vorherige Zustimmung des Anbieters.</li>
            </ul>
            <p className="mt-2">
              Bei Verstößen ist der Anbieter berechtigt, betroffene Inhalte zu entfernen und/oder das jeweilige
              Nutzerkonto vorübergehend zu sperren oder zu kündigen.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 5 Nutzungsrechte, Inhalte der Nutzer</h2>
            <p>
              (1) Der Anbieter räumt dem Kunden für die Vertragslaufzeit ein einfaches, nicht übertragbares Recht ein,
              die Plattform im vertraglich vereinbarten Umfang zu nutzen.
            </p>
            <p className="mt-2">
              (2) Für Inhalte, die Nutzer selbst einstellen (z.B. Community-Beiträge, Chat-Nachrichten, hochgeladene
              Dateien), räumt der Nutzer dem Anbieter das für den Betrieb der Plattform erforderliche, nicht
              ausschließliche Nutzungsrecht ein (Speicherung, Anzeige gegenüber berechtigten anderen Nutzern gemäß
              der jeweils gewählten Sichtbarkeit). Der Nutzer versichert, über die erforderlichen Rechte an von ihm
              eingestellten Inhalten zu verfügen.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 6 Verfügbarkeit</h2>
            <p>
              Der Anbieter bemüht sich um eine hohe Verfügbarkeit der Plattform, kann jedoch eine ununterbrochene
              Erreichbarkeit nicht garantieren. Ausfallzeiten aufgrund von Wartungsarbeiten, höherer Gewalt oder
              Störungen bei vom Anbieter eingesetzten Dritten (z.B. Hosting-/Infrastrukturanbietern) bleiben hiervon
              unberührt und begründen keinen Anspruch auf Schadensersatz, sofern nicht vorsätzlich oder grob
              fahrlässig verursacht.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 7 Vergütung und Zahlungsbedingungen</h2>
            <p>
              [Platzhalter: Preise, Abrechnungszeitraum (z.B. monatlich/jährlich je Organisation oder je Nutzer),
              Zahlungsart und Fälligkeit einfügen. Falls die Nutzung aktuell unentgeltlich ist, sollte dies hier klar
              festgehalten werden, inklusive eines Hinweises, ob und wie sich das künftig ändern kann.]
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 8 Laufzeit, Kündigung</h2>
            <p>
              (1) Der Vertrag über die Nutzung der Plattform wird auf unbestimmte Zeit geschlossen, sofern nicht
              abweichend vereinbart.
            </p>
            <p className="mt-2">
              (2) Beide Parteien können den Vertrag mit einer Frist von [Platzhalter: z.B. vier Wochen] zum Ende
              [Platzhalter: eines Kalendermonats/Abrechnungszeitraums] ordentlich kündigen.
            </p>
            <p className="mt-2">
              (3) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Ein wichtiger Grund
              liegt insbesondere bei einem schwerwiegenden oder wiederholten Verstoß gegen § 4 dieser AGB vor.
            </p>
            <p className="mt-2">
              (4) Mit Beendigung des Vertrags kann der Anbieter die dem jeweiligen Nutzerkonto zugeordneten Daten nach
              Ablauf einer angemessenen Frist löschen, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
              Näheres zu Speicherfristen einzelner Datenkategorien regelt die{" "}
              <Link href="/datenschutz" className="underline text-textMain">Datenschutzerklärung</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 9 Haftung</h2>
            <p>
              (1) Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder der
              Gesundheit sowie bei Vorsatz und grober Fahrlässigkeit.
            </p>
            <p className="mt-2">
              (2) Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht (Kardinalpflicht), deren
              Erfüllung die ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht und auf deren
              Einhaltung der Nutzer regelmäßig vertrauen darf, ist die Haftung des Anbieters auf den bei
              Vertragsschluss vorhersehbaren, vertragstypischen Schaden begrenzt.
            </p>
            <p className="mt-2">
              (3) Im Übrigen ist die Haftung des Anbieters für leicht fahrlässige Pflichtverletzungen ausgeschlossen.
              Die vorstehenden Haftungsbeschränkungen gelten nicht bei Ansprüchen nach dem Produkthaftungsgesetz sowie
              bei einer etwaigen Übernahme einer Garantie.
            </p>
            <p className="mt-2">
              (4) Für die von KI-gestützten Funktionen erzeugten Inhalte (z.B. Bewertungen, Gesprächsleitfäden)
              übernimmt der Anbieter keine Gewähr für Richtigkeit, Vollständigkeit oder Eignung für einen bestimmten
              Zweck; sie ersetzen keine eigenständige fachliche Beurteilung durch den Nutzer.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 10 Datenschutz</h2>
            <p>
              Informationen zur Verarbeitung personenbezogener Daten enthält die gesonderte{" "}
              <Link href="/datenschutz" className="underline text-textMain">Datenschutzerklärung</Link>. Bei der
              Verarbeitung personenbezogener Daten von Mitarbeitenden des Kunden im Auftrag des Kunden schließen die
              Parteien auf Anforderung einen Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 11 Änderung dieser AGB</h2>
            <p>
              Der Anbieter behält sich vor, diese AGB mit Wirkung für die Zukunft zu ändern, soweit dies aus
              rechtlichen, technischen oder wirtschaftlichen Gründen erforderlich ist. Über wesentliche Änderungen
              wird der Nutzer rechtzeitig vorab informiert. Widerspricht der Nutzer nicht innerhalb von [Platzhalter:
              z.B. vier Wochen], gelten die geänderten AGB als angenommen; hierauf wird in der Änderungsmitteilung
              gesondert hingewiesen.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">§ 12 Schlussbestimmungen</h2>
            <p>(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.</p>
            <p className="mt-2">
              (2) Ausschließlicher Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesem
              Vertragsverhältnis ist, sofern der Nutzer Kaufmann ist, [Platzhalter: Sitz des Anbieters].
            </p>
            <p className="mt-2">
              (3) Sollten einzelne Bestimmungen dieser AGB unwirksam sein oder werden, bleibt die Wirksamkeit der
              übrigen Bestimmungen hiervon unberührt.
            </p>
          </section>

          <p className="text-[11px] text-[#5B5E70] mt-2">Stand: [Platzhalter: Datum der Veröffentlichung]</p>
        </div>
      </div>
    </div>
  );
}
