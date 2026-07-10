type Props = {
  percent: number;
  isSimulated?: boolean;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function barColor(p: number, isSimulated?: boolean): string {
  if (isSimulated) return "bg-violet-500";
  if (p > 100) return "bg-red-500 animate-pulse";
  if (p >= 81) return "bg-red-500";
  if (p >= 51) return "bg-amber-500";
  return "bg-emerald-500";
}

/** Thin inline utilization bar (6–8px) for fleet resource rows. */
export function FleetResourceProgressBar({ percent, isSimulated, className }: Props) {
  const raw = Number.isFinite(percent) ? percent : 0;
  const p = Math.max(0, raw);
  const displayPct = p > 100 ? p : clamp(p, 0, 100);
  const widthPct = Math.min(100, p);

  return (
    <div className={["flex min-w-[72px] max-w-[100px] shrink-0 items-center gap-1.5", className ?? ""].filter(Boolean).join(" ")}>
      <div className="h-1.5 min-w-[48px] flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barColor(p, isSimulated)}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className={`w-8 shrink-0 text-right text-[10px] font-bold tabular-nums ${p > 100 ? "text-red-600" : "text-slate-500"}`}>
        {Number(displayPct).toFixed(0)}%
      </span>
    </div>
  );
}
