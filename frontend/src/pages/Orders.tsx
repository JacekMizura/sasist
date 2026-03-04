import { useEffect, useState, useMemo } from "react";
import api from "../api/axios";
import { useTranslation } from "../locales";

type OrderItemDetail = {
  id: number;
  quantity: number;
  unit_volume_dm3?: number | null;
  line_total_weight?: number | null;
  product?: {
    name?: string;
    ean?: string;
    symbol?: string;
  };
};

type OrderItem = {
  id: number;
  quantity: number;
  product?: { name?: string; ean?: string; symbol?: string };
};

type Order = {
  id: number;
  number?: string;
  city?: string;
  country?: string;
  status?: string;
  total_volume?: number | null;
  is_multi_item?: boolean;
  total_items?: number;
  items?: OrderItemDetail[] | OrderItem[];
};

const tenantId = 1;
const warehouseId = 1;
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200, 500] as const;

type SortKey = "id" | "number" | "city" | "country" | "status" | "total_volume" | "order_type" | "total_items";

export default function Orders() {
  const t = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterOrderType, setFilterOrderType] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    const params = new URLSearchParams({
      tenant_id: String(tenantId),
      warehouse_id: String(warehouseId),
      limit: String(rowsPerPage),
      offset: String((page - 1) * rowsPerPage),
    });
    if (filterStatus.trim()) params.set("status", filterStatus.trim());
    if (filterOrderType.trim()) params.set("order_type", filterOrderType.trim());
    api
      .get(`/orders/?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        const list = Array.isArray(data) ? data : [];
        setOrders(list);
        const totalHeader = res.headers?.["x-total-count"];
        setTotalCount(totalHeader != null ? parseInt(String(totalHeader), 10) : list.length);
      })
      .catch((err) => {
        if (!cancelled) {
          setOrders([]);
          setFetchError(err?.message ?? "Błąd pobierania listy zamówień");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, rowsPerPage, filterStatus, filterOrderType]);

  const openOrder = async (orderId: number) => {
    try {
      const res = await api.get(`/orders/${orderId}/`);
      setSelectedOrder(res.data ?? null);
    } catch (err) {
      console.error("[Orders] Błąd pobierania szczegółów zamówienia:", err);
      setSelectedOrder(null);
    }
  };

  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);

  const sortedOrders = useMemo(() => {
    const list = [...safeOrders];
    list.sort((a, b) => {
      let va: number | string | boolean | undefined;
      let vb: number | string | boolean | undefined;
      if (sortBy === "order_type") {
        va = a.is_multi_item === true;
        vb = b.is_multi_item === true;
      } else if (sortBy === "total_volume") {
        va = a.total_volume ?? 0;
        vb = b.total_volume ?? 0;
      } else if (sortBy === "total_items") {
        va = a.total_items ?? 0;
        vb = b.total_items ?? 0;
      } else {
        va = ((a as Record<string, unknown>)[sortBy] as string | number | boolean | undefined) ?? "";
        vb = ((b as Record<string, unknown>)[sortBy] as string | number | boolean | undefined) ?? "";
      }
      const cmp = (va === vb) ? 0 : ((va ?? "") < (vb ?? "") ? -1 : 1);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [safeOrders, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else setSortBy(key);
  };

  const Th = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <th
      className="p-4 cursor-pointer select-none hover:bg-gray-100"
      onClick={() => toggleSort(sortKey)}
    >
      {label}
      {sortBy === sortKey && (sortDir === "asc" ? " ↑" : " ↓")}
    </th>
  );

  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-6">
        <div className="text-2xl font-semibold">Zamówienia</div>

        {fetchError && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            {fetchError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <span className="text-sm text-gray-600">{t.rowsPerPage ?? "Pokaż na stronie"}</span>
          <select
            value={rowsPerPage}
            onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            className="border rounded px-2 py-1.5 text-sm"
          >
            {ROWS_PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">{t.typ ?? "Typ"}</span>
          <select
            value={filterOrderType}
            onChange={(e) => { setFilterOrderType(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="">Wszystkie</option>
            <option value="single">{t.orderTypeSingle}</option>
            <option value="multi">{t.orderTypeMulti}</option>
          </select>
          <span className="text-sm text-gray-500">Status</span>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="">Wszystkie</option>
            <option value="NEW">NEW</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
          </select>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <Th label={t.orderId ?? "ID zamówienia"} sortKey="id" />
                <Th label="Status" sortKey="status" />
                <Th label={t.orderVolume} sortKey="total_volume" />
                <Th label={t.orderType} sortKey="order_type" />
                <Th label={t.totalItems ?? "Ilość produktów"} sortKey="total_items" />
              </tr>
            </thead>
            <tbody>
              {sortedOrders.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Brak zamówień do wyświetlenia.
                  </td>
                </tr>
              ) : (
                sortedOrders.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => openOrder(o.id)}
                    className="border-t hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="p-4">{o.id}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded">
                        {o.status ?? "NEW"}
                      </span>
                    </td>
                    <td className="p-4">
                      {o.total_volume != null ? `${Number(o.total_volume).toFixed(2)} dm³` : "-"}
                    </td>
                    <td className="p-4">
                      {o.is_multi_item ? t.orderTypeMulti : t.orderTypeSingle}
                    </td>
                    <td className="p-4">{o.total_items ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {totalCount > 0 && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-gray-200 bg-gray-50/80 text-sm text-gray-600">
              <span>
                {startRow}–{endRow} z {totalCount}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Poprzednia
                </button>
                <span className="py-1">
                  Strona {page} z {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Następna
                </button>
              </div>
            </div>
          )}
        </div>

        {loading && <div className="text-slate-500">Ładowanie...</div>}
      </div>

      {/* Panel podglądu produktów (drawer) */}
      {selectedOrder != null && (
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border-l flex flex-col max-h-[80vh]">
          <div className="p-4 border-b flex justify-between items-center">
            <span className="font-semibold">{t.orderProductPreview} #{selectedOrder.number ?? selectedOrder.id}</span>
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="text-gray-500 hover:text-black text-sm"
            >
              Zamknij
            </button>
          </div>
          <div className="p-4 overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2 text-xs text-gray-500">Produkt</th>
                  <th className="p-2 text-xs text-gray-500">SKU</th>
                  <th className="p-2 text-xs text-gray-500">Ilość</th>
                  <th className="p-2 text-xs text-gray-500">Objętość jedn. (dm³)</th>
                  <th className="p-2 text-xs text-gray-500">Waga łącznie</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                  selectedOrder.items.map((item) => {
                    const detail = item as OrderItemDetail;
                    return (
                      <tr key={item.id} className="border-t">
                        <td className="p-2">{detail.product?.name ?? "-"}</td>
                        <td className="p-2">{detail.product?.symbol ?? detail.product?.ean ?? "-"}</td>
                        <td className="p-2">{item.quantity}</td>
                        <td className="p-2">
                          {detail.unit_volume_dm3 != null ? detail.unit_volume_dm3.toFixed(2) : "-"}
                        </td>
                        <td className="p-2">
                          {detail.line_total_weight != null ? detail.line_total_weight.toFixed(2) : "-"}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-500">
                      Brak pozycji w zamówieniu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
