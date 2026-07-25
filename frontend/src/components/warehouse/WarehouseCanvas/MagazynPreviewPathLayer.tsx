import { useMemo } from "react";
import type { AisleState } from "../../../types/warehouse";
import {
  buildAislePreviewPolyline,
  previewPathArrows,
  previewPathToSvgPoints,
  type PreviewPathPoint,
} from "./buildAislePreviewPolyline";

type Props = {
  aisles: AisleState[];
  cellPx: number;
  startCell?: PreviewPathPoint | null;
};

/**
 * Magazyn-only visual overlay: thin green operator preview along aisle centers.
 * Does not affect rack geometry or aisle data.
 */
export function MagazynPreviewPathLayer({ aisles, cellPx, startCell }: Props) {
  const points = useMemo(() => buildAislePreviewPolyline(aisles, startCell), [aisles, startCell]);
  const poly = useMemo(() => previewPathToSvgPoints(points, cellPx), [points, cellPx]);
  const arrows = useMemo(() => previewPathArrows(points, cellPx), [points, cellPx]);

  if (points.length < 2) return null;

  return (
    <g pointerEvents="none" aria-hidden>
      <polyline
        points={poly}
        fill="none"
        stroke="rgba(16, 185, 129, 0.55)"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {arrows.map((a, i) => (
        <polygon
          key={`magazyn-preview-arrow-${i}`}
          points="0,-3.5 8,0 0,3.5"
          fill="rgba(5, 150, 105, 0.7)"
          transform={`translate(${a.x},${a.y}) rotate(${a.angleDeg})`}
        />
      ))}
    </g>
  );
}
