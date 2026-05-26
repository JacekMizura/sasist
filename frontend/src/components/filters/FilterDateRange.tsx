import { filterInputClass, filterLabelClass } from "./filterUiTokens";

export type FilterDateRangeProps = {
  label: string;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  className?: string;
};

/** Single label + two inline date inputs (Sellasist-style range block). */
export function FilterDateRange({
  label,
  from,
  to,
  onFromChange,
  onToChange,
  fromPlaceholder = "od",
  toPlaceholder = "do",
  className = "",
}: FilterDateRangeProps) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`.trim()}>
      <span className={filterLabelClass}>{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          aria-label={`${label} — ${fromPlaceholder}`}
          className={`${filterInputClass} min-w-0 flex-1`}
        />
        <span className="shrink-0 text-[11px] font-medium text-slate-400" aria-hidden>
          —
        </span>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          aria-label={`${label} — ${toPlaceholder}`}
          className={`${filterInputClass} min-w-0 flex-1`}
        />
      </div>
    </div>
  );
}
