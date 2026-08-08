import type { ReactNode } from "react";

import { WMS_SETTING_DATA_ATTR } from "./settingsSearch/navigateToSetting";
import { wmsSettingsTokens } from "./wmsSettingsTokens";

/**
 * Canonical WMS settings layout (Sellasist-style):
 * option name (+ optional ⓘ) on the LEFT, control on the RIGHT.
 */

export const wmsSettingRowClass =
  "wms-setting-field flex min-w-0 items-start justify-between gap-4 rounded-lg border border-transparent px-1 py-1.5 hover:bg-slate-50/80";

export const wmsSettingLabelColClass = "min-w-0 flex-1";

export const wmsSettingLabelTextClass = "inline text-sm font-medium leading-snug text-slate-800";

export const wmsSettingControlColClass = "shrink-0 pt-0.5";

/** Select/input used on the right side of a setting row (no top margin). */
export const wmsSettingControlSelectClass =
  "w-full min-w-[11rem] max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:min-w-[14rem]";

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

/** Label left, checkbox right. */
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
      <span className={wmsSettingLabelColClass}>
        <span className={wmsSettingLabelTextClass}>{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{hint}</span> : null}
        {footer}
      </span>
      <span className={wmsSettingControlColClass}>
        <input
          type="checkbox"
          className={wmsSettingCheckboxClass}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
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

/** Label left, select/input/custom control right. */
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
      <span className={wmsSettingLabelColClass}>
        <span className={wmsSettingLabelTextClass}>{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{hint}</span> : null}
        {footer}
      </span>
      <span className={`${wmsSettingControlColClass} max-w-[min(100%,20rem)]`}>{children}</span>
    </Comp>
  );
}
