import { chunkDataset } from "./chunkDataset";

/** How to order flat locations before chunking for multi-slot strip labels. */
export type RackDatasetTransformMode = "row" | "column" | "sequential";

/** Options for building page records (dataset preparation only; no layout/repeater changes). */
export type LabelDatasetPrepareOptions = {
  /** When set (>0), overrides template-derived count of repeater items per physical label. */
  itemsPerLabel?: number;
  transformMode?: RackDatasetTransformMode;
  /**
   * Optional racks “columns” hint (bins per level). Used for stable ordering when keys tie
   * (same level & segment) and for documentation; does not pad short rows.
   */
  columns?: number;
};

function rowKey(r: Record<string, unknown>): number {
  if (typeof r.level_index === "number" && !Number.isNaN(r.level_index)) return r.level_index;
  if (typeof r.level === "number" && !Number.isNaN(r.level)) return r.level;
  return 0;
}

function colKey(r: Record<string, unknown>): number {
  if (typeof r.segment_index === "number" && !Number.isNaN(r.segment_index)) return r.segment_index;
  if (typeof r.position === "number" && !Number.isNaN(r.position)) return r.position;
  return 0;
}

/**
 * Reorder a flat location list for repeater iteration.
 * - **row**: ascending level (row), then position (column).
 * - **column**: ascending position (column), then level (row).
 * - **sequential**: preserve input order.
 */
export function transformLocations(
  items: Record<string, unknown>[],
  mode: RackDatasetTransformMode,
  columns?: number
): Record<string, unknown>[] {
  if (mode === "sequential") {
    return items.map((x) => ({ ...x }));
  }

  const annotated = items.map((data, flatIndex) => ({
    data: { ...data },
    row: rowKey(data),
    col: colKey(data),
    flatIndex,
  }));

  if (mode === "row") {
    annotated.sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      if (a.col !== b.col) return a.col - b.col;
      if (columns != null && columns > 0) {
        const ia = a.row * columns + a.col;
        const ib = b.row * columns + b.col;
        if (ia !== ib) return ia - ib;
      }
      return a.flatIndex - b.flatIndex;
    });
  } else if (mode === "column") {
    annotated.sort((a, b) => {
      if (a.col !== b.col) return a.col - b.col;
      if (a.row !== b.row) return a.row - b.row;
      if (columns != null && columns > 0) {
        const ia = a.col * columns + a.row;
        const ib = b.col * columns + b.row;
        if (ia !== ib) return ia - ib;
      }
      return a.flatIndex - b.flatIndex;
    });
  }

  return annotated.map((a) => a.data);
}

/**
 * Split list into equal-sized blocks (last block may be shorter). Does not wrap into label records.
 */
export function chunkItems<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) {
    out.push(items.slice(i, i + n));
  }
  return out;
}

/**
 * items → transformLocations → flatten (already flat) → chunkDataset → records for renderLabel.
 */
export function pipelineFlatLocationsToRepeaterRecords(
  items: Record<string, unknown>[],
  options: {
    mode: RackDatasetTransformMode;
    itemsPerLabel: number;
    datasetKey: string;
    columns?: number;
  }
): Record<string, unknown>[] {
  const flat = transformLocations(items, options.mode, options.columns);
  return chunkDataset(flat, options.itemsPerLabel, options.datasetKey);
}

/**
 * Dev sanity checks for 3×3, 5×5, uneven grid ordering. Returns true if all pass.
 * (Call from console or future test runner; not wired to app startup.)
 */
export function rackLabelDatasetSelfTest(): boolean {
  const mk = (level: number, position: number, id: string) =>
    ({ loc_name: id, level, position, segment_index: position - 1, level_index: level - 1 } as Record<string, unknown>);

  // 3×3 row-major source order scrambled
  const scrambled3 = [
    mk(1, 3, "1-3"),
    mk(2, 1, "2-1"),
    mk(1, 1, "1-1"),
    mk(3, 2, "3-2"),
    mk(2, 3, "2-3"),
    mk(1, 2, "1-2"),
    mk(3, 1, "3-1"),
    mk(2, 2, "2-2"),
    mk(3, 3, "3-3"),
  ];
  const rowOrder = transformLocations(scrambled3, "row").map((r) => r.loc_name);
  const expectRow = ["1-1", "1-2", "1-3", "2-1", "2-2", "2-3", "3-1", "3-2", "3-3"];
  if (JSON.stringify(rowOrder) !== JSON.stringify(expectRow)) return false;

  const colOrder = transformLocations(scrambled3, "column").map((r) => r.loc_name);
  const expectCol = ["1-1", "2-1", "3-1", "1-2", "2-2", "3-2", "1-3", "2-3", "3-3"];
  if (JSON.stringify(colOrder) !== JSON.stringify(expectCol)) return false;

  // Uneven: missing center cell
  const uneven = [mk(1, 1, "a"), mk(1, 2, "b"), mk(2, 1, "c") /* no 2-2 */];
  const uRow = transformLocations(uneven, "row").map((r) => r.loc_name);
  if (JSON.stringify(uRow) !== JSON.stringify(["a", "b", "c"])) return false;

  // Chunk 5×5 → 25 items into 5 per label = 5 records
  const many = Array.from({ length: 25 }, (_, i) => mk(Math.floor(i / 5) + 1, (i % 5) + 1, `r${i}`));
  const piped = pipelineFlatLocationsToRepeaterRecords(many, {
    mode: "row",
    itemsPerLabel: 5,
    datasetKey: "levels",
  });
  if (piped.length !== 5) return false;
  if (!Array.isArray(piped[0].levels) || (piped[0].levels as unknown[]).length !== 5) return false;

  const seq = transformLocations(scrambled3, "sequential").map((r) => r.loc_name);
  if (JSON.stringify(seq) !== JSON.stringify(scrambled3.map((r) => r.loc_name))) return false;

  const chunks = chunkItems([1, 2, 3, 4, 5], 2);
  if (chunks.length !== 3 || chunks[0].length !== 2 || chunks[2].length !== 1) return false;

  return true;
}
