import type { ReactNode } from "react";

import { WMS_SETTINGS_SECTION_ANCHOR_CLASS } from "../../../../pages/Settings/wmsSettingsSectionConstants";
import { useWmsSettingsSectionAnchor } from "../../../../pages/Settings/WmsSettingsSectionRegistryContext";

export const selectClass =
  "mt-1.5 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

export const checkboxClass = "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500";

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
  const anchorRef = useWmsSettingsSectionAnchor(id);
  return (
    <section ref={anchorRef} id={id} data-wms-section="" className={WMS_SETTINGS_SECTION_ANCHOR_CLASS}>
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {summary ? <p className="mt-1 text-sm text-slate-500">{summary}</p> : null}
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </section>
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
