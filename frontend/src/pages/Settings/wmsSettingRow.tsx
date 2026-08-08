import type { ReactNode } from "react";

import { WMS_SETTING_DATA_ATTR } from "./settingsSearch/navigateToSetting";
import { wmsSettingsTokens } from "./wmsSettingsTokens";

/**
 * Canonical WMS settings form row (not a table):
 * LEFT ~58%: name, description, badges
 * RIGHT ~42%: checkbox / select / input / picker — shared vertical axis
 */

export const wmsSettingRowClass =
  "wms-setting-field grid grid-cols-1 items-start gap-x-6 gap-y-2 rounded-lg border border-transparent px-1 py-2.5 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]";

export const wmsSettingLabelColClass = "min-w-0";

export const wmsSettingLabelTextClass = "text-sm font-medium leading-snug text-slate-800";

export const wmsSettingControlColClass =
  "flex min-w-0 w-full flex-col items-stretch justify-start sm:pt-0.5";

/** Select/input fill the right column (aligned axis across rows). */
export const wmsSettingControlSelectClass =
  "w-full max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

export const wmsSettingControlInputClass = wmsSettingControlSelectClass + " tabular-nums";

export const wmsSettingCheckboxClass =
  "h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500";

/** Max width for packing (and similar) settings forms — keeps controls off the page edge. */
export const wmsSettingsFormMaxWidthClass = "mx-auto w-full max-w-[72rem]";

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

/** Left: label / hint / badges. Right: checkbox. */
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
