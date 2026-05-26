import { ScanLine } from "lucide-react";
import type { WmsOperationalTaskDetailApi } from "../../../api/wmsOperationalTasksApi";
import { nextOperationalAction } from "./operationalWorkflow";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

type Props = {
  detail: WmsOperationalTaskDetailApi;
  sourceLabel?: string | null;
  targetLabel?: string | null;
  remainingQty?: number;
};

export function ActiveWorkContextBar({ detail, sourceLabel, targetLabel, remainingQty }: Props) {
  const next = nextOperationalAction(detail);
  const rem =
    remainingQty ??
    Math.max(0, (detail.quantity_required || 0) - (detail.quantity_done || 0));

  return (
    <div className="sticky top-14 z-10 border-b border-indigo-200 bg-indigo-950 px-4 py-3 text-white shadow-lg">
      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
        Aktywna operacja
      </p>
      <p className="mt-0.5 text-sm font-bold">{next.label}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold">
        {sourceLabel ? (
          <span className="rounded-lg bg-indigo-800 px-2 py-1">Z: {sourceLabel}</span>
        ) : detail.picked_from_location ? (
          <span className="rounded-lg bg-indigo-800 px-2 py-1">Batch: {detail.picked_from_location}</span>
        ) : null}
        {targetLabel ? (
          <span className="rounded-lg bg-violet-500 px-2 py-1 text-white">→ {targetLabel}</span>
        ) : null}
        <span className="rounded-lg bg-white/15 px-2 py-1">Zostało {fmtQty(rem)} szt.</span>
      </div>
      {next.scanHint ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-indigo-200">
          <ScanLine size={14} />
          {next.scanHint}
        </p>
      ) : null}
    </div>
  );
}
