/**
 * Mapowanie UX siatki (kolumny × rzędy) na model backendu ConsolidationRackLevel + RackSegment.
 */

export type RackLevelPayload = {
  level_index: number;
  name: string;
  is_segmented: boolean;
  segments: Array<{
    segment_index: number;
    order_id: null;
    fill_percent: number;
    slot_label?: string | null;
    length_mm?: number | null;
    width_mm?: number | null;
    height_mm?: number | null;
  }>;
};

export type SegmentDimensionDefaults = {
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  slot_label?: string | null;
};

export type DraftSegmentOverrides = Record<string, SegmentDimensionDefaults>;

function draftSegmentKey(colIndex: number, segmentIndex: number): string {
  return `${colIndex}-${segmentIndex}`;
}

export function columnLetter(colIndex: number): string {
  return String.fromCharCode(65 + colIndex);
}

export function computeCapacityDm3(
  l: number | null | undefined,
  w: number | null | undefined,
  h: number | null | undefined,
): number | null {
  if (l == null || w == null || h == null || l <= 0 || w <= 0 || h <= 0) return null;
  return Math.round((l * w * h) / 1_000_000 * 100) / 100;
}

export function computeSlotLabel(
  levelName: string | null | undefined,
  levelIndex: number,
  segmentIndex: number,
  isSegmented: boolean,
  customSlotLabel?: string | null,
): string {
  const custom = (customSlotLabel ?? "").trim();
  if (custom) return custom;
  const levelPart = (levelName ?? "").trim() || columnLetter(levelIndex);
  if (isSegmented || segmentIndex > 0) {
    return `${levelPart}${segmentIndex + 1}`;
  }
  return levelPart;
}

export function computeShelfLabel(
  rackName: string,
  levelName: string | null | undefined,
  levelIndex: number,
  segmentIndex: number,
  isSegmented: boolean,
  customSlotLabel?: string | null,
): string {
  return `${rackName}/${computeSlotLabel(levelName, levelIndex, segmentIndex, isSegmented, customSlotLabel)}`;
}

export function buildLevelsFromGrid(
  rowCount: number,
  colCount: number,
  defaults?: SegmentDimensionDefaults,
  overrides?: DraftSegmentOverrides,
): RackLevelPayload[] {
  const rows = Math.max(1, Math.min(20, rowCount));
  const cols = Math.max(1, Math.min(26, colCount));
  const levels: RackLevelPayload[] = [];
  for (let col = 0; col < cols; col += 1) {
    levels.push({
      level_index: col,
      name: columnLetter(col),
      is_segmented: rows > 1,
      segments: Array.from({ length: rows }, (_, row) => {
        const key = draftSegmentKey(col, row);
        const o = overrides?.[key];
        return {
          segment_index: row,
          order_id: null,
          fill_percent: 0,
          slot_label: o?.slot_label ?? defaults?.slot_label ?? null,
          length_mm: o?.length_mm ?? defaults?.length_mm ?? null,
          width_mm: o?.width_mm ?? defaults?.width_mm ?? null,
          height_mm: o?.height_mm ?? defaults?.height_mm ?? null,
        };
      }),
    });
  }
  return levels;
}

export type RackGridLevel = {
  id?: number;
  level_index: number;
  name: string | null;
  is_segmented: boolean;
  segments: Array<{
    id?: number;
    segment_index: number;
    order_id: number | null;
    order_number?: string | null;
    fill_percent?: number;
    slot_label?: string | null;
    effective_slot_label?: string | null;
    length_mm?: number | null;
    width_mm?: number | null;
    height_mm?: number | null;
    capacity_dm3?: number | null;
    order_volume_dm3?: number | null;
    utilization_percent?: number | null;
    capacity_overflow?: boolean;
    dimension_estimated?: boolean;
    estimated_items_count?: number;
  }>;
};

export type ApiSegment = RackGridLevel["segments"][number];

export function buildPreviewLevelsFromGrid(
  rowCount: number,
  colCount: number,
  defaults?: SegmentDimensionDefaults,
  overrides?: DraftSegmentOverrides,
): RackGridLevel[] {
  return buildLevelsFromGrid(rowCount, colCount, defaults, overrides).map((lv) => ({
    level_index: lv.level_index,
    name: lv.name,
    is_segmented: lv.is_segmented,
    segments: lv.segments.map((s) => ({
      segment_index: s.segment_index,
      order_id: null,
      slot_label: s.slot_label,
      length_mm: s.length_mm,
      width_mm: s.width_mm,
      height_mm: s.height_mm,
      capacity_dm3: computeCapacityDm3(s.length_mm, s.width_mm, s.height_mm),
    })),
  }));
}

export { draftSegmentKey };

export function levelsToGrid(levels: RackGridLevel[]): {
  colCount: number;
  rowCount: number;
  columnLetters: string[];
  cells: Array<Array<RackGridLevel["segments"][0] & { level: RackGridLevel; slotLabel: string } | null>>;
} {
  const sortedLevels = [...levels].sort((a, b) => a.level_index - b.level_index);
  const colCount = sortedLevels.length;
  const rowCount = sortedLevels.reduce((max, lv) => Math.max(max, lv.segments?.length ?? 0), 0);
  const columnLetters = sortedLevels.map((lv, i) => (lv.name ?? "").trim() || columnLetter(i));

  const cells: Array<Array<(RackGridLevel["segments"][0] & { level: RackGridLevel; slotLabel: string }) | null>> = [];
  for (let row = 0; row < rowCount; row += 1) {
    const line: Array<(RackGridLevel["segments"][0] & { level: RackGridLevel; slotLabel: string }) | null> = [];
    for (let col = 0; col < colCount; col += 1) {
      const level = sortedLevels[col];
      const seg = [...(level.segments ?? [])].sort((a, b) => a.segment_index - b.segment_index)[row];
      if (!seg) {
        line.push(null);
        continue;
      }
      line.push({
        ...seg,
        level,
        slotLabel: computeSlotLabel(
          level.name,
          level.level_index,
          seg.segment_index,
          level.is_segmented,
          seg.slot_label,
        ),
      });
    }
    cells.push(line);
  }

  return { colCount, rowCount, columnLetters, cells };
}

export function rackOccupancyStats(levels: RackGridLevel[]): {
  total: number;
  free: number;
  occupied: number;
  utilizationPercent: number;
} {
  let total = 0;
  let occupied = 0;
  for (const lv of levels) {
    for (const seg of lv.segments ?? []) {
      total += 1;
      if (seg.order_id != null) occupied += 1;
    }
  }
  const free = total - occupied;
  const utilizationPercent = total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0;
  return { total, free, occupied, utilizationPercent };
}

export function configSegmentTone(orderId: number | null | undefined): string {
  if (orderId == null) return "border-emerald-400 bg-emerald-50 text-emerald-950 hover:bg-emerald-100";
  return "border-orange-400 bg-orange-50 text-orange-950 hover:bg-orange-100";
}

export function segmentDimsMatch(a: SegmentDimensionDefaults, b: SegmentDimensionDefaults): boolean {
  return (a.length_mm ?? null) === (b.length_mm ?? null)
    && (a.width_mm ?? null) === (b.width_mm ?? null)
    && (a.height_mm ?? null) === (b.height_mm ?? null);
}

/** Najczęstszy profil wymiarów segmentów — domyślny profil regału. */
export function inferRackDefaultDims(levels: RackGridLevel[]): SegmentDimensionDefaults {
  const freq = new Map<string, { dims: SegmentDimensionDefaults; count: number }>();
  for (const lv of levels) {
    for (const seg of lv.segments ?? []) {
      const dims: SegmentDimensionDefaults = {
        length_mm: seg.length_mm ?? null,
        width_mm: seg.width_mm ?? null,
        height_mm: seg.height_mm ?? null,
      };
      const key = `${dims.length_mm}|${dims.width_mm}|${dims.height_mm}`;
      const prev = freq.get(key);
      if (prev) prev.count += 1;
      else freq.set(key, { dims, count: 1 });
    }
  }
  let best: SegmentDimensionDefaults = {};
  let max = 0;
  for (const { dims, count } of freq.values()) {
    if (count > max) {
      max = count;
      best = dims;
    }
  }
  return best;
}

export function segmentIsOverridden(seg: ApiSegment, rackDefaults: SegmentDimensionDefaults): boolean {
  if ((seg.slot_label ?? "").trim()) return true;
  return !segmentDimsMatch(
    { length_mm: seg.length_mm, width_mm: seg.width_mm, height_mm: seg.height_mm },
    rackDefaults,
  );
}
