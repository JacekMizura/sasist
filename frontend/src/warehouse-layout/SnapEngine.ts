/**
 * Smart snap: grid, objects, axis. Logic only; no rendering.
 */

export type SnapConfig = {
  snapToGrid: boolean;
  snapToObjects: boolean;
  snapToAxis: boolean;
  gridStep?: number;
  /** Distance (same units as positions) within which to snap */
  snapThreshold?: number;
};

export type Rect = { x: number; y: number; width: number; height: number };

export type SnapResult = {
  x: number;
  y: number;
  /** Which snap applied (for guides) */
  snappedX?: boolean;
  snappedY?: boolean;
  guideLines?: Array<{ axis: "x" | "y"; value: number; start: number; end: number }>;
};

const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_GRID_STEP = 1;

/**
 * Snap a point to grid, then optionally to object edges and axis alignment.
 */
export function snapPosition(
  desired: { x: number; y: number },
  config: SnapConfig,
  bounds: { gridCols: number; gridRows: number },
  excludeRects: Rect[] = [],
  movingRect?: Rect
): SnapResult {
  let x = desired.x;
  let y = desired.y;
  let snappedX = false;
  let snappedY = false;
  const guideLines: Array<{ axis: "x" | "y"; value: number; start: number; end: number }> = [];
  const threshold = config.snapThreshold ?? DEFAULT_THRESHOLD;
  const gridStep = config.gridStep ?? DEFAULT_GRID_STEP;

  if (config.snapToGrid) {
    x = Math.round(x / gridStep) * gridStep;
    y = Math.round(y / gridStep) * gridStep;
    snappedX = true;
    snappedY = true;
  }

  if (config.snapToObjects && movingRect && excludeRects.length > 0) {
    const movingLeft = x;
    const movingRight = x + movingRect.width;
    const movingTop = y;
    const movingBottom = y + movingRect.height;
    for (const r of excludeRects) {
      for (const ex of [r.x, r.x + r.width]) {
        if (Math.abs(movingLeft - ex) <= threshold) {
          x = ex;
          snappedX = true;
          guideLines.push({ axis: "x", value: ex, start: Math.min(y, r.y), end: Math.max(y + movingRect.height, r.y + r.height) });
        }
        if (Math.abs(movingRight - ex) <= threshold) {
          x = ex - movingRect.width;
          snappedX = true;
          guideLines.push({ axis: "x", value: ex, start: Math.min(y, r.y), end: Math.max(y + movingRect.height, r.y + r.height) });
        }
      }
      for (const ey of [r.y, r.y + r.height]) {
        if (Math.abs(movingTop - ey) <= threshold) {
          y = ey;
          snappedY = true;
          guideLines.push({ axis: "y", value: ey, start: Math.min(x, r.x), end: Math.max(x + movingRect.width, r.x + r.width) });
        }
        if (Math.abs(movingBottom - ey) <= threshold) {
          y = ey - movingRect.height;
          snappedY = true;
          guideLines.push({ axis: "y", value: ey, start: Math.min(x, r.x), end: Math.max(x + movingRect.width, r.x + r.width) });
        }
      }
    }
  }

  if (config.snapToAxis && movingRect && excludeRects.length > 0) {
    const alignX = excludeRects.some((r) => Math.abs((r.x + r.width / 2) - (x + movingRect.width / 2)) <= threshold);
    const alignY = excludeRects.some((r) => Math.abs((r.y + r.height / 2) - (y + movingRect.height / 2)) <= threshold);
    if (alignX && !snappedX) {
      const cx = excludeRects[0]!.x + excludeRects[0]!.width / 2;
      x = cx - movingRect.width / 2;
      snappedX = true;
    }
    if (alignY && !snappedY) {
      const cy = excludeRects[0]!.y + excludeRects[0]!.height / 2;
      y = cy - movingRect.height / 2;
      snappedY = true;
    }
  }

  x = Math.max(0, Math.min(bounds.gridCols - (movingRect?.width ?? 0), x));
  y = Math.max(0, Math.min(bounds.gridRows - (movingRect?.height ?? 0), y));

  return {
    x,
    y,
    snappedX: snappedX || undefined,
    snappedY: snappedY || undefined,
    guideLines: guideLines.length > 0 ? guideLines : undefined,
  };
}
