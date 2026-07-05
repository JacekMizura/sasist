import { Link } from "react-router-dom";

import type { ProductionBatchSummaryRead } from "@/api/productionApi";
import { AppEmptyState } from "@/components/app-shell";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { productionBatchCardGridClass } from "../productionLayoutTokens";
import { erpProductionPaths } from "../productionPaths";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "../productionUi";

type Props = {
  batches: ProductionBatchSummaryRead[];
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  cardClassName?: string;
  limit?: number;
};

export function ProductionDashboardBatchGrid({
  batches,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  cardClassName = "rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md",
  limit = 6,
}: Props) {
  if (batches.length === 0) {
    return (
      <AppEmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        density="inline"
      />
    );
  }

  return (
    <div className={productionBatchCardGridClass}>
      {batches.slice(0, limit).map((b) => (
        <Link key={b.id} to={erpProductionPaths.batch(b.id)} className={cardClassName}>
          <p className="font-mono text-sm font-semibold text-slate-900">{b.number}</p>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
            {b.product_labels?.slice(0, 2).join(", ") || "—"}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={batchStatusBadgeClass(b.status)}>{BATCH_STATUS_LABEL[b.status]}</span>
            <span className="text-xs tabular-nums text-slate-500">{b.progress_percent ?? 0}%</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
