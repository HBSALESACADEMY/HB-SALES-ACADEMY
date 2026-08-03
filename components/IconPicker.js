import Icon from "./Icon";

export const NAV_ICONS = ["dashboard", "book", "chat", "library", "award", "lock", "download", "search", "flame", "users", "target", "calendar", "mic"];

export default function IconPicker({ value, onChange, size = 16 }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {NAV_ICONS.map((ic) => (
        <button
          key={ic} type="button" title={ic} onClick={() => onChange(ic)}
          className={`w-9 h-9 rounded-lg border flex items-center justify-center transition ${value === ic ? "border-amber bg-amber/10 text-amber" : "border-line text-textMuted hover:border-[var(--org-color-1,#4A3565)] hover:text-textMain"}`}
        >
          <Icon name={ic} size={size} />
        </button>
      ))}
    </div>
  );
}
