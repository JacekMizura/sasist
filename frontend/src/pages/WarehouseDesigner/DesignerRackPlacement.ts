import type { LayoutState, RowContainer, EmptyRowSlot } from "../../types/warehouse";
import { cmToCells, cellsToCm } from "../../components/warehouse/warehouseUtils";

export const CELLS_PER_METER = 10;
export const BASE_PX_PER_CELL = 5;
export const GRID_COLS = 240;
export const GRID_ROWS = 160;
export const TENANT_ID = 1;
/** Default slot size (cells) for "Draw Row" when no template is selected. 120×80 cm. */
export const DEFAULT_ROW_SLOT_W = 12;
export const DEFAULT_ROW_SLOT_H = 8;

export function snapToGrid(val: number, gridStep: number = 1): number {
  return Math.round(val / gridStep) * gridStep;
}

/** Row start position (from first slot). Used to recompute slot positions. */
export function getRowStart(row: RowContainer): { x: number; y: number } {
  const first = row.slots[0];
  if (!first) return { x: 0, y: 0 };
  return { x: first.x, y: first.y };
}

/** Recompute slot x,y. Horizontal: x increases, y = startY. Vertical: x = startX, y increases. */
export function computeRowSlotPositions(
  slots: EmptyRowSlot[],
  startX: number,
  startY: number,
  orientation: "horizontal" | "vertical" = "horizontal"
): EmptyRowSlot[] {
  if (orientation === "vertical") {
    let y = startY;
    return slots.map((s) => {
      const out: EmptyRowSlot = { ...s, x: startX, y };
      y += s.h;
      return out;
    });
  }
  let x = startX;
  return slots.map((s) => {
    const out: EmptyRowSlot = { ...s, x, y: startY };
    x += s.w;
    return out;
  });
}

/** Bounding box of a row (from its slots) in cell coordinates. */
export function getRowBounds(rc: RowContainer): { x: number; y: number; w: number; h: number } | null {
  if (!rc.slots.length) return null;
  let minX = rc.slots[0]!.x, minY = rc.slots[0]!.y, maxX = rc.slots[0]!.x + rc.slots[0]!.w, maxY = rc.slots[0]!.y + rc.slots[0]!.h;
  for (const s of rc.slots) {
    minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const SNAP_DISTANCES_CM = [100, 200, 300];
const SNAP_DISTANCE_THRESHOLD_CM = 15;

/** Optionally snap row drag position so distance to nearest obstacle is 100/200/300 cm. */
export function snapRowPreviewToDistance(
  row: RowContainer,
  candidate: { x: number; y: number },
  layout: LayoutState
): { x: number; y: number } {
  const orient = row.orientation ?? "horizontal";
  let w = 0, h = 0;
  for (const s of row.slots) {
    if (orient === "horizontal") { w += s.w; h = Math.max(h, s.h); } else { w = Math.max(w, s.w); h += s.h; }
  }
  const sel = { x: candidate.x, y: candidate.y, w, h };
  const rows = layout.row_containers ?? [];
  const racks = layout.racks;
  const obstacles: Array<{ y0: number; y1: number; x0: number; x1: number }> = [];
  for (const rc of rows) {
    if (rc.id === row.id) continue;
    const b = getRowBounds(rc);
    if (b) obstacles.push({ y0: b.y, y1: b.y + b.h, x0: b.x, x1: b.x + b.w });
  }
  for (const r of racks) {
    const inRow = rows.some((rc) => rc.slots.some((s) => s.rackId === (r.id ?? r.rack_index)));
    if (inRow) continue;
    obstacles.push({ y0: r.y, y1: r.y + r.height, x0: r.x, x1: r.x + r.width });
  }
  const gridRows = layout.grid_rows;
  const gridCols = layout.grid_cols;
  if (orient === "horizontal") {
    const selTop = sel.y, selBottom = sel.y + sel.h;
    let nearestAbove = 0, nearestBelow = gridRows;
    for (const o of obstacles) {
      if (o.x1 <= sel.x || o.x0 >= sel.x + sel.w) continue;
      if (o.y1 <= selTop) nearestAbove = Math.max(nearestAbove, o.y1);
      if (o.y0 >= selBottom) nearestBelow = Math.min(nearestBelow, o.y0);
    }
    const distAboveCm = cellsToCm(selTop - nearestAbove);
    const distBelowCm = cellsToCm(nearestBelow - selBottom);
    for (const target of SNAP_DISTANCES_CM) {
      if (Math.abs(distAboveCm - target) <= SNAP_DISTANCE_THRESHOLD_CM) {
        const newY = nearestAbove + cmToCells(target);
        if (newY >= 0 && newY + sel.h <= gridRows) return { x: candidate.x, y: Math.round(newY) };
      }
      if (Math.abs(distBelowCm - target) <= SNAP_DISTANCE_THRESHOLD_CM) {
        const newY = nearestBelow - cmToCells(target) - sel.h;
        if (newY >= 0 && newY + sel.h <= gridRows) return { x: candidate.x, y: Math.round(newY) };
      }
    }
  } else {
    const selLeft = sel.x, selRight = sel.x + sel.w;
    let nearestLeft = 0, nearestRight = gridCols;
    for (const o of obstacles) {
      if (o.y1 <= sel.y || o.y0 >= sel.y + sel.h) continue;
      if (o.x1 <= selLeft) nearestLeft = Math.max(nearestLeft, o.x1);
      if (o.x0 >= selRight) nearestRight = Math.min(nearestRight, o.x0);
    }
    const distLeftCm = cellsToCm(selLeft - nearestLeft);
    const distRightCm = cellsToCm(nearestRight - selRight);
    for (const target of SNAP_DISTANCES_CM) {
      if (Math.abs(distLeftCm - target) <= SNAP_DISTANCE_THRESHOLD_CM) {
        const newX = nearestLeft + cmToCells(target);
        if (newX >= 0 && newX + sel.w <= gridCols) return { x: Math.round(newX), y: candidate.y };
      }
      if (Math.abs(distRightCm - target) <= SNAP_DISTANCE_THRESHOLD_CM) {
        const newX = nearestRight - cmToCells(target) - sel.w;
        if (newX >= 0 && newX + sel.w <= gridCols) return { x: Math.round(newX), y: candidate.y };
      }
    }
  }
  return candidate;
}

/** Remove row containers that have no racks (all slots empty). Prevents ghost rows. */
export function filterEmptyRowContainers(rows: RowContainer[] | undefined): RowContainer[] {
  if (!rows?.length) return [];
  return rows.filter((rc) => rc.slots.some((s) => s.rackId != null));
}

/** Find an empty slot (no rackId) that contains the given cell. Slots must have x,y set (e.g. via computeRowSlotPositions). */
export function findEmptySlotAt(
  rowContainers: RowContainer[] | undefined,
  cell: { x: number; y: number }
): { rowContainer: RowContainer; slotIndex: number; slot: EmptyRowSlot } | null {
  if (!rowContainers?.length) return null;
  for (const row of rowContainers) {
    for (let i = 0; i < row.slots.length; i++) {
      const s = row.slots[i]!;
      if (s.rackId != null) continue;
      if (cell.x >= s.x && cell.x < s.x + s.w && cell.y >= s.y && cell.y < s.y + s.h) return { rowContainer: row, slotIndex: i, slot: s };
    }
  }
  return null;
}

/** Find which row and slot index contain the given rack (by rackId). */
export function findRowAndSlotForRack(
  rowContainers: RowContainer[] | undefined,
  rackId: number | string
): { rowContainer: RowContainer; slotIndex: number } | null {
  if (!rowContainers?.length) return null;
  const id = String(rackId);
  for (const row of rowContainers) {
    for (let i = 0; i < row.slots.length; i++) {
      if (row.slots[i]?.rackId != null && String(row.slots[i].rackId) === id) return { rowContainer: row, slotIndex: i };
    }
  }
  return null;
}

export function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

/** Check if a set of rack positions (id -> {x,y}) is valid: in bounds, no overlap with non-group racks or row slots. */
export function canPlaceGroup(
  layout: LayoutState,
  groupIds: Set<number | string>,
  positions: Map<number | string, { x: number; y: number }>
): boolean {
  const gridCols = layout.grid_cols;
  const gridRows = layout.grid_rows;
  const otherRacks = layout.racks.filter((r) => !groupIds.has(r.id ?? r.rack_index));
  const rects: { rect: { x: number; y: number; width: number; height: number } }[] = [];
  for (const [id, pos] of positions) {
    const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === id);
    if (!rack) return false;
    const rect = { x: pos.x, y: pos.y, width: rack.width, height: rack.height };
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > gridCols || rect.y + rect.height > gridRows) return false;
    rects.push({ rect });
  }
  for (const { rect } of rects) {
    for (const r of otherRacks) {
      if (rectsOverlap(rect, { x: r.x, y: r.y, width: r.width, height: r.height })) return false;
    }
    for (const rc of layout.row_containers ?? []) {
      for (const s of rc.slots) {
        if (rectsOverlap(rect, { x: s.x, y: s.y, width: s.w, height: s.h })) return false;
      }
    }
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i]!.rect, rects[j]!.rect)) return false;
    }
  }
  return true;
}

const API_BASE_FOR_IMAGES = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? undefined;

/** Parse numeric value (volume dm³ or quantity); accepts comma as decimal separator. */
export function safeVolumeDm3(v: unknown): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
/** Parse quantity (szt.); accepts comma as decimal separator. */
export function safeQuantity(v: unknown): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Resolve product image URL: support image_url, imageUrl; semicolon-separated → first. Relative paths (e.g. /uploads/x) get API base prepended when VITE_API_URL is set. */
export function getProductImageUrl(p: { image_url?: string | null; imageUrl?: string | null }): string | null {
  const raw = (p.image_url ?? (p as { imageUrl?: string }).imageUrl ?? "").trim();
  if (!raw) return null;
  const first = raw.split(";").map((s) => s.trim()).find(Boolean) ?? null;
  if (!first) return null;
  if (first.startsWith("/") && API_BASE_FOR_IMAGES) return API_BASE_FOR_IMAGES.replace(/\/$/, "") + first;
  return first;
}

/** Aisle width in cm for "magnetic" snap (new row exactly this distance from existing rack/row) */
export const DEFAULT_AISLE_WIDTH_CM = 250;

/** Snap position to 10cm grid, warehouse walls, existing racks, and aisle-width offset (magnetic edges) */
export function snapPosition(
  desired: { x: number; y: number },
  ghostW: number,
  ghostH: number,
  racks: { x: number; y: number; width: number; height: number }[],
  gridCols: number,
  gridRows: number,
  aisleWidthCm: number = DEFAULT_AISLE_WIDTH_CM
): { x: number; y: number } {
  const aisleCells = cmToCells(aisleWidthCm);
  const candX = new Set<number>([0, gridCols - ghostW, snapToGrid(desired.x)]);
  const candY = new Set<number>([0, gridRows - ghostH, snapToGrid(desired.y)]);
  racks.forEach((r) => {
    candX.add(r.x);
    candX.add(r.x + r.width);
    candX.add(Math.max(0, r.x - ghostW));
    candX.add(Math.min(gridCols - ghostW, r.x + r.width));
    candX.add(Math.max(0, r.x + r.width + aisleCells));
    candX.add(Math.min(gridCols - ghostW, r.x - ghostW - aisleCells));
  });
  racks.forEach((r) => {
    candY.add(r.y);
    candY.add(r.y + r.height);
    candY.add(Math.max(0, r.y - ghostH));
    candY.add(Math.min(gridRows - ghostH, r.y + r.height));
    candY.add(Math.max(0, r.y + r.height + aisleCells));
    candY.add(Math.min(gridRows - ghostH, r.y - ghostH - aisleCells));
  });
  let best = { x: Math.max(0, Math.min(gridCols - ghostW, snapToGrid(desired.x))), y: Math.max(0, Math.min(gridRows - ghostH, snapToGrid(desired.y))) };
  let bestDist = Infinity;
  const otherRacks = racks;
  for (const x of candX) {
    for (const y of candY) {
      const xx = Math.max(0, Math.min(gridCols - ghostW, x));
      const yy = Math.max(0, Math.min(gridRows - ghostH, y));
      const overlaps = otherRacks.some((r) => rectsOverlap({ x: xx, y: yy, width: ghostW, height: ghostH }, r));
      if (overlaps) continue;
      const dist = (desired.x - xx) ** 2 + (desired.y - yy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: xx, y: yy };
      }
    }
  }
  return best;
}
