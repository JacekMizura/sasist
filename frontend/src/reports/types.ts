import type { NormalizedStorageType } from "../types/warehouse";
import type { WarehouseMetricsSnapshot } from "../metrics/types";

/**
 * Which top-level blocks from `WarehouseMetricsSnapshot` a report displays.
 * Reports only **select and reshape** these; they never recompute engine formulas.
 */
export const REPORT_METRIC_KEYS = [
  "occupancy",
  "capacity",
  "inventoryValue",
  "spaceUtilization",
  "pickingMetrics",
] as const;

export type ReportMetricKey = (typeof REPORT_METRIC_KEYS)[number];

/**
 * Grouping dimensions for report rows. All splits are derived from layout/inventory data
 * keyed by `locationUUID` upstream; this module only aggregates pre-built granules.
 */
export type ReportGrouping = "none" | "rack" | "row" | "template";

/**
 * Flags for which filter dimensions a report supports. UI enables controls accordingly.
 */
export type ReportSupportedFilters = {
  storageType?: boolean;
  product?: boolean;
  zone?: boolean;
};

export type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  metrics: ReportMetricKey[];
  defaultGrouping: ReportGrouping;
  supportedFilters: ReportSupportedFilters;
};

/**
 * Filter values (optional). Only dimensions marked true on the definition are applied.
 * Semantics are location-scoped via `LocationMetricGranule` (never product-global totals).
 */
export type ReportFilters = {
  /** Include only locations whose storage type is in this set (when definition supports it). */
  storageTypes?: NormalizedStorageType[];
  /** Include only locations that hold at least one of these product ids (granule.productIds). */
  productIds?: string[];
  /** Include only locations assigned to these zone ids (when granules carry zoneId). */
  zoneIds?: string[];
};

/**
 * Per-location facts for grouping and filtered aggregates. Produced **outside** this module
 * (e.g. a future metrics/layout bridge); `runReport` only filters and sums — it does not compute
 * volumes or value from raw inventory.
 *
 * Join key: `locationUUID` must match `InventoryRow.location_uuid` / bin identity normalization.
 */
export type LocationMetricGranule = {
  locationUUID: string;
  /** Rack identity for grouping (e.g. `String(rack.id ?? rack.rack_index)`). */
  rackKey: string;
  /** Display grouping for “row” (e.g. row prefix + index, or synthetic key). */
  rowKey: string | null;
  templateId: string | null;
  storageType: NormalizedStorageType;
  /** When layouts attach locations to floor zones (future). */
  zoneId?: string | null;
  capacityVolumeDm3: number;
  usedVolumeDm3: number;
  /** Inventory value at this location (already location-scoped). */
  valuePln?: number;
  /** Product ids present at this location (for product filter). */
  productIds?: string[];
};

/**
 * Bundle passed into `runReport`: aggregate snapshot from the metrics engine plus optional
 * UUID-keyed granules for dimensional reports.
 */
export type ReportMetricsData = {
  snapshot: WarehouseMetricsSnapshot;
  locationGranules?: LocationMetricGranule[];
};

export type ReportRunInput = {
  reportId: string;
  filters?: ReportFilters;
  /** Overrides `ReportDefinition.defaultGrouping` when set. */
  grouping?: ReportGrouping;
  metricsData: ReportMetricsData;
};

/**
 * One output row: normalized key/label + flat metric fields for table/PDF.
 * Field keys are stable strings (e.g. `occupancyPercent`, `capacityVolumeDm3`).
 */
export type ReportDataRow = {
  groupKey: string;
  groupLabel: string;
  values: Record<string, number | string | null | undefined>;
};

export type ReportRunMeta = {
  /** True when grouping ≠ `none` was requested but no `locationGranules` were supplied. */
  insufficientDataForGrouping: boolean;
  /** Human-readable diagnostics (e.g. filter no-op reasons). */
  notes?: string[];
};

export type ReportRunResult = {
  reportId: string;
  definition: ReportDefinition;
  grouping: ReportGrouping;
  appliedFilters: ReportFilters;
  rows: ReportDataRow[];
  meta: ReportRunMeta;
};
