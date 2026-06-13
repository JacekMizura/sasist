/**
 * P5.6A — mapowanie UX siatki (kolumny × rzędy) na model backendu
 * ConsolidationRackLevel + RackSegment (bez zmian API).
 *
 * Kolumny = poziomy (level.name = A, B, C…)
 * Rzędy   = segment_index + 1 w obrębie kolumny → etykiety A1, A2, B1, B2…
 * Skan    = RK-01/A2 (format_segment_label w backendzie)
 */

export type RackLevelPayload = {
  level_index: number;
  name: string;
  is_segmented: boolean;
  segments: Array<{ segment_index: number; order_id: null; fill_percent: number }>;
};

export function columnLetter(colIndex: number): string {
  return String.fromCharCode(65 + colIndex);
}

/** Etykieta pola siatki (A1, B2, TV-01…) — zgodna z backend segment_slot_label. */
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

/** Wizard: liczba kolumn × liczba rzędów → payload levels dla POST /racks/ */
export function buildLevelsFromGrid(rowCount: number, colCount: number): RackLevelPayload[] {
  const rows = Math.max(1, Math.min(20, rowCount));
  const cols = Math.max(1, Math.min(26, colCount));
  const levels: RackLevelPayload[] = [];
  for (let col = 0; col < cols; col += 1) {
    levels.push({
      level_index: col,
      name: columnLetter(col),
      is_segmented: rows > 1,
      segments: Array.from({ length: rows }, (_, row) => ({
        segment_index: row,
        order_id: null,
        fill_percent: 0,
      })),
    });
  }
  return levels;
}

export type GridCellPreview = {
  levelIndex: number;
  segmentIndex: number;
  columnLetter: string;
  rowNumber: number;
  slotLabel: string;
  shelfLabel: string;
};

export function buildGridPreview(rackName: string, rowCount: number, colCount: number): GridCellPreview[][] {
  const rows = Math.max(1, Math.min(20, rowCount));
  const cols = Math.max(1, Math.min(26, colCount));
  const grid: GridCellPreview[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const line: GridCellPreview[] = [];
    for (let col = 0; col < cols; col += 1) {
      const letter = columnLetter(col);
      const isSegmented = rows > 1;
      line.push({
        levelIndex: col,
        segmentIndex: row,
        columnLetter: letter,
        rowNumber: row + 1,
        slotLabel: computeSlotLabel(letter, col, row, isSegmented),
        shelfLabel: computeShelfLabel(rackName, letter, col, row, isSegmented),
      });
    }
    grid.push(line);
  }
  return grid;
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

/** Normalizuje levels API → siatka [row][col] (rzędy × kolumny). */
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
          seg.slot_label ?? seg.effective_slot_label,
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

/** Kolory konfiguracji (tylko order_id — bez plan state). */
export function configSegmentTone(orderId: number | null | undefined): string {
  if (orderId == null) return "border-emerald-400 bg-emerald-50 text-emerald-950 hover:bg-emerald-100";
  return "border-orange-400 bg-orange-50 text-orange-950 hover:bg-orange-100";
}
