import type { LayoutState } from "../types/warehouse";
import { GRID_UNIT_CM } from "../types/warehouse";
import type { InventoryRow } from "../pages/WarehouseDesigner/inventoryMaps";
import { normalizeInventoryLocationUuid } from "../pages/WarehouseDesigner/inventoryMaps";
import type { CapacityMetrics, OccupancyMetrics, SpaceUtilizationMetrics } from "./types";
import { layoutLocationUuidSet } from "./computeCapacity";

function safeQuantity(q: unknown): number {
  return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : 0;
}

/**
 * Aggregate on-hand quantity per layout location UUID (inventory rows only).
 * Multiple rows for the same UUID (e.g. several SKUs) are summed so we know if the slot has any stock.
 */
function quantityByLocationUuid(
  layoutUuids: Set<string>,
  inventoryRows: InventoryRow[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of inventoryRows) {
    const u = normalizeInventoryLocationUuid(row.location_uuid);
    if (!u || !layoutUuids.has(u)) continue;
    const qty = safeQuantity(row.quantity);
    if (qty <= 0) continue;
    m.set(u, (m.get(u) ?? 0) + qty);
  }
  return m;
}

/**
 * Aligns with pdfDataBuilder footprint: width/depth from building_* or grid, height from building_height_m.
 */
function buildingVolumeDm3(layout: LayoutState): number | undefined {
  const wM = layout.building_width_m ?? (layout.grid_cols * GRID_UNIT_CM) / 100;
  const depthM =
    layout.building_depth_m ?? layout.building_height_m ?? (layout.grid_rows * GRID_UNIT_CM) / 100;
  const hM = layout.building_height_m ?? 0;
  if (wM <= 0 || depthM <= 0 || hM <= 0) return undefined;
  return wM * depthM * hM * 1000;
}

/**
 * Composites: volume ratio, slot fill ratio, optional building share when envelope is known.
 */
export function computeSpaceUtilization(
  layout: LayoutState,
  inventoryRows: InventoryRow[],
  capacity: CapacityMetrics,
  occupancy: OccupancyMetrics
): SpaceUtilizationMetrics {
  const layoutUuids = layoutLocationUuidSet(layout);
  const qtyByLoc = quantityByLocationUuid(layoutUuids, inventoryRows);

  let binsWithStock = 0;
  for (const u of layoutUuids) {
    if ((qtyByLoc.get(u) ?? 0) > 0) binsWithStock += 1;
  }

  const binsTotalWithUuid = layoutUuids.size;
  const storageVolumeRatio =
    capacity.totalVolumeDm3 > 0 ? occupancy.totalUsedVolumeDm3 / capacity.totalVolumeDm3 : 0;

  const locationFillRatio =
    binsTotalWithUuid > 0 ? binsWithStock / binsTotalWithUuid : 0;

  const bVol = buildingVolumeDm3(layout);
  let storageCapacityShareOfBuildingVolume: number | undefined;
  let usedVolumeShareOfBuildingVolume: number | undefined;
  if (bVol != null && bVol > 0) {
    storageCapacityShareOfBuildingVolume = capacity.totalVolumeDm3 / bVol;
    usedVolumeShareOfBuildingVolume = occupancy.totalUsedVolumeDm3 / bVol;
  }

  return {
    storageVolumeRatio,
    locationFillRatio,
    binsWithStock,
    binsTotalWithUuid,
    buildingVolumeDm3: bVol,
    storageCapacityShareOfBuildingVolume,
    usedVolumeShareOfBuildingVolume,
  };
}
