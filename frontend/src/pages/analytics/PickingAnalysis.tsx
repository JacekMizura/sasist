import { useEffect, useState, useMemo } from "react";
import {
  getPickingAnalysisSummary,
  getPickingAnalysisPicks,
  getPickingAnalysisHeatmap,
  generateSimulatedPicks,
  deleteSimulatedPicks,
  type PickingAnalysisSummary as SummaryType,
  type PickingAnalysisPickRow,
  type PickingAnalysisHeatmapItem,
  type PickingAnalysisFilters,
} from "../../api/analysisApi";
import {
  getWarehouseGraphNodes,
  getWarehouseGraphEdges,
  getWarehouseLocations,
  type WarehouseGraphNode,
  type WarehouseGraphEdge,
  type WarehouseLocationItem,
} from "../../api/warehouseGraphApi";
import { PageHeader } from "../../components/layout/PageHeader";
import { FilterDateRange } from "../../components/filters";
import { useWarehouse } from "../../context/WarehouseContext";

const DEFAULT_TENANT_ID = 1;
const SVG_WIDTH = 900;
const SVG_HEIGHT = 500;
const PAD = 40;
const NODE_R = 4;
const LOC_SIZE = 6;

function pickColorByActivity(totalPicks: number, maxPicks: number): string {
  if (maxPicks <= 0) return "rgb(34, 197, 94)"; // green
  const t = Math.min(1, totalPicks / maxPicks);
  if (t <= 0.33) return "rgb(34, 197, 94)";   // green – low
  if (t <= 0.66) return "rgb(249, 115, 22)"; // orange – medium
  return "rgb(239, 68, 68)";                   // red – high
}

export default function PickingAnalysis() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = activeWarehouse?.id ?? null;
  const [summary, setSummary] = useState<SummaryType | null>(null);
  const [picks, setPicks] = useState<PickingAnalysisPickRow[]>([]);
  const [heatmap, setHeatmap] = useState<PickingAnalysisHeatmapItem[]>([]);
  const [nodes, setNodes] = useState<WarehouseGraphNode[]>([]);
  const [edges, setEdges] = useState<WarehouseGraphEdge[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PickingAnalysisFilters>({ limit: 500 });
  const [appliedFilters, setAppliedFilters] = useState<PickingAnalysisFilters>({ limit: 500 });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (warehouseId == null) {
      setSummary(null);
      setPicks([]);
      setHeatmap([]);
      setNodes([]);
      setEdges([]);
      setLocations([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getPickingAnalysisSummary(DEFAULT_TENANT_ID, warehouseId),
      getPickingAnalysisPicks(DEFAULT_TENANT_ID, warehouseId, appliedFilters),
      getPickingAnalysisHeatmap(DEFAULT_TENANT_ID, warehouseId),
      getWarehouseGraphNodes(warehouseId),
      getWarehouseGraphEdges(warehouseId),
      getWarehouseLocations(warehouseId),
    ])
      .then(([s, p, h, n, e, l]) => {
        if (!cancelled) {
          setSummary(s);
          setPicks(p);
          setHeatmap(h);
          setNodes(n);
          setEdges(e);
          setLocations(l);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Błąd ładowania");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId, appliedFilters, refreshTrigger]);

  const handleGenerateSimulatedPicks = () => {
    if (warehouseId == null) return;
    setGenerating(true);
    setError(null);
    setGenerateMessage(null);
    generateSimulatedPicks(DEFAULT_TENANT_ID, warehouseId, true)
      .then((res) => {
        setGenerateMessage(
          `Wygenerowano ${res.created} pików z ${res.orders_processed} zamówień.`
        );
        setRefreshTrigger((t) => t + 1);
      })
      .catch((err) => setError(err?.message ?? "Błąd generowania pików"))
      .finally(() => setGenerating(false));
  };

  const handleClearSimulatedPicks = () => {
    if (warehouseId == null) return;
    setShowClearConfirm(false);
    setClearing(true);
    setError(null);
    setGenerateMessage(null);
    deleteSimulatedPicks(DEFAULT_TENANT_ID, warehouseId)
      .then((res) => {
        setGenerateMessage(`Usunięto ${res.deleted} pików.`);
        setRefreshTrigger((t) => t + 1);
      })
      .catch((err) => setError(err?.message ?? "Błąd usuwania pików"))
      .finally(() => setClearing(false));
  };

  const maxPicks = useMemo(
    () => (heatmap.length ? Math.max(...heatmap.map((h) => h.total_picks)) : 0),
    [heatmap]
  );
  const scale = useMemo(() => {
    const points: { x: number; y: number }[] = [];
    nodes.forEach((n) => points.push({ x: Number(n.x), y: Number(n.y) }));
    heatmap.forEach((h) => {
      if (h.x != null && h.y != null) points.push({ x: h.x, y: h.y });
    });
    locations.forEach((l) => {
      if (l.x != null && l.y != null) points.push({ x: l.x, y: l.y });
    });
    if (points.length === 0) {
      return {
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
    const s = Math.min(W / rangeX, H / rangeY);
    return {
      scaleX: (x: number) => PAD + (x - minX) * s,
      scaleY: (y: number) => PAD + (y - minY) * s,
    };
  }, [nodes, heatmap, locations]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  if (loading && !summary) {
    return (
      <>
        <PageHeader title="Picking Analysis" />
        <p className="text-slate-500">Ładowanie…</p>
      </>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
        <PageHeader
          title="Picking Analysis"
          actions={
            <div className="flex flex-wrap items-center gap-4">
          {showWarehouseSelector ? (
            <span className="text-sm text-slate-600">
              Magazyn: <span className="font-semibold text-slate-800">{activeWarehouse?.name ?? "—"}</span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleGenerateSimulatedPicks}
            disabled={warehouseId == null || generating}
            className="rounded bg-emerald-600 text-white px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generowanie…" : "Generuj symulowane piki"}
          </button>
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            disabled={warehouseId == null || clearing}
            className="rounded bg-slate-200 text-slate-700 px-4 py-1.5 text-sm font-medium hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-300"
          >
            {clearing ? "Usuwanie…" : "Wyczyść symulowane piki"}
          </button>
          {generateMessage && (
            <span className="text-sm text-slate-600">{generateMessage}</span>
          )}
          {showClearConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
              <div className="bg-white rounded-lg shadow-lg p-4 max-w-sm mx-4 border border-slate-200">
                <p className="text-slate-800 font-medium mb-2">Wyczyścić symulowane piki?</p>
                <p className="text-sm text-slate-600 mb-4">
                  Wszystkie piki dla wybranego magazynu zostaną trwale usunięte. Podsumowanie, tabela i heatmapa zostaną zaktualizowane.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="rounded bg-slate-100 text-slate-700 px-3 py-1.5 text-sm font-medium hover:bg-slate-200"
                  >
                    Anuluj
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSimulatedPicks}
                    className="rounded bg-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-500"
                  >
                    Wyczyść
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      }
        />
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
            {error}
          </div>
        )}

        {/* SECTION 1 – Summary cards */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Podsumowanie</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Łączna liczba pików</p>
              <p className="text-2xl font-semibold text-slate-800">
                {summary?.total_picks ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Łączna skompletowana ilość</p>
              <p className="text-2xl font-semibold text-slate-800">
                {summary?.total_picked_quantity ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Śr. pików na zamówienie</p>
              <p className="text-2xl font-semibold text-slate-800">
                {summary?.avg_picks_per_order ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Śr. lokalizacji na zamówienie</p>
              <p className="text-2xl font-semibold text-slate-800">
                {summary?.avg_locations_per_order ?? 0}
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 2 – Picks table */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Piki</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              type="text"
              placeholder="Nazwa produktu"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm w-40"
              value={filters.product_name ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, product_name: e.target.value || undefined }))}
            />
            <input
              type="text"
              placeholder="SKU"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm w-28"
              value={filters.sku ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, sku: e.target.value || undefined }))}
            />
            <input
              type="text"
              placeholder="EAN"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm w-28"
              value={filters.ean ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, ean: e.target.value || undefined }))}
            />
            <input
              type="text"
              placeholder="Lokalizacja"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm w-28"
              value={filters.location ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value || undefined }))}
            />
            <div className="min-w-[min(100%,280px)] self-end">
              <FilterDateRange
                label="Data piku (od – do)"
                from={filters.date_from ?? ""}
                to={filters.date_to ?? ""}
                onFromChange={(v) => setFilters((f) => ({ ...f, date_from: v || undefined }))}
                onToChange={(v) => setFilters((f) => ({ ...f, date_to: v || undefined }))}
              />
            </div>
            <button
              type="button"
              onClick={applyFilters}
              className="rounded bg-slate-700 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-600"
            >
              Filtruj
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">Order ID</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">Produkt</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">SKU</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">Lokalizacja</th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600">Ilość</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">Data/czas piku</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {picks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Brak pików. Wybierz magazyn i kliknij „Generuj symulowane piki”, aby wygenerować piki z zamówień i inventory.
                    </td>
                  </tr>
                ) : (
                  picks.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2">{row.order_id}</td>
                      <td className="px-4 py-2">{row.product_name ?? "—"}</td>
                      <td className="px-4 py-2">{row.sku ?? "—"}</td>
                      <td className="px-4 py-2">{row.location_name ?? "—"}</td>
                      <td className="px-4 py-2 text-right">{row.quantity}</td>
                      <td className="px-4 py-2">
                        {row.picked_at
                          ? new Date(row.picked_at).toLocaleString("pl-PL")
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 3 – Warehouse pick heatmap */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Heatmapa pików w magazynie</h2>
          <p className="text-sm text-slate-600 mb-2">
            Kolor: zielony = niska aktywność, pomarańczowy = średnia, czerwony = wysoka.
          </p>
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
                    x1={scale.scaleX(Number(from.x))}
                    y1={scale.scaleY(Number(from.y))}
                    x2={scale.scaleX(Number(to.x))}
                    y2={scale.scaleY(Number(to.y))}
                    stroke="#94a3b8"
                    strokeWidth={1}
                  />
                );
              })}
              {heatmap.map((h) => {
                const x = h.x != null ? scale.scaleX(h.x) - LOC_SIZE / 2 : null;
                const y = h.y != null ? scale.scaleY(h.y) - LOC_SIZE / 2 : null;
                if (x == null || y == null) return null;
                const fill = pickColorByActivity(h.total_picks, maxPicks);
                const tooltipText = [
                  h.location_name || `ID ${h.location_id}`,
                  `Piki: ${h.total_picks}`,
                  `Zamówienia: ${h.unique_orders}`,
                  `Produkty: ${h.products_picked}`,
                ].join("\n");
                return (
                  <rect
                    key={h.location_id}
                    x={x}
                    y={y}
                    width={LOC_SIZE}
                    height={LOC_SIZE}
                    fill={fill}
                    onMouseEnter={(ev) => {
                      const rect = ev.currentTarget.getBoundingClientRect();
                      setTooltip({
                        text: tooltipText,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <title>{tooltipText.replace(/\n/g, " · ")}</title>
                  </rect>
                );
              })}
              {nodes.map((n) => {
                const cx = scale.scaleX(Number(n.x));
                const cy = scale.scaleY(Number(n.y));
                return (
                  <circle
                    key={n.id}
                    cx={cx}
                    cy={cy}
                    r={NODE_R}
                    fill="#94a3b8"
                  />
                );
              })}
            </svg>
          </div>
          <div className="mt-2 flex gap-6 text-sm text-slate-500">
            <span>
              <span className="inline-block w-3 h-3 bg-green-500 align-middle mr-1" /> Niska
            </span>
            <span>
              <span className="inline-block w-3 h-3 bg-orange-500 align-middle mr-1" /> Średnia
            </span>
            <span>
              <span className="inline-block w-3 h-3 bg-red-500 align-middle mr-1" /> Wysoka
            </span>
          </div>
        </section>

        {tooltip && (
          <div
            className="fixed z-50 px-2 py-1.5 text-sm bg-slate-800 text-white rounded shadow-lg pointer-events-none whitespace-pre-line"
            style={{
              left: tooltip.x,
              top: tooltip.y - 8,
              transform: "translate(-50%, -100%)",
            }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
  );
}
