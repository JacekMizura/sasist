import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api from "../../api/axios";
import {
  getWarehouseGraphNodes,
  getWarehouseGraphEdges,
  type WarehouseGraphNode,
  type WarehouseGraphEdge,
} from "../../api/warehouseGraphApi";

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
  orders_found?: number;
  order_items?: number;
  order_numbers?: string[];
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

async function fetchPickRouteBatch(
  warehouseId: number,
  orderNumbers: string[],
  tenantId: number
): Promise<BatchResult> {
  const { data } = await api.post<BatchResult>("/analysis/pick-route/batch/", {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    order_numbers: orderNumbers,
  });
  return data ?? { orders_found: 0, order_items: 0, order_numbers: [] };
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
    const orderNumbers = orders
      .filter((o) => selectedIds.has(o.id))
      .map((o) => o.number)
      .filter((n): n is string => n != null && n !== "");
    if (orderNumbers.length === 0) {
      setError("Selected orders have no order number.");
      return;
    }
    setLoadingBatch(true);
    setError(null);
    setBatchResult(null);
    fetchPickRouteBatch(warehouseId, orderNumbers, DEFAULT_TENANT_ID)
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
      <h1 className="text-xl font-semibold text-slate-800">Symulacja trasy</h1>
      <p className="mt-2 text-slate-600 mb-4">
        Symulacja tras kompletacji: wybierz magazyn, wyszukaj i zaznacz zamówienia, uruchom symulację wsadową.
      </p>

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
            <button
              type="button"
              onClick={runBatchSimulation}
              disabled={selectedIds.size === 0 || loadingBatch || !hasStartAndPacking}
              className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {loadingBatch ? "Symulowanie…" : "Symuluj wybrane zamówienia"}
            </button>
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
              <p className="text-xs text-slate-500 uppercase">Zamówienia znalezione</p>
              <p className="text-xl font-semibold">{batchResult.orders_found ?? batchResult.orders_count ?? 0}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs text-slate-500 uppercase">Pozycje zamówień</p>
              <p className="text-xl font-semibold">{batchResult.order_items ?? "—"}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs text-slate-500 uppercase">Łączny dystans (m)</p>
              <p className="text-xl font-semibold">{batchResult.total_distance ?? "—"}</p>
            </div>
          </div>
          {batchResult.order_numbers != null && batchResult.order_numbers.length > 0 && (
            <p className="text-sm text-slate-600 mb-2">Numery zamówień: {batchResult.order_numbers.join(", ")}</p>
          )}
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
    </div>
  );
}
