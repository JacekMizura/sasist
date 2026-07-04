import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  createProductionBatch,
  getProductionBatch,
  listProductionBatches,
  type ProductionBatchRead,
  type ProductionBatchStatus,
} from "../../api/productionApi";
import { erpProductionPaths } from "./productionPaths";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { batchMonitoringSource, ProductionMonitoringPanel } from "./components/ProductionMonitoringPanel";

const DEFAULT_TENANT_ID = 1;

type ViewTab = "queue" | "in_progress" | "completed";

const TAB_STATUS: Record<ViewTab, ProductionBatchStatus> = {
  queue: "planned",
  in_progress: "in_progress",
  completed: "completed",
};

export default function ProductionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT_ID;
  const warehouseId = warehouse?.id;

  const [viewTab, setViewTab] = useState<ViewTab>("queue");
  const [batches, setBatches] = useState<ProductionBatchRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProductionBatchRead | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  const reloadList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await listProductionBatches(tenantId, {
        status: TAB_STATUS[viewTab],
        warehouse_id: warehouseId,
      });
      setBatches(rows);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać partii.");
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, viewTab]);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  useEffect(() => {
    const bid = searchParams.get("batch");
    if (bid && /^\d+$/.test(bid)) setSelectedId(Number(bid));
  }, [searchParams]);

  const loadDetail = useCallback(
    async (id: number) => {
      if (warehouseId == null) {
        setDetail(null);
        return;
      }
      setDetailBusy(true);
      try {
        const row = await getProductionBatch(tenantId, id, warehouseId);
        setDetail(row);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Nie udało się wczytać partii.");
        setDetail(null);
      } finally {
        setDetailBusy(false);
      }
    },
    [tenantId, warehouseId],
  );

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const handleCreateFromParams = useCallback(async () => {
    const newBatch = searchParams.get("newBatch");
    const productId = searchParams.get("product");
    const compositionId = searchParams.get("composition");
    if (newBatch !== "1" || !productId || !compositionId || !warehouseId) return;
    setCreateBusy(true);
    setErr(null);
    try {
      const batch = await createProductionBatch(tenantId, {
        warehouse_id: warehouseId,
        status: "planned",
        lines: [
          {
            product_id: Number(productId),
            composition_id: Number(compositionId),
            planned_quantity: 1,
          },
        ],
      });
      setSelectedId(batch.id);
      setSearchParams({ batch: String(batch.id) });
      await reloadList();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nie udało się utworzyć partii.");
    } finally {
      setCreateBusy(false);
    }
  }, [searchParams, warehouseId, tenantId, setSearchParams, reloadList]);

  useEffect(() => {
    void handleCreateFromParams();
  }, [handleCreateFromParams]);

  const tabClass = (id: ViewTab) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      viewTab === id ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
    }`;

  const viewTabs: { id: ViewTab; label: string }[] = useMemo(
    () => [
      { id: "queue", label: "Kolejka" },
      { id: "in_progress", label: "W produkcji" },
      { id: "completed", label: "Zakończone" },
    ],
    [],
  );

  const lineSummary = (b: ProductionBatchRead) =>
    b.lines.map((l) => `${l.product_name ?? l.product_id} ×${l.planned_quantity}`).join(", ");

  return (
    <PageLayout>
      <ListPageHeader
        title="Produkcja"
        breadcrumbs={[{ label: "Magazyn" }, { label: "Produkcja" }]}
      />

      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {viewTabs.map((t) => (
            <button key={t.id} type="button" className={tabClass(t.id)} onClick={() => setViewTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {createBusy ? <span className="text-sm text-slate-500">Tworzenie partii…</span> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className={panelListDenseTableScrollWrapClass}>
            <table className={panelListDenseTableClass}>
              <thead className={panelListDenseTheadClass}>
                <tr>
                  <th className={panelListDenseThBase}>Nr partii</th>
                  <th className={panelListDenseThBase}>Produkty</th>
                  <th className={panelListDenseThBase}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className={`${panelListDenseTdBase} text-slate-500`}>
                      Wczytywanie…
                    </td>
                  </tr>
                ) : batches.length === 0 ? (
                  <tr>
                    <td colSpan={3} className={`${panelListDenseTdBase} text-slate-500`}>
                      Brak partii w tym widoku.
                    </td>
                  </tr>
                ) : (
                  batches.map((b) => (
                    <tr
                      key={b.id}
                      className={`${panelListDenseRowClass} cursor-pointer ${selectedId === b.id ? "bg-violet-50" : ""}`}
                      onClick={() => {
                        setSelectedId(b.id);
                        setSearchParams({ batch: String(b.id) });
                      }}
                    >
                      <td className={panelListDenseTdBase}>
                        <span className="font-mono text-xs">{b.number}</span>
                      </td>
                      <td className={`${panelListDenseTdBase} text-xs text-slate-600 max-w-[12rem] truncate`}>
                        {lineSummary(b)}
                      </td>
                      <td className={panelListDenseTdBase}>
                        <span className={batchStatusBadgeClass(b.status)}>{BATCH_STATUS_LABEL[b.status]}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
            {!selectedId ? (
              <p className="text-sm text-slate-500">Wybierz partię z listy lub utwórz ją z karty produktu (Kompozycje → Produkcja).</p>
            ) : detailBusy || !detail ? (
              <p className="text-sm text-slate-500">Wczytywanie szczegółów…</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm font-bold text-slate-900">{detail.number}</p>
                  <Link
                    to={erpProductionPaths.batch(detail.id)}
                    className="text-xs font-semibold text-violet-700 hover:underline"
                  >
                    Pełny podgląd →
                  </Link>
                </div>
                <ProductionMonitoringPanel kind="batch" source={batchMonitoringSource(detail)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
