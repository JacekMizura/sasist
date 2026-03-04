type ProgressBarProps = {
  percent: number; // 0..100+ (over 100 shows as overload)
  /** Purple bar when value is from simulation/assigned_orders (not confirmed picking) */
  isSimulated?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** 0–50% green, 51–80% yellow/orange, 81–100% red, >100% pulsing red. */
function barColor(p: number, isSimulated?: boolean): string {
  if (isSimulated) return "bg-violet-500";
  if (p > 100) return "bg-red-500 animate-pulse";
  if (p >= 81) return "bg-red-500";
  if (p >= 51) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function ProgressBar({ percent, isSimulated }: ProgressBarProps) {
  const raw = Number.isFinite(percent) ? percent : 0;
  const p = Math.max(0, raw);
  const displayPct = p > 100 ? p : clamp(p, 0, 100);
  const widthPct = Math.min(100, p);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor(p, isSimulated)} rounded-full transition-all`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className={`text-[10px] font-black ${p > 100 ? "text-red-600" : "text-slate-400"}`}>
        {typeof displayPct === "number" ? Number(displayPct).toFixed(2) : "0.00"}%{p > 100 ? " (przepełnienie)" : ""}
      </span>
    </div>
  );
}

