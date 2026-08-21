/**
 * Raport zwrotów — live table + KPI + export (CSV/XLSX).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";

import {
  fetchReturnsReport,
  returnsReportExportUrl,
  type ReturnsReportDateField,
  type ReturnsReportResponse,
  type ReturnsReportSort,
} from "../../api/returnsReportApi";
import { listWmsReturnWorkflowStatuses } from "../../api/wmsReturnsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import type { ReturnStatusRead } from "../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

function isoDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return isoDateOnly(d);
}

function formatMoney(n: number, currency = "PLN"): string {
  try {
    return new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("pl-PL");
}

export default function ReturnsReportPage() {
  const { currentWarehouse } = useWarehouse();
  const warehouseId = currentWarehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(() => isoDateOnly(new Date()));
  const [dateField, setDateField] = useState<ReturnsReportDateField>("created");
  const [statusId, setStatusId] = useState<number | "">("");
  const [decision, setDecision] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [productDebounced, setProductDebounced] = useState("");
  const [orderDebounced, setOrderDebounced] = useState("");
  const [sort, setSort] = useState<ReturnsReportSort>("date");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReturnsReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ReturnStatusRead[]>([]);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setProductDebounced(productQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [productQuery]);
  useEffect(() => {
    const t = window.setTimeout(() => setOrderDebounced(orderQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [orderQuery]);

  useEffect(() => {
    if (warehouseId == null) {
      setStatuses([]);
      return;
    }
    void listWmsReturnWorkflowStatuses(tenantId, warehouseId)
      .then(setStatuses)
      .catch(() => setStatuses([]));
  }, [tenantId, warehouseId]);

  const filters = useMemo(
    () => ({
      tenantId,
      warehouseId,
      dateFrom: dateFrom ? `${dateFrom}T00:00:00` : null,
      dateTo: dateTo ? `${dateTo}T23:59:59` : null,
      dateField,
      statusId: statusId === "" ? null : Number(statusId),
      decision: decision || null,
      productQuery: productDebounced || null,
      orderQuery: orderDebounced || null,
      sort,
      direction,
      page,
      limit,
    }),
    [
      tenantId,
      warehouseId,
      dateFrom,
      dateTo,
      dateField,
      statusId,
      decision,
      productDebounced,
      orderDebounced,
      sort,
      direction,
      page,
      limit,
    ],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchReturnsReport(filters);
      setData(res);
    } catch {
      setError("Nie udało się wczytać raportu zwrotów.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, dateField, statusId, decision, productDebounced, orderDebounced, warehouseId, limit]);

  const summary = data?.summary;
  const items = data?.items ?? [];

  const toggleSort = (key: ReturnsReportSort) => {
    if (sort === key) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDirection(key === "date" ? "desc" : "asc");
    }
  };

  const clearFilters = () => {
    setDateFrom(defaultFrom());
    setDateTo(isoDateOnly(new Date()));
    setDateField("created");
    setStatusId("");
    setDecision("");
    setProductQuery("");
    setOrderQuery("");
  };

  const openExport = (format: "csv" | "xlsx") => {
    const url = returnsReportExportUrl(filters, format);
    window.open(url, "_blank", "noopener,noreferrer");
    setExportOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Raport zwrotów</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Analiza produktów i wartości zwracanych w wybranym okresie.
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setExportOpen((v) => !v)}
          >
            <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
            Eksportuj
          </button>
          {exportOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => openExport("csv")}
              >
                CSV
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => openExport("xlsx")}
              >
                Excel (.xlsx)
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Zwroty", value: String(summary.returns_count) },
            { label: "Sztuki zwrócone", value: String(summary.pieces_commercial) },
            { label: "Wartość towaru", value: formatMoney(summary.value_total, summary.currency) },
            { label: "Przyjęte na magazyn", value: `${summary.accepted_warehouse_qty} szt.` },
            { label: "Odrzucone", value: `${summary.rejected_qty} szt.` },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="min-w-[7.5rem] rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {kpi.label}
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{kpi.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
        <label className="text-[11px] text-slate-500">
          Data
          <select
            className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-sm"
            value={dateField}
            onChange={(e) => setDateField(e.target.value as ReturnsReportDateField)}
          >
            <option value="created">Utworzenia zwrotu</option>
            <option value="warehouse_commit">Przyjęcia magazynowego</option>
            <option value="refund">Rozliczenia zwrotu</option>
          </select>
        </label>
        <label className="text-[11px] text-slate-500">
          Od
          <input
            type="date"
            className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="text-[11px] text-slate-500">
          Do
          <input
            type="date"
            className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="text-[11px] text-slate-500">
          Status
          <select
            className="mt-0.5 block min-w-[8rem] rounded border border-slate-200 px-2 py-1 text-sm"
            value={statusId === "" ? "" : String(statusId)}
            onChange={(e) => setStatusId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Wszystkie</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-slate-500">
          Decyzja
          <select
            className="mt-0.5 block min-w-[8rem] rounded border border-slate-200 px-2 py-1 text-sm"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="">Wszystkie</option>
            <option value="OK">Przyjęty</option>
            <option value="DAMAGED">Uszkodzony</option>
            <option value="REJECTED">Odrzucony</option>
          </select>
        </label>
        <label className="min-w-[10rem] flex-1 text-[11px] text-slate-500">
          Produkt
          <input
            className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="Nazwa / SKU / EAN"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
          />
        </label>
        <label className="min-w-[10rem] flex-1 text-[11px] text-slate-500">
          Zamówienie / RMZ
          <input
            className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="Numer…"
            value={orderQuery}
            onChange={(e) => setOrderQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
          onClick={clearFilters}
        >
          Wyczyść filtry
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : null}
        {!loading && items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Brak zwrotów spełniających wybrane kryteria.
          </p>
        ) : (
          <table className="w-full min-w-[64rem] border-collapse text-sm">
            <thead className="sticky top-0 z-[1] bg-slate-50 text-left text-[11px] font-semibold text-slate-500">
              <tr className="border-b border-slate-200">
                {(
                  [
                    ["date", "Data"],
                    ["return_number", "Zwrot"],
                    ["order_number", "Zamówienie"],
                    ["product", "Produkt"],
                    ["qty", "Ilość"],
                    [null, "Decyzja"],
                    [null, "Przyjęto"],
                    [null, "Odrzucono"],
                    ["line_value", "Wartość towaru"],
                    ["status", "Status"],
                    [null, "Klient"],
                    [null, "Źródło"],
                    [null, "Kraj"],
                  ] as const
                ).map(([key, label], i) => (
                  <th key={`${label}-${i}`} className="whitespace-nowrap px-2 py-2">
                    {key ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 hover:text-slate-800"
                        onClick={() => toggleSort(key)}
                      >
                        {label}
                        {sort === key ? (direction === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.return_line_id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-600">
                    {formatDate(row.return_date)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Link
                      className="font-medium text-blue-700 hover:underline"
                      to={`/orders/returns/${row.return_id}`}
                    >
                      {row.return_number || `#${row.return_id}`}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    <Link className="text-blue-700 hover:underline" to={`/orders/${row.order_id}`}>
                      {row.order_number}
                    </Link>
                  </td>
                  <td className="max-w-[14rem] px-2 py-1.5">
                    {row.product_id ? (
                      <Link
                        className="block truncate text-slate-800 hover:text-blue-700 hover:underline"
                        to={`/products/${row.product_id}`}
                        title={row.product_name}
                      >
                        {row.product_name || "—"}
                      </Link>
                    ) : (
                      <span className="truncate text-slate-800">{row.product_name || "—"}</span>
                    )}
                    {row.sku ? (
                      <div className="truncate text-[11px] text-slate-400">{row.sku}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{row.qty_commercial || row.qty_returned}</td>
                  <td className="px-2 py-1.5">{row.decision_label || "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.qty_accepted}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.qty_rejected}</td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {formatMoney(row.line_value, row.currency || "PLN")}
                  </td>
                  <td className="px-2 py-1.5">{row.status_name || "—"}</td>
                  <td className="max-w-[10rem] truncate px-2 py-1.5">{row.customer_name || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.source || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.country || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} z {data.total}
          </span>
          <div className="flex items-center gap-2">
            <select
              className="rounded border border-slate-200 px-2 py-1 text-sm"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            <span className="tabular-nums">
              {data.page} / {Math.max(1, data.pages)}
            </span>
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
