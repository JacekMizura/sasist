import type { ReactNode } from "react";

import { WMS_SETTING_DATA_ATTR } from "./settingsSearch/navigateToSetting";
import { wmsSettingsTokens } from "./wmsSettingsTokens";

/**
 * Sellasist-style WMS settings row:
 * LEFT — name / description / badges (wraps, capped width)
 * RIGHT — fixed control column immediately beside the label
 *
 * Extra viewport width stays empty on the RIGHT. Do not push controls to the edge
 * (no space-between, no 1fr label that shoves the control column right).
 */

/** Label column ≈ 34rem, control column 26rem (416px) — aligned start of each row. */
export const wmsSettingRowClass =
  "wms-setting-field grid w-full grid-cols-1 items-start gap-x-6 gap-y-2 rounded-lg border border-transparent px-1 py-2.5 sm:grid-cols-[minmax(0,34rem)_26rem] sm:justify-start";

export const wmsSettingLabelColClass = "min-w-0 max-w-full";

export const wmsSettingLabelTextClass = "text-sm font-medium leading-snug text-slate-800";

export const wmsSettingControlColClass =
  "flex w-full min-w-0 max-w-[26rem] flex-col items-stretch justify-start sm:pt-0.5";

/** Select/input fill the fixed control column. */
export const wmsSettingControlSelectClass =
  "w-full max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

export const wmsSettingControlInputClass = wmsSettingControlSelectClass + " tabular-nums";

export const wmsSettingCheckboxClass =
  "h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500";

/** Full width of the settings content pane — form uses the pane; controls stay compact. */
export const wmsSettingsFormMaxWidthClass = "w-full min-w-0";

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

/** Left: label / hint / badges. Right: checkbox in the shared control column. */
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
      className={`${wmsSettingRowClass} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-50/80"} ${className ?? ""}`}
    >
      <span className={wmsSettingLabelColClass}>
        <span className={`block ${wmsSettingLabelTextClass}`}>{label}</span>
        {hint ? <span className="mt-1 block text-xs leading-relaxed text-slate-500">{hint}</span> : null}
        {footer}
      </span>
      <span className={`${wmsSettingControlColClass} items-start`}>
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
  asLabel?: boolean;
};

/** Left: label / hint / badges. Right: select / input / picker. */
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
      className={`${wmsSettingRowClass} ${asLabel ? "cursor-pointer" : ""} hover:bg-slate-50/80 ${className ?? ""}`}
    >
      <span className={wmsSettingLabelColClass}>
        <span className={`block ${wmsSettingLabelTextClass}`}>{label}</span>
        {hint ? <span className="mt-1 block text-xs leading-relaxed text-slate-500">{hint}</span> : null}
        {footer}
      </span>
      <span className={wmsSettingControlColClass}>{children}</span>
    </Comp>
  );
}

/** Right-column-only slot (e.g. nested multi-select under a parent setting). */
export function WmsSettingControlSlot({
  children,
  settingId,
  className,
}: {
  children: ReactNode;
  settingId?: string;
  className?: string;
}) {
  return (
    <div
      {...(settingId ? { [WMS_SETTING_DATA_ATTR]: settingId } : {})}
      className={`${wmsSettingRowClass} ${className ?? ""}`}
    >
      <span className="hidden min-w-0 sm:block" aria-hidden />
      <span className={wmsSettingControlColClass}>{children}</span>
    </div>
  );
}

export { wmsSettingsTokens };
