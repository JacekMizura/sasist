/**
 * Raport zwrotów — 1 główny wiersz = 1 RMZ, produkty w expandzie.
 * Eksport pozostaje granularny (1 RMZLine = 1 wiersz).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";

import {
  fetchReturnsReport,
  returnsReportExportUrl,
  type ReturnsReportDateField,
  type ReturnsReportGroup,
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

function polishProductsWord(n: number): string {
  if (n === 1) return "1 produkt";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} produkty`;
  return `${n} produktów`;
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
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

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
    setExpanded(new Set());
  }, [dateFrom, dateTo, dateField, statusId, decision, productDebounced, orderDebounced, warehouseId, limit]);

  const summary = data?.summary;
  const items = data?.items ?? [];

  const toggleExpand = (returnId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(returnId)) next.delete(returnId);
      else next.add(returnId);
      return next;
    });
  };

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
    window.open(returnsReportExportUrl(filters, format), "_blank", "noopener,noreferrer");
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Zwroty", value: String(summary.returns_count) },
            { label: "Sztuki", value: String(summary.pieces_commercial) },
            { label: "Wartość towaru", value: formatMoney(summary.value_total, summary.currency) },
            { label: "Przyjęto", value: String(summary.accepted_warehouse_qty) },
            { label: "Odrzucono", value: String(summary.rejected_qty) },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="flex h-[3.25rem] flex-col justify-center rounded-md border border-slate-200 bg-white px-3"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {kpi.label}
              </div>
              <div className="text-[15px] font-semibold tabular-nums leading-tight text-slate-900">
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-x-2 gap-y-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
        <label className="w-[9.5rem] text-[11px] text-slate-500">
          Data
          <select
            className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={dateField}
            onChange={(e) => setDateField(e.target.value as ReturnsReportDateField)}
          >
            <option value="created">Utworzenia zwrotu</option>
            <option value="warehouse_commit">Przyjęcia magazynowego</option>
            <option value="refund">Rozliczenia zwrotu</option>
          </select>
        </label>
        <label className="w-[8.25rem] text-[11px] text-slate-500">
          Od
          <input
            type="date"
            className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="w-[8.25rem] text-[11px] text-slate-500">
          Do
          <input
            type="date"
            className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="w-[8.5rem] text-[11px] text-slate-500">
          Status
          <select
            className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
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
        <label className="w-[8.5rem] text-[11px] text-slate-500">
          Decyzja
          <select
            className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="">Wszystkie</option>
            <option value="OK">Przyjęty</option>
            <option value="DAMAGED">Uszkodzony</option>
            <option value="REJECTED">Odrzucony</option>
          </select>
        </label>
        <label className="min-w-[9rem] max-w-[14rem] flex-1 text-[11px] text-slate-500">
          Produkt
          <input
            className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="Nazwa / SKU / EAN"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
          />
        </label>
        <label className="min-w-[9rem] max-w-[14rem] flex-1 text-[11px] text-slate-500">
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
          Wyczyść
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
          <table className="w-full min-w-[70rem] border-collapse text-sm">
            <thead className="sticky top-0 z-[1] bg-slate-50 text-left text-[11px] font-semibold text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="w-8 px-1 py-2" aria-label="Rozwiń" />
                {(
                  [
                    ["date", "Data"],
                    ["return_number", "Zwrot"],
                    ["order_number", "Zamówienie"],
                    ["product_lines", "Produkty"],
                    ["qty", "Szt."],
                    ["accepted", "Przyj."],
                    ["rejected", "Odrz."],
                    ["line_value", "Wartość"],
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
              {items.map((group) => (
                <ReturnGroupRows
                  key={group.return.return_id}
                  group={group}
                  expanded={expanded.has(group.return.return_id)}
                  onToggle={() => toggleExpand(group.return.return_id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} z{" "}
            {data.total} zwrotów
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

function ReturnGroupRows({
  group,
  expanded,
  onToggle,
}: {
  group: ReturnsReportGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const r = group.return;
  const a = group.aggregates;
  const currency = r.currency || "PLN";
  const productsCell =
    a.product_lines >= 3 ? polishProductsWord(a.product_lines) : a.products_label || polishProductsWord(a.product_lines);

  return (
    <>
      <tr
        className="h-[48px] cursor-pointer border-b border-slate-100 bg-white hover:bg-slate-50/90"
        onClick={onToggle}
        data-testid={`return-row-${r.return_id}`}
        data-expanded={expanded ? "true" : "false"}
      >
        <td className="px-1 text-slate-400">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-slate-100"
            aria-label={expanded ? "Zwiń" : "Rozwiń"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" strokeWidth={2} />
            ) : (
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </td>
        <td className="whitespace-nowrap px-2 tabular-nums text-slate-600">{formatDate(r.return_date)}</td>
        <td className="px-2 font-medium text-slate-900">
          <Link
            className="text-blue-700 hover:underline"
            to={`/orders/returns/${r.return_id}`}
            onClick={(e) => e.stopPropagation()}
          >
            {r.return_number || `#${r.return_id}`}
          </Link>
        </td>
        <td className="px-2">
          <Link
            className="font-medium text-blue-700 hover:underline"
            to={`/orders/${r.order_id}`}
            onClick={(e) => e.stopPropagation()}
          >
            {r.order_number}
          </Link>
        </td>
        <td className="max-w-[12rem] truncate px-2 text-slate-700" title={productsCell}>
          {productsCell}
        </td>
        <td className="px-2 tabular-nums">{a.quantity}</td>
        <td className="px-2 tabular-nums">{a.accepted_qty}</td>
        <td className="px-2 tabular-nums">{a.rejected_qty}</td>
        <td className="px-2 tabular-nums font-medium">{formatMoney(a.value_gross, currency)}</td>
        <td className="px-2">{r.status_name || "—"}</td>
        <td className="max-w-[9rem] truncate px-2 text-slate-700">{r.customer_name || "—"}</td>
        <td className="px-2 text-slate-600">{r.source || "—"}</td>
        <td className="px-2 text-slate-600">{r.country || "—"}</td>
      </tr>
      {expanded ? (
        <tr className="border-b border-slate-100" data-testid={`return-lines-${r.return_id}`}>
          <td colSpan={13} className="bg-slate-50/80 p-0">
            <div
              className={
                group.lines.length > 20
                  ? "max-h-[28rem] overflow-y-auto border-l-2 border-slate-200 pl-6"
                  : "border-l-2 border-slate-200 pl-6"
              }
            >
              {group.lines.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500">Brak pozycji zwrotu.</p>
              ) : (
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-1.5 font-semibold">Produkt</th>
                      <th className="w-16 px-2 py-1.5">Ilość</th>
                      <th className="w-28 px-2 py-1.5">Decyzja</th>
                      <th className="w-16 px-2 py-1.5">Przyj.</th>
                      <th className="w-16 px-2 py-1.5">Odrz.</th>
                      <th className="w-28 px-2 py-1.5">Wartość</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((line) => (
                      <tr
                        key={line.return_line_id}
                        className="h-[38px] border-t border-slate-100/80"
                        data-testid={`return-line-${line.return_line_id}`}
                      >
                        <td className="max-w-[22rem] px-3 py-1">
                          {line.product_id ? (
                            <Link
                              className="block truncate font-medium text-slate-800 hover:text-blue-700 hover:underline"
                              to={`/products/${line.product_id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {line.product_name || "—"}
                            </Link>
                          ) : (
                            <span className="truncate font-medium text-slate-800">
                              {line.product_name || "—"}
                            </span>
                          )}
                          {(line.sku || line.ean) && (
                            <div className="truncate text-[11px] text-slate-400">
                              {[line.sku, line.ean].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="px-2 tabular-nums text-slate-700">
                          {line.qty_commercial || line.qty_returned}
                        </td>
                        <td className="px-2 text-slate-600">{line.decision_label || "—"}</td>
                        <td className="px-2 tabular-nums">{line.qty_accepted}</td>
                        <td className="px-2 tabular-nums">{line.qty_rejected}</td>
                        <td className="px-2 tabular-nums text-slate-700">
                          {formatMoney(line.line_value, line.currency || currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
