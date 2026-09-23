import { Html, Head, Main, NextScript } from "next/document";

// Die Vorschau, wenn jemand einen Link zur Academy teilt (WhatsApp,
// iMessage, LinkedIn, Slack): Logo, Name und ein Satz dazu.
//
// WhatsApp und die anderen lesen nur das ausgelieferte HTML und führen kein
// JavaScript aus — deshalb hier im Dokument und nicht in einer Seite. Und
// die Bildadresse muss vollständig sein (mit https://), einen Pfad allein
// laden sie nicht. Die Adresse der Academy kommt aus NEXT_PUBLIC_APP_URL,
// ersatzweise aus der Produktionsadresse, die Vercel beim Bauen mitgibt.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ""))
  .replace(/\/+$/, "");
const VORSCHAU_TITEL = "HB Sales Academy";
const VORSCHAU_TEXT = "Die Trainings- und Vertriebsplattform für dein Team: telefonieren, Termine führen, nachfassen, besser werden.";
// Der Dateiname trägt eine Nummer: WhatsApp merkt sich Vorschaubilder
// lange — bei manchen Diensten wochenlang, und ein Anhängsel wie "?v=2"
// zählt dabei nicht als neues Bild. Ein neues Bild braucht deshalb einen
// neuen Dateinamen.
//
// Als JPEG statt PNG: Derselbe Inhalt wiegt 88 KB statt 450 KB. Die
// weichen Farbverläufe im Hintergrund sind für PNG das Schlechteste, was
// man ihm geben kann — und eine Vorschau, die zu schwer ist, zeigen
// manche Dienste gar nicht.
const VORSCHAU_BILD = `${APP_URL}/og-bild-2.jpg`;

export default function Document() {
  return (
    <Html lang="de">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0F1117" />
        {/* Das Wappen als Tab-Symbol: Ein Wappen bleibt bei 16 Pixeln
            erkennbar, ein Schriftzug wird dort zu einem grauen Fleck.
            Bewusst die kleine Fassung — die grosse wären 194 KB für ein
            Symbol von 16 Pixeln. */}
        <link rel="icon" href="/logo-wappen-64.png" type="image/png" />
        <meta name="description" content={VORSCHAU_TEXT} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={VORSCHAU_TITEL} />
        <meta property="og:title" content={VORSCHAU_TITEL} />
        <meta property="og:description" content={VORSCHAU_TEXT} />
        {APP_URL && <meta property="og:url" content={APP_URL} />}
        {APP_URL && <meta property="og:image" content={VORSCHAU_BILD} />}
        {APP_URL && <meta property="og:image:secure_url" content={VORSCHAU_BILD} />}
        <meta property="og:image:type" content="image/jpeg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Das Wappen der HB Sales Academy mit dem Untertitel: die Trainings- und Vertriebsplattform für B2B-Vertriebsteams" />
        <meta property="og:locale" content="de_DE" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={VORSCHAU_TITEL} />
        <meta name="twitter:description" content={VORSCHAU_TEXT} />
        {APP_URL && <meta name="twitter:image" content={VORSCHAU_BILD} />}
        {/* Theme (Hell/Dunkel/System) VOR dem ersten Rendern setzen, sonst
            würde die Seite kurz im falschen Theme aufblitzen, bevor React
            hydratisiert (siehe lib/theme.js).
            Als eigene Datei statt eingebettet: die Sicherheitsregeln erlauben
            nur Skripte von der eigenen Adresse (script-src 'self', siehe
            next.config.js) — eingebettet wurde es in der ausgelieferten
            Academy blockiert. Ohne async/defer, damit es vor dem Zeichnen
            läuft. */}
        <script src="/theme-init.js" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
