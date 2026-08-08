import type { ElementType, ReactNode } from "react";

import { WMS_SETTING_DATA_ATTR } from "./settingsSearch/navigateToSetting";
import { wmsSettingsTokens } from "./wmsSettingsTokens";

/**
 * Sellasist-style WMS settings row:
 * LEFT  — name / description / badges (fixed max width, wraps to 2–3 lines)
 * RIGHT — control column immediately beside the first line of the label
 *
 * Controls form one vertical column across rows. Extra viewport width stays empty
 * on the right — never push controls to the section/page edge.
 */

/** Label column — fills the fixed track; long names wrap inside it. */
export const WMS_SETTING_LABEL_COL_CLASS = "min-w-0";

/** Control column — shared width for selects / inputs / checkboxes. */
export const WMS_SETTING_CONTROL_COL_CLASS =
  "flex min-w-0 w-full flex-col items-stretch justify-start";

/**
 * Row shell: horizontal LABEL | CONTROL from `sm` up, stacked only on narrow viewports.
 * `items-start` keeps the control on the first line of a multi-line label.
 * Row max-width caps the pair so controls stay beside the name (not at the page edge).
 * Equal track sizes on every row → one vertical control column.
 */
export const wmsSettingRowClass =
  "wms-setting-field grid w-full max-w-[calc(20rem+15rem+1.25rem)] grid-cols-1 items-start gap-x-5 gap-y-2 rounded-lg border border-transparent px-1 py-2.5 sm:grid-cols-[minmax(12rem,20rem)_minmax(10rem,15rem)]";

export const wmsSettingLabelColClass = WMS_SETTING_LABEL_COL_CLASS;

export const wmsSettingLabelTextClass =
  "text-sm font-medium leading-snug text-slate-800 break-words [overflow-wrap:anywhere]";

export const wmsSettingControlColClass = WMS_SETTING_CONTROL_COL_CLASS;

/** Select/input fill the fixed control column. */
export const wmsSettingControlSelectClass =
  "w-full max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

export const wmsSettingControlInputClass = wmsSettingControlSelectClass + " tabular-nums";

export const wmsSettingCheckboxClass =
  "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500";

/** Form uses the pane width; row pair stays compact via max-w on the row. */
export const wmsSettingsFormMaxWidthClass = "w-full min-w-0";

type SettingRowProps = {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
  settingId?: string;
  className?: string;
  /** Render as <label> when the whole row activates the control (e.g. checkbox). */
  as?: "div" | "label";
};

/**
 * Shared WMS settings row: LABEL | CONTROL.
 * Prefer this (or {@link WmsControlSettingRow} / {@link WmsBoolSettingRow}) in all WMS settings tabs.
 */
export function SettingRow({
  label,
  children,
  hint,
  footer,
  settingId,
  className,
  as = "div",
}: SettingRowProps) {
  const Comp = as as ElementType;
  return (
    <Comp
      {...(settingId ? { [WMS_SETTING_DATA_ATTR]: settingId } : {})}
      className={`${wmsSettingRowClass} hover:bg-slate-50/80 ${className ?? ""}`}
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

/** @deprecated Prefer {@link SettingRow} — same layout. */
export const WmsSettingRow = SettingRow;

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
    <SettingRow
      as="label"
      settingId={settingId}
      label={label}
      hint={hint}
      footer={footer}
      className={`${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${className ?? ""}`}
    >
      <span className="flex items-start">
        <input
          type="checkbox"
          className={wmsSettingCheckboxClass}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
    </SettingRow>
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
  return (
    <SettingRow
      as={asLabel ? "label" : "div"}
      settingId={settingId}
      label={label}
      hint={hint}
      footer={footer}
      className={`${asLabel ? "cursor-pointer" : ""} ${className ?? ""}`}
    >
      {children}
    </SettingRow>
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
      <span className={`${wmsSettingLabelColClass} hidden sm:block`} aria-hidden />
      <span className={wmsSettingControlColClass}>{children}</span>
    </div>
  );
}

export { wmsSettingsTokens };
