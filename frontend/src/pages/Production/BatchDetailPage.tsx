import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Monitor, XCircle } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  openBatchProductionCardPdf,
  cancelProductionBatch,
  fetchBatchPickPlan,
  getProductionBatch,
  releaseBatchToWms,
  startErpExecutionBatch,
  type ProductionBatchPickPlanRead,
  type ProductionBatchRead,
  type ProductionBatchStatus,
} from "../../api/productionApi";
import {
  Card,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  primaryButtonClassName,
  secondaryButtonClassName,
  typography,
  type StatusTone,
} from "@/design-system";
import { DocumentMaterialReservationsPanel } from "./components/DocumentMaterialReservationsPanel";
import {
  batchMonitoringSource,
  ProductionMonitoringPanel,
} from "./components/ProductionMonitoringPanel";
import {
  batchHasMaterialShortages,
  START_COLLECTING_BLOCKED_TOOLTIP,
  BATCH_STATUS_LABEL,
  stockTone,
  STOCK_TONE_CLASS,
  formatStartCollectingError,
} from "./productionUi";
import { ProductThumb } from "./components/ProductThumb";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";

const DEFAULT_TENANT = 1;

function batchStatusTone(status: ProductionBatchStatus): StatusTone {
  switch (status) {
    case "completed":
    case "putaway":
    case "awaiting_putaway":
      return "success";
    case "in_progress":
    case "collecting":
      return "info";
    case "planned":
      return "neutral";
    case "cancelled":
      return "danger";
    case "draft":
    default:
      return "warning";
  }
}

function wmsTerminalHref(id: number, status: string): string {
  const s = status.toLowerCase();
  if (s === "collecting") return wmsProductionPaths.collecting("batch", id);
  if (s === "in_progress") return wmsProductionPaths.execute("batch", id);
  if (s === "awaiting_putaway" || s === "putaway") return wmsProductionPaths.putaway("batch", id);
  return wmsProductionPaths.collecting();
}

export default function BatchDetailPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [batch, setBatch] = useState<ProductionBatchRead | null>(null);
  const [plan, setPlan] = useState<ProductionBatchPickPlanRead | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!batchId || warehouseId == null) return;
    const id = Number(batchId);
    const [b, p] = await Promise.all([
      getProductionBatch(tenantId, id, warehouseId),
      fetchBatchPickPlan(tenantId, id, warehouseId).catch(() => null),
    ]);
    setBatch(b);
    setPlan(p);
  }, [tenantId, batchId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const releaseToWms = async () => {
    if (!batchId || warehouseId == null || !batch) return;
    if (batchHasMaterialShortages(batch, plan)) return;
    setBusy(true);
    try {
      setBatch(await releaseBatchToWms(tenantId, Number(batchId), warehouseId));
      toast.success("Partia wydana do terminalu WMS.");
    } catch (e: unknown) {
      toast.error(formatStartCollectingError(e));
    } finally {
      setBusy(false);
    }
  };

  const startErp = async () => {
    if (!batchId || warehouseId == null || !batch) return;
    if (batchHasMaterialShortages(batch, plan)) return;
    setBusy(true);
    try {
      setBatch(await startErpExecutionBatch(tenantId, Number(batchId), warehouseId));
      toast.success("Produkcja uruchomiona.");
      navigate(erpProductionPaths.erpExecution("batch", batchId));
    } catch (e: unknown) {
      toast.error(formatStartCollectingError(e));
    } finally {
      setBusy(false);
    }
  };

  const printCard = async () => {
    if (!batchId || warehouseId == null) return;
    try {
      await openBatchProductionCardPdf(tenantId, Number(batchId), warehouseId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Nie udało się otworzyć karty produkcji.";
      toast.error(message);
    }
  };

  const openErp = () => {
    if (!batchId) return;
    navigate(erpProductionPaths.erpExecution("batch", batchId));
  };

  const cancel = async () => {
    if (!batchId || !confirm("Anulować partię?") || warehouseId == null) return;
    setBusy(true);
    try {
      await cancelProductionBatch(tenantId, Number(batchId), warehouseId);
      toast.success("Partia anulowana.");
      navigate(erpProductionPaths.home);
    } catch {
      toast.error("Anulowanie nie powiodło się.");
    } finally {
      setBusy(false);
    }
  };

  const headerMeta = useMemo(() => {
    if (!batch) return { productLabel: "—", planned: 0 };
    const lines = batch.lines ?? [];
    const planned = batch.total_planned_units ?? lines.reduce((a, l) => a + (l.planned_quantity || 0), 0);
    if (lines.length === 0) return { productLabel: "—", planned };
    if (lines.length === 1) return { productLabel: lines[0].product_name ?? "Produkt", planned };
    return {
      productLabel: `${lines[0].product_name ?? "Produkt"} +${lines.length - 1}`,
      planned,
    };
  }, [batch]);

  if (!batch) return <p className="px-4 py-6 text-sm text-slate-500">Wczytywanie…</p>;

  const collectingBlocked = batchHasMaterialShortages(batch, plan);
  const status = String(batch.status || "draft");
  const canRelease =
    (status === "draft" || status === "planned") && !batch.is_released_to_wms && !batch.is_erp_interface;
  const canStartErp =
    (status === "draft" || status === "planned") && !batch.is_released_to_wms && !batch.is_erp_interface;
  const canOpenWms =
    !batch.is_erp_interface &&
    (Boolean(batch.is_released_to_wms) ||
      ["collecting", "in_progress", "awaiting_putaway", "putaway"].includes(status));
  const canOpenErp =
    Boolean(batch.is_erp_interface) &&
    ["collecting", "in_progress", "awaiting_putaway", "putaway", "draft", "planned"].includes(status);
  const canCancel = !["completed", "cancelled", "awaiting_putaway", "putaway"].includes(status);

  return (
    <div className={`${productionPageStackClass} max-w-6xl`}>
      <Link
        to={erpProductionPaths.orders}
        className={secondaryButtonClassName("inline-flex w-fit items-center gap-1.5")}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Wróć do zleceń
      </Link>

      <PageHeader
        title={
          <div className="min-w-0 space-y-1">
            <h1 className={`${productionPageTitleClass} font-mono`}>{batch.number}</h1>
            <p className="text-sm font-medium text-slate-800">{headerMeta.productLabel}</p>
            <p className="text-sm text-slate-600">
              Planowana ilość:{" "}
              <span className="font-semibold tabular-nums text-slate-900">{headerMeta.planned}</span> szt.
              {batch.operator_name ? (
                <>
                  {" · "}
                  Operator: <span className="font-medium text-slate-800">{batch.operator_name}</span>
                </>
              ) : null}
            </p>
          </div>
        }
        status={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={batchStatusTone(batch.status)} density="comfortable">
              {BATCH_STATUS_LABEL[batch.status]}
            </StatusBadge>
            {batch.is_erp_interface ? (
              <StatusBadge tone="neutral" density="comfortable">
                Tryb papierowy
              </StatusBadge>
            ) : null}
          </div>
        }
        actions={
          <>
            <SecondaryButton
              type="button"
              disabled={busy}
              onClick={() => void printCard()}
              className="inline-flex items-center gap-1.5"
            >
              <FileText className="h-4 w-4" aria-hidden />
              Drukuj kartę
            </SecondaryButton>
            {canRelease ? (
              <SecondaryButton
                type="button"
                disabled={busy || collectingBlocked}
                title={collectingBlocked ? START_COLLECTING_BLOCKED_TOOLTIP : undefined}
                onClick={() => void releaseToWms()}
              >
                Wydaj do WMS
              </SecondaryButton>
            ) : null}
            {canStartErp ? (
              <PrimaryButton
                type="button"
                disabled={busy || collectingBlocked}
                title={collectingBlocked ? START_COLLECTING_BLOCKED_TOOLTIP : undefined}
                onClick={() => void startErp()}
              >
                Rozpocznij produkcję
              </PrimaryButton>
            ) : null}
            {canOpenWms ? (
              <Link
                to={wmsTerminalHref(batch.id, status)}
                target="_blank"
                rel="noopener noreferrer"
                className={primaryButtonClassName("inline-flex items-center gap-1.5")}
              >
                <Monitor className="h-4 w-4" aria-hidden />
                Przejdź do realizacji
              </Link>
            ) : null}
            {canOpenErp && batch.is_erp_interface ? (
              <PrimaryButton type="button" disabled={busy} onClick={openErp}>
                Przejdź do realizacji
              </PrimaryButton>
            ) : null}
            {canCancel ? (
              <SecondaryButton
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
                className="inline-flex items-center gap-1.5"
              >
                <XCircle className="h-4 w-4" aria-hidden />
                Anuluj
              </SecondaryButton>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          {collectingBlocked ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Braki materiałów — uzupełnij stan magazynowy przed wydaniem do WMS.
            </p>
          ) : null}

          <ProductionMonitoringPanel
            kind="batch"
            source={batchMonitoringSource(batch)}
            showActions={false}
            actions={{
              onReleaseToWms: () => void releaseToWms(),
              onStartErpExecution: () => void startErp(),
              onPrintProductionCard: printCard,
              onOpenErpExecution: batch.is_erp_interface ? openErp : undefined,
              onCancel: () => void cancel(),
              releaseDisabled: collectingBlocked,
              releaseDisabledReason: START_COLLECTING_BLOCKED_TOOLTIP,
              erpDisabled: collectingBlocked,
              erpDisabledReason: START_COLLECTING_BLOCKED_TOOLTIP,
              busy,
            }}
          />

          <Card variant="section" density="comfortable" className="space-y-3">
            <h2 className={typography.section}>Produkty do wyprodukowania</h2>
            <ul className="space-y-2">
              {batch.lines.map((ln) => (
                <li
                  key={ln.id}
                  className="flex gap-3 rounded-lg border border-slate-100 px-3 py-2.5"
                >
                  <ProductThumb imageUrl={ln.product_image_url} name={ln.product_name ?? undefined} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{ln.product_name}</p>
                    <p className="text-xs text-slate-500">{ln.composition_name}</p>
                    <p className="mt-0.5 text-sm text-slate-700">
                      Plan: <strong className="tabular-nums">{ln.planned_quantity}</strong>
                      {" · "}
                      Wykonano: <strong className="tabular-nums">{ln.completed_quantity}</strong>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {plan ? (
            <Card variant="section" density="comfortable" className="space-y-3">
              <h2 className={typography.section}>Zagregowane materiały</h2>
              <ul className="space-y-2">
                {plan.aggregated_components.map((c) => {
                  const tone = stockTone(c.required, c.available);
                  return (
                    <li
                      key={c.component_product_id}
                      className={`flex gap-3 rounded-lg border px-3 py-2.5 ${STOCK_TONE_CLASS[tone]}`}
                    >
                      <ProductThumb imageUrl={c.product_image_url} name={c.product_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{c.product_name}</p>
                        <p className="mt-0.5 text-sm">
                          <strong className="tabular-nums">{c.required}</strong>
                          <span className="text-slate-400"> / </span>
                          <span className="tabular-nums">{c.available}</span> dostępne
                          {c.missing > 0 ? (
                            <span className="text-red-700"> · brakuje {c.missing}</span>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {warehouseId != null ? (
            <DocumentMaterialReservationsPanel
              tenantId={tenantId}
              warehouseId={warehouseId}
              batchId={Number(batchId)}
              materialsReserved={batch.materials_reserved}
              reservationsLocked={batch.reservations_locked}
              status={batch.status}
              onChanged={() => void load()}
            />
          ) : null}
        </div>
      </PageHeader>
    </div>
  );
}
