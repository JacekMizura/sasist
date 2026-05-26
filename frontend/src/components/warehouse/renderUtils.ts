/**
 * Shared helpers for converting grid cell coordinates to pixel coordinates.
 * Rule: 1 grid cell = 10 cm (GRID_UNIT_CM). All layout coordinates are in cells.
 */

/** Fixed CSS px per grid cell on the warehouse map SVG (single source; no viewport scaling). */
export const WAREHOUSE_CANVAS_CELL_PX = 14;

/** Convert a single cell coordinate to pixels. */
export function cellToPx(cell: number, cellPx: number): number {
  return cell * cellPx;
}

/** Convert a rect in cell coordinates (x, y, w, h) to pixel rect. */
export function rectCellsToPx(
  x: number,
  y: number,
  w: number,
  h: number,
  cellPx: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: x * cellPx,
    y: y * cellPx,
    width: w * cellPx,
    height: h * cellPx,
  };
}
