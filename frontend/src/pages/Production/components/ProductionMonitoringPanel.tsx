import { Link } from "react-router-dom";
import { ExternalLink, Monitor, Package, XCircle } from "lucide-react";

import type { ProductionBatchRead, ProductionOrderRead } from "@/api/productionApi";
import { currentExecutionPhaseLabel } from "@/modules/production/productionExecutionTimeline";
import { PRODUCTION_KIND_LABEL, type ProductionExecutionKind } from "@/modules/production/productionExecutionTypes";
import { wmsProductionPaths } from "../productionPaths";
import { ProgressBar } from "./ProgressBar";
import { ProductionExecutionTimeline } from "./ProductionExecutionTimeline";
import { formatProductionMoney } from "../productionUi";

export type ProductionMonitoringActions = {
  onReleaseToWms?: () => void;
  onCancel?: () => void;
  releaseDisabled?: boolean;
  releaseDisabledReason?: string;
  busy?: boolean;
};

type MonitoringSource = {
  id: number;
  status: string;
  number: string;
  planned_quantity?: number;
  produced_quantity?: number;
  total_planned_units?: number;
  total_completed_units?: number;
  progress_percent?: number;
  collection_progress_percent?: number;
  operator_name?: string | null;
  has_shortages?: boolean;
  is_released_to_wms?: boolean;
  released_to_wms_at?: string | null;
  started_at?: string | null;
  collecting_completed_at?: string | null;
  production_completed_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  calculated_unit_cost?: number | null;
  rw_stock_document_id?: number | null;
  pw_stock_document_id?: number | null;
  rw_document_number?: string | null;
  pw_document_number?: string | null;
};

type Props = {
  kind: ProductionExecutionKind;
  source: MonitoringSource;
  actions?: ProductionMonitoringActions;
};

function wmsTerminalHref(kind: ProductionExecutionKind, id: number, status: string): string {
  const s = status.toLowerCase();
  if (s === "collecting") return wmsProductionPaths.collecting(kind, id);
  if (s === "in_progress") return wmsProductionPaths.execute(kind, id);
  if (s === "putaway") return wmsProductionPaths.putaway(kind, id);
  return wmsProductionPaths.collecting();
}

export function ProductionMonitoringPanel({ kind, source, actions }: Props) {
  const status = String(source.status || "draft");
  const planned = source.planned_quantity ?? source.total_planned_units ?? 0;
  const completed = source.produced_quantity ?? source.total_completed_units ?? 0;
  const progress = source.progress_percent ?? (planned > 0 ? (completed / planned) * 100 : 0);
  const canRelease =
    (status === "draft" || status === "planned") && !source.is_released_to_wms && actions?.onReleaseToWms;
  const canOpenWms =
    source.is_released_to_wms || ["collecting", "in_progress", "putaway"].includes(status);
  const canCancel = actions?.onCancel && status !== "completed" && status !== "cancelled";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {canRelease ? (
          <button
            type="button"
            disabled={actions?.busy || actions?.releaseDisabled}
            title={actions?.releaseDisabled ? actions.releaseDisabledReason : undefined}
            onClick={actions?.onReleaseToWms}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Wydaj do WMS
          </button>
        ) : source.is_released_to_wms ? (
          <span className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
            Wydane do WMS
            {source.released_to_wms_at
              ? ` · ${formatTs(source.released_to_wms_at)}`
              : ""}
          </span>
        ) : null}
        {canOpenWms ? (
          <Link
            to={wmsTerminalHref(kind, source.id, status)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <Monitor className="h-4 w-4" aria-hidden />
            Otwórz w terminalu WMS
          </Link>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            disabled={actions?.busy}
            onClick={actions?.onCancel}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" aria-hidden />
            Anuluj
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetaCard label="Aktualna faza" value={currentExecutionPhaseLabel(status)} />
        <MetaCard label="Typ" value={PRODUCTION_KIND_LABEL[kind]} />
        <MetaCard label="Operator" value={source.operator_name ?? "—"} />
        <MetaCard label="Rozpoczęcie" value={source.started_at ? formatTs(source.started_at) : "—"} />
        <MetaCard
          label="Koniec zbierania"
          value={source.collecting_completed_at ? formatTs(source.collecting_completed_at) : "—"}
        />
        <MetaCard
          label="Koniec produkcji"
          value={source.production_completed_at ? formatTs(source.production_completed_at) : "—"}
        />
        <MetaCard
          label="Odłożenie / zamknięcie"
          value={source.completed_at ? formatTs(source.completed_at) : "—"}
        />
        {source.calculated_unit_cost != null ? (
          <MetaCard label="Koszt jednostkowy" value={formatProductionMoney(source.calculated_unit_cost)} />
        ) : null}
      </div>

      <div className="space-y-3">
        <ProgressBar value={progress} label={`Postęp ogólny · ${Math.round(progress)}%`} tone="violet" />
        {source.collection_progress_percent != null && status === "collecting" ? (
          <ProgressBar
            value={source.collection_progress_percent}
            max={100}
            label={`Postęp zbierania · ${Math.round(source.collection_progress_percent)}%`}
            tone="amber"
          />
        ) : null}
        <p className="text-sm text-slate-600">
          Wykonano <strong className="tabular-nums">{completed}</strong>
          {" / "}
          <strong className="tabular-nums">{planned}</strong> szt.
        </p>
      </div>

      {(source.rw_stock_document_id || source.pw_stock_document_id) && (
        <div className="flex flex-wrap gap-3">
          {source.rw_stock_document_id ? (
            <DocLink
              id={source.rw_stock_document_id}
              label={`RW ${source.rw_document_number ?? source.rw_stock_document_id}`}
            />
          ) : null}
          {source.pw_stock_document_id ? (
            <DocLink
              id={source.pw_stock_document_id}
              label={`PW ${source.pw_document_number ?? source.pw_stock_document_id}`}
            />
          ) : null}
        </div>
      )}

      <section>
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Przebieg produkcji</h3>
        <ProductionExecutionTimeline source={source} />
      </section>
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function DocLink({ id, label }: { id: number; label: string }) {
  return (
    <Link
      to={`/documents/warehouse?doc=${id}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-violet-200 hover:text-violet-800"
    >
      <Package className="h-4 w-4 text-slate-400" aria-hidden />
      {label}
      <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden />
    </Link>
  );
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function orderMonitoringSource(order: ProductionOrderRead): MonitoringSource {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    planned_quantity: order.planned_quantity,
    produced_quantity: order.produced_quantity,
    progress_percent: order.progress_percent,
    collection_progress_percent: order.collection_progress_percent,
    operator_name: order.operator_name,
    has_shortages: order.has_shortages,
    is_released_to_wms: order.is_released_to_wms,
    released_to_wms_at: order.released_to_wms_at,
    started_at: order.started_at,
    collecting_completed_at: order.collecting_completed_at,
    production_completed_at: order.production_completed_at,
    completed_at: order.completed_at,
    created_at: order.created_at,
    calculated_unit_cost: order.calculated_unit_cost,
    rw_stock_document_id: order.rw_stock_document_id,
    pw_stock_document_id: order.pw_stock_document_id,
    rw_document_number: order.rw_document_number,
    pw_document_number: order.pw_document_number,
  };
}

export function batchMonitoringSource(batch: ProductionBatchRead): MonitoringSource {
  return {
    id: batch.id,
    number: batch.number,
    status: batch.status,
    total_planned_units: batch.total_planned_units,
    total_completed_units: batch.total_completed_units,
    progress_percent: batch.progress_percent,
    collection_progress_percent: batch.collection_progress_percent,
    operator_name: batch.operator_name,
    has_shortages: batch.has_shortages,
    is_released_to_wms: batch.is_released_to_wms,
    released_to_wms_at: batch.released_to_wms_at,
    started_at: batch.started_at,
    collecting_completed_at: batch.collecting_completed_at,
    production_completed_at: batch.production_completed_at,
    completed_at: batch.completed_at,
    created_at: batch.created_at,
    rw_stock_document_id: batch.rw_stock_document_id,
    pw_stock_document_id: undefined,
    rw_document_number: batch.rw_document_number,
    pw_document_number: undefined,
  };
}
