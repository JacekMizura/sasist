import { useEffect, useState, useMemo } from "react";
import api from "../../api/axios";
import {
  getWarehouseGraphNodes,
  getWarehouseGraphEdges,
  getWarehouseLocations,
  type WarehouseGraphNode,
  type WarehouseGraphEdge,
  type WarehouseLocationItem,
} from "../../api/warehouseGraphApi";

const SVG_WIDTH = 900;
const SVG_HEIGHT = 500;
const PAD = 40;
const NODE_R = 4;
const LOC_SIZE = 3;

type Warehouse = { id: number; name: string };

function useGraphData(warehouseId: number | null) {
  const [nodes, setNodes] = useState<WarehouseGraphNode[]>([]);
  const [edges, setEdges] = useState<WarehouseGraphEdge[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (warehouseId == null) {
      setNodes([]);
      setEdges([]);
      setLocations([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getWarehouseGraphNodes(warehouseId),
      getWarehouseGraphEdges(warehouseId),
      getWarehouseLocations(warehouseId),
    ])
      .then(([n, e, l]) => {
        if (!cancelled) {
          setNodes(n);
          setEdges(e);
          setLocations(l);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Błąd ładowania grafu");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [warehouseId]);

  return { nodes, edges, locations, loading, error };
}

function useScale(
  nodes: WarehouseGraphNode[],
  locations: WarehouseLocationItem[]
) {
  return useMemo(() => {
    const points: { x: number; y: number }[] = [];
    nodes.forEach((n) => points.push({ x: Number(n.x), y: Number(n.y) }));
    locations.forEach((l) => {
      if (l.x != null && l.y != null) points.push({ x: l.x, y: l.y });
    });
    if (points.length === 0) {
      return {
        minX: 0,
        maxX: 100,
        minY: 0,
        maxY: 100,
        scaleX: (x: number) => PAD,
        scaleY: (y: number) => PAD,
      };
    }
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const W = SVG_WIDTH - 2 * PAD;
    const H = SVG_HEIGHT - 2 * PAD;
    const scale = Math.min(W / rangeX, H / rangeY);
    const scaleX = (x: number) => PAD + (x - minX) * scale;
    const scaleY = (y: number) => PAD + (y - minY) * scale;
    return { minX, maxX, minY, maxY, scaleX, scaleY };
  }, [nodes, locations]);
}

export default function WarehouseGraphMap() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

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

  const { nodes, edges, locations, loading, error } = useGraphData(warehouseId);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const { scaleX, scaleY } = useScale(nodes, locations);

  return (
    <div className="min-w-0">
      <h1 className="text-xl font-semibold text-slate-800">Mapa magazynu</h1>
      <p className="mt-2 text-slate-600 mb-4">
        Wizualizacja grafu (węzły, krawędzie) i lokalizacji. Później: trasy kompletacji, heatmapa, slotting.
      </p>

      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm font-medium text-slate-600">Magazyn</label>
        <select
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          value={warehouseId ?? ""}
          onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">—</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name ?? `Magazyn ${w.id}`}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-slate-500">Ładowanie…</p>}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 mb-4">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="block"
          style={{ maxHeight: SVG_HEIGHT }}
        >
          {/* Edges (gray) */}
          {edges.map((e) => {
            const from = nodeById.get(e.node_from_id);
            const to = nodeById.get(e.node_to_id);
            if (!from || !to) return null;
            const x1 = scaleX(Number(from.x));
            const y1 = scaleY(Number(from.y));
            const x2 = scaleX(Number(to.x));
            const y2 = scaleY(Number(to.y));
            return (
              <line
                key={e.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#94a3b8"
                strokeWidth={1}
              />
            );
          })}
          {/* Locations (orange squares) */}
          {locations.map((loc) => {
            if (loc.x == null || loc.y == null) return null;
            const x = scaleX(loc.x) - LOC_SIZE / 2;
            const y = scaleY(loc.y) - LOC_SIZE / 2;
            return (
              <rect
                key={loc.id}
                x={x}
                y={y}
                width={LOC_SIZE}
                height={LOC_SIZE}
                fill="#f97316"
                onMouseEnter={(ev) => {
                  const rect = ev.currentTarget.getBoundingClientRect();
                  setTooltip({
                    text: `${loc.name || `ID ${loc.id}`} (${loc.x?.toFixed(0)}, ${loc.y?.toFixed(0)})`,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <title>Lokalizacja: {loc.name || `ID ${loc.id}`}</title>
              </rect>
            );
          })}
          {/* Nodes (blue circles) */}
          {nodes.map((n) => {
            const cx = scaleX(Number(n.x));
            const cy = scaleY(Number(n.y));
            return (
              <circle
                key={n.id}
                cx={cx}
                cy={cy}
                r={NODE_R}
                fill="#3b82f6"
                onMouseEnter={(ev) => {
                  const rect = ev.currentTarget.getBoundingClientRect();
                  const locCount = n.locations_count ?? 0;
                  setTooltip({
                    text: `Węzeł ${n.id} (${Number(n.x).toFixed(0)}, ${Number(n.y).toFixed(0)})${n.type ? ` · ${n.type}` : ""}${locCount > 0 ? ` · ${locCount} lokalizacji` : ""}`,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <title>Węzeł {n.id} ({n.x}, {n.y}) {n.type} · {n.locations_count ?? 0} lokalizacji</title>
              </circle>
            );
          })}
        </svg>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 text-sm bg-slate-800 text-white rounded shadow-lg pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}

      <div className="mt-3 flex gap-6 text-sm text-slate-500">
        <span><span className="inline-block w-3 h-3 rounded-full bg-[#3b82f6] align-middle mr-1" /> Węzły</span>
        <span><span className="inline-block w-4 h-0.5 bg-[#94a3b8] align-middle mr-1" /> Krawędzie</span>
        <span><span className="inline-block w-2 h-2 bg-[#f97316] align-middle mr-1" /> Lokalizacje</span>
      </div>
    </div>
  );
}
