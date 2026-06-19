import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  title?: string;
};

/** Pola tylko dla integratorów — domyślnie zwinięte. */
export function IntegrationsApiPanel({ children, title = "⋯ Opcje techniczne" }: Props) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer select-none text-xs font-medium text-slate-400 hover:text-slate-600">
        {title}
      </summary>
      <div className="mt-3 space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-3">{children}</div>
    </details>
  );
}

/** @deprecated */
export const AdvancedSettingsPanel = IntegrationsApiPanel;

const lab = "block text-xs font-medium text-slate-600";
const inp = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800";

export function IntegrationsCodeField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className={lab}>
      {label}
      <input className={inp} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
    </label>
  );
}

/** @deprecated */
export const AdvancedCodeField = IntegrationsCodeField;
