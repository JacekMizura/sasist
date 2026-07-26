import { Link } from "react-router-dom";
import { FileText, Monitor, XCircle } from "lucide-react";

import type { ProductionBatchRead, ProductionOrderRead } from "@/api/productionApi";
import type { TimelinePwDocument } from "@/modules/production/productionExecutionTimeline";
import { currentExecutionPhaseLabel } from "@/modules/production/productionExecutionTimeline";
import { PRODUCTION_KIND_LABEL, type ProductionExecutionKind } from "@/modules/production/productionExecutionTypes";
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  primaryButtonClassName,
  typography,
} from "@/design-system";
import { wmsProductionPaths } from "../productionPaths";
import { ProgressBar } from "./ProgressBar";
import { ProductionExecutionTimeline } from "./ProductionExecutionTimeline";
import { formatProductionMoney } from "../productionUi";
import {
  ProductionDocumentsSection,
  pwDocumentsFromBatchLines,
  pwDocumentsFromOrder,
  type ProductionPwDocumentRow,
} from "./ProductionDocumentsSection";

export type ProductionMonitoringActions = {
  onReleaseToWms?: () => void;
  onStartErpExecution?: () => void;
  onPrintProductionCard?: () => void;
  onOpenErpExecution?: () => void;
  onCancel?: () => void;
  releaseDisabled?: boolean;
  releaseDisabledReason?: string;
  erpDisabled?: boolean;
  erpDisabledReason?: string;
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
  is_erp_interface?: boolean;
  execution_interface?: string | null;
  released_to_wms_at?: string | null;
  started_at?: string | null;
  collecting_completed_at?: string | null;
  production_completed_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  calculated_unit_cost?: number | null;
  display_unit_cost?: number | null;
  rw_stock_document_id?: number | null;
  pw_stock_document_id?: number | null;
  rw_document_number?: string | null;
  pw_document_number?: string | null;
  pw_documents?: TimelinePwDocument[];
  pw_document_rows?: ProductionPwDocumentRow[];
};

type Props = {
  kind: ProductionExecutionKind;
  source: MonitoringSource;
  actions?: ProductionMonitoringActions;
  /** When false, omit action toolbar (e.g. actions already in PageHeader). Default true. */
  showActions?: boolean;
};

function wmsTerminalHref(kind: ProductionExecutionKind, id: number, status: string): string {
  const s = status.toLowerCase();
  if (s === "collecting") return wmsProductionPaths.collecting(kind, id);
  if (s === "in_progress") return wmsProductionPaths.execute(kind, id);
  if (s === "awaiting_putaway" || s === "putaway") return wmsProductionPaths.putaway(kind, id);
  return wmsProductionPaths.collecting();
}

function batchPwFromLines(batch: ProductionBatchRead): Pick<
  MonitoringSource,
  "pw_stock_document_id" | "pw_document_number" | "pw_documents"
> {
  const linesWithPw = (batch.lines ?? []).filter((ln) => ln.pw_stock_document_id != null);
  if (linesWithPw.length === 0) {
    return { pw_stock_document_id: undefined, pw_document_number: undefined, pw_documents: [] };
  }
  const pw_documents: TimelinePwDocument[] = linesWithPw.map((ln) => ({
    id: ln.pw_stock_document_id!,
    number: ln.pw_document_number,
  }));
  const first = linesWithPw[0];
  return {
    pw_stock_document_id: first.pw_stock_document_id ?? undefined,
    pw_document_number: first.pw_document_number ?? undefined,
    pw_documents,
  };
}

function interfaceLabel(source: MonitoringSource): string {
  if (source.is_erp_interface) return "Tryb papierowy";
  if (source.is_released_to_wms) return "WMS";
  const raw = String(source.execution_interface || "").trim().toLowerCase();
  if (!raw || raw === "none") return "—";
  if (raw.includes("erp") || raw.includes("paper")) return "Tryb papierowy";
  if (raw.includes("wms")) return "WMS";
  return source.execution_interface ?? "—";
}

export function ProductionMonitoringPanel({ kind, source, actions, showActions = true }: Props) {
  const status = String(source.status || "draft");
  const planned = source.planned_quantity ?? source.total_planned_units ?? 0;
  const completed = source.produced_quantity ?? source.total_completed_units ?? 0;
  const progress = source.progress_percent ?? (planned > 0 ? (completed / planned) * 100 : 0);
  const canRelease =
    (status === "draft" || status === "planned") &&
    !source.is_released_to_wms &&
    !source.is_erp_interface &&
    actions?.onReleaseToWms;
  const canStartErp =
    (status === "draft" || status === "planned") &&
    !source.is_released_to_wms &&
    !source.is_erp_interface &&
    actions?.onStartErpExecution;
  const canPrintCard = Boolean(actions?.onPrintProductionCard);
  const canOpenWms =
    !source.is_erp_interface &&
    (source.is_released_to_wms ||
      ["collecting", "in_progress", "awaiting_putaway", "putaway"].includes(status));
  const canOpenErp =
    source.is_erp_interface &&
    (actions?.onOpenErpExecution || ["collecting", "in_progress", "awaiting_putaway", "putaway"].includes(status));
  const canCancel =
    actions?.onCancel &&
    !["completed", "cancelled", "awaiting_putaway", "putaway"].includes(status);
  const pwDocs =
    source.pw_document_rows ??
    source.pw_documents?.map((pw) => ({
      id: pw.id,
      number: pw.number,
    })) ??
    (source.pw_stock_document_id
      ? [{ id: source.pw_stock_document_id, number: source.pw_document_number }]
      : []);
  const unitCost = source.display_unit_cost ?? source.calculated_unit_cost;

  return (
    <div className="space-y-4">
      {showActions ? (
        <div className="flex flex-wrap gap-2">
          {canPrintCard ? (
            <SecondaryButton
              type="button"
              disabled={actions?.busy}
              onClick={actions?.onPrintProductionCard}
              className="inline-flex items-center gap-1.5"
            >
              <FileText className="h-4 w-4" aria-hidden />
              Drukuj kartę
            </SecondaryButton>
          ) : null}
          {canRelease ? (
            <SecondaryButton
              type="button"
              disabled={actions?.busy || actions?.releaseDisabled}
              title={actions?.releaseDisabled ? actions.releaseDisabledReason : undefined}
              onClick={actions?.onReleaseToWms}
            >
              Wydaj do WMS
            </SecondaryButton>
          ) : null}
          {canStartErp ? (
            <PrimaryButton
              type="button"
              disabled={actions?.busy || actions?.erpDisabled}
              title={actions?.erpDisabled ? actions.erpDisabledReason : undefined}
              onClick={actions?.onStartErpExecution}
            >
              Rozpocznij produkcję
            </PrimaryButton>
          ) : null}
          {canOpenWms ? (
            <Link
              to={wmsTerminalHref(kind, source.id, status)}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryButtonClassName("inline-flex items-center gap-1.5")}
            >
              <Monitor className="h-4 w-4" aria-hidden />
              Przejdź do realizacji
            </Link>
          ) : null}
          {canOpenErp && actions?.onOpenErpExecution ? (
            <PrimaryButton type="button" disabled={actions?.busy} onClick={actions.onOpenErpExecution}>
              Przejdź do realizacji
            </PrimaryButton>
          ) : null}
          {canCancel ? (
            <SecondaryButton
              type="button"
              disabled={actions?.busy}
              onClick={actions?.onCancel}
              className="inline-flex items-center gap-1.5"
            >
              <XCircle className="h-4 w-4" aria-hidden />
              Anuluj
            </SecondaryButton>
          ) : null}
        </div>
      ) : null}

      <Card variant="section" density="comfortable" className="space-y-3">
        <h3 className={typography.section}>Informacje</h3>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <InfoRow label="Status" value={currentExecutionPhaseLabel(status)} />
          <InfoRow label="Typ" value={PRODUCTION_KIND_LABEL[kind]} />
          <InfoRow label="Operator" value={source.operator_name ?? "—"} />
          <InfoRow label="Rozpoczęcie" value={source.started_at ? formatTs(source.started_at) : "—"} />
          <InfoRow label="Plan zakończenia" value="—" />
          <InfoRow label="Interfejs" value={interfaceLabel(source)} />
          {source.production_completed_at ? (
            <InfoRow label="Koniec produkcji" value={formatTs(source.production_completed_at)} />
          ) : null}
          {unitCost != null ? (
            <InfoRow label="Koszt jednostkowy" value={formatProductionMoney(unitCost)} />
          ) : null}
        </dl>
      </Card>

      <Card variant="section" density="comfortable" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className={typography.section}>Postęp</h3>
            <p className="mt-1 text-sm text-slate-600">
              <span className="text-lg font-semibold tabular-nums text-slate-900">{completed}</span>
              {" / "}
              <span className="text-lg font-semibold tabular-nums text-slate-900">{planned}</span>
              {" szt."}
            </p>
          </div>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{Math.round(progress)}%</p>
        </div>
        <ProgressBar value={progress} tone="orange" size="lg" />
        {source.collection_progress_percent != null && status === "collecting" ? (
          <ProgressBar
            value={source.collection_progress_percent}
            max={100}
            label={`Zbieranie · ${Math.round(source.collection_progress_percent)}%`}
            tone="amber"
            size="lg"
          />
        ) : null}
      </Card>

      {(source.rw_stock_document_id || pwDocs.length > 0) && (
        <ProductionDocumentsSection
          rwDocumentId={source.rw_stock_document_id}
          rwDocumentNumber={source.rw_document_number}
          pwDocuments={pwDocs}
        />
      )}

      <Card variant="section" density="comfortable" className="space-y-2">
        <h3 className={typography.section}>Przebieg produkcji</h3>
        <ProductionExecutionTimeline source={source} />
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={typography.caption}>{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
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
    is_erp_interface: order.is_erp_interface,
    execution_interface: order.execution_interface,
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
    pw_document_rows: pwDocumentsFromOrder(order),
  };
}

export function batchMonitoringSource(batch: ProductionBatchRead): MonitoringSource {
  const pwRows = pwDocumentsFromBatchLines(batch.lines ?? []);
  const pw = batchPwFromLines(batch);
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
    is_erp_interface: batch.is_erp_interface,
    execution_interface: batch.execution_interface,
    released_to_wms_at: batch.released_to_wms_at,
    started_at: batch.started_at,
    collecting_completed_at: batch.collecting_completed_at,
    production_completed_at: batch.production_completed_at,
    completed_at: batch.completed_at,
    created_at: batch.created_at,
    display_unit_cost: batch.display_unit_cost,
    rw_stock_document_id: batch.rw_stock_document_id,
    rw_document_number: batch.rw_document_number,
    pw_document_rows: pwRows,
    ...pw,
  };
}
