import { GRID_UNIT_CM } from "../../types/warehouse";
import type { LayoutState, RackState } from "../../types/warehouse";

/** Offset into the aisle in grid cells (path should not sit on rack edge). */
export const RACK_ACCESS_AISLE_OFFSET_CELLS = 0.45;

/**
 * Horizontal footprint: long side along X → access in front (south): below rack in grid coords.
 * Vertical footprint: long side along Y → access in front (east): right of rack.
 */
export function isRackFootprintHorizontal(rack: RackState): boolean {
  return rack.width >= rack.height;
}

/** True = pick below rack center (horizontal aisle in +Y); false = pick left of rack (−X). Uses `orientation` when set. */
export function isRackPickHorizontal(rack: RackState): boolean {
  const o = typeof rack.orientation === "string" ? rack.orientation.toLowerCase() : "";
  if (o === "horizontal") return true;
  if (o === "vertical") return false;
  return isRackFootprintHorizontal(rack);
}

/** Half user aisle width in cells (not rounded) for pick offset from rack face. */
export function aisleHalfWidthCellsFromCm(aisleWidthCm: number): number {
  return Math.max(0.15, aisleWidthCm / (2 * GRID_UNIT_CM));
}

/**
 * Pick point in front of the rack (aisle side), grid cell coords — used for route graph + badges.
 * Horizontal: center X, Y = bottom + half aisle width. Vertical: X = left face − half aisle, center Y.
 */
export function getRackPickPointCell(rack: RackState, aisleHalfWidthCells: number): { x: number; y: number } {
  const cx = rack.x + rack.width / 2;
  const cy = rack.y + rack.height / 2;
  const off = aisleHalfWidthCells;
  if (isRackPickHorizontal(rack)) {
    return { x: cx, y: rack.y + rack.height + off };
  }
  return { x: rack.x - off, y: cy };
}

/**
 * Picking access point in front of the rack (aisle side), in grid cell coordinates.
 */
export function getRackAccessPointCell(rack: RackState, aisleOffsetCells = RACK_ACCESS_AISLE_OFFSET_CELLS): { x: number; y: number } {
  if (isRackFootprintHorizontal(rack)) {
    return {
      x: rack.x + rack.width / 2,
      y: rack.y + rack.height + aisleOffsetCells,
    };
  }
  return {
    x: rack.x + rack.width + aisleOffsetCells,
    y: rack.y + rack.height / 2,
  };
}

export function collectPackingCentersCells(
  layout: LayoutState,
  specialPackingCm: { x: number; y: number } | null | undefined
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (specialPackingCm && Number.isFinite(specialPackingCm.x) && Number.isFinite(specialPackingCm.y)) {
    out.push({ x: specialPackingCm.x / GRID_UNIT_CM, y: specialPackingCm.y / GRID_UNIT_CM });
  }
  for (const ve of layout.visual_elements ?? []) {
    if (ve.type === "packing_station" && ve.width > 0 && ve.height > 0) {
      out.push({ x: ve.x + ve.width / 2, y: ve.y + ve.height / 2 });
    }
  }
  return out;
}

/** Nearest packing center to a reference point (e.g. last rack access), in cell coords. */
export function pickNearestPackingCell(
  from: { x: number; y: number },
  candidates: { x: number; y: number }[]
): { x: number; y: number } | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestD = Infinity;
  for (const c of candidates) {
    const d = (c.x - from.x) ** 2 + (c.y - from.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
