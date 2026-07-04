import type { TimelinePoint } from "@/api/productionPlanningApi";

type Props = {
  points: TimelinePoint[];
  height?: number;
};

/** Mini stock timeline — current → depletion → production end. */
export function ProductionTimelineChart({ points, height = 48 }: Props) {
  if (!points.length) {
    return <div className="h-12 rounded-lg bg-slate-50" />;
  }

  const xs = points.map((p) => Number(p.offset_days));
  const ys = points.map((p) => Number(p.quantity));
  const maxX = Math.max(...xs, 1);
  const maxY = Math.max(...ys, 1);

  const toX = (d: number) => 4 + (d / maxX) * 92;
  const toY = (q: number) => height - 4 - (q / maxY) * (height - 8);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(Number(p.offset_days)).toFixed(1)} ${toY(Number(p.quantity)).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full min-w-[120px]" role="img" aria-label="Prognoza stanu magazynowego">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500" />
      {points.map((p) => (
        <circle
          key={`${p.phase}-${p.offset_days}`}
          cx={toX(Number(p.offset_days))}
          cy={toY(Number(p.quantity))}
          r={2.5}
          className={
            p.phase === "production_end" || p.phase === "completion"
              ? "fill-emerald-500"
              : p.phase === "depletion"
                ? "fill-rose-500"
                : "fill-indigo-500"
          }
        />
      ))}
    </svg>
  );
}
