import { log } from "../../utils/logger";
import { GRID_UNIT_CM, CATALOG_PRESETS } from "./warehouseTypes";
import type { BinState, RackLevel } from "./warehouseTypes";
import type {
  CatalogItem,
  CatalogPresetId,
  CustomRackTemplate,
  RackState,
  RackType,
  LevelConfigItem,
  NormalizedStorageType,
  StorageType,
  LayoutState,
  RowContainer,
  InternalLevel,
  EmptyRowSlot,
} from "../../types/warehouse";
import { buildBinTypeMapFromBins, normalizeBinTypeMap, normalizeStorageType } from "../../utils/storageTypes";
import { getLayoutMetersPerCell, layoutCmToCellsX, layoutCmToCellsY } from "../../utils/warehouseGridMetrics";

export function generateRackUuid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `rack-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Legacy-safe active check: missing flag is treated as active. */
export function isBinActive(bin: Pick<BinState, "is_active">): boolean {
  return bin.is_active !== false;
}

/** Prefer this helper whenever iterating rack bins in UI/reporting code. */
export function activeBinsForRack(rack: Pick<RackState, "bins">): BinState[] {
  return (rack.bins ?? []).filter(isBinActive);
}

/** Dimensions and optional color / naming / reserve for a catalog item (preset or custom template) */
export function getCatalogItemSpec(item: CatalogItem): {
  width_cm: number;
  depth_cm: number;
  height_cm: number;
  levels: number;
  bins_per_level: number;
  aisle_letter: string;
  color?: string;
  naming_pattern?: string;
  addressPattern?: string;
  rowId?: string;
  sectionStartIndex?: number;
  autoSectionNumbering?: boolean;
  binNamingType?: "numeric" | "alpha";
  bin_type_map?: Record<string, NormalizedStorageType>;
  levelConfig?: LevelConfigItem[];
  namingStrategy?: "pattern" | "rack-index" | "custom" | "manual";
  namingOrientation?: "column-first" | "row-first";
  namingPattern?: string;
  manualLabels?: Record<string, string>;
  overrides?: Record<string, string>;
  indexPadding?: number;
  startIndex?: number;
  level_max_load_kg?: number;
} {
  if (item.type === "preset") {
    const p = CATALOG_PRESETS.find((x) => x.id === item.id);
    if (!p) return { width_cm: 120, depth_cm: 80, height_cm: 200, levels: 4, bins_per_level: 4, aisle_letter: "A", color: "#3b82f6" };
    return {
      width_cm: p.width_cm,
      depth_cm: p.depth_cm,
      height_cm: p.height_cm,
      levels: p.levels,
      bins_per_level: p.bins_per_level,
      aisle_letter: p.aisle_letter,
      color: p.color,
    };
  }
  const t = item.template;
  return {
    width_cm: t.width_cm,
    depth_cm: t.depth_cm,
    height_cm: t.height_cm,
    levels: t.levels,
    bins_per_level: t.bins_per_level,
    aisle_letter: t.aisle_letter,
    color: t.color,
    naming_pattern: t.naming_pattern,
    addressPattern: t.addressPattern,
    rowId: t.rowId,
    sectionStartIndex: t.sectionStartIndex,
    autoSectionNumbering: t.autoSectionNumbering,
    binNamingType: t.binNamingType,
    bin_type_map: normalizeBinTypeMap(t.bin_type_map, t.reserve_bin_keys),
    levelConfig: t.levelConfig,
    namingStrategy: t.namingStrategy,
    namingOrientation: t.namingOrientation,
    namingPattern: t.namingPattern ?? t.addressPattern,
    manualLabels: t.manualLabels,
    overrides: t.overrides,
    indexPadding: t.indexPadding,
    startIndex: t.startIndex,
    level_max_load_kg: t.level_max_load_kg,
  };
}

/** Stable key for template picker: `preset:<id>` or `custom:<uuid>`. */
export function catalogItemTemplateKey(item: CatalogItem): string {
  return item.type === "preset" ? `preset:${item.id}` : `custom:${item.template.id}`;
}

/** Persisted `RowContainer.templateId` / rack linkage: preset id or custom template id. */
export function rowContainerTemplateIdFromCatalogItem(item: CatalogItem): string {
  return item.type === "preset" ? item.id : item.template.id;
}

export function catalogItemFromTemplateKey(key: string, customTemplates: CustomRackTemplate[]): CatalogItem | null {
  if (!key || typeof key !== "string") return null;
  if (key.startsWith("preset:")) {
    const id = key.slice(7) as CatalogPresetId;
    if (!CATALOG_PRESETS.some((p) => p.id === id)) return null;
    return { type: "preset", id };
  }
  if (key.startsWith("custom:")) {
    const id = key.slice(7);
    const t = customTemplates.find((x) => x.id === id);
    if (!t) return null;
    return { type: "custom", template: t };
  }
  return null;
}

/** Grid cells from cm (10cm = 1 cell) */
export function cmToCells(cm: number): number {
  return Math.round(cm / GRID_UNIT_CM);
}

/** Grid cells from meters (1 m = 100 cm, 10 cm = 1 cell → 1 m = 10 cells) */
export function metersToCells(m: number): number {
  return Math.floor((m * 100) / GRID_UNIT_CM);
}

/** Centimeters from grid cells (1 cell = GRID_UNIT_CM cm) */
export function cellsToCm(cells: number): number {
  return cells * GRID_UNIT_CM;
}

/** Meters from grid cells (1 cell = 10 cm → cells * 0.1 m) */
export function cellsToMeters(cells: number): number {
  return (cells * GRID_UNIT_CM) / 100;
}

/** When layout has building dimensions, return grid_cols/grid_rows clamped to building max. Otherwise return unchanged. Grid uses width + depth only; building_height_m does not affect grid. */
export function clampGridToBuilding<T extends { grid_cols: number; grid_rows: number; building_width_m?: number; building_depth_m?: number; building_height_m?: number }>(layout: T): T {
  const bw = layout.building_width_m;
  const depthM = layout.building_depth_m ?? layout.building_height_m;
  if (bw == null || depthM == null || bw <= 0 || depthM <= 0) return layout;
  const maxCols = metersToCells(bw);
  const maxRows = metersToCells(depthM);
  if (layout.grid_cols <= maxCols && layout.grid_rows <= maxRows) return layout;
  return { ...layout, grid_cols: Math.min(layout.grid_cols, maxCols), grid_rows: Math.min(layout.grid_rows, maxRows) };
}

/**
 * Generates a human-readable location address for a single position.
 * Format: Row-Rack-Level-Position e.g. A-01-02-03 (Row A, Rack 01, Level 02, Position 03).
 */
export function getPositionAddress(
  rowLabel: string,
  rackNum: number,
  levelNum: number,
  positionNum: number,
  padRack: number = 2,
  padLevel: number = 2,
  padPosition: number = 2
): string {
  const row = String(rowLabel).replace(/[^A-Za-z0-9]/g, "").trim() || "A";
  const r = String(rackNum).padStart(Math.max(1, padRack), "0");
  const l = String(levelNum).padStart(Math.max(1, padLevel), "0");
  const p = String(positionNum).padStart(Math.max(1, padPosition), "0");
  return `${row}-${r}-${l}-${p}`;
}

function segmentIndexToColumnLabel(segmentIndex: number): string {
  let n = Math.max(0, Math.floor(segmentIndex));
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out || "A";
}

/**
 * Canonical visible location code for UI: {rack}-{column}-{level}, e.g. A2-A-1.
 * UUID/location_id remain internal identifiers and are not modified.
 */
export function buildVisibleLocationCode(
  rackCode: string,
  levelIndex: number,
  segmentIndex: number
): string {
  const rack = (rackCode ?? "").trim() || "A1";
  const col = segmentIndexToColumnLabel(segmentIndex);
  const level = Math.max(1, Math.floor(levelIndex) + 1);
  return `${rack}-${col}-${level}`;
}

function distributedWidthsCm(totalWidthCm: number, slots: number): number[] {
  const safeSlots = Math.max(1, Math.floor(slots));
  const total = Math.max(1, Math.round(totalWidthCm));
  const base = Math.floor(total / safeSlots);
  let rem = total - base * safeSlots;
  const out = Array.from({ length: safeSlots }, () => base);
  for (let i = 0; i < out.length && rem > 0; i++, rem--) out[i] += 1;
  return out;
}

/** Row letter prefix only (A, AB, …). Strips digits and symbols; default "A". */
export function normalizeRowPrefixLetters(input: string): string {
  const letters = (input ?? "").replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return "A";
  return letters.slice(0, 4);
}

/** Next index in row for dynamic labeling (e.g. prefix "G" → 1, 2, 3…). */
export function getNextIndexInRow(racks: { rowPrefix?: string; indexInRow?: number }[], rowPrefix: string): number {
  const np = normalizeRowPrefixLetters(rowPrefix);
  const inRow = racks.filter((r) => normalizeRowPrefixLetters(r.rowPrefix ?? "A") === np);
  if (inRow.length === 0) return 1;
  const max = Math.max(...inRow.map((r) => r.indexInRow ?? 0));
  return max + 1;
}

/** Address pattern for row-based labels: rack label is Row (e.g. G1), bins get G1-1-1, G1-1-A, … */
export const ROW_LABEL_ADDRESS_PATTERN = "{Row}-{Level}-{Bin}";

/** Row container that holds this rack (by slot rackId), if any. */
export function findRowContainerForRack(layout: LayoutState | undefined | null, rack: RackState): RowContainer | null {
  /** Slots may store `rack_index`, numeric `id`, or rack `uuid` string — match any. */
  const keys = new Set<string>();
  if (rack.id != null && String(rack.id) !== "") keys.add(String(rack.id));
  if (rack.rack_index != null) keys.add(String(rack.rack_index));
  if (rack.uuid != null && String(rack.uuid) !== "") keys.add(String(rack.uuid));
  if (keys.size === 0) return null;
  for (const rc of layout?.row_containers ?? []) {
    if (rc.slots.some((s) => s.rackId != null && keys.has(String(s.rackId)))) return rc;
  }
  return null;
}

/**
 * Rack for `InternalLayoutModal` when `internalLayoutRackId` comes from `setInternalLayoutRackId`.
 * Match `id`, `rack_index`, or `uuid` (same identifiers as row slot `rackId`).
 */
/** Row slot `rackId` may be rack `uuid`, DB `id`, or `rack_index` (legacy). */
export function rackMatchesSlotRackId(
  rack: RackState,
  rackId: string | number | undefined | null
): boolean {
  if (rackId == null) return false;
  const s = String(rackId);
  if (rack.uuid != null && String(rack.uuid) !== "" && String(rack.uuid) === s) return true;
  return String(rack.id ?? rack.rack_index) === s;
}

/** Stable identity key for React keys, maps, and integrity checks (never array index). */
export function rackEntityKey(rack: RackState): string {
  if (rack.uuid != null && String(rack.uuid).trim() !== "") return `uuid:${rack.uuid}`;
  if (rack.id != null) return `id:${rack.id}`;
  return `idx:${rack.rack_index}`;
}

/** Next monotonic rack_index — avoids reusing indices after deletes. */
export function getNextRackIndex(racks: RackState[]): number {
  let max = 0;
  for (const r of racks) {
    const candidates = [r.rack_index, r.id];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}

/** Deep-clone a rack for immutable layout updates. */
export function cloneRackState(rack: RackState): RackState {
  if (typeof structuredClone === "function") {
    return structuredClone(rack);
  }
  return JSON.parse(JSON.stringify(rack)) as RackState;
}

export type LayoutEntityIntegrityResult = { valid: boolean; errors: string[] };

/** Pre-save integrity: duplicate ids/names, missing rack_type, invalid coordinates. */
export function validateLayoutEntityIntegrity(layout: LayoutState): LayoutEntityIntegrityResult {
  const errors: string[] = [];
  const uuids = new Set<string>();
  const names = new Map<string, string>();
  const rackIndexes = new Map<number, string>();

  for (const r of layout.racks) {
    const key = rackEntityKey(r);
    const uuid = (r.uuid ?? "").trim();
    if (!uuid) {
      errors.push(`Brak uuid regału (${key})`);
    } else if (uuids.has(uuid)) {
      errors.push(`Zduplikowany uuid regału: ${uuid}`);
    } else {
      uuids.add(uuid);
    }

    const rt = r.rack_type;
    if (rt !== "warehouse" && rt !== "store") {
      errors.push(`Nieprawidłowy rack_type dla ${key}: ${String(rt)}`);
    }

    const name = (r.name ?? "").trim();
    if (name) {
      const nk = name.toLowerCase();
      const prev = names.get(nk);
      if (prev) errors.push(`Zduplikowana nazwa regału '${name}' (${prev} i ${key})`);
      else names.set(nk, key);
    }

    const idx = Number(r.rack_index);
    if (Number.isFinite(idx)) {
      const prevIdx = rackIndexes.get(idx);
      if (prevIdx && prevIdx !== key) errors.push(`Zduplikowany rack_index ${idx} (${prevIdx} i ${key})`);
      else rackIndexes.set(idx, key);
    }

    if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.width) || !Number.isFinite(r.height)) {
      errors.push(`Nieprawidłowe współrzędne regału ${key}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function findRackForInternalLayoutModal(
  layout: LayoutState | undefined | null,
  internalLayoutRackId: number | string
): RackState | undefined {
  const racks = layout?.racks;
  if (!racks?.length) return undefined;
  return racks.find((r) => rackMatchesSlotRackId(r, internalLayoutRackId));
}

/** Resolve rack numbering direction; legacy `direction` applies when `rack_direction` is unset. */
export function resolveRowContainerRackDirection(rc: RowContainer): "LTR" | "RTL" {
  if (rc.rack_direction === "RTL" || rc.rack_direction === "LTR") return rc.rack_direction;
  if (rc.direction === "RTL" || rc.direction === "LTR") return rc.direction;
  return "LTR";
}

/** Resolve bin/location numbering direction; legacy `direction` applies when `bin_direction` is unset. */
export function resolveRowContainerBinDirection(rc: RowContainer): "LTR" | "RTL" {
  if (rc.bin_direction === "RTL" || rc.bin_direction === "LTR") return rc.bin_direction;
  if (rc.direction === "RTL" || rc.direction === "LTR") return rc.direction;
  return "LTR";
}

/** Rack index order along the row (for `getRackDisplayId`). Defaults to LTR when not in a row container. */
export function getRackDirectionForRack(rack: RackState, layout?: LayoutState | null): "LTR" | "RTL" {
  const rc = layout ? findRowContainerForRack(layout, rack) : null;
  return rc ? resolveRowContainerRackDirection(rc) : "LTR";
}

/** Bin column order for display (for `getBinDisplayLabel`). Independent of rack numbering. */
export function getBinDirectionForRack(rack: RackState, layout?: LayoutState | null): "LTR" | "RTL" {
  const rc = layout ? findRowContainerForRack(layout, rack) : null;
  return rc ? resolveRowContainerBinDirection(rc) : "LTR";
}

/** `true` when bin columns render right-to-left (same as `findRowContainerForRack` + `resolveRowContainerBinDirection` === RTL). */
export function isBinDirectionRtl(layout: LayoutState | null | undefined, rack: RackState): boolean {
  return getBinDirectionForRack(rack, layout) === "RTL";
}

/**
 * Visual slot index `vis` (0 = left) → logical `segment_index` for `getBinAt` / keys.
 * Use with `Array.from({ length: locs }, (_, vis) => …)`; matches RackSideViewGrid / internal layout modals.
 */
export function segmentIndexForVisualSlot(vis: number, locs: number, binDirectionRtl: boolean): number {
  if (locs <= 0) return 0;
  return binDirectionRtl ? locs - 1 - vis : vis;
}

/**
 * `internal_structure.levels[].locations` must be indexed by segment_index (0 = column A, …).
 * If legacy data stored widths in visual left→right order (so RTL rows matched screen order), array index
 * no longer equals segment — infer from bin widths and permute back to canonical. (See also `binsToLevels`, which keeps segment order.)
 */
function inferLocationsArrayOrderForLevel(
  lev: InternalLevel,
  levIdx: number,
  bins: BinState[],
  binDirectionRtl: boolean
): "canonical" | "visual" {
  const locs = lev.locations.length;
  if (locs <= 1) return "canonical";
  const binsForLevel = bins
    .filter((b) => b.level_index === levIdx)
    .sort((a, b) => a.segment_index - b.segment_index);
  if (binsForLevel.length < locs) return "canonical";

  let canon = 0;
  let visual = 0;
  for (let i = 0; i < locs; i++) {
    const wLoc = lev.locations[i]?.width_cm;
    if (wLoc == null || !Number.isFinite(wLoc)) continue;
    const binSeg = binsForLevel.find((b) => b.segment_index === i);
    const segAtVisI = segmentIndexForVisualSlot(i, locs, binDirectionRtl);
    const binVis = binsForLevel.find((b) => b.segment_index === segAtVisI);
    const wSeg = binSeg?.width_cm;
    const wVis = binVis?.width_cm;
    if (wSeg != null && Math.abs(wLoc - wSeg) < 0.01) canon++;
    if (wVis != null && Math.abs(wLoc - wVis) < 0.01) visual++;
  }
  return visual > canon ? "visual" : "canonical";
}

export function normalizeInternalLevelsToCanonicalSegmentOrder(
  levels: InternalLevel[],
  rack: RackState,
  binDirectionRtl: boolean
): InternalLevel[] {
  const bins = rack.bins ?? [];
  return levels.map((lev, levIdx) => {
    const locs = lev.locations.length;
    if (locs <= 1) return lev;
    if (inferLocationsArrayOrderForLevel(lev, levIdx, bins, binDirectionRtl) === "canonical") return lev;
    const nextLocs = Array.from({ length: locs }, (_, seg) => {
      const vis = segmentIndexForVisualSlot(seg, locs, binDirectionRtl);
      return lev.locations[vis]!;
    });
    return { ...lev, locations: nextLocs };
  });
}

/** Persistent display label from DB (rack.name or rack.label). Use this so map and details always match after save.
 * When `layout` is passed and the rack sits in a `row_container`, rack index follows slot order and `rack_direction`. */
export function getRackDisplayId(
  r: {
    name?: string;
    label?: string;
    rowPrefix?: string;
    indexInRow?: number;
    aisle_letter?: string;
    rack_index?: number;
    id?: number | string;
  },
  layout?: LayoutState
): string {
  const rack = r as RackState;
  if (layout?.row_containers?.length) {
    const rc = findRowContainerForRack(layout, rack);
    if (rc?.slots?.length) {
      const filled = rc.slots
        .filter((s) => s.rackId != null)
        .sort((a, b) => ((rc.orientation ?? "horizontal") === "horizontal" ? a.x - b.x : a.y - b.y));
      const rid = rack.id ?? rack.rack_index;
      const i = filled.findIndex((s) => String(s.rackId) === String(rid));
      if (i >= 0 && filled.length > 0) {
        const dir = resolveRowContainerRackDirection(rc);
        const n = filled.length;
        const num = dir === "RTL" ? n - i : i + 1;
        const rawPrefix = String(rc.rowPrefix ?? rack.rowPrefix ?? rack.aisle_letter ?? "A").trim() || "A";
        const letter = (rawPrefix.match(/[A-Za-z0-9]/)?.[0] ?? "A").toUpperCase();
        return `${letter}${num}`;
      }
    }
  }
  const persistent = typeof (r as { name?: string }).name === "string" && (r as { name: string }).name.trim() !== ""
    ? (r as { name: string }).name.trim()
    : typeof (r as { label?: string }).label === "string" && (r as { label: string }).label.trim() !== ""
      ? (r as { label: string }).label.trim()
      : "";
  if (persistent) return persistent;
  const raw = String(r.rowPrefix ?? r.aisle_letter ?? "A").replace(/[^A-Za-z0-9]/g, "").trim();
  const letter = (raw.match(/[A-Za-z]/)?.[0] ?? "A").toUpperCase();
  const num = Math.floor(Number(r.indexInRow ?? r.rack_index ?? 1)) || 1;
  return `${letter}${num}`;
}

/** Name as persisted / shown on map: custom `name` or generated label. */
export function effectiveRackDisplayName(rack: RackState, layout: LayoutState): string {
  const n = (rack.name ?? "").trim();
  if (n) return n;
  return getRackDisplayId(rack, layout);
}

/** Next letter prefix for paired row (e.g. B → C, Z → AA). Uppercase, max 4 letters. */
export function nextRowPrefixLetters(input: string): string {
  const raw = normalizeRowPrefixLetters(input).toUpperCase();
  if (!raw) return "B";
  const A = 65;
  const digits = raw.split("").map((c) => c.charCodeAt(0) - A);
  let carry = 1;
  for (let i = digits.length - 1; i >= 0 && carry; i--) {
    digits[i] = (digits[i] ?? 0) + carry;
    carry = 0;
    if ((digits[i] ?? 0) > 25) {
      digits[i] = 0;
      carry = 1;
    }
  }
  if (carry) digits.unshift(0);
  const out = String.fromCharCode(...digits.map((d) => A + Math.max(0, Math.min(25, d))));
  return out.slice(0, 4);
}

/** Offset (cells) between facing row centers: rack depth along aisle + row gap. */
export function pairedAisleOffsetCells(
  depthCm: number,
  rowGapCm: number,
  layout?: Pick<LayoutState, "grid_cols" | "grid_rows" | "building_width_m" | "building_depth_m" | "building_height_m">,
  /** Axis perpendicular to the row where the aisle stacks (horizontal row → Y, vertical row → X). */
  perpendicularAxis: "x" | "y" = "y"
): number {
  if (layout && getLayoutMetersPerCell(layout)) {
    const depthCells =
      perpendicularAxis === "x" ? layoutCmToCellsX(layout, depthCm) : layoutCmToCellsY(layout, depthCm);
    const gapCells =
      perpendicularAxis === "x" ? layoutCmToCellsX(layout, rowGapCm) : layoutCmToCellsY(layout, rowGapCm);
    return Math.max(1, depthCells) + Math.max(0, gapCells);
  }
  const depth = Math.max(1, cmToCells(depthCm));
  const gap = Math.max(0, cmToCells(rowGapCm));
  return depth + gap;
}

/** Min/max on both axes, non-negative extents, row axis from extent comparison (no Math.abs on deltas). */
export function rowDrawSegmentExtents(start: { x: number; y: number }, end: { x: number; y: number }) {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const extentX = maxX - minX;
  const extentY = maxY - minY;
  const isHorizontal = extentX >= extentY;
  return { minX, maxX, minY, maxY, extentX, extentY, isHorizontal };
}

/**
 * Rack start cells along one axis from mousedown (`startAlong`) toward the cursor (`cursorAlong`), stepping by `step`.
 * Direction follows the drag (left↔right or up↔down). Cursor is the sole end bound — no span/count formula.
 */
export function rowDrawRackPositionsAlongCursor(
  startAlong: number,
  cursorAlong: number,
  step: number
): number[] {
  if (step <= 0) return [];
  if (startAlong === cursorAlong) return [startAlong];
  const positions: number[] = [];
  const dir = cursorAlong >= startAlong ? 1 : -1;
  let x = startAlong;
  while (true) {
    if ((dir === 1 && x > cursorAlong) || (dir === -1 && x < cursorAlong)) break;
    positions.push(x);
    x += step * dir;
  }
  return positions;
}

/** Shift drag endpoints for the second facing row (horizontal → +Y, vertical → +X). */
export function shiftRowDrawForPairedRow(
  start: { x: number; y: number },
  end: { x: number; y: number },
  offsetCells: number,
  isHorizontal: boolean
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  if (offsetCells <= 0) return { start: { ...start }, end: { ...end } };
  if (isHorizontal) {
    return {
      start: { x: start.x, y: start.y + offsetCells },
      end: { x: end.x, y: end.y + offsetCells },
    };
  }
  return {
    start: { x: start.x + offsetCells, y: start.y },
    end: { x: end.x + offsetCells, y: end.y },
  };
}

/** Matches `placeEmptyRow` slot count (DEFAULT_ROW_SLOT_W / H from designer). */
export function countEmptyRowSlotsInDraw(
  layout: LayoutState,
  start: { x: number; y: number },
  end: { x: number; y: number },
  rowGapCm: number
): number {
  const gridCols = layout.grid_cols;
  const gridRows = layout.grid_rows;
  const { isHorizontal } = rowDrawSegmentExtents(start, end);
  const gapCells = Math.max(0, isHorizontal ? layoutCmToCellsX(layout, rowGapCm) : layoutCmToCellsY(layout, rowGapCm));
  const slotW = 12;
  const slotH = 8;
  const sw = isHorizontal ? slotW : slotH;
  const sh = isHorizontal ? slotH : slotW;
  const step = (isHorizontal ? sw : sh) + gapCells;
  let along = rowDrawRackPositionsAlongCursor(
    isHorizontal ? start.x : start.y,
    isHorizontal ? end.x : end.y,
    step
  );
  along = along.filter((c) =>
    isHorizontal ? c >= 0 && c + sw <= gridCols : c >= 0 && c + sh <= gridRows
  );
  return along.length;
}

/** Planned rack labels for a row: `${prefix}${1..count}` (prefix already normalized). */
export function generateRackNames(prefix: string, count: number): string[] {
  const p = normalizeRowPrefixLetters(prefix);
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => `${p}${i + 1}`);
}

export type GeneratedRackNamesValidation = { valid: boolean; duplicates: string[] };

/**
 * Ensures no generated name collides with existing racks (case-insensitive) or repeats within `names`.
 */
export function validateGeneratedRackNames(names: string[], layout: LayoutState): GeneratedRackNamesValidation {
  const existing = new Set(layout.racks.map((r) => effectiveRackDisplayName(r, layout).toLowerCase()));
  const batchSeen = new Set<string>();
  const duplicates: string[] = [];
  for (const raw of names) {
    const n = raw.trim();
    const key = n.toLowerCase();
    if (existing.has(key) || batchSeen.has(key)) {
      duplicates.push(n);
    }
    batchSeen.add(key);
  }
  const uniq = [...new Set(duplicates)];
  return { valid: uniq.length === 0, duplicates: uniq };
}

/** Same as DEFAULT_ROW_SLOT_H in DesignerRackPlacement (draw row height / vertical row width). */
const PLACE_ROW_PH = 8;

/**
 * How many racks `placeRowWithTemplate` will create for this drag (geometry only; matches implementation).
 */
export function countPlaceRowWithTemplateRacks(
  layout: LayoutState,
  start: { x: number; y: number },
  end: { x: number; y: number },
  item: CatalogItem,
  rowGapCm: number
): number {
  const gridCols = layout.grid_cols;
  const gridRows = layout.grid_rows;
  const spec = getCatalogItemSpec(item);
  const cellW = layoutCmToCellsX(layout, spec.width_cm);
  const cellH = layoutCmToCellsY(layout, spec.depth_cm);
  const { minY, extentY, isHorizontal } = rowDrawSegmentExtents(start, end);
  if (isHorizontal) {
    const gapCellsX = Math.max(0, layoutCmToCellsX(layout, rowGapCm));
    const stepW = cellW + gapCellsX;
    let along = rowDrawRackPositionsAlongCursor(start.x, end.x, stepW);
    along = along.filter((c) => c >= 0 && c + cellW <= gridCols);
    return along.length;
  }
  const x0 = start.x;
  const y0 = minY;
  const extentAlong = Math.max(1, extentY);
  const clampedX = Math.max(0, Math.min(gridCols - 1, x0));
  const clampedY = Math.max(0, Math.min(gridRows - extentAlong, y0));
  const w = PLACE_ROW_PH;
  const h = Math.min(extentAlong, gridRows - clampedY);
  const slotFits = (s: EmptyRowSlot) => s.w >= cellH && s.h >= cellW;
  const remainderSlot = (s: EmptyRowSlot, startY: number): EmptyRowSlot =>
    ({ x: 0, y: startY, w: s.w, h: s.h - cellW });
  const startY = clampedY;
  let count = 0;
  const initialSlots: EmptyRowSlot[] = [{ x: clampedX, y: clampedY, w, h }];
  const newSlotsRaw: EmptyRowSlot[] = [];
  const toProcess = [...initialSlots];
  while (toProcess.length > 0) {
    const s = toProcess.shift()!;
    if (s.rackId != null) {
      newSlotsRaw.push(s);
      continue;
    }
    if (!slotFits(s)) {
      newSlotsRaw.push(s);
      continue;
    }
    newSlotsRaw.push({
      x: 0,
      y: startY,
      w: cellH,
      h: cellW,
      rackId: 1,
    });
    count += 1;
    if (s.h > cellW) {
      toProcess.unshift(remainderSlot(s, startY));
    }
  }
  const minSlotAlongRow = cellW;
  while (
    newSlotsRaw.length > 0 &&
    newSlotsRaw[newSlotsRaw.length - 1]?.rackId == null &&
    (newSlotsRaw[newSlotsRaw.length - 1]?.h ?? 0) < minSlotAlongRow
  ) {
    newSlotsRaw.pop();
  }
  return count;
}

export type RackNameValidationResult = { valid: boolean; error?: string };

/**
 * Single source of truth for rack label uniqueness (case-insensitive trim).
 * Pass `currentRackId` when editing so the current rack is ignored.
 */
export function validateRackName(
  name: string | undefined | null,
  layout: LayoutState,
  currentRackId?: { id?: number | string; rack_index?: number; uuid?: string | null }
): RackNameValidationResult {
  const trimmed = (name ?? "").trim();
  const current = currentRackId
    ? layout.racks.find(
        (r) =>
          (currentRackId.uuid != null && r.uuid != null && String(r.uuid) === String(currentRackId.uuid)) ||
          String(r.id ?? r.rack_index) === String(currentRackId.id ?? currentRackId.rack_index)
      )
    : undefined;

  const candidateKey = trimmed
    ? trimmed.toLowerCase()
    : current
      ? effectiveRackDisplayName({ ...current, name: undefined }, layout).toLowerCase()
      : "";

  if (candidateKey === "") {
    return { valid: true as const };
  }

  for (const r of layout.racks) {
    if (currentRackId) {
      if (currentRackId.uuid != null && r.uuid != null && String(r.uuid) === String(currentRackId.uuid)) continue;
      if (String(r.id ?? r.rack_index) === String(currentRackId.id ?? currentRackId.rack_index)) continue;
    }
    const otherKey = effectiveRackDisplayName(r, layout).toLowerCase();
    if (otherKey === candidateKey) {
      const display = trimmed || (current ? effectiveRackDisplayName({ ...current, name: undefined }, layout) : "?");
      const result = {
        valid: false as const,
        error: `Regał o nazwie '${display}' już istnieje`,
      };
      log("VALIDATION", name, result);
      return result;
    }
  }
  return { valid: true as const };
}

/**
 * Validates every rack's effective name against all others using `validateRackName` only.
 * Deduplicates identical error messages.
 */
export function validateAllRackNamesInLayout(layout: LayoutState): { valid: boolean; errors: string[] } {
  const errSet = new Set<string>();
  for (const r of layout.racks) {
    const eff = effectiveRackDisplayName(r, layout);
    const id = { id: r.id, rack_index: r.rack_index, uuid: r.uuid };
    const res = validateRackName(eff, layout, id);
    if (!res.valid && res.error) errSet.add(res.error);
  }
  const errors = [...errSet];
  return { valid: errors.length === 0, errors };
}

/**
 * Base rack label (before nextUniqueRackName) when stamping from catalog after choosing a row prefix,
 * matching `stampRackFromCatalogItem` (snap-to-row overrides prefix when snapping).
 */
export function getProposedFirstRackLabelForStampFromCatalog(
  layout: LayoutState,
  cell: { x: number; y: number },
  item: CatalogItem,
  modalRowPrefix: string
): string {
  const spec = getCatalogItemSpec(item);
  const w = cmToCells(spec.width_cm);
  const h = cmToCells(spec.depth_cm);
  const snap = findSnapToRowPosition(layout.racks, cell.x, cell.y, w, h);
  const prefix = snap ? normalizeRowPrefixLetters(snap.rowPrefix) : normalizeRowPrefixLetters(modalRowPrefix);
  const indexInRow = snap ? snap.indexInRow : getNextIndexInRow(layout.racks, prefix);
  return `${prefix}${indexInRow}`;
}

/** Ensures `baseName` does not collide with any existing rack's effective name (adds " (2)", " (3)", …). */
export function nextUniqueRackName(baseName: string, layout: LayoutState): string {
  const base = baseName.trim();
  if (!base) return baseName;
  let candidate = base;
  let n = 1;
  while (!validateRackName(candidate, layout).valid) {
    n += 1;
    candidate = `${base} (${n})`;
  }
  return candidate;
}

/** Renames generated racks so each has a unique `name` against existing layout racks (and within the batch). */
export function assignUniqueRackNamesToNewRacks(newRacks: RackState[], existingLayout: LayoutState): RackState[] {
  const acc: RackState[] = [...existingLayout.racks];
  const out: RackState[] = [];
  for (const r of newRacks) {
    const partial: LayoutState = { ...existingLayout, racks: acc };
    const base = (r.name ?? "").trim() || getRackDisplayId(r, partial);
    const unique = nextUniqueRackName(base, partial);
    const next = { ...r, name: unique };
    acc.push(next);
    out.push(next);
  }
  return out;
}

/** Minimum size (px) to show label. Below this, hide the label. */
const MIN_RACK_PX_FOR_LABEL = 10;

/** Returns true if the rack rect is large enough to show a label without overflow. */
export function canShowRackLabel(rectWidthPx: number, rectHeightPx: number): boolean {
  return Math.min(rectWidthPx, rectHeightPx) >= MIN_RACK_PX_FOR_LABEL;
}

/** Approximate character width as fraction of font size (for fit math). */
const CHAR_WIDTH_RATIO = 0.55;
/** Line height ratio. */
const LINE_HEIGHT_RATIO = 1.2;

/**
 * Rack label style: font size scales down so the FULL label fits inside the rack.
 * No truncation or ellipsis – full text (e.g. A10, A100, A1000) is always shown.
 * @param rectWidth - width of rack (px or viewBox units)
 * @param rectHeight - height of rack (px or viewBox units)
 * @param label - full label text (never truncated)
 * @param inViewBoxUnits - if true, fontSize is in viewBox units (for SVG viewBox maps); else px
 */
export function getRackLabelStyle(
  rectWidth: number,
  rectHeight: number,
  label: string,
  inViewBoxUnits: boolean = false
): { displayText: string; fontSize: number } {
  const len = Math.max(1, label.length);
  const minSize = inViewBoxUnits ? 0.3 : 5;
  const maxSize = inViewBoxUnits ? 1.8 : 10;
  const byWidth = rectWidth / (len * CHAR_WIDTH_RATIO);
  const byHeight = rectHeight / LINE_HEIGHT_RATIO;
  let fontSize = Math.min(maxSize, byWidth, byHeight);
  fontSize = Math.max(minSize, fontSize);
  return { displayText: label, fontSize };
}

/** Map label: full text + responsive font (px). No truncation. */
export function formatRackLabelForMap(
  label: string,
  rectWidth: number,
  rectHeight: number,
  _fontSizePx?: number
): { displayText: string; fontSizePx: number } {
  const { displayText, fontSize } = getRackLabelStyle(rectWidth, rectHeight, label, false);
  return { displayText, fontSizePx: fontSize };
}

const SNAP_ROW_TOLERANCE = 3;

type RackRect = { x: number; y: number; width: number; height: number; rowPrefix?: string; indexInRow?: number };

/**
 * Find snap-to-row position: when dropping/dragging a rack near an existing row, snap to the row end (gapless).
 * Returns { x, y, rowPrefix, indexInRow } or null. Template-agnostic; letter from row's prefix, number = next in row.
 */
export function findSnapToRowPosition(
  racks: RackRect[],
  dropX: number,
  dropY: number,
  w: number,
  h: number,
  excludeRackId?: number | string
): { x: number; y: number; rowPrefix: string; indexInRow: number } | null {
  const exclude = excludeRackId != null ? String(excludeRackId) : undefined;
  const other = racks.filter((r) => {
    if (exclude == null) return true;
    const id = (r as RackRect & { id?: number; rack_index?: number }).id ?? (r as RackRect & { rack_index?: number }).rack_index;
    return String(id ?? "") !== exclude;
  });

  let best: { x: number; y: number; rowPrefix: string; indexInRow: number } | null = null;
  let bestDist = Infinity;

  const byY = new Map<number, RackRect[]>();
  other.forEach((r) => {
    const y = r.y;
    if (!byY.has(y)) byY.set(y, []);
    byY.get(y)!.push(r);
  });
  byY.forEach((rowRacks, rowY) => {
    const sorted = [...rowRacks].sort((a, b) => a.x - b.x);
    const rowEndX = Math.max(...sorted.map((r) => r.x + r.width));
    const rowStartX = Math.min(...sorted.map((r) => r.x));
    const rowPrefix = sorted[0]?.rowPrefix ?? "A";
    const maxIndex = Math.max(...sorted.map((r) => r.indexInRow ?? 0), 0);
    if (Math.abs(dropY - rowY) <= SNAP_ROW_TOLERANCE) {
      const snapEnd = { x: rowEndX, y: rowY };
      const distEnd = (dropX - snapEnd.x) ** 2 + (dropY - snapEnd.y) ** 2;
      if (distEnd < bestDist && rowEndX + w <= 9999) {
        bestDist = distEnd;
        best = { x: rowEndX, y: rowY, rowPrefix, indexInRow: maxIndex + 1 };
      }
      const snapStart = { x: rowStartX - w, y: rowY };
      if (rowStartX - w >= 0) {
        const distStart = (dropX - snapStart.x) ** 2 + (dropY - snapStart.y) ** 2;
        if (distStart < bestDist) {
          bestDist = distStart;
          best = { x: rowStartX - w, y: rowY, rowPrefix, indexInRow: 1 };
        }
      }
      for (let i = 0; i < sorted.length - 1; i++) {
        const r1 = sorted[i]!;
        const r2 = sorted[i + 1]!;
        const gapStart = r1.x + r1.width;
        const gapEnd = r2.x;
        if (gapEnd - gapStart >= w) {
          const snapGap = { x: gapStart, y: rowY };
          const distGap = (dropX - snapGap.x) ** 2 + (dropY - snapGap.y) ** 2;
          if (distGap < bestDist) {
            bestDist = distGap;
            const indexInRow = (r1.indexInRow ?? i + 1) + 1;
            best = { x: gapStart, y: rowY, rowPrefix, indexInRow };
          }
        }
      }
    }
  });

  const byX = new Map<number, RackRect[]>();
  other.forEach((r) => {
    const x = r.x;
    if (!byX.has(x)) byX.set(x, []);
    byX.get(x)!.push(r);
  });
  byX.forEach((rowRacks, rowX) => {
    const sorted = [...rowRacks].sort((a, b) => a.y - b.y);
    const rowEndY = Math.max(...sorted.map((r) => r.y + r.height));
    const rowStartY = Math.min(...sorted.map((r) => r.y));
    const rowPrefix = sorted[0]?.rowPrefix ?? "A";
    const maxIndex = Math.max(...sorted.map((r) => r.indexInRow ?? 0), 0);
    if (Math.abs(dropX - rowX) <= SNAP_ROW_TOLERANCE) {
      const snapEnd = { x: rowX, y: rowEndY };
      const distEnd = (dropX - snapEnd.x) ** 2 + (dropY - snapEnd.y) ** 2;
      if (distEnd < bestDist && rowEndY + h <= 9999) {
        bestDist = distEnd;
        best = { x: rowX, y: rowEndY, rowPrefix, indexInRow: maxIndex + 1 };
      }
      const snapStart = { x: rowX, y: rowStartY - h };
      if (rowStartY - h >= 0) {
        const distStart = (dropX - snapStart.x) ** 2 + (dropY - snapStart.y) ** 2;
        if (distStart < bestDist) {
          bestDist = distStart;
          best = { x: rowX, y: rowStartY - h, rowPrefix, indexInRow: 1 };
        }
      }
      for (let i = 0; i < sorted.length - 1; i++) {
        const r1 = sorted[i]!;
        const r2 = sorted[i + 1]!;
        const gapStart = r1.y + r1.height;
        const gapEnd = r2.y;
        if (gapEnd - gapStart >= h) {
          const snapGap = { x: rowX, y: gapStart };
          const distGap = (dropX - snapGap.x) ** 2 + (dropY - snapGap.y) ** 2;
          if (distGap < bestDist) {
            bestDist = distGap;
            const indexInRow = (r1.indexInRow ?? i + 1) + 1;
            best = { x: rowX, y: gapStart, rowPrefix, indexInRow };
          }
        }
      }
    }
  });

  return best;
}

export type SlotRect = { x: number; y: number; width: number; height: number };

/**
 * For drag feedback: valid drop slots (green) and occupied/invalid slots (red) in the row nearest to (dropX, dropY).
 * Uses the same row grouping as findSnapToRowPosition (excluding the dragged rack).
 */
export function getDragSlotHighlights(
  racks: RackRect[],
  dropX: number,
  dropY: number,
  w: number,
  h: number,
  excludeRackId?: number | string
): { validSlots: SlotRect[]; invalidSlots: SlotRect[] } {
  const validSlots: SlotRect[] = [];
  const invalidSlots: SlotRect[] = [];
  const exclude = excludeRackId != null ? String(excludeRackId) : undefined;
  const other = racks.filter((r) => {
    if (exclude == null) return true;
    const id = (r as RackRect & { id?: number; rack_index?: number }).id ?? (r as RackRect & { rack_index?: number }).rack_index;
    return String(id ?? "") !== exclude;
  });

  const byY = new Map<number, RackRect[]>();
  const byX = new Map<number, RackRect[]>();
  other.forEach((r) => {
    if (!byY.has(r.y)) byY.set(r.y, []);
    byY.get(r.y)!.push(r);
    if (!byX.has(r.x)) byX.set(r.x, []);
    byX.get(r.x)!.push(r);
  });

  let bestDistH = Infinity;
  let bestY: number | null = null;
  byY.forEach((_, rowY) => {
    const d = Math.abs(dropY - rowY);
    if (d <= SNAP_ROW_TOLERANCE && d < bestDistH) {
      bestDistH = d;
      bestY = rowY;
    }
  });
  let bestDistV = Infinity;
  let bestX: number | null = null;
  byX.forEach((_, rowX) => {
    const d = Math.abs(dropX - rowX);
    if (d <= SNAP_ROW_TOLERANCE && d < bestDistV) {
      bestDistV = d;
      bestX = rowX;
    }
  });

  if (bestY != null && (bestX == null || bestDistH <= bestDistV)) {
    const rowRacks = byY.get(bestY)!;
    const sorted = [...rowRacks].sort((a, b) => a.x - b.x);
    const rowEndX = Math.max(...sorted.map((r) => r.x + r.width));
    const rowStartX = Math.min(...sorted.map((r) => r.x));
    invalidSlots.push(...sorted.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })));
    if (rowStartX - w >= 0) validSlots.push({ x: rowStartX - w, y: bestY, width: w, height: h });
    if (rowEndX + w <= 9999) validSlots.push({ x: rowEndX, y: bestY, width: w, height: h });
    for (let i = 0; i < sorted.length - 1; i++) {
      const r1 = sorted[i]!;
      const r2 = sorted[i + 1]!;
      const gapStart = r1.x + r1.width;
      const gapEnd = r2.x;
      if (gapEnd - gapStart >= w) validSlots.push({ x: gapStart, y: bestY, width: w, height: h });
    }
    return { validSlots, invalidSlots };
  }
  if (bestX != null) {
    const rowRacks = byX.get(bestX)!;
    const sorted = [...rowRacks].sort((a, b) => a.y - b.y);
    const rowEndY = Math.max(...sorted.map((r) => r.y + r.height));
    const rowStartY = Math.min(...sorted.map((r) => r.y));
    invalidSlots.push(...sorted.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })));
    if (rowStartY - h >= 0) validSlots.push({ x: bestX, y: rowStartY - h, width: w, height: h });
    if (rowEndY + h <= 9999) validSlots.push({ x: bestX, y: rowEndY, width: w, height: h });
    for (let i = 0; i < sorted.length - 1; i++) {
      const r1 = sorted[i]!;
      const r2 = sorted[i + 1]!;
      const gapStart = r1.y + r1.height;
      const gapEnd = r2.y;
      if (gapEnd - gapStart >= h) validSlots.push({ x: bestX, y: gapStart, width: w, height: h });
    }
    return { validSlots, invalidSlots };
  }
  return { validSlots, invalidSlots };
}

/** Unified layout resolver for rack/template consumers. */
export function getRackLayout(r: {
  layoutVariant?: { levels?: LevelConfigItem[] | null } | null;
  levelConfig?: LevelConfigItem[];
  levels?: number;
  bins_per_level?: number;
}): { levels: LevelConfigItem[]; levelsCount: number; binsPerLevel: number } {
  if (Array.isArray(r.layoutVariant?.levels) && r.layoutVariant.levels.length > 0) {
    const lv = r.layoutVariant.levels.map((row, i) => ({ level: Number(row.level ?? i + 1), locations: Math.max(1, Number(row.locations ?? 1)) }));
    return { levels: lv, levelsCount: lv.length, binsPerLevel: lv[0]?.locations ?? 1 };
  }
  if (Array.isArray(r.levelConfig) && r.levelConfig.length > 0) {
    const lv = r.levelConfig.map((row, i) => ({ level: Number(row.level ?? i + 1), locations: Math.max(1, Number(row.locations ?? 1)) }));
    return { levels: lv, levelsCount: lv.length, binsPerLevel: lv[0]?.locations ?? 1 };
  }
  const L = Math.max(1, Number(r.levels ?? 4));
  const B = Math.max(1, Number(r.bins_per_level ?? 4));
  const levels = Array.from({ length: L }, (_, i) => ({ level: i + 1, locations: B }));
  return { levels, levelsCount: L, binsPerLevel: B };
}

/** Normalize rack/template to level config array. Uses layoutVariant/levelConfig when present, else builds from levels + bins_per_level. */
export function getLevelConfig(r: { layoutVariant?: { levels?: LevelConfigItem[] | null } | null; levelConfig?: LevelConfigItem[]; levels?: number; bins_per_level?: number }): LevelConfigItem[] {
  const resolved = getRackLayout(r);
  if (resolved.levels.length > 0) return resolved.levels;
  const L = Math.max(1, Number(r.levels ?? 4));
  const B = Math.max(1, Number(r.bins_per_level ?? 4));
  return Array.from({ length: L }, (_, i) => ({ level: i + 1, locations: B }));
}

/** Total storage locations from level config. */
export function getTotalLocations(config: LevelConfigItem[]): number {
  return config.reduce((sum, row) => sum + Math.max(0, row.locations), 0);
}

/**
 * Duplicate racks at a grid cell position. Returns new RackState[] with new rack_index, x/y, and regenerated bins.
 * Used by paste (Ctrl+V), duplicate (Ctrl+D), and copy-placement click.
 */
export function duplicateRacksAtPosition(
  racks: RackState[],
  cell: { x: number; y: number },
  nextRackIndexBase: number
): RackState[] {
  const rAny = (r: RackState) => r as { addressPattern?: string; rowId?: string; sectionStartIndex?: number; binNamingType?: "numeric" | "alpha" };
  return racks.map((r, i) => {
    const lc = getLevelConfig(r);
    const binTypeMap = buildBinTypeMapFromBins(r.bins);
    const total = getTotalLocations(lc);
    const volPerBin = total > 0
      ? volumePerBinFromTotal(r.width_cm, r.length_cm, r.height_cm, total)
      : volumePerBin(r.width_cm, r.length_cm, r.height_cm, r.levels, r.bins_per_level);
    const bins = createBinsForRack(
      r.aisle_letter,
      nextRackIndexBase + i,
      r.levels,
      r.bins_per_level,
      volPerBin,
      "M1",
      undefined,
      r.width_cm,
      r.length_cm,
      r.height_cm,
      binTypeMap,
      rAny(r).addressPattern ?? ROW_LABEL_ADDRESS_PATTERN,
      rAny(r).rowId ?? r.name,
      rAny(r).sectionStartIndex ?? 1,
      rAny(r).binNamingType ?? "numeric",
      lc
    );
    return {
      ...r,
      id: undefined,
      uuid: generateRackUuid(),
      rack_type: r.rack_type === "store" ? "store" : "warehouse",
      x: cell.x + (i % 3) * (r.width + 1),
      y: cell.y + Math.floor(i / 3) * (r.height + 1),
      rack_index: nextRackIndexBase + i,
      bins,
      rackLevels: binsToLevels(bins),
    } as RackState;
  });
}

/**
 * Re-index racks in a row — updates `indexInRow` only.
 * Never rewrites `name` or regenerates bins (user names must stay stable).
 */
export function reindexRowByPrefix(racks: RackState[], prefix: string): RackState[] {
  const inRow = racks.filter((r) => (r.rowPrefix ?? "").trim() === prefix.trim());
  if (inRow.length <= 1) return racks;
  const sorted = [...inRow].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
  const byKey = new Map<string, number>();
  sorted.forEach((r, i) => byKey.set(rackEntityKey(r), i + 1));
  return racks.map((r) => {
    const next = byKey.get(rackEntityKey(r));
    if (next == null || r.indexInRow === next) return r;
    return { ...r, indexInRow: next };
  });
}

/**
 * Updates `indexInRow` for racks sharing the same `rowPrefix` as the reference rack.
 * Does NOT rename racks or regenerate bins — names are assigned only at creation/rename.
 */
export function reindexGeometricRow(racks: RackState[], refRackId: number | string): RackState[] {
  const ref = racks.find((r) => rackMatchesSlotRackId(r, refRackId));
  if (!ref) return racks;

  const prefix = (ref.rowPrefix ?? "").trim();
  if (!prefix) return racks;

  const inRow = racks.filter((r) => (r.rowPrefix ?? "").trim() === prefix);
  if (inRow.length <= 1) return racks;

  const horizontalCount = inRow.filter((r) => r.y === ref.y).length;
  const verticalCount = inRow.filter((r) => r.x === ref.x).length;
  const sortHorizontal = horizontalCount >= verticalCount;
  const sorted = [...inRow].sort((a, b) =>
    sortHorizontal ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x
  );

  const byKey = new Map<string, number>();
  sorted.forEach((r, i) => byKey.set(rackEntityKey(r), i + 1));

  const beforeNames =
    import.meta.env.DEV ? new Map(racks.map((r) => [rackEntityKey(r), (r.name ?? "").trim()])) : null;
  const result = racks.map((r) => {
    const next = byKey.get(rackEntityKey(r));
    if (next == null || r.indexInRow === next) return r;
    return { ...r, indexInRow: next };
  });
  if (beforeNames) {
    for (const r of result) {
      const key = rackEntityKey(r);
      const prevName = beforeNames.get(key);
      const nextName = (r.name ?? "").trim();
      if (prevName !== undefined && prevName !== nextName) {
        console.warn("[layout.rack.cross-mutation]", {
          context: "reindexGeometricRow",
          local_id: key,
          old_name: prevName || null,
          new_name: nextName || null,
        });
      }
    }
  }
  return result;
}

export function formatVolume(v: number): string {
  if (!Number.isFinite(Number(v)) || Number(v) <= 0) return "Brak danych";
  return Number(v).toFixed(2);
}

/** Snap cm to nearest 10cm */
export function snapCm(cm: number): number {
  return Math.round(cm / GRID_UNIT_CM) * GRID_UNIT_CM;
}

/**
 * Level heights that sum exactly to rackHeight.
 * baseHeight = floor(rackHeight / levels); last level gets the remainder.
 * Use for both preview and internal layout so they never exceed rack height.
 */
export function levelHeightsForRack(rackHeightCm: number, levelCount: number): number[] {
  if (levelCount <= 0 || rackHeightCm <= 0) return [];
  const baseHeight = Math.floor(rackHeightCm / levelCount);
  const heights = Array(levelCount).fill(baseHeight) as number[];
  heights[levelCount - 1] = rackHeightCm - baseHeight * (levelCount - 1);
  return heights;
}

/** Generate location_id and barcode string: WH-SEC-ROW-LEV-BIN (e.g. M1-A-04-02-01) */
export function locationId(warehouseCode: string, section: string, row: number, level: number, bin: number): string {
  return `${warehouseCode}-${section}-${String(row).padStart(2, "0")}-${String(level).padStart(2, "0")}-${String(bin).padStart(2, "0")}`;
}

/** Expand naming pattern: {R}=rack, {S}=section/aisle, {L}=level, {B}=bin. Optional :N = zero-pad to N digits (e.g. {R:2} → 01) */
export function expandNamingPattern(
  pattern: string,
  rackIndex: number,
  level1Based: number,
  bin1Based: number,
  sectionOrAisleLetter?: string
): string {
  const pad = (n: number, digits: number) => String(n).padStart(Math.max(1, digits), "0");
  const S = sectionOrAisleLetter ?? "A";
  return pattern
    .replace(/\{R:(\d+)\}/gi, (_, d) => pad(rackIndex, Number(d) || 2))
    .replace(/\{R\}/gi, String(rackIndex).padStart(2, "0"))
    .replace(/\{S:(\d+)\}/gi, (_, d) => (S.length >= (Number(d) || 1) ? S : S.padStart(Number(d) || 1, "0")))
    .replace(/\{S\}/gi, S)
    .replace(/\{L:(\d+)\}/g, (_, d) => pad(level1Based, Number(d) || 2))
    .replace(/\{L\}/g, String(level1Based).padStart(2, "0"))
    .replace(/\{B:(\d+)\}/g, (_, d) => pad(bin1Based, Number(d) || 2))
    .replace(/\{B\}/g, String(bin1Based).padStart(2, "0"));
}

const DEFAULT_ADDRESS_PATTERN = "{Row}{Section}-{Bin}-{Level}";

/** Expand address pattern: {Row}, {Section}, {Bin}, {Level}. Bin = numeric (1,2,3) or alpha (A,B,C) per binNamingType. */
export function expandAddressPattern(
  pattern: string,
  rowId: string,
  sectionStartIndex: number,
  binNamingType: "numeric" | "alpha",
  level1Based: number,
  bin1Based: number
): string {
  const section = String(sectionStartIndex);
  const binStr = binNamingType === "alpha"
    ? String.fromCharCode(64 + Math.min(26, Math.max(1, bin1Based)))
    : String(bin1Based);
  const levelStr = String(level1Based);
  return pattern
    .replace(/\{Row\}/g, rowId)
    .replace(/\{Section\}/g, section)
    .replace(/\{Bin\}/g, binStr)
    .replace(/\{Level\}/g, levelStr);
}

/** Expand pattern with {Rack} and {Index} / {Index:N}. Used for rack-index and custom strategies. */
export function expandRackIndexPattern(
  pattern: string,
  rackId: string,
  index1Based: number,
  indexPadding: number = 2
): string {
  const pad = (n: number, d: number) => String(n).padStart(Math.max(1, d), "0");
  return pattern
    .replace(/\{Rack\}/g, rackId)
    .replace(/\{Index:(\d+)\}/gi, (_, d) => pad(index1Based, Number(d) || 2))
    .replace(/\{Index\}/gi, (m) => pad(index1Based, indexPadding));
}

/** Options for generating a single cell label from template naming config. Used by preview and createBinsForRack. */
export type RackTemplateLabelOptions = {
  namingStrategy: "pattern" | "rack-index" | "custom" | "manual";
  namingOrientation?: "column-first" | "row-first";
  namingPattern: string;
  rowId: string;
  sectionStartIndex: number;
  binNamingType: "numeric" | "alpha";
  manualLabels?: Record<string, string>;
  overrides?: Record<string, string>;
  /** Rack id for {Rack} (e.g. aisle + rack index or "A1"). */
  rackId: string;
  indexPadding?: number;
  startIndex?: number;
};

export type GenerateLocationLabelParams = {
  levelIndex: number;
  segmentIndex: number;
  levelRows: { level: number; locations: number }[];
  labelOptions?: RackTemplateLabelOptions | null;
  addressPattern?: string;
  rowId?: string;
  sectionStartIndex?: number;
  binNamingType?: "numeric" | "alpha";
  namingPattern?: string;
  rackIndex?: number;
  aisleLetter?: string;
};

function globalIndexColumnFirst(levelIndex: number, segmentIndex: number, levelRows: { level: number; locations: number }[]): number {
  let idx = 1;
  for (let lev = 0; lev < levelIndex; lev++) idx += Math.max(1, levelRows[lev]?.locations ?? 0);
  return idx + segmentIndex;
}

function globalIndexRowFirst(levelIndex: number, segmentIndex: number, levelRows: { level: number; locations: number }[]): number {
  const L = levelRows.length;
  const maxSeg = Math.max(...levelRows.map((r) => r.locations), 1);
  let idx = 1;
  for (let seg = 0; seg < maxSeg; seg++) {
    for (let lev = 0; lev < L; lev++) {
      if ((levelRows[lev]?.locations ?? 0) <= seg) continue;
      if (seg === segmentIndex && lev === levelIndex) return idx;
      idx++;
    }
  }
  return idx;
}

/**
 * Generate label for one cell from template naming config. Uses structural coordinates only.
 * Overrides replace generated/manual label when present.
 */
export function getRackTemplateLabel(
  levelIndex: number,
  segmentIndex: number,
  levelRows: { level: number; locations: number }[],
  options: RackTemplateLabelOptions
): string {
  const key = `${levelIndex}-${segmentIndex}`;
  const override = options.overrides?.[key];
  if (override !== undefined && override !== "") return override;

  if (options.namingStrategy === "manual") {
    return options.manualLabels?.[key] ?? "";
  }

  const orientation = options.namingOrientation ?? "column-first";
  const pattern = (options.namingPattern || DEFAULT_ADDRESS_PATTERN).trim() || DEFAULT_ADDRESS_PATTERN;
  const row = options.rowId.replace(/\./g, "");
  const sectionStart = options.sectionStartIndex ?? 1;
  const binType = options.binNamingType ?? "numeric";
  const startIdx = options.startIndex ?? 1;

  const level1Based = orientation === "column-first" ? levelIndex + 1 : segmentIndex + 1;
  const bin1Based = orientation === "column-first" ? segmentIndex + 1 : levelIndex + 1;
  const colFirst = globalIndexColumnFirst(levelIndex, segmentIndex, levelRows);
  const rowFirst = globalIndexRowFirst(levelIndex, segmentIndex, levelRows);
  const index1 = orientation === "row-first" ? rowFirst : colFirst;
  const globalIndex1 = startIdx - 1 + index1;
  const padding = options.indexPadding ?? 2;

  if (options.namingStrategy === "rack-index") {
    return expandRackIndexPattern(pattern, options.rackId, globalIndex1, padding);
  }

  let out = expandAddressPattern(pattern, row, sectionStart, binType, level1Based, bin1Based);
  if (options.namingStrategy === "custom") {
    out = expandRackIndexPattern(out, options.rackId, globalIndex1, padding);
  }
  return out;
}

/** Single source of truth for location label generation in preview and real bin creation. */
export function generateLocationLabel(params: GenerateLocationLabelParams): string {
  const {
    levelIndex,
    segmentIndex,
    levelRows,
    labelOptions,
    addressPattern,
    rowId,
    sectionStartIndex,
    binNamingType,
    namingPattern,
    rackIndex,
    aisleLetter,
  } = params;

  if (labelOptions) {
    return getRackTemplateLabel(levelIndex, segmentIndex, levelRows, labelOptions);
  }

  const useAddressPattern =
    addressPattern != null &&
    rowId != null &&
    sectionStartIndex != null &&
    binNamingType != null;

  if (useAddressPattern) {
    const addrPattern = (addressPattern?.trim() || DEFAULT_ADDRESS_PATTERN);
    return expandAddressPattern(
      addrPattern,
      rowId!,
      sectionStartIndex!,
      binNamingType!,
      levelIndex + 1,
      segmentIndex + 1
    );
  }

  const pattern = (namingPattern?.trim() || `${aisleLetter ?? "A"}-{R}-{L}-{B}`);
  return expandNamingPattern(
    pattern,
    rackIndex ?? 1,
    levelIndex + 1,
    segmentIndex + 1,
    aisleLetter
  );
}

/** Bin volume from dimensions (dm³). */
export function binVolumeFromDimensions(width_cm: number, depth_cm: number, height_cm: number): number {
  return Number(((width_cm * depth_cm * height_cm) / 1000).toFixed(2));
}

/** Used volume for a bin (used_volume_dm3 ?? current_load_dm3). */
export function binUsedVolumeDm3(b: BinState): number {
  return b.used_volume_dm3 ?? b.current_load_dm3 ?? 0;
}

/** Occupancy %: (used / volume) * 100. */
export function binOccupancyPct(b: BinState): number {
  const vol = binVolumeDm3(b);
  if (vol <= 0) return 0;
  return Math.min(100, (binUsedVolumeDm3(b) / vol) * 100);
}

/** Volume of bin: from dimensions if set, else volume_dm3. */
export function binVolumeDm3(b: BinState, _rack?: { width_cm: number; length_cm: number; height_cm: number; levels: number; bins_per_level: number }): number {
  if (b.width_cm != null && b.depth_cm != null && b.height_cm != null)
    return binVolumeFromDimensions(b.width_cm, b.depth_cm, b.height_cm);
  return b.volume_dm3 ?? 0;
}

/** Max items that fit in a slot by volume (floor(slotVol / productVol)). Returns 0 if either volume is falsy. */
export function calculateMaxCapacityByVolume(slotVol: number, productVol: number): number {
  if (!slotVol || !productVol) return 0;
  return Math.floor(slotVol / productVol);
}

/** Result of packing layout: best rotation and counts along slot axes. */
export interface PackingLayoutResult {
  count: number;
  rotationIndex: number;
  countX: number;
  countY: number;
  countZ: number;
  boxW_cm: number;
  boxD_cm: number;
  boxH_cm: number;
}

/**
 * Compute best packing layout (rotation and counts) for product in slot.
 * allowedRotations: rotation indices 0..5 to consider (default all).
 * maxCountZ: cap countZ (e.g. 1 for no_stack). Omitted = no cap.
 * Returns null if any dimension is missing.
 */
export function calculatePackingLayout(
  slot: { width_cm?: number; depth_cm?: number; height_cm?: number },
  product: { width_cm?: number; depth_cm?: number; height_cm?: number },
  allowedRotations: number[] = [0, 1, 2, 3, 4, 5],
  maxCountZ?: number
): PackingLayoutResult | null {
  const sw = slot.width_cm;
  const sd = slot.depth_cm;
  const sh = slot.height_cm;
  const pw = product.width_cm;
  const pd = product.depth_cm;
  const ph = product.height_cm;
  if (!sw || !sd || !sh || !pw || !pd || !ph) return null;

  const rotations: [number, number, number][] = [
    [pw, pd, ph],
    [pw, ph, pd],
    [pd, pw, ph],
    [pd, ph, pw],
    [ph, pw, pd],
    [ph, pd, pw],
  ];

  const allowedSet = new Set(allowedRotations);
  let best: PackingLayoutResult | null = null;
  rotations.forEach(([w, d, h], i) => {
    if (!allowedSet.has(i)) return;
    const countX = Math.floor(sw / w);
    const countY = Math.floor(sd / d);
    let countZ = Math.floor(sh / h);
    if (maxCountZ != null && maxCountZ >= 0) countZ = Math.min(countZ, maxCountZ);
    const qty = countX * countY * countZ;
    if (!best || qty > best.count) {
      best = {
        count: qty,
        rotationIndex: i,
        countX,
        countY,
        countZ,
        boxW_cm: w,
        boxD_cm: d,
        boxH_cm: h,
      };
    }
  });
  return best;
}

/**
 * Max items (cylinders) that fit in a slot. Diameter = product width_cm, height = product height_cm.
 * capacity = floor(slotWidth/diameter) * floor(slotDepth/diameter) * floor(slotHeight/height).
 */
export function calculateMaxCapacityCylinder(
  slotDims: { width_cm?: number; depth_cm?: number; height_cm?: number },
  productDims: { width_cm?: number; depth_cm?: number; height_cm?: number }
): number {
  const slotW = slotDims.width_cm ?? 0;
  const slotD = slotDims.depth_cm ?? 0;
  const slotH = slotDims.height_cm ?? 0;
  const diameter = productDims.width_cm ?? 0;
  const height = productDims.height_cm ?? 0;
  if (!slotW || !slotD || !slotH || !diameter || !height) return 0;
  const perW = Math.floor(slotW / diameter);
  const perD = Math.floor(slotD / diameter);
  const perH = Math.floor(slotH / height);
  return perW * perD * perH;
}

/** Max items that fit in a slot by 3D dimensions (6 rotations). Uses same logic as calculatePackingLayout. */
export function calculateMaxCapacityByDimensions(
  slot: { width_cm?: number; depth_cm?: number; height_cm?: number },
  product: { width_cm?: number; depth_cm?: number; height_cm?: number }
): number {
  const layout = calculatePackingLayout(slot, product);
  return layout ? layout.count : 0;
}

export function createBinsForRack(
  aisleLetter: string,
  rackIndex: number,
  levels: number,
  binsPerLevel: number,
  volumePerBinDm3: number,
  warehouseCode: string = "M1",
  namingPattern?: string,
  rackWidthCm?: number,
  rackDepthCm?: number,
  rackHeightCm?: number,
  binTypeMap?: Record<string, NormalizedStorageType>,
  addressPattern?: string,
  rowId?: string,
  sectionStartIndex?: number,
  binNamingType?: "numeric" | "alpha",
  levelConfig?: LevelConfigItem[],
  namingStrategy?: "pattern" | "rack-index" | "custom" | "manual",
  namingOrientation?: "column-first" | "row-first",
  templateNamingPattern?: string,
  manualLabels?: Record<string, string>,
  overrides?: Record<string, string>,
  indexPadding?: number,
  startIndex?: number
): BinState[] {
  const levelRows = Array.isArray(levelConfig) && levelConfig.length > 0
    ? levelConfig
    : Array.from({ length: Math.max(1, levels) }, (_, i) => ({ level: i + 1, locations: Math.max(1, binsPerLevel) }));
  const levelCount = levelRows.length;
  const levelHeights = rackHeightCm != null && rackHeightCm > 0 ? levelHeightsForRack(rackHeightCm, levelCount) : [];
  const depth_cm = rackDepthCm ?? undefined;
  const normalizedBinTypeMap = normalizeBinTypeMap(binTypeMap);
  const row = (rowId ?? aisleLetter).toString().replace(/\./g, "");
  const sectionStart = sectionStartIndex ?? 1;
  const binType = binNamingType ?? "numeric";
  const rackId = `${row}${rackIndex}`;

  const useNewNaming =
    namingStrategy != null ||
    manualLabels != null ||
    (overrides != null && Object.keys(overrides).length > 0);
  const effectiveStrategy: "pattern" | "rack-index" | "custom" | "manual" = namingStrategy ?? "pattern";
  const effectivePattern =
    (templateNamingPattern ?? addressPattern ?? namingPattern)?.trim() ||
    DEFAULT_ADDRESS_PATTERN;

  const labelOptions: RackTemplateLabelOptions | null = useNewNaming
    ? {
        namingStrategy: effectiveStrategy,
        namingOrientation: namingOrientation ?? "column-first",
        namingPattern: effectivePattern,
        rowId: row,
        sectionStartIndex: sectionStart,
        binNamingType: binType,
        manualLabels,
        overrides,
        rackId,
        indexPadding: indexPadding ?? 2,
        startIndex: startIndex ?? 1,
      }
    : null;

  const useAddressPattern = !labelOptions && addressPattern != null && rowId != null && sectionStartIndex != null && binNamingType != null;
  const pattern = (namingPattern?.trim() || `${aisleLetter}-{R}-{L}-{B}`);
  const addrPattern = (addressPattern?.trim() || DEFAULT_ADDRESS_PATTERN);

  const out: BinState[] = [];
  for (let lev = 0; lev < levelRows.length; lev++) {
    const locs = Math.max(1, levelRows[lev].locations);
    const widthList = rackWidthCm != null ? distributedWidthsCm(rackWidthCm, locs) : [];
    const height_cm = levelHeights[lev] ?? undefined;
    for (let seg = 0; seg < locs; seg++) {
      const key = `${lev}-${seg}`;
      const type = normalizedBinTypeMap[key] ?? "primary";
      const label = generateLocationLabel({
        levelIndex: lev,
        segmentIndex: seg,
        levelRows,
        labelOptions,
        addressPattern: useAddressPattern ? addrPattern : undefined,
        rowId: useAddressPattern ? row : undefined,
        sectionStartIndex: useAddressPattern ? sectionStart : undefined,
        binNamingType: useAddressPattern ? binType : undefined,
        namingPattern: pattern,
        rackIndex,
        aisleLetter,
      });
      const visibleCode = buildVisibleLocationCode(`${aisleLetter}${rackIndex}`, lev, seg);
      const locId = visibleCode;
      const locationUUID = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `loc-${Date.now()}-${lev}-${seg}-${Math.random().toString(36).slice(2, 9)}`;
      const width_cm = widthList.length > seg ? widthList[seg] : undefined;
      const vol = (width_cm != null && depth_cm != null && height_cm != null)
        ? binVolumeFromDimensions(width_cm, depth_cm, height_cm)
        : volumePerBinDm3;
      out.push({
        label: visibleCode,
        level_index: lev,
        segment_index: seg,
        volume_dm3: vol,
        current_load_dm3: 0,
        used_volume_dm3: 0,
        width_cm,
        depth_cm,
        height_cm,
        location_id: locId,
        locationUUID,
        barcode_data: locId,
        storage_type: type,
      });
    }
  }
  return out;
}

/**
 * Single-cell location label using the same rules as createBinsForRack (for mirrored RTL display).
 */
export function generateLocationLabelForRackCell(rack: RackState, levelIndex: number, segmentIndex: number): string {
  const levelCfg = getLevelConfig(rack);
  const levelRows = levelCfg.map((row) => ({ level: row.level, locations: row.locations }));
  const aisleLetter = rack.aisle_letter ?? "A";
  const rackIndex = rack.rack_index ?? 1;
  const rAny = rack as {
    addressPattern?: string;
    rowId?: string;
    sectionStartIndex?: number;
    binNamingType?: "numeric" | "alpha";
    namingStrategy?: "pattern" | "rack-index" | "custom" | "manual";
    namingOrientation?: "column-first" | "row-first";
    namingPattern?: string;
    manualLabels?: Record<string, string>;
    overrides?: Record<string, string>;
    indexPadding?: number;
    startIndex?: number;
  };
  const row = (rAny.rowId ?? rack.name ?? aisleLetter).toString().replace(/\./g, "");
  const sectionStart = rAny.sectionStartIndex ?? 1;
  const binType = rAny.binNamingType ?? "numeric";
  const useNewNaming =
    rAny.namingStrategy != null ||
    rAny.manualLabels != null ||
    (rAny.overrides != null && Object.keys(rAny.overrides).length > 0);
  const effectiveStrategy: "pattern" | "rack-index" | "custom" | "manual" = rAny.namingStrategy ?? "pattern";
  const effectivePattern =
    (rAny.addressPattern ?? rAny.namingPattern)?.trim() || DEFAULT_ADDRESS_PATTERN;
  const rackId = `${row}${rackIndex}`;

  const labelOptions: RackTemplateLabelOptions | null = useNewNaming
    ? {
        namingStrategy: effectiveStrategy,
        namingOrientation: rAny.namingOrientation ?? "column-first",
        namingPattern: effectivePattern,
        rowId: row,
        sectionStartIndex: sectionStart,
        binNamingType: binType,
        manualLabels: rAny.manualLabels,
        overrides: rAny.overrides,
        rackId,
        indexPadding: rAny.indexPadding ?? 2,
        startIndex: rAny.startIndex ?? 1,
      }
    : null;

  const useAddressPattern =
    !labelOptions &&
    rAny.addressPattern != null &&
    row !== "" &&
    rAny.sectionStartIndex != null &&
    rAny.binNamingType != null;
  const pattern = (rAny.namingPattern?.trim() || `${aisleLetter}-{R}-{L}-{B}`);
  const addrPattern = (rAny.addressPattern?.trim() || DEFAULT_ADDRESS_PATTERN);

  return generateLocationLabel({
    levelIndex,
    segmentIndex,
    levelRows,
    labelOptions,
    addressPattern: useAddressPattern ? addrPattern : undefined,
    rowId: useAddressPattern ? row : undefined,
    sectionStartIndex: useAddressPattern ? sectionStart : undefined,
    binNamingType: useAddressPattern ? binType : undefined,
    namingPattern: pattern,
    rackIndex,
    aisleLetter,
  });
}

/** Bin label for UI when `bin_direction` is RTL (mirrors column letters / bin indices without moving geometry). */
export function getBinDisplayLabel(rack: RackState, bin: BinState, layout?: LayoutState | null): string {
  const base = bin.label ?? bin.location_id ?? "";
  if (getBinDirectionForRack(rack, layout ?? undefined) !== "RTL") return base;
  const lc = getLevelConfig(rack);
  const locs = Math.max(1, lc[bin.level_index]?.locations ?? rack.bins_per_level ?? 1);
  if (locs <= 1) return base;
  const segMir = locs - 1 - bin.segment_index;
  if (segMir === bin.segment_index) return base;
  return generateLocationLabelForRackCell(rack, bin.level_index, segMir);
}

/** Merge rack naming prefix with bin display string so the first segment matches the rack line shown in UI (`effectiveRackDisplayName` / slot label). */
function combineRackBinDisplayParts(rack: RackState, rackDisp: string, binDisp: string): string {
  const trimmed = binDisp.trim();
  if (!trimmed) return rackDisp;
  const name = (rack.name ?? "").trim();
  if (name && trimmed.startsWith(`${name}-`)) {
    return rackDisp + trimmed.slice(name.length);
  }
  const parts = trimmed.split("-").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return rackDisp;
  const first = parts[0] ?? "";
  if (/^[A-Za-z]+\d+$/.test(first)) {
    parts[0] = rackDisp;
    return parts.join("-");
  }
  return `${rackDisp}-${trimmed}`;
}

/**
 * Single human-readable location line for UI: rack naming prefix + bin (`bin_direction`), e.g. A3-C-1.
 * Uses `effectiveRackDisplayName` when layout is known so the rack line matches the properties panel / custom `rack.name`.
 * Does not mutate data; UUID remains the canonical identity.
 */
export function getDisplayLocationLabel(rack: RackState, bin: BinState, layout?: LayoutState | null): string {
  const rackDisp =
    layout != null
      ? effectiveRackDisplayName(rack, layout).trim()
      : getRackDisplayId(rack, layout ?? undefined).trim();
  return buildVisibleLocationCode(rackDisp, bin.level_index, bin.segment_index);
}

/**
 * Full location line using canonical `segment_index` for the bin part (no `getBinDisplayLabel` RTL mirroring).
 * Use when tile order already follows `bin_direction` (e.g. internal layout left→right = vis 0..n).
 */
export function getDisplayLocationLabelPhysicalOrder(rack: RackState, bin: BinState, layout?: LayoutState | null): string {
  const rackDisp =
    layout != null
      ? effectiveRackDisplayName(rack, layout).trim()
      : getRackDisplayId(rack, layout ?? undefined).trim();
  return buildVisibleLocationCode(rackDisp, bin.level_index, bin.segment_index);
}

/** Find rack + bin by permanent location UUID (layout identity). */
export function findRackAndBinByLocationUuid(
  layout: LayoutState | null | undefined,
  locationUUID: string
): { rack: RackState; bin: BinState } | null {
  const u = (locationUUID ?? "").trim();
  if (!u || !layout?.racks?.length) return null;
  for (const rack of layout.racks) {
    for (const bin of rack.bins ?? []) {
      if ((bin.locationUUID ?? "").trim() === u) return { rack, bin };
    }
  }
  return null;
}

/** Map rack key (id or rack_index) → walk order: row_container slots first (along row), then unracked racks. */
export function buildRackOrderMap(layout: LayoutState): Map<string, number> {
  const m = new Map<string, number>();
  let ord = 0;
  const seen = new Set<string>();
  for (const rc of layout.row_containers ?? []) {
    const horiz = (rc.orientation ?? "horizontal") === "horizontal";
    const filled = [...rc.slots]
      .filter((s) => s.rackId != null)
      .sort((a, b) => (horiz ? a.x - b.x : a.y - b.y));
    for (const s of filled) {
      const k = String(s.rackId);
      if (!seen.has(k)) {
        m.set(k, ord++);
        seen.add(k);
      }
    }
  }
  for (const r of layout.racks ?? []) {
    const k = String(r.id ?? r.rack_index);
    if (!seen.has(k)) {
      m.set(k, ord++);
      seen.add(k);
    }
  }
  return m;
}

/** Stable sort key: rack walk order, then level, then segment (RTL/LTR does not change geometry indices). */
export function getLocationLayoutSortOrdinal(rack: RackState, bin: BinState, layout: LayoutState | null | undefined): number {
  const map = layout ? buildRackOrderMap(layout) : null;
  const rk = String(rack.id ?? rack.rack_index);
  const rackPart = map?.get(rk) ?? (rack.rack_index ?? 0) + 100_000;
  const lev = bin.level_index;
  const seg = bin.segment_index;
  return rackPart * 1_000_000 + lev * 10_000 + seg;
}

export function compareLocationUuidsByLayoutOrder(
  layout: LayoutState | null | undefined,
  uuidA: string,
  uuidB: string
): number {
  if (!layout) return uuidA.localeCompare(uuidB);
  const fa = findRackAndBinByLocationUuid(layout, uuidA);
  const fb = findRackAndBinByLocationUuid(layout, uuidB);
  if (fa && fb) {
    const oa = getLocationLayoutSortOrdinal(fa.rack, fa.bin, layout);
    const ob = getLocationLayoutSortOrdinal(fb.rack, fb.bin, layout);
    if (oa !== ob) return oa - ob;
  }
  if (fa && !fb) return -1;
  if (!fa && fb) return 1;
  return uuidA.localeCompare(uuidB);
}

/** Product dimensions (cm) for fit-check. D = depth, S = width, W = height. */
export type ProductDimensionsCm = { depthCm: number; widthCm: number; heightCm: number };

/** Returns true if product fits in position by dimensions (all position max dimensions must be set and product must be <= each). */
export function positionFitsDimensions(
  position: { maxDepthCm?: number; maxWidthCm?: number; maxHeightCm?: number },
  product: ProductDimensionsCm
): boolean {
  const { maxDepthCm, maxWidthCm, maxHeightCm } = position;
  if (maxDepthCm == null || maxWidthCm == null || maxHeightCm == null) return true;
  return (
    product.depthCm <= maxDepthCm &&
    product.widthCm <= maxWidthCm &&
    product.heightCm <= maxHeightCm
  );
}

/** Single selectable position for location picker (Row > Rack > Level > Position). */
export type SelectablePosition = {
  locationUUID: string;
  /** Full display line — same as `getDisplayLocationLabel` (not raw bin.label). */
  locationAddress: string;
  /** Rack-only prefix for search; same as `getRackDisplayId`. */
  rowLabel: string;
  rackIndex: number;
  levelIndex: number;
  positionIndex: number;
  /** Primary sort: layout walk order + level + segment (stable when RTL toggles). */
  layoutSortOrdinal?: number;
  /** Max dimensions (cm) for fit-check. When set, product dimensions must not exceed these. */
  maxDepthCm?: number;
  maxWidthCm?: number;
  maxHeightCm?: number;
  /** Capacity in dm³ for volume fit-check. */
  capacityDm3?: number;
  /** primary = picking; reserve = zapasowa (orange on map). */
  storageType?: NormalizedStorageType;
};

/** Build flat list of all positions from layout racks (for location picker). Uses bins + display label helper. */
export function getAllPositionsFromRacks(racks: RackState[], layout?: LayoutState | null): SelectablePosition[] {
  const orderMap = layout ? buildRackOrderMap(layout) : null;
  const rackList = [...racks].sort((a, b) => {
    const ka = String(a.id ?? a.rack_index);
    const kb = String(b.id ?? b.rack_index);
    if (orderMap) {
      const oa = orderMap.get(ka);
      const ob = orderMap.get(kb);
      if (oa != null && ob != null && oa !== ob) return oa - ob;
    }
    return (a.rack_index ?? 0) - (b.rack_index ?? 0);
  });
  const out: SelectablePosition[] = [];
  for (const rack of rackList) {
    const rowLabel = getRackDisplayId(rack, layout ?? undefined);
    const orderedBins = [...(rack.bins ?? [])].sort((a, b) => {
      if (a.level_index !== b.level_index) return a.level_index - b.level_index;
      return a.segment_index - b.segment_index;
    });
    for (const bin of orderedBins) {
      const u = (bin.locationUUID ?? "").trim();
      if (!u) continue;
      const display = getDisplayLocationLabel(rack, bin, layout);
      const ordinal = getLocationLayoutSortOrdinal(rack, bin, layout);
      const sameLevel = (rack.bins ?? []).filter((b) => b.level_index === bin.level_index).sort((a, b) => a.segment_index - b.segment_index);
      const positionIndex = Math.max(1, sameLevel.findIndex((b) => b.locationUUID === bin.locationUUID) + 1);
      out.push({
        locationUUID: u,
        locationAddress: display,
        rowLabel,
        rackIndex: rack.rack_index ?? 0,
        levelIndex: bin.level_index + 1,
        positionIndex,
        layoutSortOrdinal: ordinal,
        maxDepthCm: bin.depth_cm,
        maxWidthCm: bin.width_cm,
        maxHeightCm: bin.height_cm,
        capacityDm3: bin.volume_dm3,
        storageType: normalizeStorageType(bin.storage_type),
      });
    }
  }
  out.sort((a, b) => {
    const oa = a.layoutSortOrdinal ?? 0;
    const ob = b.layoutSortOrdinal ?? 0;
    if (oa !== ob) return oa - ob;
    return (a.locationAddress ?? "").localeCompare(b.locationAddress ?? "", undefined, { numeric: true });
  });
  return out;
}

/** Raw rack from layout API (minimal shape). */
export type RawLayoutRack = {
  id?: number;
  uuid?: string;
  rack_index?: number;
  rack_type?: string;
  name?: string;
  row_prefix?: string;
  index_in_row?: number;
  aisle_letter?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  orientation?: string;
  levels?: number;
  bins_per_level?: number;
  width_cm?: number;
  length_cm?: number;
  height_cm?: number;
  bins?: Array<{
    label?: string;
    location_id?: string;
    location_uuid?: string;
    locationUUID?: string;
    level_index?: number;
    segment_index?: number;
    width_cm?: number;
    depth_cm?: number;
    height_cm?: number;
    volume_dm3?: number;
    storage_type?: string;
  }>;
};

/** Normalize API rack JSON to RackState for label helpers (Products page / import). */
export function rawLayoutRackToRackState(r: RawLayoutRack): RackState {
  const binsIn = r.bins ?? [];
  const bins: BinState[] = binsIn.map((b) => {
    const vol = Number(b.volume_dm3);
    return {
      label: (b.label ?? "").toString(),
      level_index: Number(b.level_index ?? 0),
      segment_index: Number(b.segment_index ?? 0),
      volume_dm3: Number.isFinite(vol) ? vol : 0,
      location_id: b.location_id,
      locationUUID:
        typeof b.location_uuid === "string"
          ? b.location_uuid
          : typeof b.locationUUID === "string"
            ? b.locationUUID
            : undefined,
      width_cm: b.width_cm,
      depth_cm: b.depth_cm,
      height_cm: b.height_cm,
      storage_type: normalizeStorageType(b.storage_type),
    };
  });
  return {
    id: r.id,
    uuid: r.uuid,
    rack_type: (r.rack_type as RackType) ?? "warehouse",
    name: r.name,
    x: r.x ?? 0,
    y: r.y ?? 0,
    width: r.width ?? 1,
    height: r.height ?? 1,
    orientation: r.orientation ?? "vertical",
    levels: r.levels ?? 1,
    bins_per_level: r.bins_per_level ?? 1,
    length_cm: r.length_cm ?? 0,
    width_cm: r.width_cm ?? 0,
    height_cm: r.height_cm ?? 0,
    aisle_letter: r.aisle_letter ?? "A",
    rack_index: r.rack_index ?? 0,
    bins,
    rowPrefix: r.row_prefix,
    indexInRow: r.index_in_row,
  } as RackState;
}

/**
 * Build SelectablePosition[] from layout API racks. Pass optional `layout` (grid + row_containers) so labels match designer / Magazyn.
 */
export function getPositionsFromLayoutRacks(rawRacks: RawLayoutRack[], layout?: LayoutState | null): SelectablePosition[] {
  const racks = (rawRacks ?? []).map((r) => rawLayoutRackToRackState(r));
  const merged: LayoutState = {
    layout_id: layout?.layout_id ?? null,
    warehouse_id: layout?.warehouse_id ?? null,
    warehouse_name: layout?.warehouse_name ?? "",
    name: layout?.name ?? "",
    grid_cols: layout?.grid_cols ?? 0,
    grid_rows: layout?.grid_rows ?? 0,
    building_width_m: layout?.building_width_m,
    building_depth_m: layout?.building_depth_m,
    building_height_m: layout?.building_height_m,
    racks,
    aisles: layout?.aisles ?? [],
    visual_elements: layout?.visual_elements ?? [],
    picking_path: layout?.picking_path,
    row_containers: layout?.row_containers ?? [],
    wall_elements: layout?.wall_elements,
  };
  return getAllPositionsFromRacks(racks, merged);
}

/** Build levels[] with positions (each with locationUUID and locationAddress) from a rack's bins. Used when placing a rack to populate rack.levels. */
export function binsToLevels(bins: BinState[]): RackLevel[] {
  const byLevel = new Map<number, BinState[]>();
  for (const b of bins) {
    const lev = b.level_index;
    if (!byLevel.has(lev)) byLevel.set(lev, []);
    byLevel.get(lev)!.push(b);
  }
  const levels: RackLevel[] = [];
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  for (const levelIndex of sortedLevels) {
    const levelBins = byLevel.get(levelIndex)!;
    levelBins.sort((a, b) => a.segment_index - b.segment_index);
    levels.push({
      levelIndex: levelIndex + 1,
      positions: levelBins.map((b, i) => ({
        positionIndex: i + 1,
        locationUUID: b.locationUUID ?? `gen-${levelIndex}-${b.segment_index}`,
        locationAddress: b.location_id ?? b.label ?? "",
        volume_dm3: b.volume_dm3,
        used_volume_dm3: b.used_volume_dm3 ?? b.current_load_dm3,
        max_depth_cm: b.depth_cm,
        max_width_cm: b.width_cm,
        max_height_cm: b.height_cm,
        storage_type: b.storage_type,
      })),
    });
  }
  return levels;
}

export function volumePerBin(
  widthCm: number,
  depthCm: number,
  heightCm: number,
  levels: number,
  binsPerLevel: number
): number {
  const total = (widthCm * depthCm * heightCm) / 1000;
  const count = levels * binsPerLevel;
  return count > 0 ? Number((total / count).toFixed(2)) : 0;
}

/** Volume per bin when total bin count is known (e.g. from levelConfig). */
export function volumePerBinFromTotal(widthCm: number, depthCm: number, heightCm: number, totalBins: number): number {
  if (totalBins <= 0) return 0;
  const total = (widthCm * depthCm * heightCm) / 1000;
  return Number((total / totalBins).toFixed(2));
}

/** Total path distance in meters. Points in cell coordinates; 1 cell = GRID_UNIT_CM cm. */
export function pathDistanceMeters(points: { x: number; y: number }[], cellsPerMeter: number = 10): number {
  if (points.length < 2) return 0;
  const meterPerCell = 1 / cellsPerMeter;
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    d += Math.hypot(b.x - a.x, b.y - a.y) * meterPerCell;
  }
  return Number(d.toFixed(2));
}
