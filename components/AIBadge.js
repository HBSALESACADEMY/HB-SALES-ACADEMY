// Dezenter Hinweis auf KI-generierte/-gestützte Inhalte bzw. KI-Interaktion,
// gemäß den EU-KI-Verordnung-Transparenzpflichten (Art. 50): Nutzer:innen
// sollen erkennen können, wenn sie mit einer KI interagieren oder KI-erzeugte
// Inhalte sehen. Bewusst klein und unaufdringlich gehalten (kein Banner/Modal).
export default function AIBadge({ label = "KI", title = "KI-generierter Inhalt", className = "" }) {
  return (
    <span
      title={title}
      className={`text-[9.5px] uppercase tracking-wide text-textMuted/70 border border-line rounded px-1 py-0.5 cursor-help ${className}`}
    >
      🤖 {label}
    </span>
  );
}
