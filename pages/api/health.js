import { pruefeSystem } from "../../lib/systemPruefung";

// Schlanker Zustandsbericht für eine externe Überwachung (z.B. UptimeRobot).
//
// Warum zusätzlich zur eigenen Überwachung: Ist die Academy KOMPLETT aus,
// läuft auch der eigene Prüflauf nicht mehr — dann meldet sich niemand. Nur
// ein Dienst von aussen merkt einen Totalausfall. Diese Adresse ist dafür da.
//
// Bewusst ohne Anmeldung, aber auch ohne Details: nach aussen nur "läuft" oder
// "gestört", damit niemand erfährt, welcher Teil gerade schwächelt.
export default async function handler(req, res) {
  const ergebnis = await pruefeSystem();
  return res.status(ergebnis.gesund ? 200 : 503).json({ status: ergebnis.gesund ? "ok" : "gestoert" });
}
