import { useCallback, useEffect, useState } from "react";
import { getBatchPicking, type BatchPickingItem } from "../../api/analysisApi";

const DEFAULT_TENANT_ID = 1;
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100, 500] as const;
const DEFAULT_LIMIT = 25;

export default function BatchPickingPage() {
  const [items, setItems] = useState<BatchPickingItem[]>([]);
  const [name, setName] = useState("");
  const [ean, setEan] = useState("");
  const [sku, setSku] = useState("");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(() => {
    setLoading(true);
    setError(null);
    getBatchPicking(DEFAULT_TENANT_ID, {
      name: name || undefined,
      ean: ean || undefined,
      sku: sku || undefined,
      limit,
    })
      .then(setItems)
      .catch((e) => setError(e?.message ?? "Błąd ładowania"))
      .finally(() => setLoading(false));
  }, [name, ean, sku, limit]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getBatchPicking(DEFAULT_TENANT_ID, { limit: DEFAULT_LIMIT })
      .then(setItems)
      .catch((e) => setError(e?.message ?? "Błąd ładowania"))
      .finally(() => setLoading(false));
  }, []);

  if (loading && items.length === 0) {
    return <div className="min-w-0"><p className="text-slate-500">Ładowanie…</p></div>;
  }

  if (error && items.length === 0) {
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
      <h1 className="text-xl font-semibold text-slate-800">Batch picking</h1>
      <p className="mt-2 text-slate-600 mb-4">
        Łączna ilość do kompletacji per produkt (suma quantity z order_items). Nie używa tabeli picks.
      </p>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Filtry</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Wierszy na stronę</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              {ROWS_PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
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

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 text-sm">{error}</div>}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">ID</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Produkt</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Łączne pobrania</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">Brak danych.</td></tr>
            ) : (
              items.map((row) => (
                <tr key={row.product_id}>
                  <td className="px-4 py-2">{row.product_id}</td>
                  <td className="px-4 py-2">{row.product_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{row.total_picks}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
