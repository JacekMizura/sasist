import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  cancelProductionBatch,
  downloadBatchProductionCardPdf,
  fetchBatchPickPlan,
  getProductionBatch,
  printBatchProductionCardBrowser,
  releaseBatchToWms,
  startErpExecutionBatch,
  type ProductionBatchPickPlanRead,
  type ProductionBatchRead,
} from "../../api/productionApi";
import { PrintFlowModals, usePrintMethodFlow } from "../../components/printing";
import { useQueuePrint } from "../../hooks/useQueuePrint";
import {
  Card,
  IconButton,
  PageHeader,
  StatusBadge,
  typography,
} from "@/design-system";
import { DocumentMaterialReservationsPanel } from "./components/DocumentMaterialReservationsPanel";
import ActivityLogPanel from "../../components/activityLog/ActivityLogPanel";
import {
  batchMonitoringSource,
  ProductionMonitoringPanel,
} from "./components/ProductionMonitoringPanel";
import {
  batchHasMaterialShortages,
  START_COLLECTING_BLOCKED_TOOLTIP,
  BATCH_STATUS_LABEL,
  executionStatusTone,
  formatProductionQuantity,
  stockTone,
  STOCK_TONE_CLASS,
  formatStartCollectingError,
} from "./productionUi";
import { ProductThumb } from "./components/ProductThumb";
import { erpProductionPaths } from "./productionPaths";
import { productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";

const DEFAULT_TENANT = 1;

export default function BatchDetailPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [batch, setBatch] = useState<ProductionBatchRead | null>(null);
  const [plan, setPlan] = useState<ProductionBatchPickPlanRead | null>(null);
  const [busy, setBusy] = useState(false);
  const { queueProductionBatchCard } = useQueuePrint({ tenantId, warehouseId });
  const printFlow = usePrintMethodFlow({ tenantId, warehouseId, printerKind: "a4" });

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

  const printCard = () => {
    if (!batchId || warehouseId == null) return;
    const id = Number(batchId);
    void printFlow.requestPrint({
      kindCode: "production_card",
      documentTypeKey: "production_batch_card",
      title: "Drukuj kartę produkcji",
      onBrowserPrint: () => printBatchProductionCardBrowser(tenantId, id, warehouseId),
      onCloudPrint: async (workstationId, templateVersionId) => {
        await queueProductionBatchCard(id, warehouseId, workstationId, templateVersionId);
      },
      onDownloadPdf: () => downloadBatchProductionCardPdf(tenantId, id, warehouseId),
    });
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

  return (
    <div className={`${productionPageStackClass} max-w-6xl`}>
      <PageHeader
        title={
          <div className="flex min-w-0 items-start gap-2">
            <IconButton
              type="button"
              aria-label="Wróć do zleceń"
              title="Wróć do zleceń"
              onClick={() => navigate(erpProductionPaths.orders)}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </IconButton>
            <div className="min-w-0 space-y-1">
              <h1 className={`${productionPageTitleClass} font-mono`}>{batch.number}</h1>
              <p className="text-sm font-medium text-slate-800">{headerMeta.productLabel}</p>
              <p className="text-sm text-slate-600">
                Planowana ilość:{" "}
                <span className="font-semibold tabular-nums text-slate-900">{headerMeta.planned}</span> szt.
                {" · "}
                Operator:{" "}
                <span className="font-medium text-slate-800">
                  {batch.operator_name?.trim() || "Dowolny operator"}
                </span>
              </p>
            </div>
          </div>
        }
        status={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={executionStatusTone(batch.status)} density="comfortable">
              {BATCH_STATUS_LABEL[batch.status]}
            </StatusBadge>
            {batch.is_erp_interface ? (
              <StatusBadge tone="neutral" density="comfortable">
                Tryb papierowy
              </StatusBadge>
            ) : null}
          </div>
        }
        actions={undefined}
      >
        <div className="space-y-4">
          <ProductionMonitoringPanel
            kind="batch"
            source={batchMonitoringSource(batch)}
            showActions
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
                      Plan: <strong className="tabular-nums">{formatProductionQuantity(ln.planned_quantity)}</strong>
                      {" · "}
                      Wykonano: <strong className="tabular-nums">{formatProductionQuantity(ln.completed_quantity)}</strong>
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
                          <strong className="tabular-nums">{formatProductionQuantity(c.required)}</strong>
                          <span className="text-slate-400"> / </span>
                          <span className="tabular-nums">{formatProductionQuantity(c.available)}</span> dostępne
                          {c.missing > 0 ? (
                            <span className="text-red-700"> · brakuje {formatProductionQuantity(c.missing)}</span>
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
      {batch?.id != null ? (
        <section className="mt-6 px-4 pb-8 sm:px-6">
          <ActivityLogPanel
            objectType="production"
            objectId={Number(batch.id)}
            title="Historia produkcji"
            defaultCollapsed={false}
          />
        </section>
      ) : null}
      <PrintFlowModals flow={printFlow} />
    </div>
  );
}
