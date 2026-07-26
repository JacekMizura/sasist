import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import type { ProductionBatchSummaryRead } from "@/api/productionApi";
import { AppEmptyState } from "@/components/app-shell";
import {
  EmptyState,
  ListTile,
  ProgressBar,
  StatusBadge,
  secondaryButtonClassName,
  toneTextClass,
} from "@/design-system";

import { erpProductionPaths } from "../productionPaths";
import { BATCH_STATUS_LABEL, executionStatusTone, productionProgressTone } from "../productionUi";

type Props = {
  batches: ProductionBatchSummaryRead[];
  emptyIcon?: LucideIcon;
  emptyTitle: string;
  emptyDescription?: string;
  /** When true, render a minimal empty message (no icon / description chrome). */
  plainEmpty?: boolean;
  limit?: number;
  seeAllTo?: string;
  seeAllLabel?: string;
};

function productLabel(batch: ProductionBatchSummaryRead): string {
  return batch.product_labels?.slice(0, 2).join(", ") || "—";
}

function formatPlannedDate(raw?: string | null): string {
  if (!raw) return "—";
  const d = raw.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}.${m}.${y}`;
}

/** Full-width batch rows for Production dashboard work sections (max `limit`, then „Pokaż wszystkie”). */
export function ProductionDashboardBatchGrid({
  batches,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  plainEmpty = false,
  limit = 5,
  seeAllTo = erpProductionPaths.orders,
  seeAllLabel = "Pokaż wszystkie",
}: Props) {
  if (batches.length === 0) {
    if (plainEmpty) {
      return <p className="py-2 text-sm text-slate-600">{emptyTitle}</p>;
    }
    if (emptyIcon) {
      return (
        <AppEmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          density="inline"
        />
      );
    }
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const visible = batches.slice(0, limit);

  return (
    <div className="flex w-full flex-col gap-2">
      <ul className="flex w-full flex-col gap-2">
        {visible.map((b) => {
          const pct = Math.max(0, Math.min(100, b.progress_percent ?? 0));
          const href = erpProductionPaths.batch(b.id);
          const barTone = productionProgressTone(pct, b.status);
          return (
            <li key={b.id} className="w-full">
              <ListTile density="comfortable" className="w-full">
                <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold text-slate-900">{b.number}</p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-slate-600">{productLabel(b)}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusBadge tone={executionStatusTone(b.status)} density="compact">
                      {BATCH_STATUS_LABEL[b.status]}
                    </StatusBadge>
                    {b.has_shortages ? (
                      <StatusBadge tone="warning" density="compact">
                        Braki
                        {b.shortage_count != null && b.shortage_count > 0 ? ` (${b.shortage_count})` : ""}
                      </StatusBadge>
                    ) : null}
                  </div>

                  <div className="w-full min-w-0 space-y-1 lg:max-w-[14rem] lg:flex-1">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>Postęp</span>
                      <span className={`tabular-nums font-semibold ${toneTextClass[barTone]}`}>{pct}%</span>
                    </div>
                    <ProgressBar value={pct} tone={barTone} />
                  </div>

                  <div className="flex shrink-0 flex-col gap-0.5 text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-4 lg:flex-col lg:items-end xl:flex-row xl:items-center">
                    <span>
                      Termin:{" "}
                      <span className="tabular-nums font-medium text-slate-800">
                        {formatPlannedDate(b.planned_date)}
                      </span>
                    </span>
                  </div>

                  <div className="shrink-0 lg:ml-auto">
                    <Link to={href} className={secondaryButtonClassName("", "compact")}>
                      Otwórz
                    </Link>
                  </div>
                </div>
              </ListTile>
            </li>
          );
        })}
      </ul>
      {batches.length > 0 ? (
        <div className="pt-1 text-right">
          <Link to={seeAllTo} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            {seeAllLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
