import { useEffect } from "react";
import { Work_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import "../styles/globals.css";
import { meldeFehler } from "../lib/fehlerMelden";

// Schriften selbst hosten statt live von fonts.googleapis.com zu laden —
// verhindert, dass die IP-Adresse jedes Besuchers ohne Einwilligung an
// Google übertragen wird (in Deutschland ein bekannter DSGVO-Streitpunkt).
const workSans = Work_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-work-sans", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"], variable: "--font-fraunces", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-jetbrains-mono", display: "swap" });

export default function App({ Component, pageProps }) {
  // Abstürze im Browser an den Betreiber melden. Genau diese Fehler waren
  // bisher unsichtbar: eine weisse Seite oder ein toter Knopf steht auf dem
  // Bildschirm EINER Person, und ob sie sich meldet, ist Zufall. Die
  // tägliche Systemprüfung sieht nur die Technik dahinter.
  useEffect(() => {
    const beiFehler = (e) => meldeFehler(window.location.pathname, e?.error?.message || e?.message);
    const beiVersprechen = (e) => meldeFehler(window.location.pathname, e?.reason?.message || e?.reason);
    window.addEventListener("error", beiFehler);
    window.addEventListener("unhandledrejection", beiVersprechen);
    return () => {
      window.removeEventListener("error", beiFehler);
      window.removeEventListener("unhandledrejection", beiVersprechen);
    };
  }, []);

  return (
    <div className={`${workSans.variable} ${fraunces.variable} ${jetbrainsMono.variable} font-sans`}>
      <Component {...pageProps} />
    </div>
  );
}
