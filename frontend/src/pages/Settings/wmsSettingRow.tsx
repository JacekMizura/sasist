import type { ElementType, ReactNode } from "react";

import { SettingInfoButton } from "./SettingInfoButton";
import { WMS_SETTING_DATA_ATTR } from "./settingsSearch/navigateToSetting";
import { wmsSettingsTokens } from "./wmsSettingsTokens";

/**
 * Sellasist-style WMS settings row:
 * LEFT  — title (text + optional „i” on the first line) / badges under title
 * RIGHT — control column (checkbox / select / input / picker), top-aligned
 *
 * The info icon lives inside `.option-title` (horizontal flex), not in a separate
 * column beside the whole multi-line label block.
 */

/** Label column — fills the fixed track; long names wrap inside the title text. */
export const WMS_SETTING_LABEL_COL_CLASS = "min-w-0";

/**
 * @deprecated Info icon is no longer a grid column — kept for import compatibility.
 */
export const WMS_SETTING_INFO_COL_CLASS =
  "inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center";

/** Control column — shared width for selects / inputs / checkboxes. */
export const WMS_SETTING_CONTROL_COL_CLASS =
  "flex min-w-0 w-full flex-col items-stretch justify-start";

/**
 * Row shell: LABEL | CONTROL from `sm` up; stacked on narrow viewports.
 * `items-start` keeps the control on the first line of a multi-line title.
 */
export const wmsSettingRowClass =
  "wms-setting-field grid w-full max-w-[calc(20rem+15rem+1.25rem)] grid-cols-1 items-start gap-x-5 gap-y-2 rounded-lg border border-transparent px-1 py-2.5 sm:grid-cols-[minmax(12rem,20rem)_minmax(10rem,15rem)]";

export const wmsSettingLabelColClass = WMS_SETTING_LABEL_COL_CLASS;

/** @deprecated See {@link WMS_SETTING_INFO_COL_CLASS}. */
export const wmsSettingInfoColClass = WMS_SETTING_INFO_COL_CLASS;

export const wmsSettingLabelTextClass =
  "text-sm font-medium leading-snug text-slate-800 break-words [overflow-wrap:anywhere]";

/**
 * Title row: shrink-wraps to text+icon when short; at full label width when long.
 * `items-start` keeps „i” on the first line while the name wraps below.
 */
export const wmsSettingTitleClass = "inline-flex max-w-full items-start gap-1.5";

export const wmsSettingControlColClass = WMS_SETTING_CONTROL_COL_CLASS;

/** Select/input fill the fixed control column. */
export const wmsSettingControlSelectClass =
  "w-full max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

export const wmsSettingControlInputClass = wmsSettingControlSelectClass + " tabular-nums";

export const wmsSettingCheckboxClass =
  "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500";

/** Form uses the pane width; row pair stays compact via max-w on the row. */
export const wmsSettingsFormMaxWidthClass = "w-full min-w-0";

function resolveInfoTitle(infoTitle: string | undefined, label: ReactNode): string {
  if (infoTitle && infoTitle.trim()) return infoTitle.trim();
  if (typeof label === "string" && label.trim()) return label.trim();
  return "Ustawienie";
}

function hasHintContent(hint: ReactNode | undefined): boolean {
  if (hint == null || hint === false || hint === true) return false;
  if (typeof hint === "string") return hint.trim().length > 0;
  return true;
}

type SettingRowProps = {
  label: ReactNode;
  children: ReactNode;
  /**
   * Legacy under-option description.
   * Not rendered under the title — promoted to the title-row „i” when `info` is absent.
   */
  hint?: ReactNode;
  /** Info control rendered inside the title row (typically {@link SettingInfoButton}). */
  info?: ReactNode;
  /** Modal title when `hint` is auto-promoted to SettingInfoButton. */
  infoTitle?: string;
  footer?: ReactNode;
  settingId?: string;
  className?: string;
  /** Render as <label> when the whole row activates the control (e.g. checkbox). */
  as?: "div" | "label";
};

/**
 * Shared WMS settings row: LABEL (title + „i”) | CONTROL.
 * Prefer this (or {@link WmsControlSettingRow} / {@link WmsBoolSettingRow}) in all WMS settings tabs.
 */
export function SettingRow({
  label,
  children,
  hint,
  info,
  infoTitle,
  footer,
  settingId,
  className,
  as = "div",
}: SettingRowProps) {
  const Comp = as as ElementType;
  const resolvedInfo =
    info ??
    (hasHintContent(hint) ? (
      <SettingInfoButton title={resolveInfoTitle(infoTitle, label)} description={hint} />
    ) : null);

  return (
    <Comp
      {...(settingId ? { [WMS_SETTING_DATA_ATTR]: settingId } : {})}
      className={`${wmsSettingRowClass} hover:bg-slate-50/80 ${className ?? ""}`}
    >
      <span className={wmsSettingLabelColClass}>
        <span className={wmsSettingTitleClass}>
          <span className={`min-w-0 ${wmsSettingLabelTextClass}`}>{label}</span>
          {resolvedInfo ? <span className="mt-0.5 inline-flex shrink-0">{resolvedInfo}</span> : null}
        </span>
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
  info?: ReactNode;
  infoTitle?: string;
  footer?: ReactNode;
  disabled?: boolean;
  settingId?: string;
  className?: string;
};

/** Left: title + optional „i”. Right: checkbox. */
export function WmsBoolSettingRow({
  label,
  checked,
  onChange,
  hint,
  info,
  infoTitle,
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
      info={info}
      infoTitle={infoTitle}
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
  info?: ReactNode;
  infoTitle?: string;
  footer?: ReactNode;
  settingId?: string;
  className?: string;
  asLabel?: boolean;
};

/** Left: title + optional „i”. Right: select / input / picker. */
export function WmsControlSettingRow({
  label,
  children,
  hint,
  info,
  infoTitle,
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
      info={info}
      infoTitle={infoTitle}
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
