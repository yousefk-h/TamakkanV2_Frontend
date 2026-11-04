export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  labels,
  "aria-label": ariaLabel,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  /** Display text per option, when the option itself is an internal value
   * (e.g. "Upcoming") rather than already-displayable text - falls back to
   * the raw option so every call site that doesn't need this keeps working
   * unchanged. */
  labels?: Record<T, string>;
  "aria-label"?: string;
}) {
  return (
    <div className="flex max-w-full flex-wrap items-center gap-1 rounded-[11px] border border-line bg-card p-1" role="group" aria-label={ariaLabel}>
      {options.map(o => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`min-h-11 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            value === o ? "bg-brand-primary-pale font-bold text-brand-blue" : "text-muted hover:bg-bg"
          }`}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
