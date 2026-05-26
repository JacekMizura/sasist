import type { WarehouseMetricsSnapshot } from "../metrics/types";
import type {
  LocationMetricGranule,
  ReportDefinition,
  ReportFilters,
  ReportGrouping,
  ReportMetricKey,
  ReportRunInput,
  ReportRunMeta,
  ReportRunResult,
} from "./types";
import { getReportDefinition } from "./reportDefinitions";

function intersects(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a?.length || !b?.length) return false;
  const setB = new Set(b);
  return a.some((x) => setB.has(x));
}

/**
 * Applies only filters that the report definition advertises; records notes when a filter is ignored.
 */
function filterGranules(
  definition: ReportDefinition,
  filters: ReportFilters | undefined,
  granules: LocationMetricGranule[],
  notes: string[]
): LocationMetricGranule[] {
  if (!filters) return granules;
  let out = granules;

  if (filters.storageTypes?.length) {
    if (definition.supportedFilters.storageType) {
      const allow = new Set(filters.storageTypes);
      out = out.filter((g) => allow.has(g.storageType));
    } else {
      notes.push("Filter storageTypes ignored: report does not support storageType.");
    }
  }

  if (filters.productIds?.length) {
    if (definition.supportedFilters.product) {
      const want = filters.productIds;
      out = out.filter((g) => intersects(g.productIds ?? [], want));
    } else {
      notes.push("Filter productIds ignored: report does not support product.");
    }
  }

  if (filters.zoneIds?.length) {
    if (definition.supportedFilters.zone) {
      const allow = new Set(filters.zoneIds);
      out = out.filter((g) => g.zoneId != null && allow.has(g.zoneId));
    } else {
      notes.push("Filter zoneIds ignored: report does not support zone.");
    }
  }

  return out;
}

function groupKeyFor(
  grouping: ReportGrouping,
  g: LocationMetricGranule
): { key: string; label: string } {
  switch (grouping) {
    case "rack":
      return { key: `rack:${g.rackKey}`, label: g.rackKey };
    case "row":
      return {
        key: `row:${g.rowKey ?? "unknown"}`,
        label: g.rowKey ?? "—",
      };
    case "template":
      return {
        key: `template:${g.templateId ?? "none"}`,
        label: g.templateId ?? "(brak szablonu)",
      };
    default:
      return { key: "__all__", label: "Wszystko" };
  }
}

function sumGranules(gs: LocationMetricGranule[]): {
  capacityVolumeDm3: number;
  usedVolumeDm3: number;
  valuePln: number;
} {
  let capacityVolumeDm3 = 0;
  let usedVolumeDm3 = 0;
  let valuePln = 0;
  for (const g of gs) {
    capacityVolumeDm3 += g.capacityVolumeDm3;
    usedVolumeDm3 += g.usedVolumeDm3;
    valuePln += g.valuePln ?? 0;
  }
  return { capacityVolumeDm3, usedVolumeDm3, valuePln };
}

/**
 * Flattens selected snapshot sections into stable string keys for tables/PDF.
 * Reports do not recompute — they only project fields from the engine output.
 */
export function flattenSnapshotMetrics(
  snapshot: WarehouseMetricsSnapshot,
  keys: ReportMetricKey[]
): Record<string, number | string | null | undefined> {
  const out: Record<string, number | string | null | undefined> = {};
  const want = new Set(keys);

  if (want.has("occupancy")) {
    out.occupancy_totalCapacityVolumeDm3 = snapshot.occupancy.totalCapacityVolumeDm3;
    out.occupancy_totalUsedVolumeDm3 = snapshot.occupancy.totalUsedVolumeDm3;
    out.occupancy_occupancyPercent = snapshot.occupancy.occupancyPercent;
    out.occupancy_binCountWithUuid = snapshot.occupancy.binCountWithUuid;
    out.occupancy_binsSkippedNoUuid = snapshot.occupancy.binsSkippedNoUuid;
  }
  if (want.has("capacity")) {
    out.capacity_totalVolumeDm3 = snapshot.capacity.totalVolumeDm3;
    out.capacity_binCount = snapshot.capacity.binCount;
    out.capacity_binsSkippedNoUuid = snapshot.capacity.binsSkippedNoUuid;
    const st = snapshot.capacity.byStorageType;
    for (const k of ["primary", "pick", "buffer", "reserve", "damaged", "unknown"] as const) {
      out[`capacity_byStorageType_${k}_binCount`] = st[k].binCount;
      out[`capacity_byStorageType_${k}_volumeDm3`] = st[k].volumeDm3;
    }
  }
  if (want.has("inventoryValue")) {
    out.inventoryValue_totalValue = snapshot.inventoryValue.totalValue;
    out.inventoryValue_contributingRowCount = snapshot.inventoryValue.contributingRowCount;
    out.inventoryValue_distinctLocationCount = snapshot.inventoryValue.distinctLocationCount;
  }
  if (want.has("spaceUtilization")) {
    out.spaceUtilization_storageVolumeRatio = snapshot.spaceUtilization.storageVolumeRatio;
    out.spaceUtilization_locationFillRatio = snapshot.spaceUtilization.locationFillRatio;
    out.spaceUtilization_binsWithStock = snapshot.spaceUtilization.binsWithStock;
    out.spaceUtilization_binsTotalWithUuid = snapshot.spaceUtilization.binsTotalWithUuid;
    out.spaceUtilization_buildingVolumeDm3 = snapshot.spaceUtilization.buildingVolumeDm3;
    out.spaceUtilization_storageCapacityShareOfBuildingVolume =
      snapshot.spaceUtilization.storageCapacityShareOfBuildingVolume;
    out.spaceUtilization_usedVolumeShareOfBuildingVolume =
      snapshot.spaceUtilization.usedVolumeShareOfBuildingVolume;
  }
  if (want.has("pickingMetrics") && snapshot.pickingMetrics) {
    out.picking_waypointCount = snapshot.pickingMetrics.waypointCount;
    out.picking_manhattanPathLengthCells = snapshot.pickingMetrics.manhattanPathLengthCells;
  }

  return out;
}

function mergeGroupedMetrics(
  snapshot: WarehouseMetricsSnapshot,
  keys: ReportMetricKey[],
  sums: { capacityVolumeDm3: number; usedVolumeDm3: number; valuePln: number }
): Record<string, number | string | null | undefined> {
  const out: Record<string, number | string | null | undefined> = {};
  const want = new Set(keys);
  const occ =
    sums.capacityVolumeDm3 > 0
      ? Math.min(100, (sums.usedVolumeDm3 / sums.capacityVolumeDm3) * 100)
      : 0;

  if (want.has("occupancy")) {
    out.occupancy_totalCapacityVolumeDm3 = sums.capacityVolumeDm3;
    out.occupancy_totalUsedVolumeDm3 = sums.usedVolumeDm3;
    out.occupancy_occupancyPercent = occ;
  }
  if (want.has("capacity")) {
    out.capacity_totalVolumeDm3 = sums.capacityVolumeDm3;
  }
  if (want.has("inventoryValue")) {
    out.inventoryValue_totalValue = sums.valuePln;
  }
  if (want.has("spaceUtilization")) {
    out.spaceUtilization_storageVolumeRatio =
      sums.capacityVolumeDm3 > 0 ? sums.usedVolumeDm3 / sums.capacityVolumeDm3 : 0;
  }
  if (want.has("pickingMetrics") && snapshot.pickingMetrics) {
    out.picking_waypointCount = snapshot.pickingMetrics.waypointCount;
    out.picking_manhattanPathLengthCells = snapshot.pickingMetrics.manhattanPathLengthCells;
  }

  return out;
}

/**
 * Transforms pre-computed metrics into a normalized row set for UI/PDF.
 * Does not call the metrics engine and does not join raw inventory — only filters and aggregates granules by UUID-keyed facts.
 */
export function runReport(input: ReportRunInput): ReportRunResult {
  const notes: string[] = [];
  const definition = getReportDefinition(input.reportId);
  if (!definition) {
    throw new Error(`Unknown report id: ${input.reportId}`);
  }

  const grouping = input.grouping ?? definition.defaultGrouping;
  const appliedFilters: ReportFilters = { ...input.filters };
  const snapshot = input.metricsData.snapshot;
  const granules = input.metricsData.locationGranules;

  const insufficientDataForGrouping =
    grouping !== "none" && (!granules || granules.length === 0);

  if (insufficientDataForGrouping) {
    notes.push(
      "Grouping requires locationGranules (locationUUID-keyed); falling back to aggregate snapshot only."
    );
  }

  const rows: ReportDataRow[] = [];

  if (grouping === "none" || insufficientDataForGrouping) {
    rows.push({
      groupKey: "__aggregate__",
      groupLabel: "Magazyn",
      values: flattenSnapshotMetrics(snapshot, definition.metrics),
    });
  } else {
    const filtered = filterGranules(definition, input.filters, granules!, notes);
    const buckets = new Map<string, LocationMetricGranule[]>();
    for (const g of filtered) {
      const { key } = groupKeyFor(grouping, g);
      const arr = buckets.get(key);
      if (arr) arr.push(g);
      else buckets.set(key, [g]);
    }

    const orderedKeys = [...buckets.keys()].sort();
    for (const key of orderedKeys) {
      const list = buckets.get(key)!;
      const first = list[0]!;
      const { label } = groupKeyFor(grouping, first);
      const sums = sumGranules(list);
      rows.push({
        groupKey: key,
        groupLabel: label,
        values: mergeGroupedMetrics(snapshot, definition.metrics, sums),
      });
    }

    if (rows.length === 0) {
      notes.push("No rows after filters; granule set may be empty.");
    }
  }

  const meta: ReportRunMeta = {
    insufficientDataForGrouping,
    notes: notes.length ? notes : undefined,
  };

  return {
    reportId: input.reportId,
    definition,
    grouping: insufficientDataForGrouping ? "none" : grouping,
    appliedFilters,
    rows,
    meta,
  };
}
