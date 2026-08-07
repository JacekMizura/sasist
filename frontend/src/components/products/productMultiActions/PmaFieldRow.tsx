import type { ReactNode } from "react";

import { pmaFieldRowClass } from "./uiTokens";

type Props = {
  label: string;
  /** When set, shows an enable/choice checkbox in the first column. */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  checkboxAriaLabel?: string;
  /** Radio group name — mutually exclusive options in first column. */
  radioName?: string;
  radioValue?: string;
  radioChecked?: boolean;
  onRadioSelect?: () => void;
  disabled?: boolean;
  /** Right column: input / select / spacer. */
  control?: ReactNode;
  hint?: string;
};

/**
 * Uniform Multiakcje row: [checkbox|radio|spacer] | label | control
 */
export function PmaFieldRow({
  label,
  checked,
  onCheckedChange,
  checkboxAriaLabel,
  radioName,
  radioValue,
  radioChecked,
  onRadioSelect,
  disabled,
  control,
  hint,
}: Props) {
  const showCheckbox = typeof checked === "boolean" && typeof onCheckedChange === "function";
  const showRadio = Boolean(radioName && onRadioSelect);

  return (
    <div className={pmaFieldRowClass}>
      {showCheckbox ? (
        <input
          type="checkbox"
          className="justify-self-center rounded border-slate-300"
          checked={checked}
          disabled={disabled}
          aria-label={checkboxAriaLabel ?? label}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
        />
      ) : showRadio ? (
        <input
          type="radio"
          name={radioName}
          value={radioValue}
          className="justify-self-center border-slate-300"
          checked={Boolean(radioChecked)}
          disabled={disabled}
          aria-label={checkboxAriaLabel ?? label}
          onChange={() => onRadioSelect?.()}
        />
      ) : (
        <span className="justify-self-center" aria-hidden />
      )}
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-800">{label}</span>
        {hint ? <span className="block truncate text-xs text-slate-400">{hint}</span> : null}
      </div>
      {control ?? <span className="block h-8" aria-hidden />}
    </div>
  );
}
