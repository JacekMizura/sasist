type Props = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "success" | "info";
};

const TONE_RING: Record<NonNullable<Props["tone"]>, string> = {
  default: "border-slate-200",
  warning: "border-amber-200 bg-amber-50/50",
  success: "border-emerald-200 bg-emerald-50/40",
  info: "border-blue-200 bg-blue-50/40",
};

export function ErpKpiCard({ label, value, hint, tone = "default" }: Props) {
  return (
    <div className={`rounded-lg border bg-white px-4 py-3 shadow-sm ${TONE_RING[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
