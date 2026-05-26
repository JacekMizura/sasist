import type { LayoutState } from "../types/warehouse";
import type { InventoryRow } from "../pages/WarehouseDesigner/inventoryMaps";

/**
 * Minimal product fields for metrics. Prefer the same shape as WarehouseProduct;
 * ids must match InventoryRow.product_id (string-coerced).
 */
export type MetricsProductInput = {
  id: string;
  /** Unit volume (dm³); used for inventory load volume at locations. */
  volume_dm3: number;
  /** Purchase price per unit; optional — value lines default to 0. */
  purchase_price?: number;
};

export type WarehouseMetricsInput = {
  layout: LayoutState;
  inventoryRows: InventoryRow[];
  products: MetricsProductInput[];
};

/** --- Capacity (layout bins only) --- */

export type StorageTypeVolumeBreakdown = {
  binCount: number;
  volumeDm3: number;
};

export type CapacityMetrics = {
  /** Sum of bin capacities; each distinct locationUUID counted once (first bin wins on duplicate UUID). */
  totalVolumeDm3: number;
  /** Bins included in totals (have a non-empty locationUUID after normalization). */
  binCount: number;
  /** Bins skipped: empty/missing UUID — excluded from locationUUID-based rules. */
  binsSkippedNoUuid: number;
  byStorageType: {
    primary: StorageTypeVolumeBreakdown;
    pick: StorageTypeVolumeBreakdown;
    buffer: StorageTypeVolumeBreakdown;
    reserve: StorageTypeVolumeBreakdown;
    damaged: StorageTypeVolumeBreakdown;
    unknown: StorageTypeVolumeBreakdown;
  };
};

/** --- Occupancy (capacity from layout, used volume from inventory × product unit volume) --- */

export type OccupancyMetrics = {
  totalCapacityVolumeDm3: number;
  totalUsedVolumeDm3: number;
  /** 0–100; 0 if capacity is 0. */
  occupancyPercent: number;
  binCountWithUuid: number;
  binsSkippedNoUuid: number;
};

/** --- Inventory value (location-scoped rows only; no product-level-only totals) --- */

export type InventoryValueMetrics = {
  totalValue: number;
  /** Number of inventory rows that contributed (qty > 0, location in layout, price finite). */
  contributingRowCount: number;
  /** Distinct layout locationUUIDs with at least one contributing row. */
  distinctLocationCount: number;
};

/** --- Space utilization (composites; no duplicate counting of bins) --- */

export type SpaceUtilizationMetrics = {
  /** totalUsedVolumeDm3 / totalCapacityVolumeDm3; 0 if capacity is 0. */
  storageVolumeRatio: number;
  /** Locations with UUID that have any stock / locations with UUID in layout. */
  locationFillRatio: number;
  binsWithStock: number;
  binsTotalWithUuid: number;
  /** Building envelope volume (dm³) when width × depth × height are all known; else undefined. */
  buildingVolumeDm3?: number;
  /** totalCapacityVolumeDm3 / buildingVolumeDm3 when building volume known. */
  storageCapacityShareOfBuildingVolume?: number;
  /** totalUsedVolumeDm3 / buildingVolumeDm3 when building volume known. */
  usedVolumeShareOfBuildingVolume?: number;
};

/** --- Picking path (optional; derived from layout only) --- */

export type PickingMetrics = {
  waypointCount: number;
  /** Sum of |Δx|+|Δy| between consecutive waypoints in grid cells. */
  manhattanPathLengthCells: number;
};

export type WarehouseMetricsSnapshot = {
  occupancy: OccupancyMetrics;
  capacity: CapacityMetrics;
  inventoryValue: InventoryValueMetrics;
  spaceUtilization: SpaceUtilizationMetrics;
  pickingMetrics?: PickingMetrics;
};
