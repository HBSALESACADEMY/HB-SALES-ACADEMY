import Head from "next/head";
import Link from "next/link";

// Das Impressum.
//
// Pflicht, sobald die Academy öffentlich erreichbar ist und geschäftlich
// genutzt wird (§ 5 DDG, früher TMG). Ohne Impressum ist eine gewerbliche
// Seite in Deutschland angreifbar — und zwar von jedem Wettbewerber.
//
// Die Angaben kann nur der Betreiber selbst einsetzen: Sie müssen stimmen,
// und erfundene Angaben wären schlimmer als fehlende. Alles mit
// „[Platzhalter]" gehört ausgefüllt, bevor die Seite online geht.
export default function Impressum() {
  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "var(--org-bg, #14151C)", color: "var(--org-text, #EDEDF4)" }}>
      <Head>
        <title>Impressum · HB Sales Academy</title>
        <meta name="description" content="Anbieterkennzeichnung der HB Sales Academy." />
      </Head>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/login" className="text-textMuted text-xs underline">← Zurück zum Login</Link>
        </div>

        <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Impressum</h1>
        <div className="brand-stripe w-16 mb-6" />

        <div className="card mb-6 border border-amber/40 text-sm text-textMuted leading-relaxed">
          <strong className="text-textMain">Hinweis:</strong> Die mit „[Platzhalter]" markierten Angaben müssen vor
          der Veröffentlichung ausgefüllt werden. Sie müssen stimmen — ein Impressum mit falschen Angaben ist
          schlechter als keines.
        </div>

        <div className="flex flex-col gap-6 text-sm text-textMuted leading-relaxed">
          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">Angaben gemäß § 5 DDG</h2>
            <p>[Platzhalter: Firmenname, Rechtsform]</p>
            <p>[Platzhalter: Straße und Hausnummer]</p>
            <p>[Platzhalter: Postleitzahl und Ort]</p>
            <p>[Platzhalter: Land]</p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">Vertreten durch</h2>
            <p>[Platzhalter: Name der vertretungsberechtigten Person]</p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">Kontakt</h2>
            <p>Telefon: [Platzhalter]</p>
            <p>E-Mail: [Platzhalter]</p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">Registereintrag</h2>
            <p>Registergericht: [Platzhalter]</p>
            <p>Registernummer: [Platzhalter]</p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">Umsatzsteuer-Identifikationsnummer</h2>
            <p>[Platzhalter: USt-IdNr. gemäß § 27 a UStG]</p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">Verantwortlich für den Inhalt</h2>
            <p>[Platzhalter: Name und Anschrift]</p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">Streitschlichtung</h2>
            <p>
              Die Academy richtet sich ausschließlich an Unternehmen. Eine Teilnahme an einem
              Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle ist damit nicht vorgesehen.
            </p>
          </section>

          <section>
            <h2 className="text-textMain font-display font-semibold text-base mb-2">Weitere Angaben</h2>
            <p>
              <Link href="/datenschutz" className="underline">Datenschutzerklärung</Link>
              {" · "}
              <Link href="/agb" className="underline">Allgemeine Geschäftsbedingungen</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
