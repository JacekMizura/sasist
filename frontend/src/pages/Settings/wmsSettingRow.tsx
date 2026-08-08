import type { ReactNode } from "react";

import { WMS_SETTING_DATA_ATTR } from "./settingsSearch/navigateToSetting";
import { wmsSettingsTokens } from "./wmsSettingsTokens";

/**
 * Canonical WMS settings layout:
 * option name (+ optional ⓘ) first, then control immediately beside it — not at the page edge.
 */

export const wmsSettingRowClass =
  "wms-setting-field flex flex-col gap-1 rounded-lg border border-transparent px-1 py-1.5 hover:bg-slate-50/80";

export const wmsSettingMainLineClass = "flex min-w-0 flex-wrap items-start gap-2.5";

export const wmsSettingLabelTextClass = "inline text-sm font-medium leading-snug text-slate-800";

export const wmsSettingControlColClass = "shrink-0 pt-0.5";

/** Select/input beside the label (compact, not full-bleed). */
export const wmsSettingControlSelectClass =
  "w-auto min-w-[12rem] max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

export const wmsSettingControlInputClass = wmsSettingControlSelectClass + " tabular-nums";

export const wmsSettingCheckboxClass = wmsSettingsTokens.checkbox.replace("mt-0.5 ", "");

type BoolRowProps = {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
  settingId?: string;
  className?: string;
};

/** Label first, checkbox right next to it. */
export function WmsBoolSettingRow({
  label,
  checked,
  onChange,
  hint,
  footer,
  disabled,
  settingId,
  className,
}: BoolRowProps) {
  return (
    <label
      {...(settingId ? { [WMS_SETTING_DATA_ATTR]: settingId } : {})}
      className={`${wmsSettingRowClass} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${className ?? ""}`}
    >
      <span className={wmsSettingMainLineClass}>
        <span className={`min-w-0 ${wmsSettingLabelTextClass}`}>{label}</span>
        <span className={wmsSettingControlColClass}>
          <input
            type="checkbox"
            className={wmsSettingCheckboxClass}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
        </span>
      </span>
      {hint ? <span className="text-xs leading-relaxed text-slate-500">{hint}</span> : null}
      {footer}
    </label>
  );
}

type ControlRowProps = {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
  settingId?: string;
  className?: string;
  /** When true, wrap in <label> (for native inputs). Default: div. */
  asLabel?: boolean;
};

/** Label first, select/input immediately beside it. */
export function WmsControlSettingRow({
  label,
  children,
  hint,
  footer,
  settingId,
  className,
  asLabel = false,
}: ControlRowProps) {
  const Comp = asLabel ? "label" : "div";
  return (
    <Comp
      {...(settingId ? { [WMS_SETTING_DATA_ATTR]: settingId } : {})}
      className={`${wmsSettingRowClass} ${asLabel ? "cursor-pointer" : ""} ${className ?? ""}`}
    >
      <span className={wmsSettingMainLineClass}>
        <span className={`min-w-0 ${wmsSettingLabelTextClass}`}>{label}</span>
        <span className={wmsSettingControlColClass}>{children}</span>
      </span>
      {hint ? <span className="text-xs leading-relaxed text-slate-500">{hint}</span> : null}
      {footer}
    </Comp>
  );
}
