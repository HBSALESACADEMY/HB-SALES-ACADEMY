import { useEffect, useState } from "react";
import { getCachedOrg, abonniereOrg } from "./Layout";

// Das Logo der eigenen Organisation, blass hinter einem Bereich.
//
// Nur dort einsetzen, wo eine grosse, ruhige Fläche entsteht — ein
// Monatsraster, ein Organigramm, die Begrüssung. Über Text oder einer
// dichten Liste wird daraus Unruhe statt Zugehörigkeit.
//
// Voraussetzung am umgebenden Kasten: "relative overflow-hidden", und der
// Inhalt darüber braucht selbst "relative", sonst liegt das Bild vorne.
//
// Das Logo kommt aus dem Zwischenspeicher des Layouts — also immer aus der
// AKTIVEN Organisation. Es trifft erst nach dem ersten Zeichnen ein,
// deshalb die Anmeldung: sonst bliebe der Hintergrund bis zum nächsten
// Seitenwechsel leer.
export default function LogoHintergrund({ breite = "w-2/3", hoehe = "max-h-[70%]", deckkraft = "opacity-[0.07]" }) {
  const [logo, setLogo] = useState(() => getCachedOrg()?.logo_url || null);

  useEffect(() => abonniereOrg((o) => setLogo(o?.logo_url || null)), []);

  if (!logo) return null;
  return (
    <img
      src={logo}
      alt=""
      aria-hidden="true"
      className={`pointer-events-none select-none absolute inset-0 m-auto object-contain ${breite} ${hoehe} ${deckkraft}`}
    />
  );
}
