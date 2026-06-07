type Props = {
  value: number;
  max?: number;
  label?: string;
  tone?: "violet" | "emerald" | "amber";
};

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
};

export function ProgressBar({ value, max = 100, label, tone = "violet" }: Props) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      {label ? (
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${TONE[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
