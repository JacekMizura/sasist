import type { RackState } from "../../../types/warehouse";
import { cellToPx } from "../../../components/warehouse/renderUtils";
import {
  corridorSpecFromDrag,
  corridorWorldAabb,
  layoutCellCenterCm,
  worldCorridorToPassagesFromSpec,
  type WorldCorridorSpec,
} from "./rackPassageGeometry";

type Props = {
  racks: RackState[];
  passageDrawStart: { x: number; y: number } | null;
  passageDrawEnd: { x: number; y: number } | null;
  passageWidthCm: number;
  cellPx: number;
  shiftKey?: boolean;
};

export function PassageDrawPreview({
  racks,
  passageDrawStart,
  passageDrawEnd,
  passageWidthCm,
  cellPx,
  shiftKey = false,
}: Props) {
  if (!passageDrawStart || !passageDrawEnd) return null;

  const startCm = layoutCellCenterCm(passageDrawStart);
  const endCm = layoutCellCenterCm(passageDrawEnd);
  const spec: WorldCorridorSpec = corridorSpecFromDrag(startCm, endCm, passageWidthCm, {
    freeAngle: shiftKey,
  });
  const corridor = corridorWorldAabb(spec);
  const placements = worldCorridorToPassagesFromSpec(racks, spec);

  const x = (corridor.minX / 10) * cellPx;
  const y = (corridor.minY / 10) * cellPx;
  const w = ((corridor.maxX - corridor.minX) / 10) * cellPx;
  const h = ((corridor.maxY - corridor.minY) / 10) * cellPx;

  return (
    <g pointerEvents="none" aria-hidden>
      <rect
        x={x}
        y={y}
        width={Math.max(2, w)}
        height={Math.max(2, h)}
        fill="rgba(99,102,241,0.18)"
        stroke="#6366f1"
        strokeWidth={2}
        strokeDasharray="6 4"
        rx={3}
      />
      {placements.length > 0 && (
        <text
          x={x + w / 2}
          y={y - 6}
          textAnchor="middle"
          fill="#4338ca"
          fontSize={11}
          fontWeight={700}
        >
          {placements.length} regał{placements.length === 1 ? "" : placements.length < 5 ? "y" : "ów"}
        </text>
      )}
    </g>
  );
}

export function passagePreviewSpec(
  start: { x: number; y: number },
  end: { x: number; y: number },
  widthCm: number,
  shiftKey: boolean
): WorldCorridorSpec {
  return corridorSpecFromDrag(layoutCellCenterCm(start), layoutCellCenterCm(end), widthCm, {
    freeAngle: shiftKey,
  });
}

export function corridorRectPx(spec: WorldCorridorSpec, cellPx: number) {
  const corridor = corridorWorldAabb(spec);
  return {
    x: cellToPx(corridor.minX / 10, cellPx),
    y: cellToPx(corridor.minY / 10, cellPx),
    w: cellToPx((corridor.maxX - corridor.minX) / 10, cellPx),
    h: cellToPx((corridor.maxY - corridor.minY) / 10, cellPx),
  };
}
