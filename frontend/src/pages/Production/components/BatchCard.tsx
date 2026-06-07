import { Link } from "react-router-dom";
import { AlertTriangle, Play, ScanLine } from "lucide-react";
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

export function BatchCard({ batch, showActions = true, onStartCollecting, onContinue }: Props) {
  const status = batch.status as ProductionBatchRead["status"];

  const continueHref = () => {
    if (status === "collecting") return productionPaths.collecting(batch.id);
    if (status === "in_progress") return productionPaths.execute(batch.id);
    if (status === "putaway") return productionPaths.putaway(batch.id);
    return productionPaths.batch(batch.id);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <Link to={productionPaths.batch(batch.id)} className="font-mono text-base font-bold text-slate-900 hover:text-violet-700">
          {batch.number}
        </Link>
        <span className={batchStatusBadgeClass(status)}>{BATCH_STATUS_LABEL[status]}</span>
      </div>

      <p className="mt-2 text-sm text-slate-600 line-clamp-2">{productSummary(batch)}</p>
      <p className="mt-1 text-xs text-slate-500">
        {batch.products_count ?? 0} prod. · {batch.total_planned_units ?? 0} szt.
      </p>

      {batch.has_shortages ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Braki materiałów
        </p>
      ) : null}

      <div className="mt-4">
        <ProgressBar value={batch.progress_percent ?? 0} tone={batch.has_shortages ? "amber" : "violet"} />
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {batch.operator_name ?? "—"}
        {"created_at" in batch && batch.created_at ? ` · ${String(batch.created_at).slice(0, 10)}` : ""}
      </p>

      {showActions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={productionPaths.batch(batch.id)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Otwórz
          </Link>
          {(status === "draft" || status === "planned") && onStartCollecting ? (
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
