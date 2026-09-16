import { WER, signalVon, datumKurz } from "../lib/onboarding";

// Balken und Schrittzeile des Onboardings — gemeinsam für die Seite der
// Leitung (pages/onboarding.js) und den Startbildschirm (pages/index.js),
// damit beide denselben Stand gleich zeigen.

export function OnboardingBalken({ prozent, warnung = false }) {
  return (
    <div className="flex-1 h-1.5 rounded-full bg-surfaceRaised overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${prozent}%`, background: warnung ? "#E5716A" : "#5FCF6B" }} />
    </div>
  );
}

/** Die Zeile unter einem Schritt: wie er abgehakt wird, bis wann, von wem. */
export function schrittInfo(x) {
  const teile = [];
  const signal = signalVon(x.schritt.automatisch);
  if (signal) teile.push(`Automatisch: ${signal.label}${x.ziel ? ` ${Math.min(x.ist, x.ziel)} von ${x.ziel}` : ""}`);
  else teile.push(`Hakt ab: ${WER[x.schritt.wer] || "Vertriebler"}`);
  if (x.faelligAm && !x.erledigt) teile.push(x.ueberfaellig ? `überfällig seit ${datumKurz(x.faelligAm)}` : `bis ${datumKurz(x.faelligAm)}`);
  if (x.haken) teile.push(`erledigt am ${datumKurz(x.haken.erledigt_am)}${x.haken.von_name ? ` von ${x.haken.von_name}` : ""}`);
  return teile.join(" · ");
}
