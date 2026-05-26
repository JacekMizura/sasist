/**
 * Pure utilities for designer mouse handling. No React, no refs.
 */

/** Client coords + SVG rect + grid size → grid cell { x, y }. Fallback when CTM is unavailable. */
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

/**
 * Screen (client) coordinates → SVG user space (viewBox units) using the SVG
 * screen CTM. Includes ancestor CSS transforms (pan/zoom on parent).
 */
export function clientToSvgUserPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

function svgLayoutSizeFromElement(svg: SVGSVGElement): { widthPx: number; heightPx: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { widthPx: vb.width, heightPx: vb.height };
  }
  return { widthPx: svg.clientWidth, heightPx: svg.clientHeight };
}

/**
 * Map client coords to grid cells using `#warehouse-canvas` SVG CTM (scale + translate
 * from pan/zoom). Falls back to bounding-rect mapping only if CTM is missing.
 */
export function getCellFromWarehouseLayoutSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  gridCols: number,
  gridRows: number
): { x: number; y: number } {
  const { widthPx, heightPx } = svgLayoutSizeFromElement(svg);
  const local = clientToSvgUserPoint(svg, clientX, clientY);
  if (local && widthPx > 0 && heightPx > 0) {
    const col = (local.x / widthPx) * gridCols;
    const row = (local.y / heightPx) * gridRows;
    const x = Math.max(0, Math.min(gridCols - 1, Math.round(col)));
    const y = Math.max(0, Math.min(gridRows - 1, Math.round(row)));
    return { x, y };
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return getCellFromClientPosition(clientX, clientY, rect, gridCols, gridRows);
  }
  const layer = svg.parentElement instanceof HTMLElement ? svg.parentElement : svg;
  const layerRect = layer.getBoundingClientRect();
  return getCellFromClientPosition(clientX, clientY, layerRect, gridCols, gridRows);
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

/**
 * Hit-test racks at a grid cell. SVG paints `racks` in array order (earlier = underneath),
 * so when footprints overlap the visually top rack must win — use a reverse pass.
 */
export function pickRackAtCell<T extends RectLike>(racks: readonly T[], cell: { x: number; y: number }): T | undefined {
  for (let i = racks.length - 1; i >= 0; i--) {
    const r = racks[i];
    if (isCellInsideRack(cell, r)) return r;
  }
  return undefined;
}

const WALL_HIT_BAND_PX = 18;

export type WallHit = {
  wall: "north" | "south" | "east" | "west";
  position_cm: number;
};

function wallHitFromSvgLocal(
  localX: number,
  localY: number,
  widthPx: number,
  heightPx: number,
  gridCols: number,
  gridRows: number,
  gridUnitCm: number
): WallHit | null {
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

/** Client coords + warehouse SVG CTM + canvas size and grid → wall hit or null. */
export function getWallFromClientPosition(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  widthPx: number,
  heightPx: number,
  gridCols: number,
  gridRows: number,
  gridUnitCm: number
): WallHit | null {
  const local = clientToSvgUserPoint(svg, clientX, clientY);
  if (local) {
    return wallHitFromSvgLocal(local.x, local.y, widthPx, heightPx, gridCols, gridRows, gridUnitCm);
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const localX = ((clientX - rect.left) / rect.width) * widthPx;
  const localY = ((clientY - rect.top) / rect.height) * heightPx;
  return wallHitFromSvgLocal(localX, localY, widthPx, heightPx, gridCols, gridRows, gridUnitCm);
}

/** Client coords + SVG CTM + canvas size and grid + fixed wall → position_cm along that wall (for drag). */
export function getPositionCmAlongWall(
  clientX: number,
  clientY: number,
  wall: "north" | "south" | "east" | "west",
  svg: SVGSVGElement,
  widthPx: number,
  heightPx: number,
  gridCols: number,
  gridRows: number,
  gridUnitCm: number
): number {
  const local = clientToSvgUserPoint(svg, clientX, clientY);
  let localX: number;
  let localY: number;
  if (local) {
    localX = local.x;
    localY = local.y;
  } else {
    const rect = svg.getBoundingClientRect();
    localX = ((clientX - rect.left) / rect.width) * widthPx;
    localY = ((clientY - rect.top) / rect.height) * heightPx;
  }
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

/** Logical layout size in px from an SVG element (viewBox preferred). */
export function getSvgLayoutSizePx(svg: SVGSVGElement, fallbackWidthPx: number, fallbackHeightPx: number): {
  widthPx: number;
  heightPx: number;
} {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { widthPx: vb.width, heightPx: vb.height };
  }
  return { widthPx: fallbackWidthPx, heightPx: fallbackHeightPx };
}
