import type { ReactNode } from "react";

import { WmsSettingsSection } from "../../../../pages/Settings/WmsSettingsSection";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingCheckboxClass,
  wmsSettingControlInputClass,
  wmsSettingControlSelectClass,
} from "../../../../pages/Settings/wmsSettingRow";
import { wmsSettingsRowsStackClass } from "../../../../pages/Settings/wmsSettingsUi";
import { DIRECT_SALES_SETTINGS_NAV_SECTIONS } from "../directSalesSettingsNavSections";

export const selectClass = wmsSettingControlSelectClass;
export const inputClass = wmsSettingControlInputClass;
export const checkboxClass = wmsSettingCheckboxClass;

export function SettingsCard({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  const meta = DIRECT_SALES_SETTINGS_NAV_SECTIONS.find((s) => s.id === id);
  return (
    <WmsSettingsSection
      id={id}
      title={title}
      summary={summary}
      icon={meta?.icon}
      iconClassName={meta?.iconClassName}
      searchText={meta?.searchText}
    >
      <div className={wmsSettingsRowsStackClass}>{children}</div>
    </WmsSettingsSection>
  );
}

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <WmsControlSettingRow label={label} hint={hint}>
      {children}
    </WmsControlSettingRow>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <WmsBoolSettingRow
      label={label}
      hint={hint}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

export function WarningBlock({ tone, children }: { tone: "amber" | "red"; children: ReactNode }) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-950";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
