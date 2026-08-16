import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Flame } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  cancelProductionOrder,
  downloadOrderMaterialPickListPdf,
  downloadOrderProductionCardPdf,
  getProductionOrder,
  printOrderMaterialPickListBrowser,
  printOrderProductionCardBrowser,
  releaseOrderToWms,
  startErpExecutionOrder,
  startPrintExecutionOrder,
  type ProductionOrderRead,
} from "../../api/productionApi";
import { PrintFlowModals, usePrintMethodFlow } from "../../components/printing";
import { useQueuePrint } from "../../hooks/useQueuePrint";
import { DocumentMaterialReservationsPanel } from "./components/DocumentMaterialReservationsPanel";
import {
  orderMonitoringSource,
  ProductionMonitoringPanel,
} from "./components/ProductionMonitoringPanel";
import { erpProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";
import {
  EXECUTION_STATUS_LABEL,
  START_COLLECTING_BLOCKED_TOOLTIP,
  formatProductionQuantity,
  formatStartCollectingError,
  materialReadinessLabel,
  materialReadinessTone,
  producibleQuantityHint,
  productionExecutionMethodLabel,
  productionSourceItemStatusLabel,
  productionSourceItemStatusTone,
  productionSourceTypeLabel,
  productionSourceTypeTone,
  resolveMaterialReadiness,
} from "./productionUi";
import { productionOrdersSourceSummary } from "./productionNextAction";
import { getProductionOperationalState, shortageHintFromOrderLines } from "./productionOperationalState";
import { Card, IconButton, ProgressBar, StatusBadge, primaryButtonClassName, typography } from "@/design-system";
import ActivityLogPanel from "../../components/activityLog/ActivityLogPanel";

const DEFAULT_TENANT = 1;

function fmtQty(n: number): string {
  return formatProductionQuantity(n);
}

export default function ProductionOrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;

  const [order, setOrder] = useState<ProductionOrderRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [printStartOpen, setPrintStartOpen] = useState(false);
  const [componentsOpen, setComponentsOpen] = useState(true);

  const { queueProductionOrderCard, queueProductionOrderMaterialPickList } = useQueuePrint({
    tenantId,
    warehouseId,
  });
  const printFlow = usePrintMethodFlow({ tenantId, warehouseId, printerKind: "a4" });

  const load = useCallback(async () => {
    if (!orderId || warehouseId == null) {
      setOrder(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setOrder(await getProductionOrder(tenantId, Number(orderId), warehouseId));
    } catch {
      setOrder(null);
      toast.error("Nie udało się wczytać zlecenia produkcyjnego.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, orderId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const releaseToWms = async () => {
    if (!order || warehouseId == null) return;
    setBusy(true);
    try {
      setOrder(await releaseOrderToWms(tenantId, order.id, warehouseId));
      toast.success("Zlecenie wydane do terminalu WMS.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Wydanie do WMS nie powiodło się.");
    } finally {
      setBusy(false);
    }
  };

  const startErp = async () => {
    if (!order || warehouseId == null || orderId == null) return;
    if (order.has_shortages) return;
    setBusy(true);
    try {
      setOrder(await startErpExecutionOrder(tenantId, order.id, warehouseId));
      toast.success("Realizacja w ERP uruchomiona.");
      navigate(erpProductionPaths.erpExecution("order", orderId));
    } catch (e: unknown) {
      toast.error(formatStartCollectingError(e));
    } finally {
      setBusy(false);
    }
  };

  const printCard = () => {
    if (!order || warehouseId == null) return;
    void printFlow.requestPrint({
      kindCode: "production_card",
      documentTypeKey: "production_order_card",
      title: "Drukuj kartę produkcji",
      onBrowserPrint: () => printOrderProductionCardBrowser(tenantId, order.id, warehouseId),
      onCloudPrint: async (workstationId, templateVersionId) => {
        await queueProductionOrderCard(order.id, warehouseId, workstationId, templateVersionId);
      },
      onDownloadPdf: () => downloadOrderProductionCardPdf(tenantId, order.id, warehouseId),
    });
  };

  const printPickList = () => {
    if (!order || warehouseId == null) return;
    void printFlow.requestPrint({
      kindCode: "production_material_pick_list",
      documentTypeKey: "production_order_material_pick_list",
      title: "Drukuj listę pobrania",
      onBrowserPrint: () => printOrderMaterialPickListBrowser(tenantId, order.id, warehouseId),
      onCloudPrint: async (workstationId, templateVersionId) => {
        await queueProductionOrderMaterialPickList(
          order.id,
          warehouseId,
          workstationId,
          templateVersionId,
        );
      },
      onDownloadPdf: () => downloadOrderMaterialPickListPdf(tenantId, order.id, warehouseId),
    });
  };

  const startPrintAndPrint = async () => {
    if (!order || warehouseId == null) return;
    if (order.has_shortages || !order.materials_reserved) {
      toast.error("Brak komponentów — nie można rozpocząć produkcji z wydruku.");
      return;
    }
    setBusy(true);
    try {
      const updated = await startPrintExecutionOrder(tenantId, order.id, warehouseId, {
        consumeMaterials: true,
      });
      setOrder(updated);
      setPrintStartOpen(false);
      if (updated.rw_stock_document_id) {
        toast.success("Produkcja rozpoczęta. Komponenty pobrane (RW).");
      } else {
        toast.success("Produkcja już była rozpoczęta.");
      }
      await printOrderProductionCardBrowser(tenantId, order.id, warehouseId);
    } catch (e: unknown) {
      toast.error(formatStartCollectingError(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!order || warehouseId == null || !confirm("Anulować zlecenie produkcyjne?")) return;
    setBusy(true);
    try {
      setOrder(await cancelProductionOrder(tenantId, order.id, warehouseId));
      toast.success("Zlecenie anulowane.");
    } catch {
      toast.error("Anulowanie nie powiodło się.");
    } finally {
      setBusy(false);
    }
  };

  const isPrintMethod =
    order?.source_type === "ORDERS" && order.production_execution_method === "PRINT";
  const printStarted = Boolean(
    order &&
      (order.is_print_interface ||
        ["collecting", "in_progress", "awaiting_putaway", "putaway", "completed"].includes(
          String(order.status),
        )),
  );

  const readiness = useMemo(() => {
    if (!order) return "unknown" as const;
    return resolveMaterialReadiness({
      hasShortages: order.has_shortages,
      materialsReserved: order.materials_reserved,
      sourceShortageCount: order.source_shortage_count,
      sourceReservedCount: order.source_reserved_count,
      producedQuantity: order.produced_quantity,
      plannedQuantity: order.planned_quantity,
    });
  }, [order]);

  const qtyHint = useMemo(() => {
    if (!order) return null;
    return producibleQuantityHint({
      sourceReservedQuantityTotal: order.source_reserved_quantity_total,
      sourceRequestedQuantityTotal: order.source_requested_quantity_total,
      plannedQuantity: order.planned_quantity,
      readiness,
    });
  }, [order, readiness]);

  if (warehouseId == null) {
    return <p className="px-4 py-6 text-sm text-slate-500">Wybierz magazyn, aby otworzyć zlecenie.</p>;
  }
  if (loading) {
    return <p className="px-4 py-6 text-sm text-slate-500">Wczytywanie zlecenia…</p>;
  }
  if (!order) {
    return (
      <div className="space-y-4 px-4 py-6">
        <p className="text-sm text-rose-600">Zlecenie nie istnieje lub nie masz do niego dostępu.</p>
        <Link to={erpProductionPaths.orders} className="text-sm font-medium text-orange-700 hover:underline">
          ← Lista zleceń
        </Link>
      </div>
    );
  }

  const shortagesBlocked = Boolean(order.has_shortages);
  const remaining = Math.max(0, order.planned_quantity - order.produced_quantity);
  const readyToPack = order.source_awaiting_packing_order_count ?? 0;
  const reservedQty = order.source_reserved_quantity_total ?? 0;
  const shortageQty = order.source_shortage_quantity_total ?? 0;
  const requestedQty = order.source_requested_quantity_total ?? 0;
  const orderCount = order.source_order_count ?? 0;
  const readyOrderCount = order.source_reserved_count ?? 0;
  const shortageOrderCount = order.source_shortage_count ?? 0;
  const ordersSummary = productionOrdersSourceSummary({
    sourceOrderCount: orderCount,
    sourceRequestedQuantityTotal: requestedQty,
    plannedQuantity: order.planned_quantity,
  });
  const shortage = shortageHintFromOrderLines(order.lines);
  const operational = getProductionOperationalState({
    executionKind: "order",
    id: order.id,
    status: order.status,
    sourceType: order.source_type,
    hasShortages: order.has_shortages,
    materialsReserved: order.materials_reserved,
    isReleasedToWms: order.is_released_to_wms,
    isErpInterface: order.is_erp_interface,
    isPrintInterface: order.is_print_interface,
    productionExecutionMethod: order.production_execution_method,
    producedQuantity: order.produced_quantity,
    plannedQuantity: order.planned_quantity,
    collectionProgressPercent: order.collection_progress_percent,
    progressPercent: order.progress_percent,
    sourceOrderCount: order.source_order_count,
    sourceRequestedQuantityTotal: order.source_requested_quantity_total,
    sourceShortageQuantityTotal: order.source_shortage_quantity_total,
    sourceShortageCount: order.source_shortage_count,
    sourceFulfilledOrderCount: order.source_fulfilled_order_count,
    sourceAwaitingPackingOrderCount: order.source_awaiting_packing_order_count,
    shortageComponentHint: shortage.hint,
    shortagePrimaryMissingQty: shortage.primaryMissingQty || undefined,
    shortageAdditionalCount: shortage.additionalCount || undefined,
  });
  const progressPct = operational.progressMeaning.percent;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-6">
      {/* Header */}
      <Card variant="section" density="comfortable" className="space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <IconButton
            type="button"
            aria-label="Wróć do zleceń"
            title="Wróć do zleceń"
            onClick={() => navigate(erpProductionPaths.orders)}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </IconButton>
          <ProductThumb imageUrl={order.product_image_url} name={order.product_name ?? undefined} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xl font-bold text-slate-900 sm:text-2xl">{order.number}</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{order.product_name}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {order.product_sku ? `${order.product_sku} · ` : ""}
              {order.warehouse_name}
              {order.recipe_name ? ` · Receptura: ${order.recipe_name}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge tone={productionSourceTypeTone(order.source_type)} density="compact">
                {productionSourceTypeLabel(order.source_type)}
              </StatusBadge>
              {(order.source_type === "ORDERS" || order.production_execution_method) && (
                <StatusBadge tone="neutral" density="compact">
                  {productionExecutionMethodLabel(order.production_execution_method)}
                </StatusBadge>
              )}
              <StatusBadge
                tone={
                  order.status === "completed"
                    ? "success"
                    : order.status === "in_progress" || order.status === "collecting"
                      ? "primary"
                      : "neutral"
                }
                density="compact"
              >
                {EXECUTION_STATUS_LABEL[order.status] ?? order.status}
              </StatusBadge>
              <StatusBadge tone={materialReadinessTone(readiness)} density="compact">
                {materialReadinessLabel(readiness, {
                  producible: qtyHint?.producible,
                  planned: qtyHint?.planned,
                })}
              </StatusBadge>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {operational.progressMeaning.label}
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
                {fmtQty(operational.progressMeaning.current)}{" "}
                <span className="text-base font-semibold text-slate-500">
                  / {fmtQty(operational.progressMeaning.total)} szt.
                </span>
              </p>
            </div>
            <p className="text-sm tabular-nums text-slate-600">{progressPct}%</p>
          </div>
          <ProgressBar value={progressPct} tone={progressPct >= 100 ? "success" : "info"} className="mt-2" />
          {operational.progressMeaning.nextStepHint ? (
            <p className="mt-2 text-sm font-medium text-orange-800">{operational.progressMeaning.nextStepHint}</p>
          ) : null}
          {order.source_type === "ORDERS" ? (
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              {ordersSummary ? <p className="font-medium text-slate-800">{ordersSummary}</p> : null}
              <p>
                Gotowe do pakowania: <strong className="tabular-nums">{readyToPack}</strong>
                {" · "}
                Pozostało: <strong className="tabular-nums">{fmtQty(remaining)}</strong> szt.
              </p>
              {orderCount > 0 ? (
                <p>
                  Zamówienia: <strong className="tabular-nums">{orderCount}</strong>
                  {readyOrderCount > 0 ? (
                    <>
                      {" · "}
                      Gotowe do produkcji:{" "}
                      <strong className="tabular-nums">{readyOrderCount}</strong>{" "}
                      {readyOrderCount === 1 ? "zamówienie" : "zamówień"}
                    </>
                  ) : null}
                  {shortageOrderCount > 0 ? (
                    <>
                      {" · "}
                      Brak komponentów:{" "}
                      <strong className="tabular-nums text-amber-800">{shortageOrderCount}</strong>{" "}
                      {shortageOrderCount === 1 ? "zamówienie" : "zamówienia"}
                      {shortageQty > 0 ? (
                        <>
                          {" "}
                          / <strong className="tabular-nums text-amber-800">{fmtQty(shortageQty)}</strong> szt.
                        </>
                      ) : null}
                    </>
                  ) : null}
                </p>
              ) : null}
              {requestedQty > 0 ? (
                <p className="tabular-nums text-slate-500">
                  Plan: {fmtQty(requestedQty)} szt.
                  {reservedQty > 0 ? <> · Można wyprodukować: {fmtQty(reservedQty)} szt.</> : null}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <ProductionMonitoringPanel
          kind="order"
          source={orderMonitoringSource(order)}
          actions={{
            onReleaseToWms: isPrintMethod ? undefined : () => void releaseToWms(),
            onStartErpExecution: isPrintMethod ? undefined : () => void startErp(),
            onPrintProductionCard: printCard,
            onPrintMaterialPickList: printPickList,
            onStartPrintExecution:
              isPrintMethod && !printStarted ? () => setPrintStartOpen(true) : undefined,
            onOpenErpExecution:
              order.is_erp_interface || order.is_print_interface
                ? () => navigate(erpProductionPaths.erpExecution("order", String(order.id)))
                : undefined,
            onCancel: () => void cancel(),
            releaseDisabled: shortagesBlocked,
            erpDisabled: shortagesBlocked,
            printStartDisabled: shortagesBlocked || !order.materials_reserved,
            releaseDisabledReason: START_COLLECTING_BLOCKED_TOOLTIP,
            erpDisabledReason: START_COLLECTING_BLOCKED_TOOLTIP,
            printStartDisabledReason: "Brak komponentów",
            busy,
          }}
        />
      </Card>

      {/* A. Produkt */}
      <section className="space-y-2">
        <h2 className={typography.h2}>Produkt</h2>
        <Card variant="section" density="compact" className="flex items-center gap-3">
          <ProductThumb imageUrl={order.product_image_url} name={order.product_name ?? undefined} size="md" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{order.product_name}</p>
            {order.product_sku ? <p className="font-mono text-xs text-slate-500">{order.product_sku}</p> : null}
            {order.composition_id ? (
              <Link
                to={erpProductionPaths.recipe(order.composition_id)}
                className="mt-1 inline-block text-xs font-medium text-orange-700 hover:underline"
              >
                Otwórz recepturę
              </Link>
            ) : null}
          </div>
        </Card>
      </section>

      {/* B. Komponenty */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className={typography.h2}>Komponenty</h2>
          <button
            type="button"
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
            onClick={() => setComponentsOpen((v) => !v)}
          >
            {componentsOpen ? "Zwiń" : "Rozwiń"}
          </button>
        </div>
        {componentsOpen ? (
          order.lines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
              Brak listy komponentów dla tego zlecenia.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Komponent</th>
                    <th className="px-3 py-2 text-right">Potrzeba</th>
                    <th className="px-3 py-2 text-right">Zarezerwowano</th>
                    <th className="px-3 py-2 text-right">Pobrano</th>
                    <th className="px-3 py-2 text-right">Brakuje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.lines.map((ln) => {
                    const missing = Number(ln.missing ?? 0);
                    return (
                      <tr key={ln.id} className="align-middle">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <ProductThumb
                              imageUrl={ln.product_image_url}
                              name={ln.product_name_snapshot}
                              size="sm"
                            />
                            <div>
                              <p className="font-medium text-slate-900">{ln.product_name_snapshot}</p>
                              {ln.product_sku_snapshot ? (
                                <p className="font-mono text-xs text-slate-500">{ln.product_sku_snapshot}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtQty(ln.total_required_quantity)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {ln.reserved != null ? fmtQty(ln.reserved) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtQty(ln.consumed_quantity)}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            missing > 0 ? "font-semibold text-amber-800" : "text-slate-700"
                          }`}
                        >
                          {ln.missing != null ? fmtQty(missing) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}
        {warehouseId != null && orderId ? (
          <DocumentMaterialReservationsPanel
            tenantId={tenantId}
            warehouseId={warehouseId}
            orderId={Number(orderId)}
            materialsReserved={order.materials_reserved}
            reservationsLocked={order.reservations_locked}
            status={order.status}
            onChanged={() => void load()}
          />
        ) : null}
      </section>

      {/* C. Zamówienia */}
      {order.source_type === "ORDERS" ? (
        <section className="space-y-2">
          <h2 className={typography.h2}>Zamówienia</h2>
          {(order.order_sources?.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
              Brak powiązanych zamówień.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Nr zamówienia</th>
                    <th className="px-3 py-2 text-right">Ilość</th>
                    <th className="px-3 py-2 text-right">Wyprodukowano</th>
                    <th className="px-3 py-2">Status produkcji</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.order_sources!.map((src) => (
                    <tr key={src.id}>
                      <td className="px-3 py-2">
                        <Link
                          to={`/orders/${src.order_id}`}
                          className="inline-flex items-center gap-1.5 font-mono font-medium text-orange-700 hover:underline"
                        >
                          <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden />
                          {src.order_number ?? `#${src.order_id}`}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtQty(src.requested_quantity)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtQty(src.fulfilled_quantity)}/{fmtQty(src.requested_quantity)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={productionSourceItemStatusTone(src.status)} density="compact">
                          {productionSourceItemStatusLabel(src.status)}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* D. Dokumenty */}
      <section className="space-y-2">
        <h2 className={typography.h2}>Dokumenty</h2>
        <Card variant="section" density="compact" className="space-y-1 text-sm text-slate-700">
          <p>
            RW:{" "}
            <span className="font-mono font-medium">
              {order.rw_document_number ?? (order.rw_stock_document_id ? `#${order.rw_stock_document_id}` : "—")}
            </span>
          </p>
          <p>
            PW:{" "}
            <span className="font-mono font-medium">
              {order.pw_document_number ?? (order.pw_stock_document_id ? `#${order.pw_stock_document_id}` : "—")}
            </span>
            {order.pw_putaway_status ? (
              <span className="ml-2 text-xs text-slate-500">({order.pw_putaway_status})</span>
            ) : null}
          </p>
        </Card>
      </section>

      {/* E. Historia — monitoring already covers actions; keep light meta */}
      <section className="space-y-2">
        <h2 className={typography.h2}>Historia</h2>
        <Card variant="section" density="compact" className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
          <p>
            Utworzono:{" "}
            <span className="font-medium text-slate-800">
              {order.created_at ? new Date(order.created_at).toLocaleString("pl-PL") : "—"}
            </span>
          </p>
          <p>
            Start:{" "}
            <span className="font-medium text-slate-800">
              {order.started_at ? new Date(order.started_at).toLocaleString("pl-PL") : "—"}
            </span>
          </p>
          <p>
            Zakończenie:{" "}
            <span className="font-medium text-slate-800">
              {order.completed_at ? new Date(order.completed_at).toLocaleString("pl-PL") : "—"}
            </span>
          </p>
          <p>
            Operator: <span className="font-medium text-slate-800">{order.operator_name ?? "—"}</span>
          </p>
        </Card>
      </section>

      <PrintFlowModals flow={printFlow} />

      {order?.id != null ? (
        <section className="mt-6">
          <ActivityLogPanel
            objectType="production"
            objectId={Number(order.id)}
            title="Historia produkcji"
            defaultCollapsed={false}
          />
        </section>
      ) : null}

      {printStartOpen ? (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-start-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 id="print-start-title" className="text-lg font-semibold text-slate-900">
              Rozpocząć produkcję?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Komponenty zostaną pobrane ze wskazanych lokalizacji i zostanie utworzony dokument RW.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                disabled={busy}
                onClick={() => setPrintStartOpen(false)}
              >
                Anuluj
              </button>
              <button
                type="button"
                className={primaryButtonClassName()}
                disabled={busy || shortagesBlocked || !order.materials_reserved}
                onClick={() => void startPrintAndPrint()}
              >
                Rozpocznij i drukuj
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
