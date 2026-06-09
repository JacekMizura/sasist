import type { LucideIcon } from "lucide-react";

export type AppStatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
};

export function AppStatCard({ label, value, hint, icon: Icon }: AppStatCardProps) {
  return (
    <div className="rounded-lg border border-slate-200/90 bg-white p-3 shadow-none">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
          {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-100 bg-slate-50 text-slate-600">
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
      </div>
    </div>
  );
}
