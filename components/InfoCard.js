export default function InfoCard({ title = "Wie funktioniert das?", children }) {
  return (
    <div className="card mb-5 border border-line/60">
      <div className="text-xs font-semibold text-textMain mb-1.5 flex items-center gap-1.5">
        <span>💡</span> {title}
      </div>
      <div className="text-xs text-textMuted leading-relaxed">{children}</div>
    </div>
  );
}
