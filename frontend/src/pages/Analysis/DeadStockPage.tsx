import { useCallback, useEffect, useMemo, useState } from "react";
import { getDeadStock, type DeadStockResponse } from "../../api/analysisApi";

const DEFAULT_TENANT_ID = 1;
const DEFAULT_DAYS = 90;
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100, 500] as const;
const DEFAULT_LIMIT = 25;

type SortKey = "default" | "inventory_value" | "product_value_share";

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("pl-PL", { dateStyle: "short" });
  } catch {
    return s;
  }
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatPercent(n: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " %";
}

export default function DeadStockPage() {
  const [data, setData] = useState<DeadStockResponse | null>(null);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [name, setName] = useState("");
  const [ean, setEan] = useState("");
  const [sku, setSku] = useState("");
  const [salesFrom, setSalesFrom] = useState("");
  const [salesTo, setSalesTo] = useState("");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("default");
  const runSearch = useCallback(() => {
    setLoading(true);
    setError(null);
    getDeadStock(DEFAULT_TENANT_ID, days, {
      name: name || undefined,
      ean: ean || undefined,
      sku: sku || undefined,
      salesStartDate: salesFrom || undefined,
      salesEndDate: salesTo || undefined,
      limit,
    })
      .then((res) => setData(res))
      .catch((e) => setError(e?.message ?? "Błąd ładowania"))
      .finally(() => setLoading(false));
  }, [days, name, ean, sku, salesFrom, salesTo, limit]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getDeadStock(DEFAULT_TENANT_ID, days, { limit: DEFAULT_LIMIT })
      .then((res) => setData(res))
      .catch((e) => setError(e?.message ?? "Błąd ładowania"))
      .finally(() => setLoading(false));
  }, []);

  const items = data?.items ?? [];
  const summary = data?.summary;

  const sortedItems = useMemo(() => {
    if (sortBy === "default") return items;
    const copy = [...items];
    if (sortBy === "inventory_value") {
      copy.sort((a, b) => b.inventory_value - a.inventory_value);
    } else if (sortBy === "product_value_share") {
      copy.sort((a, b) => b.product_value_share - a.product_value_share);
    }
    return copy;
  }, [items, sortBy]);

  if (loading) return <div className="min-w-0"><p className="text-slate-500">Ładowanie…</p></div>;
  if (error) {
    return (
      <div className="min-w-0">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold text-slate-800 mb-2">Zalegający towar (Inventory Aging)</h2>
      <p className="text-slate-600 mb-4">
        Analiza starzenia zapasów: ostatnia sprzedaż, wartość magazynowa, rotacja i kategorie (szybka / wolna / zalegająca).
      </p>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Filtry</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Nazwa produktu</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. cable"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">EAN</span>
            <input
              type="text"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">SKU</span>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Sprzedaż od</span>
            <input
              type="date"
              value={salesFrom}
              onChange={(e) => setSalesFrom(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Sprzedaż do</span>
            <input
              type="date"
              value={salesTo}
              onChange={(e) => setSalesTo(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Wierszy na stronę</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              {ROWS_PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={runSearch}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Ładowanie…" : "Szukaj"}
        </button>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <label className="text-sm text-slate-600">Okres referencyjny (dni):</label>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value={30}>30</option>
          <option value={60}>60</option>
          <option value={90}>90</option>
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Szybka rotacja</p>
            <p className="text-lg font-semibold text-slate-800">
              {formatMoney(summary.fast_moving_value)}
              {summary.fast_percentage != null && (
                <span className="text-slate-500 font-normal ml-1">({Math.round(summary.fast_percentage)}%)</span>
              )}
            </p>
            <p className="text-xs text-slate-500">Ostatnia sprzedaż &lt; 30 dni</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Wolna rotacja</p>
            <p className="text-lg font-semibold text-slate-800">
              {formatMoney(summary.slow_moving_value)}
              {summary.slow_percentage != null && (
                <span className="text-slate-500 font-normal ml-1">({Math.round(summary.slow_percentage)}%)</span>
              )}
            </p>
            <p className="text-xs text-slate-500">30–90 dni</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Zalegający</p>
            <p className="text-lg font-semibold text-red-700">
              {formatMoney(summary.dead_stock_value)}
              {summary.dead_percentage != null && (
                <span className="text-red-600/80 font-normal ml-1">({Math.round(summary.dead_percentage)}%)</span>
              )}
            </p>
            <p className="text-xs text-slate-500">&gt; 90 dni lub brak sprzedaży</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Łączna wartość zapasów</p>
            <p className="text-lg font-semibold text-slate-800">{formatMoney(summary.total_inventory_value)}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">ID</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Produkt</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Ilość</th>
              <th
                className="text-right px-4 py-2 font-medium text-slate-600 cursor-pointer hover:bg-slate-100 select-none"
                onClick={() => setSortBy((s) => (s === "inventory_value" ? "default" : "inventory_value"))}
                title="Sortuj po wartości"
              >
                Wartość {sortBy === "inventory_value" ? " ▼" : ""}
              </th>
              <th
                className="text-right px-4 py-2 font-medium text-slate-600 cursor-pointer hover:bg-slate-100 select-none"
                onClick={() => setSortBy((s) => (s === "product_value_share" ? "default" : "product_value_share"))}
                title="Sortuj po udziale w magazynie"
              >
                % magazynu {sortBy === "product_value_share" ? " ▼" : ""}
              </th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Ostatnia sprzedaż</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Dni bez sprzedaży</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Sprzedaż 30 dni</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Sprzedaż 90 dni</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Rotacja (90d)</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Kategoria</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedItems.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-slate-500">
                  Brak produktów z zapasem dla tego tenanta.
                </td>
              </tr>
            ) : (
              sortedItems.map((row) => (
                <tr key={row.product_id} className={row.category === "DEAD_STOCK" ? "bg-red-50/50" : ""}>
                  <td className="px-4 py-2">{row.product_id}</td>
                  <td className="px-4 py-2">{row.product_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{row.inventory_quantity}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(row.inventory_value)}</td>
                  <td className="px-4 py-2 text-right">{formatPercent(row.product_value_share * 100)}</td>
                  <td className="px-4 py-2">{formatDate(row.last_sale_date)}</td>
                  <td className="px-4 py-2 text-right">{row.days_since_last_sale ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{row.sales_last_30_days}</td>
                  <td className="px-4 py-2 text-right">{row.sales_last_90_days}</td>
                  <td className="px-4 py-2 text-right">{row.rotation_rate.toFixed(4)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        row.category === "FAST_MOVING"
                          ? "text-green-700"
                          : row.category === "SLOW_MOVING"
                            ? "text-amber-700"
                            : "text-red-700 font-medium"
                      }
                    >
                      {row.category === "FAST_MOVING" ? "Szybka" : row.category === "SLOW_MOVING" ? "Wolna" : "Zalegający"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
