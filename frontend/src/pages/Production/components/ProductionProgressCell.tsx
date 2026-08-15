import { ProgressBar, toneTextClass } from "@/design-system";

import { productionProgressTone } from "../productionUi";

type Props = {
  current: number;
  total: number;
  percent?: number;
  displayLine?: string | null;
  className?: string;
  /** Hide the text line above the bar (table cells). */
  barOnly?: boolean;
};

/**
 * Numeric progress + DS ProgressBar — shared by Pulpit rows and Zlecenia table.
 */
export function ProductionProgressCell({
  current,
  total,
  percent,
  displayLine,
  className = "",
  barOnly = false,
}: Props) {
  const pct =
    percent != null && Number.isFinite(percent)
      ? Math.max(0, Math.min(100, Math.round(percent)))
      : total > 0
        ? Math.max(0, Math.min(100, Math.round((current / total) * 100)))
        : 0;
  const tone = productionProgressTone(pct);
  const line =
    displayLine?.trim() ||
    (total > 0 ? `${formatQty(current)} / ${formatQty(total)}` : null);

  return (
    <div className={`min-w-0 space-y-0.5 ${className}`.trim()}>
      {!barOnly && line ? (
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="truncate tabular-nums">{line}</span>
          <span className={`shrink-0 tabular-nums font-semibold ${toneTextClass[tone]}`}>{pct}%</span>
        </div>
      ) : null}
      <ProgressBar value={pct} tone={tone} size="sm" />
    </div>
  );
}

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}
