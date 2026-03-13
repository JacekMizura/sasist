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
