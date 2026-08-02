import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import api from "../../api/axios";
import { PrimaryButton } from "../../design-system/PrimaryButton";
import {
  getPickingStrategy,
  type PickingStrategyResult,
  type PickingStrategyResponse,
} from "../../api/analysisApi";
import {
  OptimizationPlanPanel,
  OptimizationToolHeader,
} from "../../modules/optymalizacja/OptimizationPlan";
import { useWarehouseChangePlan } from "../../modules/optymalizacja/useWarehouseChangePlan";
import type { ChangePriority } from "../../modules/optymalizacja/warehouseChangePlanStore";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";

const DEFAULT_TENANT_ID = 1;
const DEFAULT_ORDER_LIMIT = 100;
const BAR_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981"];

type Warehouse = { id: number; name: string };

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function lastNDays(n: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - n);
  return { start: toDateStr(start), end: toDateStr(end) };
}

function formatNum(n: number, decimals = 1): string {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export default function PickingStrategyPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [orderLimit, setOrderLimit] = useState(DEFAULT_ORDER_LIMIT);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [useDateRange, setUseDateRange] = useState<boolean>(false);
  const [cartCapacity, setCartCapacity] = useState(10);
  const [basketCount, setBasketCount] = useState(6);
  const [zoneCount, setZoneCount] = useState(3);
  const [data, setData] = useState<PickingStrategyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const { add } = useWarehouseChangePlan();
  const { user } = useAuth();
  const { warehouse } = useWarehouse();

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

  const runSimulation = useCallback(() => {
    if (warehouseId == null) return;
    setLoading(true);
    setError(null);
    setData(null);
    const options = useDateRange && startDate && endDate
      ? { startDate, endDate }
      : { limit: orderLimit };
    getPickingStrategy(warehouseId, DEFAULT_TENANT_ID, options)
      .then((res) => setData(res))
      .catch((e) => setError(e?.message ?? "Błąd symulacji"))
      .finally(() => setLoading(false));
  }, [warehouseId, orderLimit, useDateRange, startDate, endDate]);

  const strategies: PickingStrategyResult[] = data?.strategies ?? [];
  const bestStrategy: PickingStrategyResult | null =
    strategies.length > 0
      ? strategies.reduce((best, s) =>
          s.orders_per_hour > best.orders_per_hour ? s : best
        )
      : null;

  const saveDecision = () => {
    if (warehouseId == null || !bestStrategy) return;
    const worst = strategies.reduce((w, s) =>
      s.orders_per_hour < w.orders_per_hour ? s : w
    );
    const gain = bestStrategy.orders_per_hour - worst.orders_per_hour;
    let priority: ChangePriority = "sredni";
    if (gain >= 5) priority = "wysoki";
    else if (gain < 1) priority = "niski";

    const authorName =
      [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
      user?.login ||
      "Nieznany";
    const result = add({
      source: "strategy",
      dedupeKey: `strategy:wh:${warehouseId}:${bestStrategy.strategy_name}`,
      title: `Wdróż strategię „${bestStrategy.strategy_name}”`,
      description: `${formatNum(bestStrategy.orders_per_hour)} zamówień/godz. (vs najsłabsza: ${formatNum(worst.orders_per_hour)})`,
      executedDescription: `Wdrożono strategię kompletacji „${bestStrategy.strategy_name}”.`,
      priority,
      originLabel: "Strategia kompletacji",
      impactConcrete: `+${formatNum(gain)} zamówień/godz. względem najsłabszej strategii`,
      impactScore: gain * 100,
      sourcePath: "/optymalizacja/picking-strategy",
      authorName,
      authorId: user?.id ?? null,
      warehouseName:
        warehouses.find((w) => w.id === warehouseId)?.name ?? warehouse?.name ?? null,
      warehouseId,
    });
    setPlanMsg(
      result.ok
        ? "Dodano strategię do planu zmian."
        : "Ta strategia jest już w planie zmian."
    );
  };

  const chartData = strategies.map((s) => ({
    name: s.strategy_name,
    orders_per_hour: s.orders_per_hour,
  }));

  return (
    <div className="min-w-0 space-y-6">
      <OptimizationToolHeader
        title="Strategia kompletacji"
        question="Który sposób pracy (wózek, koszyki, strefy) daje najwyższą wydajność w szczycie obciążenia?"
        decision="Jaką strategię wdrożyć na magazynie?"
      />

      {/* 1. Simulation parameters */}
      <div className="bg-white rounded-xl shadow border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Parametry symulacji
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Magazyn</span>
            <select
              value={warehouseId ?? ""}
              onChange={(e) =>
                setWarehouseId(e.target.value ? Number(e.target.value) : null)
              }
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Wybierz magazyn</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Zakres dat zamówień</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const { start, end } = lastNDays(7);
                  setStartDate(start);
                  setEndDate(end);
                  setUseDateRange(true);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
              >
                Ostatnie 7 dni
              </button>
              <button
                type="button"
                onClick={() => {
                  const { start, end } = lastNDays(30);
                  setStartDate(start);
                  setEndDate(end);
                  setUseDateRange(true);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
              >
                Ostatnie 30 dni
              </button>
              <button
                type="button"
                onClick={() => setUseDateRange(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
              >
                Ostatnie N zamówień
              </button>
            </div>
          </div>
          {useDateRange ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Data od</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Data do</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Liczba zamówień do symulacji</span>
              <input
                type="number"
                min={1}
                max={500}
                value={orderLimit}
                onChange={(e) => setOrderLimit(Number(e.target.value) || 1)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Pojemność wózka (zamówienia)</span>
            <input
              type="number"
              min={1}
              value={cartCapacity}
              onChange={(e) => setCartCapacity(Number(e.target.value) || 1)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Liczba koszyków</span>
            <input
              type="number"
              min={1}
              value={basketCount}
              onChange={(e) => setBasketCount(Number(e.target.value) || 1)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Liczba stref</span>
            <input
              type="number"
              min={1}
              value={zoneCount}
              onChange={(e) => setZoneCount(Number(e.target.value) || 1)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-4">
          <PrimaryButton
            type="button"
            onClick={runSimulation}
            disabled={
              loading ||
              warehouseId == null ||
              (useDateRange && (!startDate || !endDate))
            }
          >
            {loading ? "Symulacja…" : "Uruchom symulację"}
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Dataset statistics */}
          <div className="bg-white rounded-xl shadow border border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">
              Statystyki zbioru
            </h2>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-slate-500">Zamówienia: </span>
                <span className="font-medium text-slate-800">{data.orders_used}</span>
              </div>
              <div>
                <span className="text-slate-500">Łączna liczba pozycji: </span>
                <span className="font-medium text-slate-800">{data.total_items}</span>
              </div>
              <div>
                <span className="text-slate-500">Średnio pozycji na zamówienie: </span>
                <span className="font-medium text-slate-800">
                  {formatNum(data.avg_items_per_order)}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Best strategy highlight */}
          {bestStrategy && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-emerald-800 mb-1">
                Rekomendacja dla tego magazynu
              </h3>
              <p className="text-emerald-700">
                Najlepsza strategia: <strong>{bestStrategy.strategy_name}</strong> —{" "}
                {formatNum(bestStrategy.orders_per_hour)} zamówień/godz.
              </p>
              <p className="text-slate-600 text-sm mt-1">
                Na podstawie {data.orders_used} zamówień.
              </p>
            </div>
          )}

          {/* 2. Strategy comparison table */}
          <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
            <h2 className="text-lg font-semibold text-slate-800 p-4 border-b border-slate-100">
              Porównanie strategii
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="py-3 px-4 font-medium text-slate-600">Strategia</th>
                    <th className="py-3 px-4 font-medium text-slate-600 text-right">
                      Dystans (m)
                    </th>
                    <th className="py-3 px-4 font-medium text-slate-600 text-right">
                      Czas kompletacji (s)
                    </th>
                    <th className="py-3 px-4 font-medium text-slate-600 text-right">
                      Czas pakowania (s)
                    </th>
                    <th className="py-3 px-4 font-medium text-slate-600 text-right">
                      Liczba kompletujących
                    </th>
                    <th className="py-3 px-4 font-medium text-slate-600 text-right">
                      Zamówienia/godz.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {strategies.map((s) => (
                    <tr
                      key={s.strategy_name}
                      className="border-t border-slate-100 hover:bg-slate-50/80"
                    >
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {s.strategy_name}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700">
                        {formatNum(s.total_walking_distance)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700">
                        {formatNum(s.estimated_picking_time)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700">
                        {formatNum(s.estimated_packing_time)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700">
                        {s.required_picker_count}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-800">
                        {formatNum(s.orders_per_hour)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Performance chart */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-xl shadow border border-slate-200 p-4">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                Wydajność: zamówienia na godzinę
              </h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 16, right: 16, left: 16, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      stroke="#64748b"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="#64748b"
                      tickFormatter={(v) => formatNum(v, 0)}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatNum(value, 1), "Zamówienia/godz."]}
                      contentStyle={{ borderRadius: "8px" }}
                    />
                    <Bar dataKey="orders_per_hour" name="Zamówienia/godz." radius={[4, 4, 0, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && warehouseId != null && (
        <p className="text-slate-500 text-sm">
          Wybierz magazyn i kliknij „Uruchom symulację”, aby zobaczyć porównanie strategii
          kompletacji.
        </p>
      )}

      <OptimizationPlanPanel
        summary={
          bestStrategy
            ? `Rekomendacja: wdroż strategię „${bestStrategy.strategy_name}” (${formatNum(bestStrategy.orders_per_hour)} zamówień/godz.).`
            : "Uruchom symulację, aby wybrać strategię do planu zmian."
        }
        items={
          bestStrategy
            ? strategies.map(
                (s) =>
                  `${s.strategy_name}: ${formatNum(s.orders_per_hour)} zam./godz., dystans ${formatNum(s.total_walking_distance, 0)} m`
              )
            : undefined
        }
        emptyMessage="Brak wyników porównania."
        actions={[
          ...(bestStrategy
            ? [
                {
                  label: "Dodaj strategię do planu",
                  onClick: saveDecision,
                  primary: true as const,
                },
              ]
            : []),
          { label: "Zobacz plan zmian", to: "/optymalizacja/plan" },
        ]}
      />
      {planMsg ? (
        <p className="text-sm text-emerald-700">
          {planMsg}{" "}
          <Link to="/optymalizacja/plan" className="font-medium underline">
            Otwórz plan
          </Link>
        </p>
      ) : null}
    </div>
  );
}
