import type { BinState, LayoutState, NormalizedStorageType, RackState } from "../types/warehouse";
import {
  activeBinsForRack,
  findRackAndBinByLocationUuid,
  generateLocationLabelForRackCell,
  getDisplayLocationLabel,
  rackMatchesSlotRackId,
  rackPrimaryId,
} from "../components/warehouse/warehouseUtils";
import { normalizeStorageType } from "./storageTypes";

/** Single resolved view of a bin for UI badges (label + type + identity). */
export type ResolvedWarehouseLocation = {
  label: string;
  storageType: NormalizedStorageType;
  locationUUID: string | null;
};

/**
 * Effective storage class for badges — store racks use green (pick), never stale primary blue.
 */
export function resolveBinStorageType(rack: RackState, bin: BinState): NormalizedStorageType {
  const raw = normalizeStorageType(bin.storage_type);
  if (rack.rack_type === "store") {
    if (raw === "primary" || raw === "unknown") return "pick";
  }
  return raw;
}

/** One source of truth: computed display label + resolved type (never mix draft label with persisted type). */
export function resolveWarehouseLocation(
  rack: RackState,
  bin: BinState,
  layout?: LayoutState | null,
): ResolvedWarehouseLocation {
  const label = layout
    ? getDisplayLocationLabel(rack, bin, layout).replace(/\s+/g, " ").trim()
    : (
        generateLocationLabelForRackCell(rack, bin.level_index, bin.segment_index) ||
        (bin.label ?? bin.location_id ?? "")
      )
        .replace(/\s+/g, " ")
        .trim();
  return {
    label,
    storageType: resolveBinStorageType(rack, bin),
    locationUUID: (bin.locationUUID ?? "").trim() || null,
  };
}

/** Align persisted bin fields with the current layout naming (after template regen / rack rename). */
export function syncBinDisplayFields(
  rack: RackState,
  bin: BinState,
  layout: LayoutState,
): BinState {
  const { label } = resolveWarehouseLocation(rack, bin, layout);
  if (!label) return bin;
  return {
    ...bin,
    label,
    location_id: label,
    barcode_data: label,
    storage_type: resolveBinStorageType(rack, bin),
  };
}

export function syncRackBinsDisplayFields(rack: RackState, layout: LayoutState): BinState[] {
  const rid = rackPrimaryId(rack);
  const rackInLayout = layout.racks.find((r) => rackMatchesSlotRackId(r, rid)) ?? rack;
  return (rack.bins ?? []).map((bin) => syncBinDisplayFields(rackInLayout, bin, layout));
}

/** Canonical display label — UI must use this (or `resolveWarehouseLocation`). */
export function resolvedLocationLabel(
  rack: RackState,
  bin: BinState,
  layout?: LayoutState | null,
): string {
  return resolveWarehouseLocation(rack, bin, layout).label;
}

/** Lookup resolved label by permanent location UUID. */
export function resolveLocationLabelByUuid(layout: LayoutState, locationUuid: string): string | null {
  const hit = findRackAndBinByLocationUuid(layout, locationUuid);
  if (!hit) return null;
  return resolveWarehouseLocation(hit.rack, hit.bin, layout).label;
}

/** Build UUID → resolved location map for sidebar / inventory joins. */
export function buildUuidToResolvedLocation(layout: LayoutState): Map<string, ResolvedWarehouseLocation> {
  const map = new Map<string, ResolvedWarehouseLocation>();
  for (const rack of layout.racks) {
    for (const bin of activeBinsForRack(rack)) {
      const u = (bin.locationUUID ?? "").trim();
      if (!u) continue;
      map.set(u, resolveWarehouseLocation(rack, bin, layout));
    }
  }
  return map;
}

/** Align every rack/bin persisted fields with the naming engine before save or after load. */
export function syncLayoutDisplayFields(layout: LayoutState): LayoutState {
  return {
    ...layout,
    racks: layout.racks.map((rack) => ({
      ...rack,
      bins: syncRackBinsDisplayFields(rack, layout),
    })),
  };
}

/** Preserve UUID / load / ids when regenerating bins from a template. */
export function mergeRegeneratedBins(existingBins: BinState[], newBins: BinState[]): BinState[] {
  const byKey = new Map<string, BinState>();
  for (const b of existingBins) {
    byKey.set(`${b.level_index}-${b.segment_index}`, b);
  }
  return newBins.map((nb) => {
    const ex = byKey.get(`${nb.level_index}-${nb.segment_index}`);
    if (!ex) return nb;
    return {
      ...nb,
      id: ex.id,
      locationUUID: ex.locationUUID ?? nb.locationUUID,
      current_load_dm3: ex.current_load_dm3 ?? ex.used_volume_dm3 ?? nb.current_load_dm3 ?? 0,
      used_volume_dm3: ex.used_volume_dm3 ?? ex.current_load_dm3 ?? nb.used_volume_dm3 ?? 0,
      width_cm: ex.width_cm ?? nb.width_cm,
      depth_cm: ex.depth_cm ?? nb.depth_cm,
      height_cm: ex.height_cm ?? nb.height_cm,
    };
  });
}
