import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageLayout from "../../components/layout/PageLayout";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import {
  panelListDenseRowClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "../../components/operational";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  getProductionOrder,
  listProductionOrders,
  type ProductionOrderRead,
  type ProductionOrderStatus,
} from "../../api/productionApi";
import { ProductionOrderExecutionPanel } from "./ProductionOrderExecutionPanel";
import { PRODUCTION_STATUS_LABEL, productionStatusBadgeClass } from "./productionUi";

const DEFAULT_TENANT_ID = 1;

type ViewTab = "queue" | "in_progress" | "completed" | "cancelled";

const TAB_STATUS: Record<ViewTab, ProductionOrderStatus> = {
  queue: "planned",
  in_progress: "in_progress",
  completed: "completed",
  cancelled: "cancelled",
};

export default function ProductionPage() {
  const [searchParams] = useSearchParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT_ID;
  const warehouseId = warehouse?.id;

  const [viewTab, setViewTab] = useState<ViewTab>("queue");
  const [orders, setOrders] = useState<ProductionOrderRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProductionOrderRead | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const reloadList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await listProductionOrders(tenantId, {
        status: TAB_STATUS[viewTab],
        warehouse_id: warehouseId,
      });
      setOrders(rows);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać zleceń.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, viewTab]);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  useEffect(() => {
    const oid = searchParams.get("order");
    if (oid && /^\d+$/.test(oid)) setSelectedId(Number(oid));
  }, [searchParams]);

  const loadDetail = useCallback(
    async (id: number) => {
      setDetailBusy(true);
      try {
        const row = await getProductionOrder(tenantId, id);
        setDetail(row);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Nie udało się wczytać zlecenia.");
        setDetail(null);
      } finally {
        setDetailBusy(false);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const tabClass = (id: ViewTab) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      viewTab === id ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
    }`;

  const viewTabs: { id: ViewTab; label: string }[] = useMemo(
    () => [
      { id: "queue", label: "Kolejka" },
      { id: "in_progress", label: "W produkcji" },
      { id: "completed", label: "Zakończone" },
      { id: "cancelled", label: "Anulowane" },
    ],
    [],
  );

  return (
    <PageLayout>
      <ListPageHeader
        title="Produkcja"
        breadcrumbs={[{ label: "Magazyn" }, { label: "Produkcja" }]}
      />

      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {viewTabs.map((t) => (
          <button key={t.id} type="button" className={tabClass(t.id)} onClick={() => setViewTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className={panelListDenseTableScrollWrapClass}>
            <table className={panelListDenseTableClass}>
              <thead className={panelListDenseTheadClass}>
                <tr>
                  <th className={panelListDenseThBase}>Nr</th>
                  <th className={panelListDenseThBase}>Produkt</th>
                  <th className={panelListDenseThBase}>Ilość</th>
                  <th className={panelListDenseThBase}>Magazyn</th>
                  <th className={panelListDenseThBase}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className={`${panelListDenseTdBase} text-slate-500`}>
                      Wczytywanie…
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`${panelListDenseTdBase} text-slate-500`}>
                      Brak zleceń w tym widoku.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr
                      key={o.id}
                      className={`${panelListDenseRowClass} cursor-pointer ${selectedId === o.id ? "bg-violet-50" : ""}`}
                      onClick={() => setSelectedId(o.id)}
                    >
                      <td className={panelListDenseTdBase}>
                        <span className="font-mono text-xs">{o.number}</span>
                      </td>
                      <td className={panelListDenseTdBase}>
                        <div className="font-medium text-slate-900">{o.product_name ?? `#${o.product_id}`}</div>
                        <div className="text-xs text-slate-500">{o.product_sku ?? ""}</div>
                      </td>
                      <td className={panelListDenseTdBase}>{o.planned_quantity}</td>
                      <td className={panelListDenseTdBase}>{o.warehouse_name ?? o.warehouse_id}</td>
                      <td className={panelListDenseTdBase}>
                        <span className={productionStatusBadgeClass(o.status)}>
                          {PRODUCTION_STATUS_LABEL[o.status]}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
            {!selectedId ? (
              <p className="text-sm text-slate-500">Wybierz zlecenie z listy.</p>
            ) : detailBusy || !detail ? (
              <p className="text-sm text-slate-500">Wczytywanie szczegółów…</p>
            ) : (
              <ProductionOrderExecutionPanel
                tenantId={tenantId}
                order={detail}
                onOrderUpdated={setDetail}
                onListRefresh={() => void reloadList()}
              />
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
