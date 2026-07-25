/**
 * Passage → storage levels (variant A only).
 *
 * SSOT remains Rack + internal structure + passages.
 * Generator is a pure function: structural levels + void height → storage bins.
 * Passage is always full-width for storage (XY offset still used for routing only).
 */

import type { BinState, LevelConfigItem, RackPassageState, RackState } from "../../types/warehouse";

export type PassageClearanceLike = {
  enabled?: boolean;
  clearance_height_cm?: number | null;
};

function isBinActive(bin: Pick<BinState, "is_active">): boolean {
  return bin.is_active !== false;
}

/** Local copy of equal-split heights (avoids circular import with warehouseUtils). */
function levelHeightsForRack(rackHeightCm: number, levelCount: number): number[] {
  if (levelCount <= 0 || rackHeightCm <= 0) return [];
  const baseHeight = Math.floor(rackHeightCm / levelCount);
  const heights = Array(levelCount).fill(baseHeight) as number[];
  heights[levelCount - 1] = rackHeightCm - baseHeight * (levelCount - 1);
  return heights;
}

/**
 * Exactly one structural under-rack passage per rack.
 * Canonical = first enabled passage in list order (extras ignored for storage void).
 * XY routing may still see other openings historically; storage uses only this one.
 */
export function getStructuralPassage(
  passages?: PassageClearanceLike[] | null
): PassageClearanceLike | null {
  for (const p of passages ?? []) {
    if (p.enabled === false) continue;
    return p;
  }
  return null;
}

/** Clearance of the single structural passage (cm). Missing/invalid → 0 (no void). */
export function getPassageVoidHeightCm(
  passages?: PassageClearanceLike[] | null
): number {
  const p = getStructuralPassage(passages);
  if (!p) return 0;
  const c = Number(p.clearance_height_cm);
  return Number.isFinite(c) && c > 0 ? c : 0;
}

/** True when more than one enabled passage exists (model allows only one structural). */
export function hasMultipleEnabledPassages(
  passages?: PassageClearanceLike[] | null
): boolean {
  let n = 0;
  for (const p of passages ?? []) {
    if (p.enabled === false) continue;
    n += 1;
    if (n > 1) return true;
  }
  return false;
}

/**
 * How many bottom structural levels intersect void band [0, voidHeightCm).
 * A level with bottom >= voidHeightCm is storage.
 */
export function countPassageVoidLevels(
  rackHeightCm: number,
  structuralLevelCount: number,
  voidHeightCm: number
): number {
  const L = Math.max(0, Math.floor(structuralLevelCount));
  if (L <= 0 || voidHeightCm <= 0 || !(rackHeightCm > 0)) return 0;
  const heights = levelHeightsForRack(rackHeightCm, L);
  let bottom = 0;
  let skip = 0;
  for (let i = 0; i < heights.length; i++) {
    if (bottom < voidHeightCm) skip += 1;
    else break;
    bottom += heights[i]!;
  }
  return Math.min(skip, L);
}

export function countPassageVoidLevelsForRack(
  rack: Pick<RackState, "height_cm" | "levels" | "levelConfig" | "layoutVariant" | "passages">
): number {
  const structuralCount = Math.max(
    1,
    Array.isArray(rack.layoutVariant?.levels) && rack.layoutVariant!.levels!.length > 0
      ? rack.layoutVariant!.levels!.length
      : Array.isArray(rack.levelConfig) && rack.levelConfig.length > 0
        ? rack.levelConfig.length
        : Number(rack.levels ?? 1)
  );
  return countPassageVoidLevels(
    Number(rack.height_cm ?? 0),
    structuralCount,
    getPassageVoidHeightCm(rack.passages)
  );
}

/** Drop void levels; renumber remaining to 1..N (storage only). */
export function storageLevelConfigAfterVoid(
  structuralLevels: LevelConfigItem[],
  voidLevelCount: number
): LevelConfigItem[] {
  const skip = Math.max(0, Math.min(voidLevelCount, structuralLevels.length));
  return structuralLevels.slice(skip).map((row, i) => ({
    ...row,
    level: i + 1,
  }));
}

export function sumVoidLevelHeightsCm(
  rackHeightCm: number,
  structuralLevelCount: number,
  voidLevelCount: number
): number {
  if (voidLevelCount <= 0 || structuralLevelCount <= 0 || !(rackHeightCm > 0)) return 0;
  const heights = levelHeightsForRack(rackHeightCm, structuralLevelCount);
  return heights.slice(0, voidLevelCount).reduce((s, h) => s + h, 0);
}

function binPosKey(levelIndex: number, segmentIndex: number): string {
  return `${levelIndex}-${segmentIndex}`;
}

/**
 * Infer whether existing bins still use structural indices (including void slots)
 * vs already-storage indices (0..storageCount-1 only).
 */
export function inferExistingStorageIndexing(
  existingBins: BinState[],
  structuralLevelCount: number,
  nextVoidLevels: number
): { storageIndexed: boolean; previousVoidLevels: number } {
  const active = existingBins.filter(isBinActive);
  if (active.length === 0) {
    return { storageIndexed: true, previousVoidLevels: nextVoidLevels };
  }
  const minL = Math.min(...active.map((b) => b.level_index));
  const maxL = Math.max(...active.map((b) => b.level_index));
  const nextStorageCount = Math.max(0, structuralLevelCount - nextVoidLevels);
  const packedFromZero = minL === 0 && maxL === active.length - 1;

  // Already storage-numbered for this (or prior) void: contiguous 0..n-1 with n <= storage slots.
  if (packedFromZero && active.length <= nextStorageCount && active.length < structuralLevelCount) {
    return {
      storageIndexed: true,
      previousVoidLevels: Math.max(nextVoidLevels, structuralLevelCount - active.length),
    };
  }

  // Full structural span still present.
  if (packedFromZero && active.length >= structuralLevelCount) {
    return { storageIndexed: false, previousVoidLevels: 0 };
  }

  // Structural leftovers after void bins were dropped (indices start above floor).
  if (minL > 0) {
    return { storageIndexed: false, previousVoidLevels: minL };
  }

  // Bins in the void index range AND more bins than storage ⇒ still structural.
  if (
    nextVoidLevels > 0 &&
    active.length > nextStorageCount &&
    active.some((b) => b.level_index < nextVoidLevels)
  ) {
    return { storageIndexed: false, previousVoidLevels: 0 };
  }

  return {
    storageIndexed: true,
    previousVoidLevels: nextVoidLevels,
  };
}

export type BinRebuildPlan = {
  merged: BinState[];
  removed: BinState[];
  nextVoidLevels: number;
  previousVoidLevels: number;
};

/**
 * Merge next generator bins with existing identity (UUID/id/load).
 * Physical column match: storageIndex + voidLevels.
 */
export function planBinRebuild(
  existingBins: BinState[],
  nextBins: BinState[],
  structuralLevelCount: number,
  nextVoidLevels: number
): BinRebuildPlan {
  const active = existingBins.filter(isBinActive);
  const { storageIndexed, previousVoidLevels } = inferExistingStorageIndexing(
    active,
    structuralLevelCount,
    nextVoidLevels
  );

  const byPhysical = new Map<string, BinState>();
  for (const b of active) {
    const physical = storageIndexed ? b.level_index + previousVoidLevels : b.level_index;
    byPhysical.set(binPosKey(physical, b.segment_index), b);
  }

  const usedUuids = new Set<string>();
  const merged = nextBins.map((nb) => {
    const physical = nb.level_index + nextVoidLevels;
    const ex = byPhysical.get(binPosKey(physical, nb.segment_index));
    if (!ex) return nb;
    if (ex.locationUUID) usedUuids.add(ex.locationUUID);
    return {
      ...nb,
      id: ex.id,
      locationUUID: ex.locationUUID ?? nb.locationUUID,
      current_load_dm3: ex.current_load_dm3 ?? ex.used_volume_dm3 ?? nb.current_load_dm3 ?? 0,
      used_volume_dm3: ex.used_volume_dm3 ?? ex.current_load_dm3 ?? nb.used_volume_dm3 ?? 0,
      width_cm: ex.width_cm ?? nb.width_cm,
      depth_cm: ex.depth_cm ?? nb.depth_cm,
      height_cm: ex.height_cm ?? nb.height_cm,
      is_active: true,
    };
  });

  for (const b of merged) {
    if (b.locationUUID) usedUuids.add(b.locationUUID);
  }

  const removed = active.filter((b) => {
    const uuid = b.locationUUID;
    if (uuid && usedUuids.has(uuid)) return false;
    // Also treat positional reuse without uuid as kept
    const physical = storageIndexed ? b.level_index + previousVoidLevels : b.level_index;
    const kept = merged.some(
      (nb) =>
        nb.level_index + nextVoidLevels === physical &&
        nb.segment_index === b.segment_index &&
        (nb.locationUUID === b.locationUUID || (!b.locationUUID && nb.id === b.id))
    );
    return !kept;
  });

  return {
    merged,
    removed,
    nextVoidLevels,
    previousVoidLevels,
  };
}

export type StructureRemovalImpact = {
  rackKey: string;
  rackLabel: string;
  removedCount: number;
  removed: Array<{
    label: string;
    locationUUID?: string;
    level_index: number;
    segment_index: number;
    hasStock: boolean;
    stockHint: string;
  }>;
  hasStock: boolean;
};

export function binHasStockHint(bin: BinState): boolean {
  const load = Number(bin.used_volume_dm3 ?? bin.current_load_dm3 ?? 0);
  return Number.isFinite(load) && load > 0;
}

export function buildRemovalImpact(
  rackLabel: string,
  rackKey: string,
  removed: BinState[],
  stockByUuid?: Map<string, number>
): StructureRemovalImpact {
  const rows = removed.map((b) => {
    const uuid = (b.locationUUID ?? "").trim();
    const qty = uuid && stockByUuid ? Number(stockByUuid.get(uuid) ?? 0) : 0;
    const hasStock = (Number.isFinite(qty) && qty > 0) || binHasStockHint(b);
    return {
      label: String(b.label ?? b.location_id ?? `${b.level_index}-${b.segment_index}`).trim(),
      locationUUID: b.locationUUID,
      level_index: b.level_index,
      segment_index: b.segment_index,
      hasStock,
      stockHint: hasStock
        ? qty > 0
          ? `stan qty=${qty}`
          : "zajętość objętościowa > 0"
        : "brak stanu",
    };
  });
  return {
    rackKey,
    rackLabel,
    removedCount: rows.length,
    removed: rows,
    hasStock: rows.some((r) => r.hasStock),
  };
}

/** True when storage slot set (level×segment) differs — ignores labels. */
export function rackBinPositionsDiffer(existingBins: BinState[], nextBins: BinState[]): boolean {
  const key = (b: BinState) => `${b.level_index}|${b.segment_index}`;
  const a = existingBins.filter(isBinActive).map(key).sort();
  const n = nextBins.map(key).sort();
  if (a.length !== n.length) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== n[i]) return true;
  return false;
}

/** True when expected storage set differs from current active bins (count/positions/labels). */
export function rackStructureDiffers(existingBins: BinState[], nextBins: BinState[]): boolean {
  if (rackBinPositionsDiffer(existingBins, nextBins)) return true;
  const a = existingBins.filter(isBinActive);
  const key = (b: BinState) =>
    `${b.level_index}|${b.segment_index}|${String(b.label ?? "").trim()}`;
  const aSet = new Set(a.map(key));
  const nSet = new Set(nextBins.map(key));
  if (aSet.size !== nSet.size) return true;
  for (const k of nSet) if (!aSet.has(k)) return true;
  return false;
}

export function passagesForGenerator(
  passages?: RackPassageState[] | null
): PassageClearanceLike[] | undefined {
  if (!passages?.length) return undefined;
  return passages.map((p) => ({
    enabled: p.enabled !== false,
    clearance_height_cm: p.clearance_height_cm,
  }));
}

/** Template default_passages → clearance input for createBinsForRack. */
export function passagesFromTemplateDefaults(
  defaults?: Array<{
    enabled?: boolean;
    clearance_height_cm?: number | null;
  }> | null
): PassageClearanceLike[] | undefined {
  if (!defaults?.length) return undefined;
  return defaults.map((p) => ({
    enabled: p.enabled !== false,
    clearance_height_cm: p.clearance_height_cm,
  }));
}
