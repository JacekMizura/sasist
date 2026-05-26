import type { BinState, LayoutState, NormalizedStorageType, RackState } from "../types/warehouse";
import { activeBinsForRack, binVolumeDm3 } from "../components/warehouse/warehouseUtils";
import { normalizeInventoryLocationUuid } from "../pages/WarehouseDesigner/inventoryMaps";
import { normalizeStorageType } from "../utils/storageTypes";
import type { CapacityMetrics, StorageTypeVolumeBreakdown } from "./types";

/** Bin may expose `locationUUID` or `location_uuid`; must match InventoryRow.location_uuid after trim. */
function normalizeBinLocationUuid(bin: BinState): string {
  const raw = (bin as { location_uuid?: string }).location_uuid ?? bin.locationUUID;
  return normalizeInventoryLocationUuid(raw);
}

const emptyBreakdown = (): StorageTypeVolumeBreakdown => ({ binCount: 0, volumeDm3: 0 });

export type BinWithRack = { bin: BinState; rack: RackState };

/**
 * Walk all racks.bins and collect the first BinState per normalized locationUUID.
 * Assumption: layout bins are the canonical list of storage locations; `locationUUID` is the join key
 * to InventoryRow.location_uuid. If two bins share the same UUID (data error), we keep the first
 * encountered and ignore the duplicate for capacity to avoid double-counting volume.
 */
export function binsByLocationUuid(layout: LayoutState): Map<string, BinWithRack> {
  const map = new Map<string, BinWithRack>();
  for (const rack of layout.racks ?? []) {
    for (const bin of activeBinsForRack(rack)) {
      const u = normalizeBinLocationUuid(bin);
      if (!u) continue;
      if (!map.has(u)) map.set(u, { bin, rack });
    }
  }
  return map;
}

/** All distinct layout location UUIDs (trimmed). */
export function layoutLocationUuidSet(layout: LayoutState): Set<string> {
  return new Set(binsByLocationUuid(layout).keys());
}

function addBreakdown(
  agg: CapacityMetrics["byStorageType"],
  st: NormalizedStorageType,
  volumeDm3: number
): void {
  const key = st as keyof typeof agg;
  if (!(key in agg)) return;
  const b = agg[key];
  b.binCount += 1;
  b.volumeDm3 += volumeDm3;
}

/**
 * Capacity from layout bins only: volumes use the same rules as binVolumeDm3 (dimensions or volume_dm3).
 * Each locationUUID is counted once (see binsByLocationUuid).
 */
export function computeCapacity(layout: LayoutState): CapacityMetrics {
  const byStorageType: CapacityMetrics["byStorageType"] = {
    primary: emptyBreakdown(),
    pick: emptyBreakdown(),
    buffer: emptyBreakdown(),
    reserve: emptyBreakdown(),
    damaged: emptyBreakdown(),
    unknown: emptyBreakdown(),
  };

  let binsSkippedNoUuid = 0;
  for (const rack of layout.racks ?? []) {
    for (const bin of activeBinsForRack(rack)) {
      if (!normalizeBinLocationUuid(bin)) binsSkippedNoUuid += 1;
    }
  }

  const unique = binsByLocationUuid(layout);
  let totalVolumeDm3 = 0;
  for (const { bin, rack } of unique.values()) {
    const vol = binVolumeDm3(bin, rack);
    totalVolumeDm3 += vol;
    addBreakdown(byStorageType, normalizeStorageType(bin.storage_type), vol);
  }

  return {
    totalVolumeDm3,
    binCount: unique.size,
    binsSkippedNoUuid,
    byStorageType,
  };
}
