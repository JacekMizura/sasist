import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api from "../../api/axios";
import {
  getWarehouseGraphNodes,
  getWarehouseGraphEdges,
  type WarehouseGraphNode,
  type WarehouseGraphEdge,
} from "../../api/warehouseGraphApi";
import { PrimaryButton } from "../../design-system/PrimaryButton";
import {
  OptimizationPlanPanel,
  OptimizationToolHeader,
} from "../../modules/optymalizacja/OptimizationPlan";
import WalkingCostPage from "./WalkingCostPage";
import { useWarehouseChangePlan } from "../../modules/optymalizacja/useWarehouseChangePlan";
import type { ChangePriority } from "../../modules/optymalizacja/warehouseChangePlanStore";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";

const DEFAULT_TENANT_ID = 1;
const ORDERS_PAGE_SIZE = 100;
const SVG_WIDTH = 900;
const SVG_HEIGHT = 400;
const PAD = 40;
const NODE_R = 4;

type Warehouse = { id: number; name: string };
type OrderOption = { id: number; number: string | null };
type RoutePoint = { node_id?: number; x: number; y: number };
type SpecialLocations = { pick_start: { id: number; x: number; y: number } | null; packing: { id: number; x: number; y: number } | null };
type PickRouteResponse = {
  warehouse_id: number | null;
  route: RoutePoint[];
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
  total_distance: number;
  estimated_time: number;
  pick_locations: { location_id: number; location_name: string; x: number; y: number }[];
  error?: string;
};
type BatchRouteItem = { order_id: number; distance: number; estimated_time: number; route: { x: number; y: number }[] };
type BatchResult = {
  orders_count?: number;
  total_distance?: number;
  estimated_time?: number;
  routes?: BatchRouteItem[];
};

async function fetchOrdersPage(
  warehouseId: number,
  page: number,
  search: string
): Promise<{ orders: OrderOption[]; total: number }> {
  const params = new URLSearchParams({
    tenant_id: String(DEFAULT_TENANT_ID),
    warehouse_id: String(warehouseId),
    limit: String(ORDERS_PAGE_SIZE),
    offset: String(page * ORDERS_PAGE_SIZE),
  });
  if (search.trim()) params.set("search", search.trim());
  const { data, headers } = await api.get<OrderOption[]>(`/orders/?${params.toString()}`);
  const list = Array.isArray(data) ? data : [];
  const total = headers?.["x-total-count"] != null ? parseInt(String(headers["x-total-count"]), 10) : list.length;
  return { orders: list.map((o) => ({ id: o.id, number: o.number ?? null })), total };
}

async function fetchPickRoute(orderNumber: string): Promise<PickRouteResponse> {
  const { data } = await api.get<PickRouteResponse>(`/analysis/pick-route/${encodeURIComponent(orderNumber)}`);
  return data ?? { warehouse_id: null, route: [], start: null, end: null, total_distance: 0, estimated_time: 0, pick_locations: [] };
}

async function fetchSpecialLocations(warehouseId: number): Promise<SpecialLocations> {
  const { data } = await api.get<SpecialLocations>(`/warehouse/${warehouseId}/special-locations`);
  return data ?? { pick_start: null, packing: null };
}

async function fetchPickRouteBatch(warehouseId: number, orderIds: number[]): Promise<BatchResult> {
  const { data } = await api.post<BatchResult>("/analysis/pick-route/batch", {
    warehouse_id: warehouseId,
    order_ids: orderIds,
    record_picks: false,
  });
  return data ?? { orders_count: 0, total_distance: 0, estimated_time: 0, routes: [] };
}

function useScale(
  nodes: WarehouseGraphNode[],
  routePoints: { x: number; y: number }[],
  start?: { x: number; y: number } | null,
  end?: { x: number; y: number } | null
) {
  return useMemo(() => {
    const points: { x: number; y: number }[] = [];
    nodes.forEach((n) => points.push({ x: Number(n.x), y: Number(n.y) }));
    routePoints.forEach((p) => points.push({ x: p.x, y: p.y }));
    if (start) points.push(start);
    if (end) points.push(end);
    if (points.length === 0) {
      return { scaleX: (x: number) => PAD, scaleY: (y: number) => PAD };
    }
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min((SVG_WIDTH - 2 * PAD) / rangeX, (SVG_HEIGHT - 2 * PAD) / rangeY);
    return {
      scaleX: (x: number) => PAD + (x - minX) * scale,
      scaleY: (y: number) => PAD + (y - minY) * scale,
    };
  }, [nodes, routePoints, start, end]);
}

export default function PickPathSimulation() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [singleOrderId, setSingleOrderId] = useState<number | null>(null);
  const [routeData, setRouteData] = useState<PickRouteResponse | null>(null);
  const [nodes, setNodes] = useState<WarehouseGraphNode[]>([]);
  const [edges, setEdges] = useState<WarehouseGraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [specialLocations, setSpecialLocations] = useState<SpecialLocations | null>(null);
  const [view, setView] = useState<"routes" | "distance">("routes");
  const [distanceSummary, setDistanceSummary] = useState<{
    count: number;
    avgDistance: number | null;
  } | null>(null);
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const { add } = useWarehouseChangePlan();
  const { user } = useAuth();
  const { warehouse } = useWarehouse();

  const authorMeta = () => {
    const authorName =
      [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
      user?.login ||
      "Nieznany";
    return {
      authorName,
      authorId: user?.id ?? null,
      warehouseName: warehouse?.name ?? warehouses.find((w) => w.id === warehouseId)?.name ?? null,
      warehouseId: warehouseId ?? warehouse?.id ?? null,
    };
  };

  const addRoutesToPlan = (kind: "distance" | "batch" | "single") => {
    const meta = authorMeta();
    if (kind === "distance" && distanceSummary?.avgDistance != null) {
      const avg = distanceSummary.avgDistance;
      let priority: ChangePriority = "sredni";
      if (avg >= 80) priority = "wysoki";
      else if (avg < 30) priority = "niski";
      const result = add({
        source: "routes",
        dedupeKey: `routes:distance:tenant:${DEFAULT_TENANT_ID}`,
        title: "Skróć średni dystans kompletacji",
        description: `Średni dystans ${Math.round(avg)} m na ${distanceSummary.count} zamówieniach.`,
        executedDescription: `Skrócono średni dystans kompletacji (bazowo ~${Math.round(avg)} m).`,
        priority,
        originLabel: "Dystans kompletacji",
        impactConcrete: `~${Math.round(avg)} m średnio / zamówienie`,
        impactScore: avg,
        sourcePath: "/optymalizacja/pick-path",
        ...meta,
      });
      setPlanMsg(result.ok ? "Dodano do planu zmian." : "Ta rekomendacja jest już w planie.");
      return;
    }
    if (kind === "batch" && batchResult?.total_distance != null) {
      const total = batchResult.total_distance;
      const orders = batchResult.orders_count ?? selectedIds.size;
      let priority: ChangePriority = "sredni";
      if (total >= 500) priority = "wysoki";
      else if (total < 100) priority = "niski";
      const result = add({
        source: "routes",
        dedupeKey: `routes:batch:wh:${warehouseId ?? "x"}:${orders}`,
        title: `Skróć trasy dla wsadu ${orders} zamówień`,
        description: `Łączny dystans wsadu: ${Math.round(total)} m.`,
        executedDescription: `Zoptymalizowano trasy dla wsadu ${orders} zamówień.`,
        priority,
        originLabel: "Trasy kompletacji",
        impactConcrete: `${Math.round(total)} m łącznie (wsad)`,
        impactScore: total,
        sourcePath: "/optymalizacja/pick-path",
        ...meta,
      });
      setPlanMsg(result.ok ? "Dodano do planu zmian." : "Ta rekomendacja jest już w planie.");
      return;
    }
    if (kind === "single" && routeData?.total_distance != null) {
      const d = routeData.total_distance;
      let priority: ChangePriority = "sredni";
      if (d >= 100) priority = "wysoki";
      else if (d < 40) priority = "niski";
      const result = add({
        source: "routes",
        dedupeKey: `routes:single:${singleOrderId ?? "x"}`,
        title: "Skróć trasę wybranego zamówienia",
        description: `Dystans zamówienia: ${d} m.`,
        executedDescription: `Skrócono trasę zamówienia (bazowo ${d} m).`,
        priority,
        originLabel: "Trasy kompletacji",
        impactConcrete: `${d} m na zamówieniu`,
        impactScore: d,
        sourcePath: "/optymalizacja/pick-path",
        ...meta,
      });
      setPlanMsg(result.ok ? "Dodano do planu zmian." : "Ta rekomendacja jest już w planie.");
    }
  };

  useEffect(() => {
    api.get<Warehouse[]>("/warehouses/").then((r) => {
      const list = Array.isArray(r.data) ? r.data : [];
      setWarehouses(list);
      if (list.length > 0 && warehouseId === null) setWarehouseId(list[0].id);
    }).catch(() => setWarehouses([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (warehouseId == null) {
      setOrders([]);
      setTotalOrders(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchOrdersPage(warehouseId, page, searchDebounced)
      .then(({ orders: list, total }) => {
        if (!cancelled) {
          setOrders(list);
          setTotalOrders(total);
        }
      })
      .catch(() => { if (!cancelled) setOrders([]); setTotalOrders(0); })
      .finally(() => { if (!cancelled) setLoading(false); });
  }, [warehouseId, page, searchDebounced]);

  useEffect(() => {
    if (warehouseId == null) {
      setSpecialLocations(null);
      return;
    }
    fetchSpecialLocations(warehouseId).then(setSpecialLocations).catch(() => setSpecialLocations(null));
  }, [warehouseId]);

  const hasStartAndPacking = Boolean(specialLocations?.pick_start && specialLocations?.packing);

  const loadRouteAndGraph = useCallback((oid: number | null, ordersList: OrderOption[]) => {
    if (oid == null) {
      setRouteData(null);
      setNodes([]);
      setEdges([]);
      return;
    }
    const orderNumber = ordersList.find((o) => o.id === oid)?.number ?? null;
    if (orderNumber == null || orderNumber === "") {
      setRouteData(null);
      setNodes([]);
      setEdges([]);
      setError("Order number not available");
      return;
    }
    setLoading(true);
    setError(null);
    fetchPickRoute(orderNumber)
      .then((res) => {
        setRouteData(res);
        setError(res.error ?? null);
        const whId = res.warehouse_id;
        if (whId != null && (res.route?.length > 0 || res.pick_locations?.length > 0)) {
          return Promise.all([
            getWarehouseGraphNodes(whId),
            getWarehouseGraphEdges(whId),
          ]).then(([n, e]) => ({ nodes: n, edges: e }));
        }
        return { nodes: [] as WarehouseGraphNode[], edges: [] as WarehouseGraphEdge[] };
      })
      .then((g) => {
        setNodes(g.nodes);
        setEdges(g.edges);
      })
      .catch((err) => {
        setError(err?.message ?? "Błąd ładowania trasy");
        setRouteData(null);
        setNodes([]);
        setEdges([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRouteAndGraph(singleOrderId, orders);
  }, [singleOrderId, orders, loadRouteAndGraph]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    const onPage = new Set(orders.map((o) => o.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      onPage.forEach((id) => next.add(id));
      return next;
    });
  };

  const runBatchSimulation = () => {
    if (warehouseId == null || selectedIds.size === 0) return;
    if (!hasStartAndPacking) {
      setError("Define start and packing locations in the warehouse designer.");
      return;
    }
    const orderIds = orders.filter((o) => selectedIds.has(o.id)).map((o) => o.id);
    if (orderIds.length === 0) {
      setError("Nie wybrano zamówień.");
      return;
    }
    setLoadingBatch(true);
    setError(null);
    setBatchResult(null);
    fetchPickRouteBatch(warehouseId, orderIds)
      .then(setBatchResult)
      .catch((err) => setError(err?.message ?? "Błąd symulacji wsadowej"))
      .finally(() => setLoadingBatch(false));
  };

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const routePoints = routeData?.route ?? [];
  const routePointsXY = useMemo(() => routePoints.map((p) => ({ x: p.x, y: p.y })), [routePoints]);
  const { scaleX, scaleY } = useScale(nodes, routePointsXY, routeData?.start ?? null, routeData?.end ?? null);

  const routePath = useMemo(() => {
    if (routePoints.length < 2) return "";
    return routePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.x)} ${scaleY(p.y)}`).join(" ");
  }, [routePoints, scaleX, scaleY]);

  const chartData = useMemo(() => {
    if (!batchResult?.routes?.length) return [];
    return batchResult.routes.map((r) => ({ order_id: r.order_id, distance: r.distance, name: `#${r.order_id}` }));
  }, [batchResult]);

  const totalPages = Math.max(1, Math.ceil(totalOrders / ORDERS_PAGE_SIZE));

  return (
    <div className="min-w-0">
      <OptimizationToolHeader
        title="Trasy i dystans kompletacji"
        question="Gdzie trasy są za długie przy obecnym układzie i grafie?"
        decision="Skrócić drogę regułą trasy czy przesunięciem towaru?"
      />

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setView("routes")}
          className={
            view === "routes"
              ? "rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
              : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
          }
        >
          Symulacja tras
        </button>
        <button
          type="button"
          onClick={() => setView("distance")}
          className={
            view === "distance"
              ? "rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
              : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
          }
        >
          Dystans zamówień
        </button>
      </div>

      {view === "distance" ? (
        <>
          <WalkingCostPage
            embedded
            onSummary={setDistanceSummary}
          />
          <OptimizationPlanPanel
            summary={
              distanceSummary?.avgDistance != null
                ? `Średni dystans: ${Math.round(distanceSummary.avgDistance)} m na ${distanceSummary.count} zamówień.`
                : "Policz dystans zamówień, aby dodać rekomendację do planu."
            }
            actions={[
              ...(distanceSummary?.avgDistance != null
                ? [
                    {
                      label: "Dodaj do planu zmian",
                      onClick: () => addRoutesToPlan("distance"),
                      primary: true as const,
                    },
                  ]
                : []),
              { label: "Zobacz plan zmian", to: "/optymalizacja/plan" },
            ]}
          />
          {planMsg ? (
            <p className="mt-2 text-sm text-emerald-700">
              {planMsg}{" "}
              <Link to="/optymalizacja/plan" className="font-medium underline">
                Otwórz plan
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="text-sm font-medium text-slate-600">Magazyn</label>
        <select
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          value={warehouseId ?? ""}
          onChange={(e) => {
            setWarehouseId(e.target.value ? Number(e.target.value) : null);
            setPage(0);
            setBatchResult(null);
          }}
        >
          <option value="">—</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name ?? `Magazyn ${w.id}`}</option>
          ))}
        </select>
        <label className="text-sm font-medium text-slate-600">Szukaj</label>
        <input
          type="text"
          placeholder="Numer zamówienia, nazwa produktu, SKU…"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm min-w-[220px]"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>

      {warehouseId != null && !hasStartAndPacking && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-4 text-amber-800 text-sm">
          Define start and packing locations in the warehouse designer.
        </div>
      )}

      {warehouseId != null && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden mb-4">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-slate-700">
              Wybrane: <strong>{selectedIds.size}</strong> zamówień
            </span>
            <button
              type="button"
              onClick={selectAllOnPage}
              className="text-sm text-blue-600 hover:underline"
            >
              Zaznacz wszystkie na stronie
            </button>
            <PrimaryButton
              type="button"
              onClick={runBatchSimulation}
              disabled={selectedIds.size === 0 || loadingBatch || !hasStartAndPacking}
            >
              {loadingBatch ? "Symulowanie…" : "Symuluj wybrane zamówienia"}
            </PrimaryButton>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {loading ? (
              <p className="p-4 text-slate-500">Ładowanie listy…</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="w-10 px-2 py-2 text-left"></th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">ID</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Numer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">Brak zamówień</td></tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(o.id)}
                            onChange={() => toggleSelect(o.id)}
                          />
                        </td>
                        <td className="px-4 py-2">{o.id}</td>
                        <td className="px-4 py-2">{o.number ?? `#${o.id}`}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          {totalOrders > 0 && (
            <div className="p-2 border-t border-slate-200 flex items-center justify-between text-sm text-slate-600">
              <span>Strona {page + 1} z {totalPages} (łącznie {totalOrders} zamówień)</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50"
                >
                  Poprzednia
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50"
                >
                  Następna
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 mb-4">
          {error}
        </div>
      )}

      {batchResult && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
          <h2 className="text-lg font-medium text-slate-800 mb-3">Wyniki symulacji wsadowej</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs text-slate-500 uppercase">Zamówienia</p>
              <p className="text-xl font-semibold">{batchResult.orders_count ?? 0}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs text-slate-500 uppercase">Szacowany czas (s)</p>
              <p className="text-xl font-semibold">{batchResult.estimated_time ?? "—"}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs text-slate-500 uppercase">Łączny dystans (m)</p>
              <p className="text-xl font-semibold">{batchResult.total_distance ?? "—"}</p>
            </div>
          </div>
          {chartData.length > 0 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [v + " m", "Dystans"]} />
                  <Bar dataKey="distance" fill="#3b82f6" name="Dystans (m)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <div className="mb-4">
        <label className="text-sm font-medium text-slate-600 block mb-2">Podgląd trasy pojedynczego zamówienia</label>
        <select
          className="rounded border border-slate-300 px-3 py-1.5 text-sm min-w-[200px]"
          value={singleOrderId ?? ""}
          onChange={(e) => setSingleOrderId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Wybierz zamówienie —</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>{o.number ?? `#${o.id}`}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-slate-500 mb-2">Ładowanie trasy…</p>}

      {routeData && !routeData.error && (routeData.route?.length > 0 || routeData.pick_locations?.length > 0) && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg text-sm flex flex-wrap gap-4">
          <span><span className="font-medium">Dystans:</span> {routeData.total_distance} m</span>
          <span><span className="font-medium">Szac. czas kompletacji:</span> {routeData.estimated_time} s</span>
          <span><span className="font-medium">Liczba lokalizacji:</span> {routeData.pick_locations?.length ?? 0}</span>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="block"
          style={{ maxHeight: SVG_HEIGHT }}
        >
          {edges.map((e) => {
            const from = nodeById.get(e.node_from_id);
            const to = nodeById.get(e.node_to_id);
            if (!from || !to) return null;
            return (
              <line
                key={e.id}
                x1={scaleX(Number(from.x))}
                y1={scaleY(Number(from.y))}
                x2={scaleX(Number(to.x))}
                y2={scaleY(Number(to.y))}
                stroke="#3b82f6"
                strokeWidth={1}
              />
            );
          })}
          {routePath && (
            <path
              d={routePath}
              fill="none"
              stroke="#dc2626"
              strokeWidth={2.5}
              strokeDasharray="6 4"
            />
          )}
          {nodes.map((n) => (
            <circle
              key={n.id}
              cx={scaleX(Number(n.x))}
              cy={scaleY(Number(n.y))}
              r={NODE_R}
              fill="#3b82f6"
            />
          ))}
          {routeData?.start && (
            <g>
              <circle
                cx={scaleX(routeData.start.x)}
                cy={scaleY(routeData.start.y)}
                r={NODE_R + 3}
                fill="#22c55e"
                stroke="#166534"
                strokeWidth={2}
              />
              <text x={scaleX(routeData.start.x)} y={scaleY(routeData.start.y) + 1} textAnchor="middle" fontSize={8} fill="#fff" fontWeight="bold">START</text>
            </g>
          )}
          {routeData?.end && (
            <g>
              <rect
                x={scaleX(routeData.end.x) - NODE_R - 2}
                y={scaleY(routeData.end.y) - NODE_R - 2}
                width={(NODE_R + 2) * 2}
                height={(NODE_R + 2) * 2}
                fill="#3b82f6"
                stroke="#1d4ed8"
                strokeWidth={2}
                rx={2}
              />
              <text x={scaleX(routeData.end.x)} y={scaleY(routeData.end.y) + 1} textAnchor="middle" fontSize={8} fill="#fff" fontWeight="bold">PACK</text>
            </g>
          )}
          {routePoints.map((p, i) => (
            <circle
              key={i}
              cx={scaleX(p.x)}
              cy={scaleY(p.y)}
              r={NODE_R + 1}
              fill="none"
              stroke="#dc2626"
              strokeWidth={2}
            />
          ))}
        </svg>
      </div>
      <div className="mt-2 text-sm text-slate-500">
        <span className="inline-block w-3 h-3 rounded-full bg-[#3b82f6] align-middle mr-1" /> Graf
        <span className="ml-4"><span className="inline-block w-4 h-0.5 bg-[#dc2626] align-middle mr-1" style={{ borderStyle: "dashed" }} /> Trasa</span>
        <span className="ml-4"><span className="inline-block w-3 h-3 rounded-full bg-[#22c55e] align-middle mr-1" /> START</span>
        <span className="ml-4"><span className="inline-block w-3 h-3 rounded bg-[#3b82f6] align-middle mr-1" /> PACK</span>
      </div>

      <OptimizationPlanPanel
        summary={
          batchResult?.total_distance != null
            ? `Wsad: ${batchResult.orders_count ?? selectedIds.size} zamówień, łącznie ${Math.round(batchResult.total_distance)} m.`
            : routeData?.total_distance != null
              ? `Wybrane zamówienie: ${routeData.total_distance} m.`
              : "Uruchom symulację trasy, aby dodać rekomendację do planu zmian."
        }
        actions={[
          ...(batchResult?.total_distance != null
            ? [
                {
                  label: "Dodaj do planu zmian",
                  onClick: () => addRoutesToPlan("batch"),
                  primary: true as const,
                },
              ]
            : routeData?.total_distance != null
              ? [
                  {
                    label: "Dodaj do planu zmian",
                    onClick: () => addRoutesToPlan("single"),
                    primary: true as const,
                  },
                ]
              : []),
          { label: "Zobacz plan zmian", to: "/optymalizacja/plan" },
        ]}
      />
      {planMsg && view === "routes" ? (
        <p className="mt-2 text-sm text-emerald-700">
          {planMsg}{" "}
          <Link to="/optymalizacja/plan" className="font-medium underline">
            Otwórz plan
          </Link>
        </p>
      ) : null}
        </>
      )}
    </div>
  );
}
