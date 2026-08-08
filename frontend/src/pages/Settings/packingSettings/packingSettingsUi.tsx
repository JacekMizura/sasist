import { useState, type ReactNode } from "react";
import { wmsSettingsTokens } from "../wmsSettingsTokens";
import { WmsSettingsSection } from "../WmsSettingsSection";
import { WmsSettingField } from "../settingsSearch";
import { WMS_SETTING_DATA_ATTR } from "../settingsSearch/navigateToSetting";
import {
  PackingCapabilityBadge,
  type PackingSettingCapability,
} from "../packingSettingCapability";
import { SettingInfoButton } from "../SettingInfoButton";
import { PACKING_SETTING_HELP } from "./packingSettingsHelp";

export const selectClass = wmsSettingsTokens.select;
export const numberInputClass = wmsSettingsTokens.input.replace("max-w-md", "max-w-xs") + " tabular-nums";
export const textInputClass = wmsSettingsTokens.input;
export const checkboxClass = wmsSettingsTokens.checkbox;

export const CAP_NONE: PackingSettingCapability = "none";
export const CAP_PARTIAL: PackingSettingCapability = "partial";

export function Help({ children }: { children: ReactNode }) {
  return <p className={wmsSettingsTokens.help}>{children}</p>;
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className={wmsSettingsTokens.fieldGrid}>{children}</div>;
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
    <div
      {...(settingId ? { [WMS_SETTING_DATA_ATTR]: settingId } : {})}
      className={`wms-setting-field rounded-lg border border-transparent px-1 py-1 ${disabled ? "opacity-60" : "hover:bg-slate-50/80"}`}
    >
      <label className={`flex min-w-0 items-start gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="inline text-sm font-medium leading-snug text-slate-800">
            {label}
            {info ? (
              <SettingInfoButton title={label} description={info} tip={tip} />
            ) : null}
          </span>
          {capability ? (
            <span className="mt-1 block">
              <PackingCapabilityBadge kind={capability} note={capabilityNote} />
            </span>
          ) : null}
          {help ? <Help>{help}</Help> : null}
        </span>
      </label>
    </div>
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
    <WmsSettingField settingId={settingId} className="block text-sm font-medium text-slate-700">
      <span className="mb-1 block">
        <span className="inline text-sm font-medium leading-snug text-slate-700">
          {label}
          {info ? <SettingInfoButton title={label} description={info} tip={tip} /> : null}
        </span>
        {capability ? (
          <span className="mt-1 block">
            <PackingCapabilityBadge kind={capability} note={capabilityNote} />
          </span>
        ) : null}
      </span>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      {help ? <div className="mt-1">{help}</div> : null}
    </WmsSettingField>
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
        <label key={m.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-white">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={set.has(m.id)}
            onChange={() => onToggle(m.id)}
          />
          <span className="text-sm leading-snug text-slate-800">{m.name}</span>
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
