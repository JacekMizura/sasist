import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { WMS_TASK_CARD } from "@/components/wms/execution/wmsLayoutTokens";
import {
  EXECUTION_STATUS_LABEL,
  PRODUCTION_KIND_LABEL,
  type ProductionExecutionKind,
} from "@/modules/production/productionExecutionTypes";
import { operationalBadgeBase, operationalBadgeNeutralClass } from "@/components/operational/operationalSemanticBadges";

type Accent = "amber" | "blue" | "emerald";

const ACCENT_STRIP: Record<Accent, string> = {
  amber: "bg-amber-400",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
};

type Props = {
  kind: ProductionExecutionKind;
  number: string;
  productLine?: string;
  quantity?: number | string;
  status?: string;
  statusBadge?: ReactNode;
  accent?: Accent;
  disabled?: boolean;
  disabledTitle?: string;
  onClick: () => void;
};

export function WmsProductionJobQueueCard({
  kind,
  number,
  productLine,
  quantity,
  status,
  statusBadge,
  accent = "amber",
  disabled = false,
  disabledTitle,
  onClick,
}: Props) {
  const kindLabel = PRODUCTION_KIND_LABEL[kind];
  const statusLabel = status ? EXECUTION_STATUS_LABEL[status] ?? status : null;

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      onClick={onClick}
      className={`${WMS_TASK_CARD} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className={`absolute bottom-0 left-0 top-0 w-1 ${ACCENT_STRIP[accent]}`} aria-hidden />
      <div className="flex flex-1 flex-col pl-2">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${operationalBadgeBase} ${operationalBadgeNeutralClass} text-[10px] uppercase tracking-wide`}>
                {kindLabel}
              </span>
              {statusLabel ? (
                <span className={`${operationalBadgeBase} ${operationalBadgeNeutralClass} text-[10px]`}>{statusLabel}</span>
              ) : null}
            </div>
            <p className="mt-2 font-mono text-2xl font-black tracking-tight text-slate-900">{number}</p>
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

/** @deprecated Use WmsProductionJobQueueCard */
export { WmsProductionJobQueueCard as WmsProductionBatchQueueCard };
