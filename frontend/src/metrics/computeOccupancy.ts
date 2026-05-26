import type { LayoutState } from "../types/warehouse";
import type { InventoryRow } from "../pages/WarehouseDesigner/inventoryMaps";
import { normalizeInventoryLocationUuid } from "../pages/WarehouseDesigner/inventoryMaps";
import type { CapacityMetrics, MetricsProductInput, OccupancyMetrics } from "./types";
import { layoutLocationUuidSet } from "./computeCapacity";

function safeQuantity(q: unknown): number {
  return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : 0;
}

function unitVolumeDm3ByProductId(products: MetricsProductInput[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of products) {
    const v = typeof p.volume_dm3 === "number" && Number.isFinite(p.volume_dm3) ? p.volume_dm3 : 0;
    m.set(String(p.id), Math.max(0, v));
  }
  return m;
}

/**
 * Used volume from inventory: for each row at a layout location, add qty × product unit volume (dm³).
 * Assumption: `location_uuid` on rows matches bin `locationUUID` after trimming (see inventoryMaps).
 * Rows outside the layout UUID set are ignored so stock is not attributed to unknown locations.
 */
export function computeOccupancy(
  layout: LayoutState,
  inventoryRows: InventoryRow[],
  products: MetricsProductInput[],
  capacity: CapacityMetrics
): OccupancyMetrics {
  const layoutUuids = layoutLocationUuidSet(layout);
  const volByProduct = unitVolumeDm3ByProductId(products);

  let totalUsedVolumeDm3 = 0;
  for (const row of inventoryRows) {
    const u = normalizeInventoryLocationUuid(row.location_uuid);
    if (!u || !layoutUuids.has(u)) continue;
    const qty = safeQuantity(row.quantity);
    if (qty <= 0) continue;
    const unitVol = volByProduct.get(String(row.product_id)) ?? 0;
    totalUsedVolumeDm3 += qty * unitVol;
  }

  const totalCapacityVolumeDm3 = capacity.totalVolumeDm3;
  const occupancyPercent =
    totalCapacityVolumeDm3 > 0
      ? Math.min(100, (totalUsedVolumeDm3 / totalCapacityVolumeDm3) * 100)
      : 0;

  return {
    totalCapacityVolumeDm3,
    totalUsedVolumeDm3,
    occupancyPercent,
    binCountWithUuid: capacity.binCount,
    binsSkippedNoUuid: capacity.binsSkippedNoUuid,
  };
}
