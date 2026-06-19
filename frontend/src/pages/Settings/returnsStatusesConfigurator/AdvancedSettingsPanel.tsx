import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  title?: string;
};

export function AdvancedSettingsPanel({ children, title = "Ustawienia zaawansowane" }: Props) {
  return (
    <details className="rounded-lg border border-slate-100 bg-slate-50/80 text-sm">
      <summary className="cursor-pointer select-none px-3 py-2.5 font-medium text-slate-500 hover:text-slate-700">
        ▼ {title}
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-3 py-3">{children}</div>
    </details>
  );
}

const lab = "block text-xs font-medium text-slate-600";
const inp = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 shadow-sm";

export function AdvancedCodeField({
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
