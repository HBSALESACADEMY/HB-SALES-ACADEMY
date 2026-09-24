import { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { darfInDenIndex } from "../lib/oeffentlicheSeiten";
import { Work_Sans, Archivo, JetBrains_Mono } from "next/font/google";
import "../styles/globals.css";
import { meldeStoerung } from "../lib/fehlerMelden";

// Schriften selbst hosten statt live von fonts.googleapis.com zu laden —
// verhindert, dass die IP-Adresse jedes Besuchers ohne Einwilligung an
// Google übertragen wird (in Deutschland ein bekannter DSGVO-Streitpunkt).
const workSans = Work_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-work-sans", display: "swap" });
// Archivo für Überschriften und Kennzahlen, seit 24.09.2026 anstelle von
// Fraunces. Fraunces ist eine Serif mit absichtlich geschwungenen Formen —
// auf einer Seite, auf der neben der Überschrift eine Anwahlzahl steht,
// wirkte das wie eine Einladungskarte. Archivo kommt aus der Zeitungswelt:
// enge, kräftige Grotesk, deren Ziffern fest stehen.
const archivo = Archivo({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-archivo", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-jetbrains-mono", display: "swap" });

export default function App({ Component, pageProps }) {
  const router = useRouter();
  // Alles hinter der Anmeldung gehört in keine Suchmaschine: Dort stehen
  // Namen von Kund:innen, Auswertungen und Gesprächsnotizen
  // (lib/oeffentlicheSeiten.js).
  const oeffentlich = darfInDenIndex(router.pathname);

  // Abstürze im Browser an den Betreiber melden. Genau diese Fehler waren
  // bisher unsichtbar: eine weisse Seite oder ein toter Knopf steht auf dem
  // Bildschirm EINER Person, und ob sie sich meldet, ist Zufall. Die
  // tägliche Systemprüfung sieht nur die Technik dahinter.
  useEffect(() => {
    const beiFehler = (e) => meldeStoerung(window.location.pathname, e?.error?.message || e?.message);
    const beiVersprechen = (e) => meldeStoerung(window.location.pathname, e?.reason?.message || e?.reason);
    window.addEventListener("error", beiFehler);
    window.addEventListener("unhandledrejection", beiVersprechen);
    return () => {
      window.removeEventListener("error", beiFehler);
      window.removeEventListener("unhandledrejection", beiVersprechen);
    };
  }, []);

  return (
    <div className={`${workSans.variable} ${archivo.variable} ${jetbrainsMono.variable} font-sans`}>
      {/* Der Name im Browser-Reiter. Stand bisher nirgends — der Reiter
          zeigte nur die Adresse. */}
      <Head>
        <title>HB Sales Academy</title>
        {!oeffentlich && <meta name="robots" content="noindex, nofollow" />}
      </Head>
      <Component {...pageProps} />
    </div>
  );
}
