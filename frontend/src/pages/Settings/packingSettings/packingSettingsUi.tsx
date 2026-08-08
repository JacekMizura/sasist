import { useState, type ReactNode } from "react";
import { wmsSettingsTokens } from "../wmsSettingsTokens";
import { WmsSettingsSection } from "../WmsSettingsSection";
import { WmsSettingField } from "../settingsSearch";
import {
  PackingCapabilityBadge,
  type PackingSettingCapability,
} from "../packingSettingCapability";
import { SettingInfoButton } from "../SettingInfoButton";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingCheckboxClass,
  wmsSettingControlInputClass,
  wmsSettingControlSelectClass,
} from "../wmsSettingRow";
import { PACKING_SETTING_HELP } from "./packingSettingsHelp";

export const selectClass = wmsSettingControlSelectClass;
export const numberInputClass = wmsSettingControlInputClass;
export const textInputClass = wmsSettingControlSelectClass;
export const checkboxClass = wmsSettingCheckboxClass;

export const CAP_NONE: PackingSettingCapability = "none";
export const CAP_PARTIAL: PackingSettingCapability = "partial";

export function Help({ children }: { children: ReactNode }) {
  return <p className={wmsSettingsTokens.help}>{children}</p>;
}

export function FieldGrid({ children }: { children: ReactNode }) {
  /** Single column — label|control rows need full width. */
  return <div className="space-y-2">{children}</div>;
}

/** Jedna sekcja nawigacji WMS = jedna karta Sellasist. */
export function SectionCard({
  id,
  title,
  summary,
  children,
  defaultCollapsed,
}: {
  id: string;
  title: string;
  summary?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  return (
    <WmsSettingsSection id={id} title={title} summary={summary} defaultCollapsed={defaultCollapsed}>
      {children}
    </WmsSettingsSection>
  );
}

export function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-4 first:mt-0 first:border-t-0 first:pt-0">
      {title ? <p className="mb-2 text-sm font-semibold text-slate-800">{title}</p> : null}
      {children}
    </div>
  );
}

export function BoolRow({
  label,
  checked,
  onChange,
  help,
  disabled,
  settingId,
  capability,
  capabilityNote,
  infoKey,
  infoDescription,
  infoTip,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
  disabled?: boolean;
  settingId?: string;
  capability?: PackingSettingCapability;
  capabilityNote?: string;
  infoKey?: string;
  infoDescription?: ReactNode;
  infoTip?: ReactNode;
}) {
  const helpEntry = infoKey ? PACKING_SETTING_HELP[infoKey] : undefined;
  const info = infoDescription ?? helpEntry?.description;
  const tip = infoTip ?? helpEntry?.tip;
  return (
    <WmsBoolSettingRow
      settingId={settingId}
      label={
        <>
          {label}
          {info ? <SettingInfoButton title={label} description={info} tip={tip} /> : null}
        </>
      }
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      hint={help}
      footer={
        capability ? (
          <span className="mt-1 block">
            <PackingCapabilityBadge kind={capability} note={capabilityNote} />
          </span>
        ) : null
      }
    />
  );
}

export function SelectField({
  label,
  settingId,
  value,
  onChange,
  children,
  capability,
  capabilityNote,
  infoKey,
  help,
}: {
  label: string;
  settingId?: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  capability?: PackingSettingCapability;
  capabilityNote?: string;
  infoKey?: string;
  help?: ReactNode;
}) {
  const helpEntry = infoKey ? PACKING_SETTING_HELP[infoKey] : undefined;
  const info = helpEntry?.description;
  const tip = helpEntry?.tip;
  return (
    <WmsControlSettingRow
      settingId={settingId}
      label={
        <>
          {label}
          {info ? <SettingInfoButton title={label} description={info} tip={tip} /> : null}
        </>
      }
      hint={typeof help === "string" ? help : undefined}
      footer={
        <>
          {capability ? (
            <span className="mt-1 block">
              <PackingCapabilityBadge kind={capability} note={capabilityNote} />
            </span>
          ) : null}
          {help && typeof help !== "string" ? <div className="mt-1">{help}</div> : null}
        </>
      }
    >
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </WmsControlSettingRow>
  );
}

export function MethodChecklist({
  methods,
  selectedIds,
  onToggle,
  emptyHint = "Brak metod dostawy dla magazynu — dodaj je w ustawieniach wysyłki.",
}: {
  methods: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyHint?: string;
}) {
  const set = new Set(selectedIds);
  if (methods.length === 0) {
    return <p className="text-sm text-slate-500">{emptyHint}</p>;
  }
  return (
    <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
      {methods.map((m) => (
        <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-0.5 hover:bg-white">
          <span className="text-sm leading-snug text-slate-800">{m.name}</span>
          <input
            type="checkbox"
            className={checkboxClass}
            checked={set.has(m.id)}
            onChange={() => onToggle(m.id)}
          />
        </label>
      ))}
    </div>
  );
}

/** Alias kanoniczny: SettingInfoButton / SettingHelpModal. */
export { SettingInfoButton as SettingHelpModal } from "../SettingInfoButton";

export function useCollapsed(defaultCollapsed = false) {
  return useState(defaultCollapsed);
}

/** Re-export for sections that still import WmsSettingField for custom rows. */
export { WmsSettingField };
