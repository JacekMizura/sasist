import type { CustomRackTemplate, LayoutState, RackState, WarehouseProduct } from "../../types/warehouse";
import { GRID_UNIT_CM } from "../../types/warehouse";
import type { InventoryRow } from "../../pages/WarehouseDesigner/inventoryMaps";
import { getLevelConfig, getRackDisplayId } from "../../components/warehouse/warehouseUtils";

/** Prepared payload for react-pdf — no business logic inside PDF components. */
export type PdfReportData = {
  name: string;
  date: string;
  dimensions: { widthM: number; depthM: number; heightM: number };
  surfaceM2: number;
  buildingVolumeM3: number;
  totalVolume: number;
  usedVolume: number;
  freeVolume: number;
  occupancyPercent: number;
  totalLocations: number;
  locations: {
    primary: { count: number; volume: number };
    reserve: { count: number; volume: number };
    damaged: { count: number; volume: number };
  };
  templates: Array<{
    templateId: string | null;
    name: string;
    dimensionsLabel: string;
    count: number;
    totalLocations: number;
    levels: number[];
  }>;
  warehouseValue: number;
  map: {
    gridCols: number;
    gridRows: number;
    racks: Array<{ x: number; y: number; width: number; height: number; label: string }>;
  };
};

function rackLocationCount(rack: RackState): number {
  const lc = rack.levelConfig;
  if (lc && lc.length > 0) return lc.reduce((s, x) => s + x.locations, 0);
  return Math.max(0, rack.levels) * Math.max(1, rack.bins_per_level);
}

function resolveLevelArray(rack: RackState, tplById: Map<string, CustomRackTemplate>): number[] {
  const tid = rack.templateId;
  const fromTpl = tid ? tplById.get(tid)?.levelConfig : undefined;
  const lc = fromTpl && fromTpl.length > 0 ? fromTpl : getLevelConfig(rack);
  if (lc.length === 0) return [rack.bins_per_level];
  const sorted = [...lc].sort((a, b) => a.level - b.level);
  return sorted.map((lev) => Math.max(1, lev.locations));
}

/**
 * Σ(quantity × purchase_price) for inventory rows at layout locations only.
 */
function warehouseValueFromInventory(
  products: WarehouseProduct[],
  inventoryRows: InventoryRow[],
  layoutLocationUuids: Set<string>
): number {
  const priceById = new Map<string, number>();
  for (const p of products) {
    const pr =
      typeof p.purchase_price === "number" && Number.isFinite(p.purchase_price) ? p.purchase_price : 0;
    priceById.set(String(p.id), pr);
  }
  let sum = 0;
  for (const row of inventoryRows) {
    const u = (row.location_uuid ?? "").trim();
    if (!u || !layoutLocationUuids.has(u)) continue;
    const qty = typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 0;
    if (qty <= 0) continue;
    const price = priceById.get(String(row.product_id)) ?? 0;
    sum += qty * price;
  }
  return sum;
}

export type BuildPdfDataInput = {
  layout: LayoutState;
  customTemplates: CustomRackTemplate[];
  totalCapacityDm3: number;
  usedVolumeDm3: number;
  occupancyPercent: number;
  primary: { count: number; volumeDm3: number };
  reserve: { count: number; volumeDm3: number };
  damaged: { count: number; volumeDm3: number };
  products: WarehouseProduct[];
  inventoryRows: InventoryRow[];
  layoutLocationUuids: Set<string>;
};

export function buildPdfReportData(input: BuildPdfDataInput): PdfReportData {
  const {
    layout,
    customTemplates,
    totalCapacityDm3,
    usedVolumeDm3,
    occupancyPercent,
    primary,
    reserve,
    damaged,
    products,
    inventoryRows,
    layoutLocationUuids,
  } = input;

  const w = layout.building_width_m ?? (layout.grid_cols * GRID_UNIT_CM) / 100;
  const depthM =
    layout.building_depth_m ?? layout.building_height_m ?? (layout.grid_rows * GRID_UNIT_CM) / 100;
  const h = layout.building_height_m ?? 0;
  const surfaceM2 = w * depthM;
  const buildingVolumeM3 = w > 0 && depthM > 0 && h > 0 ? w * depthM * h : surfaceM2 * (h || 0);
  const freeVol = Math.max(0, totalCapacityDm3 - usedVolumeDm3);

  const totalBins = layout.racks.reduce((s, r) => s + rackLocationCount(r), 0);

  const tplById = new Map(customTemplates.map((t) => [t.id, t]));
  type Agg = {
    templateId: string | null;
    name: string;
    dimensionsLabel: string;
    count: number;
    totalLocations: number;
    levels: number[];
    sort: string;
  };
  const groups = new Map<string, Agg>();

  for (const rack of layout.racks) {
    const tid = rack.templateId ?? null;
    const key = tid ?? "__no_template__";
    const tpl = tid ? tplById.get(tid) : undefined;
    const locCount = rackLocationCount(rack);
    const name =
      tpl?.name ??
      (tid ? `Szablon ${tid}` : rack.name ? String(rack.name) : "Bez szablonu");
    const levels = resolveLevelArray(rack, tplById);
    const widthCm = tpl?.width_cm ?? rack.width_cm;
    const depthCm = tpl?.depth_cm ?? rack.length_cm;
    const heightCm = tpl?.height_cm ?? rack.height_cm;
    const dimensionsLabel = `${Math.round(widthCm)}×${Math.round(depthCm)}×${Math.round(heightCm)} cm`;
    const prev = groups.get(key);
    if (prev) {
      prev.count += 1;
      prev.totalLocations += locCount;
    } else {
      groups.set(key, {
        templateId: tid,
        name,
        dimensionsLabel,
        count: 1,
        totalLocations: locCount,
        levels,
        sort: name.toLowerCase(),
      });
    }
  }

  const templates = [...groups.values()]
    .sort((a, b) => a.sort.localeCompare(b.sort, "pl"))
    .map((g) => ({
      templateId: g.templateId,
      name: g.name,
      dimensionsLabel: g.dimensionsLabel,
      count: g.count,
      totalLocations: g.totalLocations,
      levels: g.levels,
    }));

  const racks = layout.racks.map((r) => ({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    label: getRackDisplayId(r, layout),
  }));

  const rawName = layout.warehouse_name ?? layout.name ?? "Magazyn";
  return {
    name: String(rawName).trim() || "Magazyn",
    date: String(new Date().toLocaleString("pl-PL")),
    dimensions: { widthM: w, depthM, heightM: h },
    surfaceM2,
    buildingVolumeM3,
    totalVolume: totalCapacityDm3,
    usedVolume: usedVolumeDm3,
    freeVolume: freeVol,
    occupancyPercent,
    totalLocations: totalBins,
    locations: {
      primary: { count: primary.count, volume: primary.volumeDm3 },
      reserve: { count: reserve.count, volume: reserve.volumeDm3 },
      damaged: { count: damaged.count, volume: damaged.volumeDm3 },
    },
    templates,
    warehouseValue: warehouseValueFromInventory(products, inventoryRows, layoutLocationUuids),
    map: {
      gridCols: layout.grid_cols,
      gridRows: layout.grid_rows,
      racks,
    },
  };
}
