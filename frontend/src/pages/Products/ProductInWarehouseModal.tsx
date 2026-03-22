import { useEffect, useMemo, useState } from "react";
import { layoutService } from "../../services/layoutService";

const DEFAULT_TENANT_ID = 1;

/** First segment before the dash. "A3-2-1" → "A3" */
function getRackIdFromLocationName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return "";
  const part = name.trim().split("-")[0];
  return part ?? "";
}

type LayoutRack = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  levels: number;
  bins_per_level: number;
  color?: string;
  bins: Array<{ id?: number; label: string; level_index: number; segment_index: number }>;
};

type Layout = {
  layout_id: number | null;
  warehouse_id: number;
  grid_cols: number;
  grid_rows: number;
  racks: LayoutRack[];
  aisles: Array<{ id?: number; x: number; y: number; width: number; height: number }>;
};

type ProductLocation = { name: string; quantity: number; warehouse_id?: number };

type Product = {
  id: number;
  name?: string;
  locations?: ProductLocation[];
};

type Props = {
  product: Product | null;
  onClose: () => void;
};

export function ProductInWarehouseModal({ product, onClose }: Props) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);

  const locationsWithWarehouse = useMemo(
    () => (product?.locations ?? []).filter((loc) => loc.warehouse_id != null) as (ProductLocation & { warehouse_id: number })[],
    [product?.locations]
  );
  const warehouseIds = useMemo(
    () => Array.from(new Set(locationsWithWarehouse.map((loc) => loc.warehouse_id))),
    [locationsWithWarehouse]
  );

  useEffect(() => {
    if (warehouseIds.length > 0 && selectedWarehouseId == null) {
      setSelectedWarehouseId(warehouseIds[0]);
    }
  }, [warehouseIds, selectedWarehouseId]);

  useEffect(() => {
    if (product != null && warehouseIds.length === 0 && warehouses.length > 0 && selectedWarehouseId == null) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [product, warehouseIds.length, warehouses, selectedWarehouseId]);

  useEffect(() => {
    import("../../api/axios").then(({ default: api }) => {
      api.get<{ id: number; name: string }[]>("/warehouses/").then((r) => setWarehouses(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (selectedWarehouseId == null) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    setLayoutLoading(true);
    setLayout(null);
    layoutService
      .getLayout({ tenant_id: DEFAULT_TENANT_ID, warehouse_id: selectedWarehouseId })
      .then((res) => {
        const d = res.data as Layout | undefined;
        if (!cancelled && d && typeof d === "object") {
          setLayout({
            layout_id: d.layout_id ?? null,
            warehouse_id: d.warehouse_id ?? selectedWarehouseId,
            grid_cols: Number(d.grid_cols) || 24,
            grid_rows: Number(d.grid_rows) || 16,
            racks: Array.isArray(d.racks) ? d.racks : [],
            aisles: Array.isArray(d.aisles) ? d.aisles : [],
          });
        }
      })
      .catch(() => { if (!cancelled) setLayout(null); })
      .finally(() => { if (!cancelled) setLayoutLoading(false); });
    return () => { cancelled = true; };
  }, [selectedWarehouseId]);

  const productLocationsInWarehouse = useMemo(() => {
    if (selectedWarehouseId == null) return [];
    if (warehouseIds.length > 0) {
      return locationsWithWarehouse.filter((loc) => loc.warehouse_id === selectedWarehouseId);
    }
    return (product?.locations ?? []) as { name: string; quantity: number }[];
  }, [locationsWithWarehouse, selectedWarehouseId, warehouseIds.length, product?.locations]);

  const rackIdToLocations = useMemo(() => {
    const map: Record<string, { name: string; quantity: number }[]> = {};
    for (const loc of productLocationsInWarehouse) {
      const rackId = getRackIdFromLocationName(loc.name);
      if (!rackId) continue;
      if (!map[rackId]) map[rackId] = [];
      map[rackId].push({ name: loc.name, quantity: loc.quantity });
    }
    return map;
  }, [productLocationsInWarehouse]);

  const highlightedRackIds = useMemo(() => new Set(Object.keys(rackIdToLocations)), [rackIdToLocations]);

  if (product == null) return null;

  const hasLocations = product.locations && product.locations.length > 0;
  const hasWarehouseInfo = warehouseIds.length > 0;
  const warehouseOptions = warehouseIds.length > 0 ? warehouseIds : warehouses.map((w) => w.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Show product in warehouse</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700 p-1">×</button>
        </div>
        <div className="p-6 overflow-auto flex-1">
          {!hasLocations ? (
            <p className="text-slate-500">Brak danych o lokalizacjach dla tego produktu.</p>
          ) : !hasWarehouseInfo && warehouses.length === 0 ? (
            <p className="text-slate-500">Ładowanie listy magazynów…</p>
          ) : null}

          {hasLocations && (
            <>
              <div className="mb-4 flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700">Magazyn:</span>
                <select
                  value={selectedWarehouseId ?? ""}
                  onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm"
                >
                  {warehouseOptions.map((wid) => {
                    const wh = warehouses.find((w) => w.id === wid);
                    return (
                      <option key={wid} value={wid}>
                        {wh?.name ?? `Magazyn ${wid}`}
                      </option>
                    );
                  })}
                </select>
              </div>

              {layoutLoading && <p className="text-slate-500 text-sm">Ładowanie layoutu…</p>}
              {!layoutLoading && layout && layout.racks.length > 0 && (
                <ProductRackMap
                  layout={layout}
                  highlightedRackIds={highlightedRackIds}
                  rackIdToLocations={rackIdToLocations}
                  productName={product.name ?? `#${product.id}`}
                />
              )}
              {!layoutLoading && selectedWarehouseId != null && layout && layout.racks.length === 0 && (
                <p className="text-slate-500 text-sm">Brak layoutu regałów dla tego magazynu.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductRackMap({
  layout,
  highlightedRackIds,
  rackIdToLocations,
  productName,
}: {
  layout: Layout;
  highlightedRackIds: Set<string>;
  rackIdToLocations: Record<string, { name: string; quantity: number }[]>;
  productName: string;
}) {
  const [tooltip, setTooltip] = useState<{
    rackId: string;
    x: number;
    y: number;
    locations: { name: string; quantity: number }[];
  } | null>(null);
  const viewW = Math.max(1, layout.grid_cols);
  const viewH = Math.max(1, layout.grid_rows);
  const defaultRackFill = "#94a3b8";
  const highlightFill = "#22c55e";
  const highlightStroke = "#16a34a";

  return (
    <div className="relative">
      <div className="bg-slate-100/50 rounded-lg overflow-hidden">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full block"
          style={{ maxHeight: 420 }}
        >
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
          {layout.racks.map((r) => {
            const levels = Math.max(1, r.levels);
            const binsPerLevel = Math.max(1, r.bins_per_level);
            const cellW = Math.max(0.02, (r.width - 0.04) / binsPerLevel);
            const cellH = Math.max(0.02, (r.height - 0.04) / levels);
            const rackId = getRackIdFromLocationName(r.bins?.[0]?.label);
            const isHighlighted = rackId && highlightedRackIds.has(rackId);
            const fill = isHighlighted ? highlightFill : (r.color?.trim() && r.color !== "" ? r.color : defaultRackFill);
            const stroke = isHighlighted ? highlightStroke : "#1e293b";
            const strokeWidth = isHighlighted ? 0.04 : 0.015;
            const bins = (r.bins ?? []).slice().sort(
              (a, b) => a.level_index - b.level_index || a.segment_index - b.segment_index
            );
            const locationsInRack = rackId ? (rackIdToLocations[rackId] ?? []) : [];

            return (
              <g
                key={r.id}
                onMouseEnter={(ev) => {
                  if (rackId && locationsInRack.length > 0) {
                    const rect = ev.currentTarget.getBoundingClientRect();
                    setTooltip({
                      rackId,
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                      locations: locationsInRack,
                    });
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                {bins.map((bin) => {
                  const seg = Math.min(bin.segment_index, binsPerLevel - 1);
                  const lev = Math.min(bin.level_index, levels - 1);
                  const x = r.x + 0.02 + seg * cellW;
                  const y = r.y + 0.02 + lev * cellH;
                  return (
                    <rect
                      key={bin.id ?? `${r.id}-${bin.level_index}-${bin.segment_index}`}
                      x={x + 0.01}
                      y={y + 0.01}
                      width={Math.max(0.02, cellW - 0.02)}
                      height={Math.max(0.02, cellH - 0.02)}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 text-sm bg-slate-800 text-white rounded shadow-lg pointer-events-none max-w-xs"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <p className="font-medium">Rack: {tooltip.rackId}</p>
          <p className="text-slate-300 mt-1">{productName}</p>
          <p className="text-slate-400 text-xs mt-1">Locations:</p>
          <ul className="mt-0.5 space-y-0.5">
            {tooltip.locations.map((loc, i) => (
              <li key={i}>
                {loc.name} ({Number.isInteger(loc.quantity) ? loc.quantity : loc.quantity})
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 flex items-center gap-4 text-sm text-slate-500">
        <span>
          <span className="inline-block w-3 h-3 rounded bg-[#22c55e] border border-slate-700 align-middle mr-1" />
          Regały z produktem
        </span>
      </div>
    </div>
  );
}
