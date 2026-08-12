import { useCallback, useEffect, useState } from "react";

import { Link, useNavigate, useParams } from "react-router-dom";

import { ArrowLeft } from "lucide-react";

import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";

import {

  cancelProductionOrder,
  downloadOrderProductionCardPdf,
  getProductionOrder,
  printOrderProductionCardBrowser,
  releaseOrderToWms,
  startErpExecutionOrder,
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

import { PRODUCTION_STATUS_LABEL, START_COLLECTING_BLOCKED_TOOLTIP, formatStartCollectingError, productionStatusBadgeClass } from "./productionUi";



const DEFAULT_TENANT = 1;



export default function ProductionOrderDetailPage() {

  const { orderId } = useParams();
  const navigate = useNavigate();

  const { warehouse } = useWarehouse();

  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;

  const warehouseId = warehouse?.id;

  const [order, setOrder] = useState<ProductionOrderRead | null>(null);

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState(false);
  const { queueProductionOrderCard } = useQueuePrint({ tenantId, warehouseId });
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

      const msg = e instanceof Error ? e.message : "Wydanie do WMS nie powiodło się.";

      toast.error(msg);

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

  const openErp = () => {
    if (!orderId) return;
    navigate(erpProductionPaths.erpExecution("order", orderId));
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



  if (warehouseId == null) {

    return <p className="px-4 py-6 text-sm text-slate-500">Wybierz magazyn, aby otworzyć zlecenie.</p>;

  }



  if (loading) {

    return <p className="px-4 py-6 text-sm text-slate-500">Wczytywanie zlecenia…</p>;

  }



  if (!order) {

    return (

      <div className="px-4 py-6 space-y-4">

        <p className="text-sm text-rose-600">Zlecenie nie istnieje lub nie masz do niego dostępu.</p>

        <Link to={erpProductionPaths.orders} className="text-sm font-medium text-violet-700 hover:underline">

          ← Lista zleceń

        </Link>

      </div>

    );

  }



  const shortagesBlocked = Boolean(order.has_shortages);



  return (

    <div className="px-4 py-6 lg:px-6 space-y-8 max-w-6xl">

      <Link

        to={erpProductionPaths.orders}

        className="inline-flex items-center gap-2 text-sm text-violet-600 hover:underline"

      >

        <ArrowLeft className="h-4 w-4" aria-hidden />

        Zlecenia produkcyjne

      </Link>



      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">

          <div className="flex flex-wrap items-start gap-4">
            <ProductThumb imageUrl={order.product_image_url} name={order.product_name ?? undefined} size="lg" />
            <div>
            <p className="font-mono text-2xl font-bold text-slate-900">{order.number}</p>

            <p className="mt-1 text-sm text-slate-600">

              {order.product_name}

              {order.product_sku ? ` · ${order.product_sku}` : ""}

            </p>

            <p className="mt-1 text-xs text-slate-500">

              {order.warehouse_name}

              {order.recipe_name ? ` · Receptura: ${order.recipe_name}` : ""}

            </p>

            <span className={`mt-2 inline-block ${productionStatusBadgeClass(order.status)}`}>

              {PRODUCTION_STATUS_LABEL[order.status]}

            </span>

            {order.source_type === "ORDERS" ? (
              <span className="mt-2 ml-2 inline-block rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                Z zamówień
              </span>
            ) : null}

          </div>
          </div>
        </div>



        {order.composition_id ? (

          <p className="mt-3 text-xs text-slate-500">

            Receptura (BOM):{" "}

            <Link to={erpProductionPaths.recipe(order.composition_id)} className="font-medium text-slate-700 underline">

              otwórz w module Receptury

            </Link>

          </p>

        ) : null}

        {order.source_type === "ORDERS" && (order.order_sources?.length ?? 0) > 0 ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Zamówienia źródłowe</h3>
            <p className="mt-1 text-xs text-slate-600">
              Wyprodukowano: {order.produced_quantity}/{order.planned_quantity}
              {" · "}
              Zamówienia gotowe: {order.source_fulfilled_order_count ?? 0}/
              {order.source_order_count ?? order.order_sources!.length}
              {" · "}
              Oczekujące: {order.source_pending_order_count ?? 0}
              {" · "}
              Brak komponentów: {order.source_shortage_count ?? 0}
            </p>
            <ul className="mt-3 divide-y divide-slate-200">
              {order.order_sources!.map((src) => {
                const st = String(src.status || "").toLowerCase();
                const ready = st === "reserved" || st === "open" || st === "partial";
                const shortage = st === "shortage";
                const fulfilled = st === "fulfilled";
                return (
                  <li key={src.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-mono font-medium text-slate-900">
                        {src.order_number ?? `#${src.order_id}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {src.product_name ?? `Produkt #${src.product_id}`}
                        {src.product_sku ? ` · ${src.product_sku}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="tabular-nums text-slate-700">
                        {src.fulfilled_quantity}/{src.requested_quantity}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">{st}</p>
                      {fulfilled ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200">
                          Gotowe / do pakowania
                        </span>
                      ) : null}
                      {ready ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200">
                          Gotowe do produkcji
                        </span>
                      ) : null}
                      {shortage ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">
                          Brak komponentów
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}



        {shortagesBlocked ? (

          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">

            Braki materiałów — uzupełnij stan magazynowy przed wydaniem do WMS.

          </p>

        ) : null}



        <div className="mt-6">

          <ProductionMonitoringPanel

            kind="order"

            source={orderMonitoringSource(order)}

            actions={{

              onReleaseToWms: () => void releaseToWms(),
              onStartErpExecution: () => void startErp(),
              onPrintProductionCard: printCard,
              onOpenErpExecution: order.is_erp_interface ? openErp : undefined,

              onCancel: () => void cancel(),

              releaseDisabled: shortagesBlocked,
              erpDisabled: shortagesBlocked,

              releaseDisabledReason: START_COLLECTING_BLOCKED_TOOLTIP,
              erpDisabledReason: START_COLLECTING_BLOCKED_TOOLTIP,

              busy,

            }}

          />

        </div>

      </div>



      {order.lines.length > 0 ? (

        <section>

          <h2 className="text-lg font-bold text-slate-900 mb-3">Snapshot składników (BOM)</h2>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">

            <table className="min-w-full text-sm">

              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">

                <tr>

                  <th className="px-4 py-2">Składnik</th>

                  <th className="px-4 py-2 text-right">Na szt.</th>

                  <th className="px-4 py-2 text-right">Wymagane</th>

                  <th className="px-4 py-2 text-right">Dostępne</th>

                  <th className="px-4 py-2 text-right">Brak</th>

                </tr>

              </thead>

              <tbody>

                {order.lines.map((ln) => (

                  <tr key={ln.id} className="border-t border-slate-100">

                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <ProductThumb imageUrl={ln.product_image_url} name={ln.product_name_snapshot} size="sm" />
                        <span>
                          <span className="font-medium text-slate-900">{ln.product_name_snapshot}</span>
                          {ln.product_sku_snapshot ? (
                            <span className="ml-2 text-xs text-slate-500">{ln.product_sku_snapshot}</span>
                          ) : null}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-2 text-right tabular-nums">{ln.quantity_per_unit}</td>

                    <td className="px-4 py-2 text-right tabular-nums">{ln.total_required_quantity}</td>

                    <td className="px-4 py-2 text-right tabular-nums">{ln.available ?? "—"}</td>

                    <td className="px-4 py-2 text-right tabular-nums text-amber-800">{ln.missing ?? "—"}</td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </section>

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

      <PrintFlowModals flow={printFlow} />

    </div>

  );

}


