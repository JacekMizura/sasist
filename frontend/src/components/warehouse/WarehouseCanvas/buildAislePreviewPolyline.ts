import type { AisleState } from "../../../types/warehouse";

export type PreviewPathPoint = { x: number; y: number };

function dist(a: PreviewPathPoint, b: PreviewPathPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function aisleCenter(a: AisleState): PreviewPathPoint {
  return { x: a.x + a.width / 2, y: a.y + a.height / 2 };
}

/**
 * Visual-only Magazyn tour: nearest-neighbor through aisle centers, orthogonal corners.
 * Does not mutate layout / racks / aisles.
 */
export function buildAislePreviewPolyline(
  aisles: AisleState[],
  startCell?: PreviewPathPoint | null,
): PreviewPathPoint[] {
  if (!aisles.length) return [];

  const centers = aisles.map(aisleCenter);
  const remaining = centers.map((c, i) => ({ c, i }));
  const ordered: PreviewPathPoint[] = [];

  let current: PreviewPathPoint =
    startCell && Number.isFinite(startCell.x) && Number.isFinite(startCell.y)
      ? startCell
      : centers.reduce((best, p) => (p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best), centers[0]);

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = dist(current, remaining[i].c);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0].c;
    if (ordered.length === 0 || dist(ordered[ordered.length - 1], next) > 1e-6) {
      ordered.push(next);
    }
    current = next;
  }

  if (ordered.length < 2) return ordered;

  // Orthogonal corners between consecutive centers (stay corridor-like; no rack cuts).
  const withCorners: PreviewPathPoint[] = [ordered[0]];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = withCorners[withCorners.length - 1];
    const next = ordered[i];
    if (Math.abs(prev.x - next.x) > 1e-6 && Math.abs(prev.y - next.y) > 1e-6) {
      withCorners.push({ x: next.x, y: prev.y });
    }
    withCorners.push(next);
  }
  return withCorners;
}

export function previewPathToSvgPoints(points: PreviewPathPoint[], cellPx: number): string {
  return points
    .map((p) => {
      const x = p.x * cellPx + cellPx / 2;
      const y = p.y * cellPx + cellPx / 2;
      return `${x},${y}`;
    })
    .join(" ");
}

export function previewPathArrows(
  points: PreviewPathPoint[],
  cellPx: number,
): { x: number; y: number; angleDeg: number }[] {
  if (points.length < 2) return [];
  const px = points.map((p) => ({ x: p.x * cellPx + cellPx / 2, y: p.y * cellPx + cellPx / 2 }));
  const arrows: { x: number; y: number; angleDeg: number }[] = [];
  for (let i = 0; i < px.length - 1; i += 1) {
    const a = px[i];
    const b = px[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 14) continue;
    arrows.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    });
  }
  return arrows;
}
