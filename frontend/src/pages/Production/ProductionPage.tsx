import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Play, XCircle } from "lucide-react";
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
  cancelProductionOrder,
  completeProductionOrder,
  getProductionOrder,
  listProductionOrders,
  startProductionOrder,
  type ProductionCompleteResultRead,
  type ProductionOrderRead,
  type ProductionOrderStatus,
} from "../../api/productionApi";

const DEFAULT_TENANT_ID = 1;

type ViewTab = "queue" | "in_progress" | "completed" | "cancelled";

const TAB_STATUS: Record<ViewTab, ProductionOrderStatus | "queue"> = {
  queue: "planned",
  in_progress: "in_progress",
  completed: "completed",
  cancelled: "cancelled",
};

const STATUS_LABEL: Record<ProductionOrderStatus, string> = {
  draft: "Szkic",
  planned: "Kolejka",
  in_progress: "W trakcie",
  completed: "Zakończone",
  cancelled: "Anulowane",
};

function statusBadge(status: ProductionOrderStatus): string {
  const base = "inline-flex rounded px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "in_progress":
      return `${base} bg-amber-100 text-amber-900`;
    case "completed":
      return `${base} bg-emerald-100 text-emerald-800`;
    case "cancelled":
      return `${base} bg-slate-200 text-slate-700`;
    case "planned":
      return `${base} bg-blue-100 text-blue-800`;
    default:
      return `${base} bg-slate-100 text-slate-700`;
  }
}

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
  const [completeResult, setCompleteResult] = useState<ProductionCompleteResultRead | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const reloadList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const status = TAB_STATUS[viewTab];
      const rows = await listProductionOrders(tenantId, {
        status: status === "queue" ? "planned" : status,
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
      setCompleteResult(null);
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

  const canStart = detail?.status === "planned" || detail?.status === "draft";
  const canComplete = detail?.status === "in_progress" || detail?.status === "planned";
  const canCancel = detail && detail.status !== "completed" && detail.status !== "cancelled";

  const handleStart = async () => {
    if (!detail) return;
    setActionBusy(true);
    setErr(null);
    try {
      const row = await startProductionOrder(tenantId, detail.id);
      setDetail(row);
      await reloadList();
    } catch (e: unknown) {
      const detailMsg =
        e && typeof e === "object" && "response" in e
          ? JSON.stringify((e as { response?: { data?: unknown } }).response?.data)
          : "";
      setErr(detailMsg || (e instanceof Error ? e.message : "Start nie powiódł się."));
    } finally {
      setActionBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!detail) return;
    setActionBusy(true);
    setErr(null);
    try {
      const result = await completeProductionOrder(tenantId, detail.id, {
        produced_quantity: detail.planned_quantity,
        location_id: detail.location_id ?? undefined,
      });
      setCompleteResult(result);
      setDetail(result.order);
      await reloadList();
    } catch (e: unknown) {
      const detailMsg =
        e && typeof e === "object" && "response" in e
          ? JSON.stringify((e as { response?: { data?: unknown } }).response?.data)
          : "";
      setErr(detailMsg || (e instanceof Error ? e.message : "Zakończenie nie powiodło się."));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!detail) return;
    if (!window.confirm("Anulować zlecenie produkcyjne?")) return;
    setActionBusy(true);
    try {
      const row = await cancelProductionOrder(tenantId, detail.id);
      setDetail(row);
      await reloadList();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Anulowanie nie powiodło się.");
    } finally {
      setActionBusy(false);
    }
  };

  const viewTabs: { id: ViewTab; label: string }[] = useMemo(
    () => [
      { id: "queue", label: "Kolejka" },
      { id: "in_progress", label: "W trakcie" },
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
                        <span className={statusBadge(o.status)}>{STATUS_LABEL[o.status]}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sticky top-4">
            {!selectedId ? (
              <p className="text-sm text-slate-500">Wybierz zlecenie z listy.</p>
            ) : detailBusy || !detail ? (
              <p className="text-sm text-slate-500">Wczytywanie szczegółów…</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-xs text-slate-500">{detail.number}</p>
                  <h3 className="text-lg font-bold text-slate-900">{detail.product_name}</h3>
                  <p className="text-sm text-slate-600">
                    {detail.recipe_name} · {detail.planned_quantity} szt.
                  </p>
                  <span className={`mt-2 inline-block ${statusBadge(detail.status)}`}>
                    {STATUS_LABEL[detail.status]}
                  </span>
                </div>

                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <span className="text-slate-500">Magazyn:</span> {detail.warehouse_name ?? detail.warehouse_id}
                  </p>
                  {detail.location_name ? (
                    <p>
                      <span className="text-slate-500">Lokalizacja docelowa:</span> {detail.location_name}
                    </p>
                  ) : null}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Składniki</p>
                  <div className="overflow-x-auto rounded border border-slate-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5">Składnik</th>
                          <th className="px-2 py-1.5">Wymagane</th>
                          <th className="px-2 py-1.5">Dostępne</th>
                          <th className="px-2 py-1.5">Brak</th>
                          <th className="px-2 py-1.5">Zużyte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((ln) => (
                          <tr key={ln.id} className="border-t border-slate-50">
                            <td className="px-2 py-1.5">{ln.product_name_snapshot}</td>
                            <td className="px-2 py-1.5">{ln.total_required_quantity}</td>
                            <td className="px-2 py-1.5">{ln.available ?? "—"}</td>
                            <td className="px-2 py-1.5 text-red-600">
                              {ln.missing != null && ln.missing > 0 ? ln.missing : "—"}
                            </td>
                            <td className="px-2 py-1.5">{ln.consumed_quantity || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canStart ? (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleStart()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" aria-hidden />
                      Start
                    </button>
                  ) : null}
                  {canComplete ? (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleComplete()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      Zakończ
                    </button>
                  ) : null}
                  {canCancel ? (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleCancel()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" aria-hidden />
                      Anuluj
                    </button>
                  ) : null}
                </div>

                {completeResult ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm space-y-2">
                    <p className="font-semibold text-emerald-900">Produkcja zakończona</p>
                    <p>
                      Wyprodukowano: <strong>{completeResult.order.produced_quantity}</strong> szt.
                    </p>
                    {completeResult.calculated_unit_cost != null ? (
                      <p>
                        Koszt jednostkowy: <strong>{completeResult.calculated_unit_cost.toFixed(2)} zł</strong>
                      </p>
                    ) : null}
                    <p className="text-emerald-800">Dokumenty magazynowe:</p>
                    <ul className="list-disc pl-5 text-emerald-900">
                      {completeResult.rw_stock_document_id ? (
                        <li>
                          RW #{completeResult.rw_stock_document_id}
                          {" · "}
                          <Link to="/documents/warehouse" className="underline">
                            Historia magazynowa
                          </Link>
                        </li>
                      ) : null}
                      {completeResult.pw_stock_document_id ? (
                        <li>PW #{completeResult.pw_stock_document_id}</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
