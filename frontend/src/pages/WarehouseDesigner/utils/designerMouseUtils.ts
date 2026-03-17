/**
 * Pure utilities for designer mouse handling. No React, no refs.
 */

/** Client coords + SVG rect + grid size → grid cell { x, y }. */
export function getCellFromClientPosition(
  clientX: number,
  clientY: number,
  svgRect: DOMRect,
  gridCols: number,
  gridRows: number
): { x: number; y: number } {
  const col = (clientX - svgRect.left) / svgRect.width * gridCols;
  const row = (clientY - svgRect.top) / svgRect.height * gridRows;
  const x = Math.max(0, Math.min(gridCols - 1, Math.round(col)));
  const y = Math.max(0, Math.min(gridRows - 1, Math.round(row)));
  return { x, y };
}

/** Marquee box from start/end points. */
export function computeMarqueeBox(
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x0: number; y0: number; x1: number; y1: number; hasExtent: boolean } {
  const x0 = Math.min(start.x, end.x);
  const y0 = Math.min(start.y, end.y);
  const x1 = Math.max(start.x, end.x);
  const y1 = Math.max(start.y, end.y);
  const hasExtent = start.x !== end.x || start.y !== end.y;
  return { x0, y0, x1, y1, hasExtent };
}

/** Rect-like shape (rack, aisle, visual). */
export type RectLike = { x: number; y: number; width: number; height: number };

/** True if cell is inside the given rect (rack/aisle/visual). */
export function isCellInsideRack(cell: { x: number; y: number }, rack: RectLike): boolean {
  return (
    cell.x >= rack.x &&
    cell.x < rack.x + rack.width &&
    cell.y >= rack.y &&
    cell.y < rack.y + rack.height
  );
}

const WALL_HIT_BAND_PX = 18;

export type WallHit = {
  wall: "north" | "south" | "east" | "west";
  position_cm: number;
};

/** Client coords + SVG rect + canvas size and grid → wall hit or null. */
export function getWallFromClientPosition(
  clientX: number,
  clientY: number,
  svgRect: DOMRect,
  widthPx: number,
  heightPx: number,
  gridCols: number,
  gridRows: number,
  gridUnitCm: number
): WallHit | null {
  const localX = ((clientX - svgRect.left) / svgRect.width) * widthPx;
  const localY = ((clientY - svgRect.top) / svgRect.height) * heightPx;
  if (localY <= WALL_HIT_BAND_PX) {
    const position_cm = (localX / widthPx) * gridCols * gridUnitCm;
    return { wall: "north", position_cm };
  }
  if (localY >= heightPx - WALL_HIT_BAND_PX) {
    const position_cm = (localX / widthPx) * gridCols * gridUnitCm;
    return { wall: "south", position_cm };
  }
  if (localX <= WALL_HIT_BAND_PX) {
    const position_cm = (localY / heightPx) * gridRows * gridUnitCm;
    return { wall: "west", position_cm };
  }
  if (localX >= widthPx - WALL_HIT_BAND_PX) {
    const position_cm = (localY / heightPx) * gridRows * gridUnitCm;
    return { wall: "east", position_cm };
  }
  return null;
}

/** Client coords + SVG rect + canvas size and grid + fixed wall → position_cm along that wall (for drag). */
export function getPositionCmAlongWall(
  clientX: number,
  clientY: number,
  wall: "north" | "south" | "east" | "west",
  svgRect: DOMRect,
  widthPx: number,
  heightPx: number,
  gridCols: number,
  gridRows: number,
  gridUnitCm: number
): number {
  const localX = ((clientX - svgRect.left) / svgRect.width) * widthPx;
  const localY = ((clientY - svgRect.top) / svgRect.height) * heightPx;
  if (wall === "north" || wall === "south") {
    return (localX / widthPx) * gridCols * gridUnitCm;
  }
  return (localY / heightPx) * gridRows * gridUnitCm;
}

/** Pan delta from pointer event and previous pan start. */
export function computePanDelta(
  event: { clientX: number; clientY: number; movementX?: number; movementY?: number },
  panStart: { x: number; y: number } | null
): { movX: number; movY: number } {
  const movX =
    typeof event.movementX === "number"
      ? event.movementX
      : panStart
        ? event.clientX - panStart.x
        : 0;
  const movY =
    typeof event.movementY === "number"
      ? event.movementY
      : panStart
        ? event.clientY - panStart.y
        : 0;
  return { movX, movY };
}
