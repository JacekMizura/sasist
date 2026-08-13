import { useMemo } from "react";

import type { ProductionBatchRead, ProductionOrderRead } from "@/api/productionApi";
import type { TimelinePwDocument } from "@/modules/production/productionExecutionTimeline";
import { currentExecutionPhaseLabel } from "@/modules/production/productionExecutionTimeline";
import { PRODUCTION_KIND_LABEL, type ProductionExecutionKind } from "@/modules/production/productionExecutionTypes";
import { Card, StatusBadge, typography } from "@/design-system";
import { wmsProductionPaths } from "../productionPaths";
import {
  getProductionOperationalState,
  resolveProductionSecondaryActions,
  type ProductionOperationalStateInput,
  type ProductionSecondaryActionId,
} from "../productionOperationalState";
import { formatProductionMoney } from "../productionUi";
import { ProgressBar } from "./ProgressBar";
import { ProductionContextBanner } from "./ProductionContextBanner";
import { ProductionExecutionTimeline } from "./ProductionExecutionTimeline";
import { ProductionPrimaryActionBar } from "./ProductionPrimaryActionBar";
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
  onStartPrintExecution?: () => void;
  onOpenErpExecution?: () => void;
  onCancel?: () => void;
  releaseDisabled?: boolean;
  releaseDisabledReason?: string;
  erpDisabled?: boolean;
  erpDisabledReason?: string;
  printStartDisabled?: boolean;
  printStartDisabledReason?: string;
  busy?: boolean;
  /** When true, hide primary/secondary CTA bar (actions already in parent header). */
  hideActionBar?: boolean;
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
  materials_reserved?: boolean;
  is_released_to_wms?: boolean;
  is_erp_interface?: boolean;
  is_print_interface?: boolean;
  production_execution_method?: "WMS" | "PRINT" | null;
  source_type?: string | null;
  source_order_count?: number;
  source_requested_quantity_total?: number;
  source_shortage_quantity_total?: number;
  source_shortage_count?: number;
  source_fulfilled_order_count?: number;
  shortage_component_hint?: string | null;
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
  /** Show contextual “Co dalej?” banner above actions. Default true. */
  showContextBanner?: boolean;
};

function wmsTerminalHref(kind: ProductionExecutionKind, id: number, status: string): string {
  const s = status.toLowerCase();
  if (s === "collecting") return wmsProductionPaths.collecting(kind, id);
  if (s === "in_progress") return wmsProductionPaths.execute(kind, id);
  if (s === "awaiting_putaway" || s === "putaway") return wmsProductionPaths.putaway(kind, id);
  return wmsProductionPaths.collecting(kind, id);
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
  const raw = String(source.execution_interface || "").trim().toUpperCase();
  if (raw === "PRINT") return "Wydruk";
  if (source.is_released_to_wms) return "Terminal WMS";
  if (!raw || raw === "NONE") return "—";
  if (raw.includes("ERP") || raw.includes("PAPER")) return "Tryb papierowy";
  if (raw.includes("WMS")) return "Terminal WMS";
  return source.execution_interface ?? "—";
}

function toNextInput(kind: ProductionExecutionKind, source: MonitoringSource): ProductionOperationalStateInput {
  return {
    executionKind: kind,
    id: source.id,
    status: source.status,
    sourceType: source.source_type,
    hasShortages: source.has_shortages,
    materialsReserved: source.materials_reserved,
    isReleasedToWms: source.is_released_to_wms,
    isErpInterface: source.is_erp_interface,
    isPrintInterface: source.is_print_interface,
    productionExecutionMethod: source.production_execution_method,
    producedQuantity: source.produced_quantity ?? source.total_completed_units,
    plannedQuantity: source.planned_quantity ?? source.total_planned_units,
    collectionProgressPercent: source.collection_progress_percent,
    progressPercent: source.progress_percent,
    sourceOrderCount: source.source_order_count,
    sourceRequestedQuantityTotal: source.source_requested_quantity_total,
    sourceShortageQuantityTotal: source.source_shortage_quantity_total,
    sourceShortageCount: source.source_shortage_count,
    sourceFulfilledOrderCount: source.source_fulfilled_order_count,
    shortageComponentHint: source.shortage_component_hint,
  };
}

export function ProductionMonitoringPanel({
  kind,
  source,
  actions,
  showActions = true,
  showContextBanner = true,
}: Props) {
  const status = String(source.status || "draft");
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

  const nextInput = useMemo(() => toNextInput(kind, source), [kind, source]);
  const operational = useMemo(() => getProductionOperationalState(nextInput), [nextInput]);
  const primary = operational.primaryAction;
  const secondary = useMemo(
    () => resolveProductionSecondaryActions(nextInput, operational),
    [nextInput, operational],
  );

  const handlePrimary = () => {
    switch (primary.kind) {
      case "send_to_execution":
        actions?.onReleaseToWms?.();
        break;
      case "start_print_execution":
        actions?.onStartPrintExecution?.();
        break;
      case "continue_collecting":
      case "continue_production":
      case "start_collecting":
      case "putaway":
        if (source.is_erp_interface || String(source.execution_interface || "").toUpperCase() === "PRINT") {
          actions?.onOpenErpExecution?.();
        }
        break;
      default:
        break;
    }
  };

  const needsPrimaryHandler =
    primary.kind === "send_to_execution" ||
    primary.kind === "start_print_execution" ||
    ((primary.kind === "continue_collecting" ||
      primary.kind === "continue_production" ||
      primary.kind === "start_collecting" ||
      primary.kind === "putaway") &&
      (source.is_erp_interface || String(source.execution_interface || "").toUpperCase() === "PRINT"));

  const handleSecondary = (id: ProductionSecondaryActionId) => {
    switch (id) {
      case "print_card":
      case "preview_print":
        actions?.onPrintProductionCard?.();
        break;
      case "start_paper":
        actions?.onStartErpExecution?.();
        break;
      case "open_erp":
        actions?.onOpenErpExecution?.();
        break;
      case "open_wms":
        window.open(wmsTerminalHref(kind, source.id, status), "_blank", "noopener,noreferrer");
        break;
      case "cancel":
        actions?.onCancel?.();
        break;
    }
  };

  const showBar = showActions && !actions?.hideActionBar;

  return (
    <div className="space-y-4">
      {showContextBanner || showBar ? (
        <ProductionContextBanner
          message={operational.description}
          tone={operational.tone}
          action={
            showBar ? (
              <ProductionPrimaryActionBar
                primary={{
                  kind: primary.kind,
                  label: primary.label,
                  contextMessage: operational.description,
                  tone: operational.tone,
                  disabled: primary.disabled,
                  disabledReason: primary.disabledReason,
                  href: primary.href,
                  openInNewTab: primary.openInNewTab,
                }}
                secondary={secondary.filter((s) => {
                  if (s.id === "print_card" || s.id === "preview_print") {
                    return Boolean(actions?.onPrintProductionCard);
                  }
                  if (s.id === "start_paper") return Boolean(actions?.onStartErpExecution);
                  if (s.id === "open_erp") return Boolean(actions?.onOpenErpExecution);
                  if (s.id === "cancel") return Boolean(actions?.onCancel);
                  return true;
                })}
                busy={actions?.busy}
                onPrimaryClick={needsPrimaryHandler ? handlePrimary : undefined}
                onSecondary={handleSecondary}
              />
            ) : undefined
          }
        />
      ) : null}

      <Card variant="section" density="comfortable" className="space-y-3">
        <h3 className={typography.section}>Informacje</h3>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <InfoRow label="Status" value={currentExecutionPhaseLabel(status)} />
          <InfoRow label="Typ" value={PRODUCTION_KIND_LABEL[kind]} />
          <InfoRow label="Operator" value={source.operator_name ?? "—"} />
          <InfoRow label="Rozpoczęcie" value={source.started_at ? formatTs(source.started_at) : "—"} />
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
            <p className="mt-1 text-sm text-slate-600">{operational.progressMeaning.displayLine}</p>
            {operational.progressMeaning.nextStepHint ? (
              <p className="mt-1 text-xs font-medium text-orange-800">
                {operational.progressMeaning.nextStepHint}
              </p>
            ) : null}
          </div>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {operational.progressMeaning.percent}%
          </p>
        </div>
        <ProgressBar value={operational.progressMeaning.percent} tone="orange" size="lg" />
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={typography.section}>Przebieg produkcji</h3>
          <StatusBadge tone="primary" density="compact">
            Aktualny: {currentExecutionPhaseLabel(status)}
          </StatusBadge>
        </div>
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
  const shortageLine = (order.lines ?? []).find((ln) => Number(ln.missing ?? 0) > 0);
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
    materials_reserved: order.materials_reserved,
    is_released_to_wms: order.is_released_to_wms,
    is_erp_interface: order.is_erp_interface,
    is_print_interface: order.is_print_interface,
    production_execution_method: order.production_execution_method,
    source_type: order.source_type,
    source_order_count: order.source_order_count,
    source_requested_quantity_total: order.source_requested_quantity_total,
    source_shortage_quantity_total: order.source_shortage_quantity_total,
    source_shortage_count: order.source_shortage_count,
    source_fulfilled_order_count: order.source_fulfilled_order_count,
    shortage_component_hint: shortageLine?.product_name_snapshot ?? null,
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
