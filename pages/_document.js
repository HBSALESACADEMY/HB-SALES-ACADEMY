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
            hydratisiert (siehe lib/theme.js). Synchron und ohne Abhängigkeiten,
            damit es garantiert vor dem body-Paint läuft. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var pref = localStorage.getItem("hb_theme_pref");
              var resolved = (pref === "light" || pref === "dark") ? pref
                : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
              document.documentElement.setAttribute("data-theme", resolved);
            } catch(e) { document.documentElement.setAttribute("data-theme", "dark"); }})();`,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
