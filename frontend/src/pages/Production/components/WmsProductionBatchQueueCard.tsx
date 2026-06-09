import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { WMS_TASK_CARD, WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";

type Accent = "amber" | "blue" | "emerald";

const ACCENT_STRIP: Record<Accent, string> = {
  amber: "bg-amber-400",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
};

type Props = {
  label: string;
  number: string;
  productLine?: string;
  quantity?: number | string;
  statusBadge?: ReactNode;
  accent?: Accent;
  onClick: () => void;
};

export function WmsProductionBatchQueueCard({
  label,
  number,
  productLine,
  quantity,
  statusBadge,
  accent = "amber",
  onClick,
}: Props) {
  return (
    <button type="button" onClick={onClick} className={WMS_TASK_CARD}>
      <div className={`absolute bottom-0 left-0 top-0 w-1 ${ACCENT_STRIP[accent]}`} aria-hidden />
      <div className="flex flex-1 flex-col pl-2">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={WMS_TERMINAL_LABEL}>{label}</p>
            <p className="mt-1 font-mono text-2xl font-black tracking-tight text-slate-900">{number}</p>
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-slate-500" aria-hidden />
        </div>
        {productLine ? (
          <p className="line-clamp-2 text-base font-semibold leading-snug text-slate-800">{productLine}</p>
        ) : null}
        {quantity != null ? (
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
            {quantity}
            <span className="ml-1 text-sm font-semibold text-slate-500">szt.</span>
          </p>
        ) : null}
        {statusBadge ? <div className="mt-auto pt-4">{statusBadge}</div> : null}
      </div>
    </button>
  );
}
