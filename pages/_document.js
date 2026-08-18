import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="de">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0F1117" />
        <link rel="icon" href="/logo.svg" />
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
