import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import api from "../../api/axios";
import {
  getSalesForecast,
  getProductForecast,
  getHotProducts,
  type SalesForecastResponse,
  type ProductForecastResponse,
  type ProductRotationItem,
} from "../../api/analysisApi";

const DEFAULT_TENANT_ID = 1;
const MIN_DAYS_FOR_FORECAST = 14;
const NOT_ENOUGH_MSG = "Not enough historical data for forecasting.";

type Warehouse = { id: number; name: string };

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function SalesForecast() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseData, setWarehouseData] = useState<SalesForecastResponse | null>(null);
  const [products, setProducts] = useState<ProductRotationItem[]>([]);
  const [productId, setProductId] = useState<number | null>(null);
  const [productData, setProductData] = useState<ProductForecastResponse | null>(null);
  const [loadingWarehouse, setLoadingWarehouse] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Warehouse[]>("/warehouses/")
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setWarehouses(list);
        if (list.length > 0 && warehouseId === null) setWarehouseId(list[0].id);
      })
      .catch(() => setWarehouses([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingWarehouse(true);
    setError(null);
    if (warehouseId == null) {
      setWarehouseData(null);
      setLoadingWarehouse(false);
      return;
    }
    getSalesForecast(warehouseId)
      .then((res) => {
        if (!cancelled) setWarehouseData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Błąd ładowania prognozy magazynu.");
      })
      .finally(() => {
        if (!cancelled) setLoadingWarehouse(false);
      });
    return () => { cancelled = true; };
  }, [warehouseId]);

  useEffect(() => {
    let cancelled = false;
    getHotProducts(DEFAULT_TENANT_ID, 200)
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => { cancelled = true; };
  }, []);

  const loadProductForecast = useCallback((pid: number | null) => {
    if (pid == null) {
      setProductData(null);
      return;
    }
    setLoadingProduct(true);
    getProductForecast(pid)
      .then((res) => setProductData(res))
      .catch(() => setProductData(null))
      .finally(() => setLoadingProduct(false));
  }, []);

  useEffect(() => {
    if (productId == null) {
      setProductData(null);
      return;
    }
    loadProductForecast(productId);
  }, [productId, loadProductForecast]);

  const warehouseHistory = warehouseData?.history ?? [];
  const warehouseForecast = warehouseData?.forecast ?? [];
  const warehouseNotEnough =
    warehouseData &&
    (warehouseData.message != null ||
      (warehouseData.history?.length ?? 0) < MIN_DAYS_FOR_FORECAST);

  const warehouseChartData = [
    ...warehouseHistory.map((h) => ({ date: h.date, orders: h.orders, predicted_orders: null as number | null })),
    ...warehouseForecast.map((f) => ({ date: f.date, orders: null as number | null, predicted_orders: f.predicted_orders })),
  ];

  const productHistory = productData?.history ?? [];
  const productForecast = productData?.forecast ?? [];
  const productNotEnough =
    productData &&
    (productData.message != null ||
      (productData.history?.length ?? 0) < MIN_DAYS_FOR_FORECAST);

  const productChartData = [
    ...productHistory.map((h) => ({ date: h.date, quantity: h.quantity, predicted_quantity: null as number | null })),
    ...productForecast.map((f) => ({ date: f.date, quantity: null as number | null, predicted_quantity: f.predicted_quantity })),
  ];

  const selectedProductName =
    productId != null ? products.find((p) => p.product_id === productId)?.product_name ?? `Produkt ${productId}` : null;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-800">Prognoza sprzedaży</h1>
      <p className="mt-2 text-slate-600 mb-6">
        Prognozowanie popytu: ostatnie 90 dni, sezonowość dni tygodnia, średnia 14-dniowa, prognoza 14 dni.
        Do slottingu, planowania obciążenia i zatrudnienia.
      </p>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <label className="text-sm font-medium text-slate-600">Magazyn</label>
        <select
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          value={warehouseId ?? ""}
          onChange={(e) =>
            setWarehouseId(e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">—</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name ?? `Magazyn ${w.id}`}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 mb-4">
          {error}
        </div>
      )}

      {loadingWarehouse && <p className="text-slate-500 mb-4">Ładowanie prognozy magazynu…</p>}

      {warehouseData && warehouseNotEnough && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800 mb-4">
          {warehouseData.message ?? NOT_ENOUGH_MSG}
        </div>
      )}

      {warehouseData && !warehouseNotEnough && warehouseChartData.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-medium text-slate-800 mb-2">Prognoza popytu — magazyn</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 overflow-x-auto min-h-[320px]">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={warehouseChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  fontSize={11}
                />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  labelFormatter={(v) => formatDate(String(v))}
                  formatter={(value: number) => [value?.toFixed(1) ?? "—", ""]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="orders"
                  name="Historia (zamówienia)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted_orders"
                  name="Prognoza"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {warehouseData && !loadingWarehouse && warehouseHistory.length === 0 && warehouseForecast.length === 0 && !warehouseNotEnough && (
        <p className="text-slate-500 mb-6">Brak danych zamówień dla wybranego magazynu.</p>
      )}

      <h2 className="text-lg font-medium text-slate-800 mb-2 mt-8">Prognoza popytu — produkt</h2>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="text-sm font-medium text-slate-600">Produkt</label>
        <select
          className="rounded border border-slate-300 px-3 py-1.5 text-sm min-w-[200px]"
          value={productId ?? ""}
          onChange={(e) =>
            setProductId(e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">— Wybierz produkt —</option>
          {products.map((p) => (
            <option key={p.product_id} value={p.product_id}>
              {p.product_name ?? `Produkt ${p.product_id}`}
            </option>
          ))}
        </select>
      </div>

      {loadingProduct && <p className="text-slate-500 mb-4">Ładowanie prognozy produktu…</p>}

      {productData && productNotEnough && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800 mb-4">
          {productData.message ?? NOT_ENOUGH_MSG}
        </div>
      )}

      {productId != null && !productData && !loadingProduct && (
        <p className="text-slate-500 mb-4">Brak danych prognozy dla wybranego produktu.</p>
      )}

      {productData && !productNotEnough && productChartData.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 overflow-x-auto min-h-[320px]">
          {selectedProductName && (
            <p className="text-sm text-slate-600 mb-2">{selectedProductName}</p>
          )}
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={productChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#64748b"
                fontSize={11}
              />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                labelFormatter={(v) => formatDate(String(v))}
                formatter={(value: number) => [value?.toFixed(1) ?? "—", ""]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="quantity"
                name="Historia (szt.)"
                stroke="#059669"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="predicted_quantity"
                name="Prognoza"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {productId == null && (
        <p className="text-slate-500">Wybierz produkt, aby zobaczyć prognozę sprzedaży na poziomie produktu.</p>
      )}
    </div>
  );
}
