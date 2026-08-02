import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getSlotting, type SlottingProduct } from "../../api/analysisApi";
import { layoutService } from "../../services/layoutService";
import type { LayoutState } from "../../types/warehouse";
import { rawLayoutRackToRackState, type RawLayoutRack } from "../../components/warehouse/warehouseUtils";
import { resolveWarehouseLocation, syncLayoutDisplayFields } from "../../utils/resolvedWarehouseLocation";
import {
  OptimizationPlanPanel,
  OptimizationToolHeader,
} from "../../modules/optymalizacja/OptimizationPlan";
import { useWarehouseChangePlan } from "../../modules/optymalizacja/useWarehouseChangePlan";
import type { ChangePriority } from "../../modules/optymalizacja/warehouseChangePlanStore";
import { analizyKpiCardClass } from "../../modules/analizy/analizyUi";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AnalizyWarehouseSelect } from "../../modules/analizy/AnalizyWarehouseSelect";
import {
  ANALIZY_DEFAULT_TENANT_ID,
  useWarehouseApiScope,
} from "../../modules/analizy/warehouseApiScope";

const ABC_COLORS: Record<string, string> = {
  A: "#ef4444",
  B: "#f97316",
  C: "#22c55e",
};

type SortKey =
  | "product"
  | "symbol"
  | "velocity"
  | "cube"
  | "coi"
  | "abc_class"
  | "distance_to_packing"
  | "current_location"
  | "recommended_zone"
  | "slotting_score";

const DEFAULT_SORT: SortKey = "slotting_score";
const DEFAULT_ASC = false;

function formatNum(n: number, decimals = 2): string {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/** UI-only: kody stref z API → etykiety biznesowe. */
function zoneDisplayName(zone: string): string {
  const map: Record<string, string> = {
    PICK_FACE: "Strefa kompletacji",
    MID_ZONE: "Strefa środkowa",
    RESERVE: "Rezerwa",
  };
  return map[zone] ?? zone;
}

export default function SlottingPage() {
  const { scope, warehouseId, warehouse, warehouses, warehouseRevision } =
    useWarehouseApiScope();
  const [name, setName] = useState("");
  const [ean, setEan] = useState("");
  const [sku, setSku] = useState("");
  const [slottingData, setSlottingData] = useState<SlottingProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT);
  const [sortAsc, setSortAsc] = useState(DEFAULT_ASC);
  const [layout, setLayout] = useState<LayoutState | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [binTooltip, setBinTooltip] = useState<{
    product: SlottingProduct;
    address: string;
    x: number;
    y: number;
  } | null>(null);

  const runSearch = useCallback(() => {
    if (scope == null) return;
    setLoading(true);
    setError(null);
    const params: { name?: string; ean?: string; sku?: string } = {};
    if (name.trim()) params.name = name.trim();
    if (ean.trim()) params.ean = ean.trim();
    if (sku.trim()) params.sku = sku.trim();
    getSlotting(scope, params)
      .then((res) => setSlottingData(res.products ?? []))
      .catch((e) => setError(e?.message ?? "Błąd ładowania układu towaru."))
      .finally(() => setLoading(false));
  }, [scope, name, ean, sku]);

  useEffect(() => {
    if (scope == null) {
      setSlottingData([]);
      setLoading(false);
      return;
    }
    runSearch();
  }, [scope, warehouseRevision]);

  useEffect(() => {
    if (warehouseId == null) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    setLayoutLoading(true);
    layoutService
      .getLayout({ tenant_id: ANALIZY_DEFAULT_TENANT_ID, warehouse_id: warehouseId })
      .then((res) => {
        const d = res.data as Record<string, unknown> | undefined;
        if (!cancelled && d && typeof d === "object") {
          const rawRacks = Array.isArray(d.racks) ? d.racks : [];
          const base: LayoutState = {
            layout_id: (d.layout_id as number | null) ?? null,
            warehouse_id: Number(d.warehouse_id) || warehouseId,
            grid_cols: Number(d.grid_cols) || 24,
            grid_rows: Number(d.grid_rows) || 16,
            racks: rawRacks.map((r) => rawLayoutRackToRackState(r as RawLayoutRack)),
            aisles: Array.isArray(d.aisles) ? (d.aisles as LayoutState["aisles"]) : [],
          };
          setLayout(syncLayoutDisplayFields(base));
        } else if (!cancelled) {
          setLayout(null);
        }
      })
      .catch(() => {
        if (!cancelled) setLayout(null);
      })
      .finally(() => {
        if (!cancelled) setLayoutLoading(false);
      });
    return () => { cancelled = true; };
  }, [warehouseId, warehouseRevision]);

  /** Map location address (current_location or bin label) to slotting product for coloring bins. */
  const slottingByAddress = useMemo(() => {
    const map: Record<string, SlottingProduct> = {};
    for (const p of slottingData) {
      const key = (p.current_location ?? "").trim();
      if (key) map[key] = p;
    }
    return map;
  }, [slottingData]);

  const kpis = useMemo(() => {
    const total = slottingData.length;
    const classA = slottingData.filter((p) => p.abc_class === "A").length;
    const classB = slottingData.filter((p) => p.abc_class === "B").length;
    const classC = slottingData.filter((p) => p.abc_class === "C").length;
    return { total, classA, classB, classC };
  }, [slottingData]);

  const sortedRows = useMemo(() => {
    const copy = [...slottingData];
    copy.sort((a, b) => {
      let va: string | number | null | undefined;
      let vb: string | number | null | undefined;
      switch (sortKey) {
        case "product":
          va = a.product_name ?? "";
          vb = b.product_name ?? "";
          break;
        case "symbol":
          va = a.symbol ?? "";
          vb = b.symbol ?? "";
          break;
        case "velocity":
          va = a.velocity;
          vb = b.velocity;
          break;
        case "cube":
          va = a.cube;
          vb = b.cube;
          break;
        case "coi":
          va = a.coi ?? 0;
          vb = b.coi ?? 0;
          break;
        case "abc_class":
          va = a.abc_class;
          vb = b.abc_class;
          break;
        case "distance_to_packing":
          va = a.distance_to_packing;
          vb = b.distance_to_packing;
          break;
        case "current_location":
          va = a.current_location ?? "";
          vb = b.current_location ?? "";
          break;
        case "recommended_zone":
          va = a.recommended_zone;
          vb = b.recommended_zone;
          break;
        case "slotting_score":
        default:
          va = a.slotting_score;
          vb = b.slotting_score;
          break;
      }
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [slottingData, sortKey, sortAsc]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(key === "slotting_score" ? false : true);
      return key;
    });
  }, []);

  const chartData = useMemo(
    () =>
      slottingData.map((p) => ({
        x: p.distance_to_packing,
        y: p.velocity,
        name: p.product_name ?? `#${p.product_id}`,
        product_id: p.product_id,
      })),
    [slottingData]
  );

  /** Plan: klasa A najdalej od pakowania — priorytet przesunięć. */
  const moveCandidates = useMemo(() => {
    return [...slottingData]
      .filter((p) => p.abc_class === "A")
      .sort((a, b) => b.distance_to_packing - a.distance_to_packing)
      .slice(0, 20);
  }, [slottingData]);

  const movePlan = useMemo(
    () =>
      moveCandidates.map((p) => {
        const name = p.product_name ?? `Produkt ${p.product_id}`;
        const from = p.current_location ?? "brak lokalizacji";
        return `${name}: ${from} → strefa ${zoneDisplayName(p.recommended_zone)}`;
      }),
    [moveCandidates]
  );

  const { add } = useWarehouseChangePlan();
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const { user } = useAuth();

  const addSlottingToPlan = () => {
    if (moveCandidates.length === 0 || warehouseId == null) return;
    const totalDist = moveCandidates.reduce((s, p) => s + (p.distance_to_packing || 0), 0);
    const avgDist = totalDist / moveCandidates.length;
    let priority: ChangePriority = "sredni";
    if (avgDist >= 40 || moveCandidates.length >= 10) priority = "wysoki";
    else if (avgDist < 15 && moveCandidates.length < 4) priority = "niski";

    const authorName =
      [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
      user?.login ||
      "Nieznany";
    const whName =
      warehouses.find((w) => w.id === warehouseId)?.name ?? warehouse?.name ?? null;

    const result = add({
      source: "slotting",
      dedupeKey: `slotting:wh:${warehouseId}:classA`,
      title: `Przesuń ${moveCandidates.length} produktów klasy A bliżej pakowania`,
      description: movePlan.slice(0, 5).join("; "),
      executedDescription: `Przeniesiono ${moveCandidates.length} produktów klasy A bliżej strefy kompletacji.`,
      priority,
      originLabel: "Układ towaru w magazynie",
      impactConcrete: `~${Math.round(totalDist)} m łącznego dystansu klasy A`,
      impactScore: totalDist,
      sourcePath: "/optymalizacja/slotting",
      authorName,
      authorId: user?.id ?? null,
      warehouseName: whName,
      warehouseId,
    });
    setPlanMsg(
      result.ok
        ? "Dodano do harmonogramu zmian magazynu."
        : "Ta rekomendacja jest już w harmonogramie zmian."
    );
  };

  return (
    <div className="min-w-0">
      <OptimizationToolHeader
        title="Układ towaru w magazynie"
        question="Które produkty są za daleko od strefy kompletacji względem swojej rotacji?"
        decision="Co przenieść bliżej — i w jakiej kolejności?"
      />

      <div className="mb-4 flex items-center gap-4">
        <AnalizyWarehouseSelect forceSelect />
        {loading && <span className="text-sm text-slate-500">Ładowanie…</span>}
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nazwa produktu</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nazwa produktu"
              className="rounded border border-slate-300 px-3 py-1.5 text-sm w-48"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">EAN</label>
            <input
              type="text"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              placeholder="EAN"
              className="rounded border border-slate-300 px-3 py-1.5 text-sm w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">SKU</label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="SKU"
              className="rounded border border-slate-300 px-3 py-1.5 text-sm w-40"
            />
          </div>
          <button
            type="button"
            onClick={runSearch}
            disabled={warehouseId == null || loading}
            className="rounded bg-slate-700 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Szukaj
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* 1. KPI SUMMARY */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Podsumowanie wskaźników
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className={analizyKpiCardClass}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Produkty analizowane</p>
            <p className="mt-2 text-2xl font-semibold text-slate-800">{kpis.total}</p>
          </div>
          <div className={analizyKpiCardClass}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Klasa A</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{kpis.classA}</p>
          </div>
          <div className={analizyKpiCardClass}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Klasa B</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{kpis.classB}</p>
          </div>
          <div className={analizyKpiCardClass}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Klasa C</p>
            <p className="mt-2 text-2xl font-semibold text-slate-600">{kpis.classC}</p>
          </div>
        </div>
      </section>

      {/* 2. SLOTTING RECOMMENDATION TABLE */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Tabela rekomendacji układu
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <ThSort label="Produkt" sortKey="product" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThSort label="SKU / Symbol" sortKey="symbol" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThSort label="Rotacja" sortKey="velocity" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThSort label="Objętość" sortKey="cube" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThSort label="COI" sortKey="coi" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThSort label="Klasa ABC" sortKey="abc_class" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThSort label="Dystans do pakowania" sortKey="distance_to_packing" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThSort label="Obecna lokalizacja" sortKey="current_location" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThSort label="Rekomendowana strefa" sortKey="recommended_zone" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThSort label="Ocena układu" sortKey="slotting_score" current={sortKey} asc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      Brak danych. Wybierz magazyn i upewnij się, że są produkty z inwentarzem.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr key={row.product_id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-800">{row.product_name ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{row.symbol ?? "—"}</td>
                      <td className="px-4 py-2 text-right">{formatNum(row.velocity)}</td>
                      <td className="px-4 py-2 text-right">{formatNum(row.cube, 4)}</td>
                      <td className="px-4 py-2 text-right">{row.coi != null ? formatNum(row.coi, 4) : "—"}</td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            row.abc_class === "A"
                              ? "text-emerald-700 font-medium"
                              : row.abc_class === "B"
                                ? "text-amber-700 font-medium"
                                : "text-slate-600"
                          }
                        >
                          {row.abc_class}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">{formatNum(row.distance_to_packing)}</td>
                      <td className="px-4 py-2 text-slate-600">{row.current_location ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-700">{zoneDisplayName(row.recommended_zone)}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatNum(row.slotting_score, 4)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SLOTTING MAP — warehouse layout (racks and bins), bins colored by ABC from slotting */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Mapa układu towaru
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          {layoutLoading && (
            <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
              Ładowanie układu…
            </div>
          )}
          {!layoutLoading && layout && layout.racks.length > 0 && (
            <>
              <SlottingLayoutMap
                layout={layout}
                slottingByAddress={slottingByAddress}
                formatNum={formatNum}
                onBinHover={(product, address, ev) => {
                  const rect = ev.currentTarget.getBoundingClientRect();
                  setBinTooltip({
                    product,
                    address,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onBinLeave={() => setBinTooltip(null)}
              />
              {binTooltip && (
                <div
                  className="fixed z-50 px-3 py-2 text-sm bg-slate-800 text-white rounded shadow-lg pointer-events-none max-w-xs"
                  style={{
                    left: binTooltip.x,
                    top: binTooltip.y - 8,
                    transform: "translate(-50%, -100%)",
                  }}
                >
                  <p className="font-medium">{binTooltip.product.product_name ?? `#${binTooltip.product.product_id}`}</p>
                  <p className="text-slate-300">SKU: {binTooltip.product.symbol ?? "—"}</p>
                  <p>Rotacja: {formatNum(binTooltip.product.velocity)}</p>
                  <p>Klasa ABC: {binTooltip.product.abc_class}</p>
                  <p>Dystans do pakowania: {formatNum(binTooltip.product.distance_to_packing)}</p>
                  <p>Ocena układu: {formatNum(binTooltip.product.slotting_score, 4)}</p>
                  <p>Lokalizacja: {binTooltip.address}</p>
                </div>
              )}
              <div className="px-4 py-2 border-t border-slate-100 flex gap-6 text-sm text-slate-500">
                <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ef4444] border border-white align-middle mr-1" /> A</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#f97316] border border-white align-middle mr-1" /> B</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#22c55e] border border-white align-middle mr-1" /> C</span>
                <span className="text-slate-400">Lokalizacje z wynikami układu towaru</span>
              </div>
            </>
          )}
          {!layoutLoading && warehouseId != null && (!layout || layout.racks.length === 0) && (
            <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
              Brak układu magazynu. Zapisz układ regałów w Projektancie magazynu.
            </div>
          )}
          {!layoutLoading && warehouseId == null && (
            <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
              Wybierz magazyn, aby zobaczyć mapę.
            </div>
          )}
        </div>
      </section>

      {/* 3. SLOTTING ANALYSIS CHART */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Wykres analizy układu
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-700 mb-3">Rotacja względem dystansu do pakowania</p>
          {chartData.length === 0 ? (
            <div className="h-[360px] flex items-center justify-center text-slate-500 text-sm">
              Brak danych do wyświetlenia.
            </div>
          ) : (
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Dystans do pakowania"
                    unit=""
                    tickFormatter={(v) => formatNum(v)}
                    label={{ value: "Dystans do pakowania", position: "bottom", offset: 0 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Rotacja"
                    tickFormatter={(v) => formatNum(v)}
                    label={{ value: "Rotacja", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    formatter={(value: number) => [formatNum(value), ""]}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="rounded bg-slate-800 text-white text-xs px-2 py-2 shadow-lg">
                          <p className="font-medium">{p.name}</p>
                          <p>Dystans: {formatNum(p.x)}</p>
                          <p>Rotacja: {formatNum(p.y)}</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={chartData} name="Produkty" fill="#6366f1" fillOpacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <OptimizationPlanPanel
        summary={
          movePlan.length > 0
            ? `Priorytet: przenieś ${movePlan.length} produktów klasy A bliżej pakowania (największy dystans najpierw).`
            : "Uruchom analizę, aby zbudować listę przesunięć."
        }
        items={movePlan}
        emptyMessage="Brak produktów klasy A do przesunięcia w tym zakresie."
        actions={[
          ...(movePlan.length > 0
            ? [{ label: "Dodaj do harmonogramu zmian", onClick: addSlottingToPlan, primary: true as const }]
            : []),
          { label: "Zobacz harmonogram zmian", to: "/optymalizacja/plan" },
          { label: "Sprawdź przeciążone lokalizacje", to: "/analytics/hot-locations" },
        ]}
      />
      {planMsg ? (
        <p className="mt-2 text-sm text-emerald-700">
          {planMsg}{" "}
          <Link to="/optymalizacja/plan" className="font-medium underline">
            Otwórz harmonogram
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Renders warehouse layout (racks and storage bins) with bins colored by slotting ABC class.
 * Reuses same coordinate system as Warehouse Designer: viewBox grid_cols × grid_rows, visual zones, racks with bin grid.
 */
function SlottingLayoutMap({
  layout,
  slottingByAddress,
  formatNum,
  onBinHover,
  onBinLeave,
}: {
  layout: SlottingLayout;
  slottingByAddress: Record<string, SlottingProduct>;
  formatNum: (n: number, decimals?: number) => string;
  onBinHover: (product: SlottingProduct, address: string, ev: React.MouseEvent<SVGElement>) => void;
  onBinLeave: () => void;
}) {
  const viewW = Math.max(1, layout.grid_cols);
  const viewH = Math.max(1, layout.grid_rows);
  const defaultRackFill = "#94a3b8";

  return (
    <div className="bg-slate-100/50">
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full block"
        style={{ maxHeight: 420 }}
      >
        {/* Visual zones (same as WarehouseFullMap) */}
        {layout.aisles?.map((a, i) => (
          <rect
            key={a.id ?? `a-${i}`}
            x={a.x + 0.02}
            y={a.y + 0.02}
            width={Math.max(0.04, a.width - 0.04)}
            height={Math.max(0.04, a.height - 0.04)}
            fill="#94a3b8"
            fillOpacity={0.38}
            stroke="#64748b"
            strokeOpacity={0.85}
            strokeWidth={0.02}
            rx={0.2}
          />
        ))}
        {/* Racks: each rack drawn as a grid of bins; each bin colored by slotting ABC */}
        {layout.racks.map((r) => {
          const levels = Math.max(1, r.levels);
          const binsPerLevel = Math.max(1, r.bins_per_level);
          const cellW = Math.max(0.02, (r.width - 0.04) / binsPerLevel);
          const cellH = Math.max(0.02, (r.height - 0.04) / levels);
          const rackFill = (r.color?.trim() && r.color !== "") ? r.color : defaultRackFill;
          const bins = (r.bins ?? []).slice().sort(
            (a, b) => a.level_index - b.level_index || a.segment_index - b.segment_index
          );
          return (
            <g key={r.id}>
              {bins.map((bin) => {
                const seg = Math.min(bin.segment_index, binsPerLevel - 1);
                const lev = Math.min(bin.level_index, levels - 1);
                const x = r.x + 0.02 + seg * cellW;
                const y = r.y + 0.02 + lev * cellH;
                const label = resolveWarehouseLocation(r, bin, layout).label;
                const product = label ? slottingByAddress[label] : undefined;
                const fill = product ? (ABC_COLORS[product.abc_class] ?? rackFill) : rackFill;
                const address = label || `L${bin.level_index}-S${bin.segment_index}`;
                return (
                  <rect
                    key={bin.id ?? `${r.id}-${bin.level_index}-${bin.segment_index}`}
                    x={x + 0.01}
                    y={y + 0.01}
                    width={Math.max(0.02, cellW - 0.02)}
                    height={Math.max(0.02, cellH - 0.02)}
                    fill={fill}
                    stroke="#1e293b"
                    strokeWidth={0.015}
                    onMouseEnter={(ev) => product && onBinHover(product, address, ev)}
                    onMouseLeave={onBinLeave}
                  >
                    <title>
                      {product
                        ? `${product.product_name ?? "#" + product.product_id} · ${product.abc_class} · Rotacja: ${formatNum(product.velocity)} · Ocena: ${formatNum(product.slotting_score, 4)}`
                        : address}
                    </title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ThSort({
  label,
  sortKey,
  current,
  asc,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const isActive = current === sortKey;
  return (
    <th
      className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {isActive && <span className="ml-1">{asc ? " ↑" : " ↓"}</span>}
    </th>
  );
}
