import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Calendar, Play, ScanLine } from "lucide-react";
import type { ProductionBatchRead, ProductionBatchSummaryRead } from "../../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "../productionUi";
import { priorityLabel, priorityStripe } from "../productionTheme";
import { productionPaths } from "../productionPaths";
import { OperatorAvatar } from "./OperatorAvatar";
import { ProductThumb } from "./ProductThumb";
import { ProgressBar } from "./ProgressBar";

type BatchLike = ProductionBatchRead | ProductionBatchSummaryRead;

type Props = {
  batch: BatchLike;
  showActions?: boolean;
  onStartCollecting?: (id: number) => void;
  onContinue?: (id: number, status: string) => void;
};

function productLines(batch: BatchLike): { name: string; qty: number; image?: string | null }[] {
  if ("lines" in batch && batch.lines?.length) {
    return batch.lines.slice(0, 3).map((l) => ({
      name: l.product_name ?? String(l.product_id),
      qty: l.planned_quantity,
      image: null,
    }));
  }
  const images = "product_image_urls" in batch ? batch.product_image_urls ?? [] : [];
  const labels = "product_labels" in batch ? batch.product_labels ?? [] : [];
  return labels.slice(0, 3).map((label, i) => {
    const m = label.match(/^(.+?)\s*×([\d.]+)/);
    return {
      name: m?.[1] ?? label,
      qty: m ? Number(m[2]) : 0,
      image: images[i] ?? images[0] ?? null,
    };
  });
}

export function BatchCard({ batch, showActions = true, onStartCollecting, onContinue }: Props) {
  const status = batch.status as ProductionBatchRead["status"];
  const priority = "priority" in batch ? batch.priority : undefined;
  const pLabel = priorityLabel(priority, batch.has_shortages);
  const stripe = priorityStripe(priority, batch.has_shortages);
  const plannedDate =
    ("planned_date" in batch && batch.planned_date) ||
    ("created_at" in batch && batch.created_at ? String(batch.created_at).slice(0, 10) : null);
  const lines = productLines(batch);
  const shortageCount = "shortage_count" in batch ? batch.shortage_count : batch.has_shortages ? 1 : 0;

  const continueHref = () => {
    if (status === "collecting") return productionPaths.collecting(batch.id);
    if (status === "in_progress") return productionPaths.execute(batch.id);
    if (status === "putaway") return productionPaths.putaway(batch.id);
    return productionPaths.batch(batch.id);
  };

  const primaryCta = () => {
    if (["collecting", "in_progress", "putaway"].includes(status)) {
      return { label: "Kontynuuj realizację", href: continueHref(), action: "continue" as const };
    }
    if ((status === "draft" || status === "planned") && !batch.has_shortages && onStartCollecting) {
      return { label: "Rozpocznij zbieranie", href: null, action: "collect" as const };
    }
    return { label: "Otwórz partię", href: productionPaths.batch(batch.id), action: "open" as const };
  };

  const cta = primaryCta();

  return (
    <article className="group relative flex overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition hover:border-violet-200 hover:shadow-lg hover:shadow-violet-100/50">
      <div className={`absolute left-0 top-0 h-full w-1.5 ${stripe}`} aria-hidden />

      <div className="flex flex-1 flex-col p-4 pl-5">
        <div className="flex items-start gap-3">
          <div className="flex -space-x-3">
            {lines.length > 0 ? (
              lines.map((ln, i) => (
                <ProductThumb
                  key={`${ln.name}-${i}`}
                  imageUrl={ln.image}
                  name={ln.name}
                  size="sm"
                  className="ring-2 ring-white"
                />
              ))
            ) : (
              <ProductThumb size="sm" className="ring-2 ring-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={productionPaths.batch(batch.id)}
                className="font-mono text-sm font-bold text-slate-900 hover:text-violet-700"
              >
                {batch.number}
              </Link>
              <span className={batchStatusBadgeClass(status)}>{BATCH_STATUS_LABEL[status]}</span>
            </div>
            {pLabel ? (
              <span className="mt-1 inline-block rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                {pLabel}
              </span>
            ) : null}
          </div>
        </div>

        <ul className="mt-3 space-y-1">
          {lines.length > 0 ? (
            lines.map((ln) => (
              <li key={ln.name} className="flex justify-between gap-2 text-sm">
                <span className="truncate font-medium text-slate-800">{ln.name}</span>
                <span className="shrink-0 tabular-nums text-slate-500">×{ln.qty || "—"}</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-slate-600">
              {batch.products_count ?? 0} produktów · {batch.total_planned_units ?? 0} szt.
            </li>
          )}
          {(batch.products_count ?? 0) > 3 ? (
            <li className="text-xs text-violet-600">+{(batch.products_count ?? 0) - 3} więcej produktów</li>
          ) : null}
        </ul>

        {batch.has_shortages ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200/80">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Braki materiałów{shortageCount > 0 ? ` (${shortageCount})` : ""}
          </p>
        ) : null}

        <div className="mt-4">
          <ProgressBar
            value={batch.progress_percent ?? 0}
            label="Postęp partii"
            tone={batch.has_shortages ? "amber" : status === "completed" ? "emerald" : "violet"}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2 min-w-0">
            <OperatorAvatar name={batch.operator_name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-700">{batch.operator_name ?? "Nieprzypisany"}</p>
              {plannedDate ? (
                <p className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Calendar className="h-3 w-3" aria-hidden />
                  {plannedDate}
                </p>
              ) : null}
            </div>
          </div>
          <p className="text-right text-xs font-semibold tabular-nums text-slate-500">
            {batch.total_planned_units ?? 0} szt.
          </p>
        </div>

        {showActions ? (
          <div className="mt-4">
            {cta.action === "collect" ? (
              <button
                type="button"
                onClick={() => onStartCollecting?.(batch.id)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:from-amber-600 hover:to-orange-600"
              >
                <ScanLine className="h-4 w-4" aria-hidden />
                {cta.label}
              </button>
            ) : (
              <Link
                to={cta.href ?? productionPaths.batch(batch.id)}
                onClick={() => cta.action === "continue" && onContinue?.(batch.id, status)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:from-violet-700 hover:to-indigo-700"
              >
                {cta.action === "continue" ? <Play className="h-4 w-4" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
                {cta.label}
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
