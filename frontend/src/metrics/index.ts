import type { LayoutState } from "../types/warehouse";
import type { WarehouseMetricsInput, WarehouseMetricsSnapshot, PickingMetrics } from "./types";
import { computeCapacity } from "./computeCapacity";
import { computeOccupancy } from "./computeOccupancy";
import { computeInventoryValue } from "./computeInventoryValue";
import { computeSpaceUtilization } from "./computeSpaceUtilization";

/**
 * Optional picking stats from `layout.picking_path` (grid cells, Manhattan length).
 */
export function computePickingMetrics(layout: LayoutState): PickingMetrics | undefined {
  const path = layout.picking_path;
  if (!path || path.length === 0) return undefined;
  let manhattanPathLengthCells = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    manhattanPathLengthCells += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  return {
    waypointCount: path.length,
    manhattanPathLengthCells,
  };
}

/**
 * Single entry: capacity from layout bins; load/value from inventory joined by locationUUID;
 * each storage UUID counted once for capacity; inventory lines summed per business rules.
 */
export function computeWarehouseMetrics(
  input: WarehouseMetricsInput,
  options?: { includePicking?: boolean }
): WarehouseMetricsSnapshot {
  const { layout, inventoryRows, products } = input;
  const capacity = computeCapacity(layout);
  const occupancy = computeOccupancy(layout, inventoryRows, products, capacity);
  const inventoryValue = computeInventoryValue(layout, inventoryRows, products);
  const spaceUtilization = computeSpaceUtilization(layout, inventoryRows, capacity, occupancy);

  const snapshot: WarehouseMetricsSnapshot = {
    occupancy,
    capacity,
    inventoryValue,
    spaceUtilization,
  };

  if (options?.includePicking) {
    const pm = computePickingMetrics(layout);
    if (pm) snapshot.pickingMetrics = pm;
  }

  return snapshot;
}

export type {
  WarehouseMetricsInput,
  WarehouseMetricsSnapshot,
  CapacityMetrics,
  OccupancyMetrics,
  InventoryValueMetrics,
  SpaceUtilizationMetrics,
  PickingMetrics,
  MetricsProductInput,
} from "./types";

export { computeCapacity, layoutLocationUuidSet, binsByLocationUuid } from "./computeCapacity";
export { computeOccupancy } from "./computeOccupancy";
export { computeInventoryValue } from "./computeInventoryValue";
export { computeSpaceUtilization } from "./computeSpaceUtilization";
