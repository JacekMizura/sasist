type Props = {
  value: number;
  max?: number;
  label?: string;
  tone?: "violet" | "emerald" | "amber" | "orange";
  size?: "default" | "lg";
};

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
};

export function ProgressBar({ value, max = 100, label, tone = "orange", size = "default" }: Props) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const trackH = size === "lg" ? "h-3.5" : "h-2";
  return (
    <div>
      {label ? (
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div className={`${trackH} overflow-hidden rounded-full bg-slate-100`}>
        <div className={`h-full rounded-full transition-all ${TONE[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
