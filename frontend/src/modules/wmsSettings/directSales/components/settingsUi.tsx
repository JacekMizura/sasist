import type { ReactNode } from "react";

import { WmsSettingsSection } from "../../../../pages/Settings/WmsSettingsSection";
import { wmsSettingsTokens } from "../../../../pages/Settings/wmsSettingsTokens";

export const selectClass = wmsSettingsTokens.select;
export const checkboxClass = wmsSettingsTokens.checkbox;

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
  return (
    <WmsSettingsSection id={id} title={title} summary={summary}>
      {children}
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
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-start">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
      <div>{children}</div>
    </div>
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
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-transparent px-1 py-1 hover:bg-slate-50">
      <input
        type="checkbox"
        className={checkboxClass}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export function WarningBlock({ tone, children }: { tone: "amber" | "red"; children: ReactNode }) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-950";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
