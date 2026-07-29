import { useState } from "react";

const STEPS = [
  {
    emoji: "🏠",
    title: "Dein Dashboard",
    body: "Hier siehst du auf einen Blick alles Wichtige: Fortschritt, Kacheln zu allen Tools, und (falls verfügbar) Erinnerungen wie deine Tages-Serie.",
  },
  {
    emoji: "📚",
    title: "Kurse & Rollenspiel",
    body: "Unter \"Lernen\" findest du die Kurse, die Wissensdatenbank, den Rollenspiel-Trainer und mehr — arbeite dich Schritt für Schritt durch, jeder Kurs endet mit einer Prüfung und einem Zertifikat.",
  },
  {
    emoji: "👥",
    title: "Team & Community",
    body: "In \"Team\" findest du deine Kolleg:innen, Team-Ziele und Mentoring. In der Community teilt ihr Erfolge und Tipps — schau öfter vorbei!",
  },
  {
    emoji: "💬",
    title: "Nachrichten & Vertriebs-Buddy",
    body: "Schreib direkt mit Kolleg:innen oder in Gruppen. Und falls du mal eine schnelle Verkaufsfrage hast: der Vertriebs-Buddy-Knopf unten rechts hilft dir sofort weiter.",
  },
  {
    emoji: "⚙️",
    title: "Einstellungen",
    body: "Passe an, wer deine Kontaktdaten sehen darf, sortiere deine Sidebar und dein Dashboard per Drag & Drop — ganz wie du magst.",
  },
];

export default function TutorialModal({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[220] p-4">
      <div className="card max-w-sm w-full overflow-hidden !p-0">
        <div className="brand-stripe !rounded-none" />
        <div className="p-6">
          <div className="text-3xl mb-3">{current.emoji}</div>
          <h2 className="font-display font-bold text-textMain text-lg mb-2">{current.title}</h2>
          <p className="text-sm text-textMuted leading-relaxed mb-5">{current.body}</p>

          <div className="flex items-center justify-center gap-1.5 mb-5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-amber" : "w-1.5 bg-line"}`} />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="btn-ghost text-xs flex-1">Zurück</button>
            )}
            <button onClick={() => isLast ? onClose() : setStep((s) => s + 1)} className="btn text-xs flex-1 justify-center">
              {isLast ? "Los geht's!" : "Weiter"}
            </button>
          </div>
          {!isLast && (
            <button onClick={onClose} className="text-textMuted hover:text-textMain text-xs mt-3 w-full text-center">Überspringen</button>
          )}
        </div>
      </div>
    </div>
  );
}
