import { Link } from "react-router-dom";
import { AlertTriangle, Calendar, Play, ScanLine, User } from "lucide-react";
import type { ProductionBatchRead, ProductionBatchSummaryRead } from "../../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "../productionUi";
import { productionPaths } from "../productionPaths";
import { ProgressBar } from "./ProgressBar";

type BatchLike = ProductionBatchRead | ProductionBatchSummaryRead;

type Props = {
  batch: BatchLike;
  showActions?: boolean;
  onStartCollecting?: (id: number) => void;
  onContinue?: (id: number, status: string) => void;
};

function productSummary(batch: BatchLike): string {
  if ("product_labels" in batch && batch.product_labels?.length) {
    return batch.product_labels.join(", ");
  }
  if ("lines" in batch && batch.lines?.length) {
    return batch.lines.map((l) => `${l.product_name ?? l.product_id} ×${l.planned_quantity}`).join(", ");
  }
  return `${batch.products_count ?? 0} produktów`;
}

function priorityLabel(priority?: string | null): string | null {
  if (!priority || priority === "normal") return null;
  if (priority === "high") return "Wysoki";
  return priority;
}

export function BatchCard({ batch, showActions = true, onStartCollecting, onContinue }: Props) {
  const status = batch.status as ProductionBatchRead["status"];
  const priority = "priority" in batch ? priorityLabel(batch.priority) : null;
  const plannedDate =
    ("planned_date" in batch && batch.planned_date) ||
    ("created_at" in batch && batch.created_at ? String(batch.created_at).slice(0, 10) : null);

  const continueHref = () => {
    if (status === "collecting") return productionPaths.collecting(batch.id);
    if (status === "in_progress") return productionPaths.execute(batch.id);
    if (status === "putaway") return productionPaths.putaway(batch.id);
    return productionPaths.batch(batch.id);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={productionPaths.batch(batch.id)}
          className="font-mono text-base font-bold text-slate-900 hover:text-violet-700"
        >
          {batch.number}
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {priority ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-800">
              {priority}
            </span>
          ) : null}
          <span className={batchStatusBadgeClass(status)}>{BATCH_STATUS_LABEL[status]}</span>
        </div>
      </div>

      <p className="mt-2 text-sm font-medium text-slate-700 line-clamp-2">{productSummary(batch)}</p>
      <p className="mt-1 text-xs text-slate-500">
        {batch.products_count ?? 0} prod. · {batch.total_planned_units ?? 0} szt. planowane
      </p>

      {batch.has_shortages ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Braki materiałów
        </p>
      ) : null}

      <div className="mt-3">
        <ProgressBar value={batch.progress_percent ?? 0} tone={batch.has_shortages ? "amber" : "violet"} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <User className="h-3.5 w-3.5" aria-hidden />
          {batch.operator_name ?? "Nieprzypisany"}
        </span>
        {plannedDate ? (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            {plannedDate}
          </span>
        ) : null}
      </div>

      {showActions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={productionPaths.batch(batch.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Szczegóły
          </Link>
          {(status === "draft" || status === "planned") && onStartCollecting && !batch.has_shortages ? (
            <button
              type="button"
              onClick={() => onStartCollecting(batch.id)}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              <ScanLine className="h-3.5 w-3.5" aria-hidden />
              Zbieranie
            </button>
          ) : null}
          {["collecting", "in_progress", "putaway"].includes(status) ? (
            <Link
              to={continueHref()}
              onClick={() => onContinue?.(batch.id, status)}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              Kontynuuj
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
