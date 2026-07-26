import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ProductionBatchSummaryRead } from "@/api/productionApi";
import { AppEmptyState } from "@/components/app-shell";
import {
  Card,
  ProgressBar,
  StatusBadge,
  primaryButtonClassName,
  secondaryButtonClassName,
  type StatusTone,
} from "@/design-system";

import { erpProductionPaths } from "../productionPaths";
import { BATCH_STATUS_LABEL } from "../productionUi";

type Props = {
  batches: ProductionBatchSummaryRead[];
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  limit?: number;
  /** Primary row action label (default: Otwórz). */
  actionLabel?: string;
  /** Optional custom action href per batch (default: batch detail). */
  actionHref?: (batch: ProductionBatchSummaryRead) => string;
  /** Visual weight of the action control. */
  actionVariant?: "primary" | "secondary";
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

function statusTone(batch: ProductionBatchSummaryRead): StatusTone {
  if (batch.has_shortages) return "danger";
  switch (batch.status) {
    case "completed":
    case "awaiting_putaway":
      return "success";
    case "in_progress":
    case "collecting":
    case "putaway":
      return "info";
    case "planned":
    case "draft":
      return "neutral";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

function progressTone(
  batch: ProductionBatchSummaryRead
): "success" | "warning" | "danger" | "neutral" | "info" {
  if (batch.has_shortages) return "danger";
  const pct = batch.progress_percent ?? 0;
  if (pct >= 100 || batch.status === "completed" || batch.status === "awaiting_putaway") {
    return "success";
  }
  if (batch.status === "in_progress" || batch.status === "collecting" || batch.status === "putaway") {
    return "info";
  }
  if (pct > 0 && pct < 40) return "warning";
  return "neutral";
}

export function ProductionDashboardBatchGrid({
  batches,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  limit = 6,
  actionLabel = "Otwórz",
  actionHref,
  actionVariant = "secondary",
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

  const btnClass =
    actionVariant === "primary"
      ? primaryButtonClassName("w-full justify-center", "compact")
      : secondaryButtonClassName("w-full justify-center", "compact");

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {batches.slice(0, limit).map((b) => {
        const pct = Math.max(0, Math.min(100, b.progress_percent ?? 0));
        const href = actionHref?.(b) ?? erpProductionPaths.batch(b.id);
        return (
          <Card key={b.id} variant="section" density="comfortable" className="flex flex-col gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold text-slate-900">{b.number}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{productLabel(b)}</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>Postęp</span>
                <span className="tabular-nums font-medium text-slate-700">{pct}%</span>
              </div>
              <ProgressBar value={pct} tone={progressTone(b)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={statusTone(b)} density="compact">
                {BATCH_STATUS_LABEL[b.status]}
              </StatusBadge>
              {b.has_shortages ? (
                <StatusBadge tone="danger" density="compact">
                  Braki{b.shortage_count != null && b.shortage_count > 0 ? ` (${b.shortage_count})` : ""}
                </StatusBadge>
              ) : null}
            </div>

            <dl className="space-y-1 text-xs text-slate-500">
              <div className="flex justify-between gap-2">
                <dt>Plan zakończenia</dt>
                <dd className="tabular-nums text-slate-700">{formatPlannedDate(b.planned_date)}</dd>
              </div>
              {b.operator_name ? (
                <div className="flex justify-between gap-2">
                  <dt>Operator</dt>
                  <dd className="truncate text-slate-700">{b.operator_name}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-auto pt-1">
              <Link to={href} className={btnClass}>
                {actionLabel}
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
