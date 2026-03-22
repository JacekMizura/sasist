import React from "react";
import type { WallElement, WallSide } from "../../../types/warehouse";
import { GRID_UNIT_CM } from "../../../types/warehouse";

const BAND_PX = 14; // height/width of door/gate symbol band on the edge

export type WallElementsLayerProps = {
  wallElements: WallElement[];
  gridCols: number;
  gridRows: number;
  cellPx: number;
  widthPx: number;
  heightPx: number;
  selectedWallElementId: string | null;
  draggingWallElementId: string | null;
  dragPreviewPositionCm: number | null;
  onSelect: (id: string | null) => void;
  onPointerDown?: (e: React.PointerEvent, el: WallElement) => void;
};

function cmToPx(cm: number, cellPx: number): number {
  return (cm / GRID_UNIT_CM) * cellPx;
}

function wallLengthCm(wall: WallSide, gridCols: number, gridRows: number): number {
  switch (wall) {
    case "north":
    case "south":
      return gridCols * GRID_UNIT_CM;
    case "east":
    case "west":
      return gridRows * GRID_UNIT_CM;
    default:
      return 0;
  }
}

export function WallElementsLayer({
  wallElements,
  gridCols,
  gridRows,
  cellPx,
  widthPx,
  heightPx,
  selectedWallElementId,
  draggingWallElementId,
  dragPreviewPositionCm,
  onSelect,
  onPointerDown,
}: WallElementsLayerProps) {
  const elements = wallElements ?? [];

  return (
    <g data-layer="wall-elements" pointerEvents="none">
      {elements.map((el) => {
        const isSelected = selectedWallElementId === el.id;
        const isDragging = draggingWallElementId === el.id;
        const positionCm = isDragging && dragPreviewPositionCm != null ? dragPreviewPositionCm : el.position_cm;
        const wallLenCm = wallLengthCm(el.wall, gridCols, gridRows);
        const widthPxEl = cmToPx(Math.min(el.width_cm, wallLenCm), cellPx);
        const posPx = cmToPx(Math.max(0, Math.min(positionCm, wallLenCm - el.width_cm)), cellPx);

        let x = 0;
        let y = 0;
        let w = 0;
        let h = 0;

        switch (el.wall) {
          case "north":
            x = posPx;
            y = 0;
            w = widthPxEl;
            h = BAND_PX;
            break;
          case "south":
            x = posPx;
            y = heightPx - BAND_PX;
            w = widthPxEl;
            h = BAND_PX;
            break;
          case "west":
            x = 0;
            y = posPx;
            w = BAND_PX;
            h = widthPxEl;
            break;
          case "east":
            x = widthPx - BAND_PX;
            y = posPx;
            w = BAND_PX;
            h = widthPxEl;
            break;
          default:
            return null;
        }

        const fill = el.type === "gate"
          ? (el.gateType === "courier" ? "#0ea5e9" : el.gateType === "supplier" ? "#f59e0b" : "#8b5cf6")
          : "#94a3b8";
        const stroke = isSelected ? "#06b6d4" : "#64748b";

        return (
          <g
            key={el.id}
            onPointerDown={onPointerDown ? (e) => { e.preventDefault(); e.stopPropagation(); onPointerDown(e, el); } : undefined}
            onClick={(e) => { e.stopPropagation(); onSelect(el.id); }}
            style={{ pointerEvents: "auto", cursor: onPointerDown ? "grab" : "pointer" }}
          >
            <rect
              x={x + 1}
              y={y + 1}
              width={Math.max(4, w - 2)}
              height={Math.max(4, h - 2)}
              fill={fill}
              stroke={stroke}
              strokeWidth={isSelected ? 2.5 : 1}
              rx={2}
            />
            {el.type === "gate" && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 4}
                textAnchor="middle"
                fontSize={9}
                fill="#fff"
                fontWeight="bold"
              >
                {el.gateType === "courier" ? "K" : el.gateType === "supplier" ? "D" : "K+D"}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
