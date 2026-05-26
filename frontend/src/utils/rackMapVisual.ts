import type { RackState } from "../types/warehouse";

/**
 * Rack footprint in layout space: integer grid cells × fixed cell px only.
 * No physical scaling, no zoom-based minimums.
 */
export function getRackFootprintPixelBounds(
  drawAt: { x: number; y: number },
  rack: RackState,
  cellPx: number
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = drawAt.x * cellPx;
  const y0 = drawAt.y * cellPx;
  const wPx = rack.width * cellPx;
  const hPx = rack.height * cellPx;
  return {
    x0,
    y0,
    x1: x0 + wPx,
    y1: y0 + hPx,
  };
}

export function clampRackRectLayout(
  drawAt: { x: number; y: number },
  rack: RackState,
  cellPx: number
): {
  rectX: number;
  rectY: number;
  rectW: number;
  rectH: number;
  cx: number;
  cy: number;
} {
  const b = getRackFootprintPixelBounds(drawAt, rack, cellPx);
  const rectX = b.x0 + 1;
  const rectY = b.y0 + 1;
  const rectW = Math.max(b.x1 - b.x0 - 2, 1);
  const rectH = Math.max(b.y1 - b.y0 - 2, 1);
  return {
    rectX,
    rectY,
    rectW,
    rectH,
    cx: rectX + rectW / 2,
    cy: rectY + rectH / 2,
  };
}
