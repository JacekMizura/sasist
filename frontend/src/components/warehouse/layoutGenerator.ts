/**
 * Warehouse Layout Generator – creates multiple racks from a template in a grid.
 * Reuses createBinsForRack and the same RackState shape as drag-and-drop placement.
 */

import type { RackState, RowContainer, LevelConfigItem } from "../../types/warehouse";
import {
  createBinsForRack,
  getLevelConfig,
  getTotalLocations,
  volumePerBinFromTotal,
  cmToCells,
  binsToLevels,
  ROW_LABEL_ADDRESS_PATTERN,
} from "./warehouseUtils";

/** Template spec passed to the generator (same shape as getCatalogItemSpec result + templateId). */
export type LayoutGeneratorTemplate = {
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
  binNamingType?: "numeric" | "alpha";
  reserve_bin_keys?: string[];
  levelConfig?: LevelConfigItem[];
  namingStrategy?: "pattern" | "rack-index" | "custom" | "manual";
  namingOrientation?: "column-first" | "row-first";
  namingPattern?: string;
  manualLabels?: Record<string, string>;
  overrides?: Record<string, string>;
  indexPadding?: number;
  startIndex?: number;
  templateId?: string;
};

export type LayoutGeneratorConfig = {
  template: LayoutGeneratorTemplate;
  rows: number;
  columns: number;
  rackSpacingCm: number;
  aisleWidthCm: number;
  orientation: "horizontal" | "vertical";
  startX: number;
  startY: number;
  startRowPrefix: string;
  /** Base rack_index for first generated rack (e.g. existingRackCount + 1 when appending). */
  baseRackIndex?: number;
  /** When set, racks that would extend past these bounds are not placed (building limit). */
  maxCols?: number;
  maxRows?: number;
};

export type LayoutGeneratorResult = {
  racks: RackState[];
  row_containers?: RowContainer[];
  /** True when some racks were skipped because they would exceed maxCols/maxRows. */
  truncated?: boolean;
};

/** Next row letter from start prefix and row index. E.g. startRowPrefix "A", row 0 → "A"; row 1 → "B". */
export function nextRowLetter(startRowPrefix: string, rowIndex: number): string {
  const base = (startRowPrefix || "A").trim().toUpperCase();
  if (base.length === 0) return String.fromCharCode(65 + (rowIndex % 26));
  const code = base.charCodeAt(0);
  if (code >= 65 && code <= 90) return String.fromCharCode(65 + ((code - 65 + rowIndex) % 26));
  return String.fromCharCode(65 + (rowIndex % 26));
}

/** Check if two axis-aligned rectangles overlap (in cell coordinates). */
export function rectanglesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Check if any of the given racks overlap with any rack in existingRacks. */
export function hasOverlapWithRacks(
  newRacks: { x: number; y: number; width: number; height: number }[],
  existingRacks: { x: number; y: number; width: number; height: number }[]
): boolean {
  for (const a of newRacks) {
    for (const b of existingRacks) {
      if (rectanglesOverlap(a, b)) return true;
    }
  }
  return false;
}

/**
 * Build a single RackState from a template spec at the given position.
 * Reuses createBinsForRack; sets name, rowPrefix, indexInRow.
 */
export function buildRackFromTemplate(
  template: LayoutGeneratorTemplate,
  x: number,
  y: number,
  rackIndex: number,
  rackLabel: string,
  rowPrefix: string,
  indexInRow: number,
  orientation: "horizontal" | "vertical"
): RackState {
  const lc = getLevelConfig(template);
  const totalBins = getTotalLocations(lc);
  const volPerBin =
    totalBins > 0
      ? volumePerBinFromTotal(template.width_cm, template.depth_cm, template.height_cm, totalBins)
      : 0;

  const bins = createBinsForRack(
    template.aisle_letter,
    rackIndex,
    template.levels,
    template.bins_per_level,
    volPerBin,
    "M1",
    template.naming_pattern,
    template.width_cm,
    template.depth_cm,
    template.height_cm,
    template.reserve_bin_keys,
    template.addressPattern ?? ROW_LABEL_ADDRESS_PATTERN,
    rackLabel,
    template.sectionStartIndex ?? 1,
    template.binNamingType ?? "numeric",
    lc,
    template.namingStrategy,
    template.namingOrientation,
    template.namingPattern ?? template.addressPattern,
    template.manualLabels,
    template.overrides,
    template.indexPadding,
    template.startIndex
  );

  const rackW = cmToCells(template.width_cm);
  const rackH = cmToCells(template.depth_cm);
  const width = orientation === "horizontal" ? rackW : rackH;
  const height = orientation === "horizontal" ? rackH : rackW;

  return {
    x,
    y,
    width,
    height,
    orientation: orientation === "horizontal" ? "vertical" : "vertical",
    levels: template.levels,
    bins_per_level: template.bins_per_level,
    levelConfig: lc,
    length_cm: template.depth_cm,
    width_cm: template.width_cm,
    height_cm: template.height_cm,
    aisle_letter: template.aisle_letter,
    rack_index: rackIndex,
    bins,
    rackLevels: binsToLevels(bins),
    color: template.color ?? "#3b82f6",
    name: rackLabel,
    rowPrefix,
    indexInRow,
    addressPattern: template.addressPattern,
    sectionStartIndex: template.sectionStartIndex,
    binNamingType: template.binNamingType,
    templateId: template.templateId,
  } as RackState;
}

/**
 * Generate a grid of racks from a template.
 * Horizontal: rows increase Y, columns increase X.
 * Vertical: rows increase X, columns increase Y.
 * 1 grid cell = 10 cm (cmToCells).
 */
export function generateWarehouseLayout(config: LayoutGeneratorConfig): LayoutGeneratorResult {
  const {
    template,
    rows,
    columns,
    rackSpacingCm,
    aisleWidthCm,
    orientation,
    startX,
    startY,
    startRowPrefix,
    baseRackIndex = 1,
    maxCols,
    maxRows,
  } = config;

  const rackW = cmToCells(template.width_cm);
  const rackH = cmToCells(template.depth_cm);
  const spacingCells = Math.max(0, cmToCells(rackSpacingCm));
  const aisleCells = Math.max(0, cmToCells(aisleWidthCm));

  const racks: RackState[] = [];
  const rowContainers: RowContainer[] = [];
  let truncated = false;

  if (orientation === "horizontal") {
    const stepW = rackW + spacingCells;
    const stepH = rackH + aisleCells;
    for (let r = 0; r < rows; r++) {
      const rowPrefix = nextRowLetter(startRowPrefix, r);
      const slots: RowContainer["slots"] = [];
      const y = startY + r * stepH;
      if (maxRows != null && y + rackH > maxRows) {
        truncated = true;
        break;
      }
      for (let c = 0; c < columns; c++) {
        const x = startX + c * stepW;
        if (maxCols != null && x + rackW > maxCols) {
          truncated = true;
          break;
        }
        const rackIndex = baseRackIndex + r * columns + c;
        const rackLabel = `${rowPrefix}${c + 1}`;
        const rack = buildRackFromTemplate(
          template,
          x,
          y,
          rackIndex,
          rackLabel,
          rowPrefix,
          c + 1,
          "horizontal"
        );
        racks.push(rack);
        slots.push({ x, y, w: rackW, h: rackH, rackId: rackIndex });
      }
      if (slots.length > 0) {
        rowContainers.push({
          id: `row-gen-${r}-${Date.now()}`,
          rowPrefix,
          orientation: "horizontal",
          slots,
        });
      }
    }
  } else {
    const stepInRow = rackH + spacingCells;
    const stepBetweenRows = rackW + aisleCells;
    for (let r = 0; r < rows; r++) {
      const rowPrefix = nextRowLetter(startRowPrefix, r);
      const slots: RowContainer["slots"] = [];
      const x = startX + r * stepBetweenRows;
      if (maxCols != null && x + rackW > maxCols) {
        truncated = true;
        break;
      }
      for (let c = 0; c < columns; c++) {
        const y = startY + c * stepInRow;
        if (maxRows != null && y + rackH > maxRows) {
          truncated = true;
          break;
        }
        const rackIndex = baseRackIndex + r * columns + c;
        const rackLabel = `${rowPrefix}${c + 1}`;
        const rack = buildRackFromTemplate(
          template,
          x,
          y,
          rackIndex,
          rackLabel,
          rowPrefix,
          c + 1,
          "vertical"
        );
        racks.push(rack);
        slots.push({ x, y, w: rackW, h: rackH, rackId: rackIndex });
      }
      if (slots.length > 0) {
        rowContainers.push({
          id: `row-gen-${r}-${Date.now()}`,
          rowPrefix,
          orientation: "vertical",
          slots,
        });
      }
    }
  }

  return { racks, row_containers: rowContainers, truncated: truncated || undefined };
}

/** Preview labels only (no real racks). Returns 2D array of rack labels. */
export function getPreviewLabels(
  rows: number,
  columns: number,
  startRowPrefix: string
): string[][] {
  const grid: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const rowPrefix = nextRowLetter(startRowPrefix, r);
    const row: string[] = [];
    for (let c = 0; c < columns; c++) row.push(`${rowPrefix}${c + 1}`);
    grid.push(row);
  }
  return grid;
}
