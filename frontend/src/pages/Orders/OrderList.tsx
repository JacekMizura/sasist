import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import api from "../../api/axios";
import { useTranslation } from "../../locales";

type OrderItemDetail = {
  id: number;
  quantity: number;
  unit_volume_dm3?: number | null;
  line_total_weight?: number | null;
  product?: { name?: string; ean?: string; symbol?: string; image_url?: string };
};

type Order = {
  id: number;
  number?: string;
  status?: string;
  order_date?: string | null;
  total_volume?: number | null;
  is_multi_item?: boolean;
  total_items?: number;
  position_count?: number;
  items?: OrderItemDetail[];
};

function formatOrderDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}

function firstImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const first = imageUrl.trim().split(";").map((s) => s.trim()).find(Boolean);
  return first || null;
}

const tenantId = 1;
const warehouseId = 1;
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200, 500] as const;
type SortKey = "id" | "number" | "status" | "order_date" | "total_volume" | "order_type" | "total_items";

export default function OrderList() {
  const t = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterOrderType, setFilterOrderType] = useState("");
  const [filterOrderId, setFilterOrderId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    const params = new URLSearchParams({
      tenant_id: String(tenantId),
      warehouse_id: String(warehouseId),
      limit: String(rowsPerPage),
      offset: String((page - 1) * rowsPerPage),
      sort_by: sortBy,
      sort_dir: sortDir,
    });
    if (filterStatus.trim()) params.set("status", filterStatus.trim());
    if (filterOrderType.trim()) params.set("order_type", filterOrderType.trim());
    if (filterOrderId.trim()) params.set("order_id", filterOrderId.trim());
    if (filterDateFrom.trim()) params.set("date_from", filterDateFrom.trim());
    if (filterDateTo.trim()) params.set("date_to", filterDateTo.trim());

    api
      .get(`/orders/?${params.toString()}`)
      .then((res) => {
        const data = res.data;
        const list = Array.isArray(data) ? data : [];
        setOrders(list);
        const totalHeader = res.headers?.["x-total-count"];
        setTotalCount(totalHeader != null ? parseInt(String(totalHeader), 10) : list.length);
      })
      .catch((err) => {
        setOrders([]);
        setFetchError(err?.message ?? "Błąd pobierania listy zamówień");
      })
      .finally(() => setLoading(false));
  }, [page, rowsPerPage, filterStatus, filterOrderType, filterOrderId, filterDateFrom, filterDateTo, sortBy, sortDir]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const openOrder = async (orderId: number) => {
    try {
      const res = await api.get(`/orders/${orderId}/`);
      setSelectedOrder(res.data ?? null);
    } catch (err) {
      console.error("[Orders] Błąd pobierania szczegółów zamówienia:", err);
      setSelectedOrder(null);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else setSortBy(key);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size >= orders.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(orders.map((o) => o.id)));
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      // Backend expects DELETE /orders/bulk (no trailing slash). api interceptor adds slash and causes 405.
      const baseURL = api.defaults.baseURL ?? "http://127.0.0.1:8010";
      await axios.delete(
        `${baseURL.replace(/\/$/, "")}/orders/bulk?tenant_id=${tenantId}&warehouse_id=${warehouseId}&ids=${Array.from(selectedIds).join(",")}`
      );
      setSelectedIds(new Set());
      setSelectedOrder(null);
      fetchOrders();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

  const Th = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <th className="p-4 cursor-pointer select-none hover:bg-gray-100" onClick={() => toggleSort(sortKey)}>
      {label}
      {sortBy === sortKey && (sortDir === "asc" ? " ↑" : " ↓")}
    </th>
  );

  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-6">
        {fetchError && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            {fetchError}
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-gray-600">{t.rowsPerPage ?? "Pokaż na stronie"}</span>
            <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1.5 text-sm">
              {ROWS_PER_PAGE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
            <span className="text-sm text-gray-500">ID zamówienia / numer</span>
            <input
              type="text"
              value={filterOrderId}
              onChange={(e) => { setFilterOrderId(e.target.value); setPage(1); }}
              placeholder="ID, numer (częściowe)"
              className="border rounded px-2 py-1.5 text-sm w-36"
            />
            <span className="text-sm text-gray-500">Data od</span>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
              className="border rounded px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-gray-500">Data do</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
              className="border rounded px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-gray-500">{t.typ ?? "Typ"}</span>
            <select value={filterOrderType} onChange={(e) => { setFilterOrderType(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 text-sm">
              <option value="">Wszystkie</option>
              <option value="single">{t.orderTypeSingle}</option>
              <option value="multi">{t.orderTypeMulti}</option>
            </select>
            <span className="text-sm text-gray-500">Status</span>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 text-sm">
              <option value="">Wszystkie</option>
              <option value="NEW">NEW</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="DONE">DONE</option>
            </select>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-amber-800">Zaznaczono: {selectedIds.size}</span>
            <button type="button" onClick={bulkDelete} disabled={deleting} className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50">
              {deleting ? "Usuwanie…" : "Usuń zaznaczone"}
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-4 w-10">
                  <input type="checkbox" checked={orders.length > 0 && selectedIds.size === orders.length} onChange={toggleSelectAll} className="rounded" />
                </th>
                <Th label="Numer zamówienia" sortKey="number" />
                <Th label="Data zamówienia" sortKey="order_date" />
                <Th label="Status" sortKey="status" />
                <Th label={t.orderVolume} sortKey="total_volume" />
                <Th label={t.orderType} sortKey="order_type" />
                <Th label={t.totalItems ?? "Ilość produktów"} sortKey="total_items" />
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && !loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">Brak zamówień do wyświetlenia.</td></tr>
              ) : (
                orders.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => openOrder(o.id)}
                    className="border-t hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} className="rounded" />
                    </td>
                    <td className="p-4">{o.number ?? o.id}</td>
                    <td className="p-4 text-slate-600">{formatOrderDate(o.order_date)}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded">{o.status ?? "NEW"}</span>
                    </td>
                    <td className="p-4">{o.total_volume != null ? `${Number(o.total_volume).toFixed(2)} dm³` : "-"}</td>
                    <td className="p-4">{o.is_multi_item ? t.orderTypeMulti : t.orderTypeSingle}</td>
                    <td className="p-4" title={o.total_items != null ? `Sztuk łącznie: ${o.total_items}` : undefined}>
                      {o.position_count ?? o.total_items ?? 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {totalCount > 0 && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-gray-200 bg-gray-50/80 text-sm text-gray-600">
              <span>{startRow}–{endRow} z {totalCount}</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">Poprzednia</button>
                <span className="py-1">Strona {page} z {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">Następna</button>
              </div>
            </div>
          )}
        </div>

        {loading && <div className="text-slate-500">Ładowanie...</div>}
      </div>

      {selectedOrder != null && (
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col max-h-[80vh]">
          <div className="p-4 border-b flex justify-between items-center">
            <span className="font-semibold">{t.orderProductPreview} #{selectedOrder.number ?? selectedOrder.id}</span>
            <button type="button" onClick={() => setSelectedOrder(null)} className="text-gray-500 hover:text-black text-sm">Zamknij</button>
          </div>
          <div className="p-4 overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2 text-xs text-gray-500 w-14">Zdjęcie</th>
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
                    const imgUrl = firstImageUrl(detail.product?.image_url);
                    return (
                      <tr key={item.id} className="border-t">
                        <td className="p-2">
                          <div className="h-12 w-12 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt=""
                                className="h-12 w-12 object-contain"
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                              </svg>
                            )}
                          </div>
                        </td>
                        <td className="p-2">{detail.product?.name ?? "-"}</td>
                        <td className="p-2">{detail.product?.symbol ?? detail.product?.ean ?? "-"}</td>
                        <td className="p-2">{item.quantity}</td>
                        <td className="p-2">{detail.unit_volume_dm3 != null ? detail.unit_volume_dm3.toFixed(2) : "-"}</td>
                        <td className="p-2">{detail.line_total_weight != null ? detail.line_total_weight.toFixed(2) : "-"}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan={6} className="p-4 text-center text-slate-500">Brak pozycji w zamówieniu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
