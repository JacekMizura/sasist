import { filterInputClass, filterLabelClass } from "./filterUiTokens";

export type FilterNumberRangeProps = {
  label: string;
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  step?: number;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
};

/** Single label + two inline number inputs. */
export function FilterNumberRange({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  minPlaceholder = "od",
  maxPlaceholder = "do",
  step = 0.01,
  className = "",
  inputClassName = filterInputClass,
  labelClassName = filterLabelClass,
}: FilterNumberRangeProps) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`.trim()}>
      <span className={labelClassName}>{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          type="number"
          min={0}
          step={step}
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder={minPlaceholder}
          aria-label={`${label} — ${minPlaceholder}`}
          className={`${inputClassName} min-w-0 flex-1`}
        />
        <span className="shrink-0 text-[11px] font-medium text-slate-400" aria-hidden>
          —
        </span>
        <input
          type="number"
          min={0}
          step={step}
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder={maxPlaceholder}
          aria-label={`${label} — ${maxPlaceholder}`}
          className={`${inputClassName} min-w-0 flex-1`}
        />
      </div>
    </div>
  );
}
