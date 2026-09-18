// Die eine Folie zum Anfang.
//
// Vorher standen hier fünf: Dashboard, Kurse, Team, Nachrichten,
// Einstellungen — am ersten Tag, alle auf einmal, und vier davon über
// Bereiche, die erst Wochen später dran sind. Gelesen wurde davon nichts,
// weggeklickt alles.
//
// Jetzt sagt der Anfang nur, worum es geht und wo man beginnt. Den Rest
// erklärt die Academy dort, wo er gebraucht wird: ein Satz beim ersten
// Öffnen jeder Seite (components/SeitenHinweis.js).
export default function TutorialModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[220] p-4">
      <div className="card max-w-sm w-full overflow-hidden !p-0">
        <div className="brand-stripe !rounded-none" />
        <div className="p-6">
          <div className="text-3xl mb-3">🚀</div>
          <h2 className="font-display font-bold text-textMain text-lg mb-2">Schön, dass du da bist</h2>
          <p className="text-sm text-textMuted leading-relaxed mb-3">
            Die Academy ist dein Werkzeug für den Vertriebsalltag: telefonieren, Termine führen, nachfassen,
            besser werden. Alles an einem Ort.
          </p>
          <p className="text-sm text-textMuted leading-relaxed mb-3">
            Fang einfach an. Auf deinem Startbildschirm stehen deine ersten Schritte — und in jedem Bereich
            erklärt dir ein Satz, worum es dort geht.
          </p>
          <p className="text-xs text-textMuted leading-relaxed mb-5">
            Am wichtigsten am ersten Tag: <strong className="text-textMain">den Call Tracker offen haben</strong>,
            wenn du telefonierst. Alles andere findest du nach und nach.
          </p>

          <button onClick={onClose} className="btn text-xs w-full justify-center">Los geht&apos;s!</button>
        </div>
      </div>
    </div>
  );
}
