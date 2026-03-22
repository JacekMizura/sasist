import React from "react";
import type { VisualElementType, VisualElementState } from "../../../types/warehouse";
import { cellToPx } from "../renderUtils";
import { radius } from "../../../layout/designTokens";

const RACK_RADIUS_PX = parseFloat(radius.small) || 6;

export type VisualLayerProps = {
  visualElements: VisualElementState[];
  cellPx: number;
  showLabels: boolean;
  isVisualSelected: (id: string) => boolean;
  draggingVisualType: VisualElementType | null;
  visualGhostPosition: { x: number; y: number } | null;
  getDefaultVisualSize: (type: VisualElementType) => { w: number; h: number };
};

export function VisualLayer({
  visualElements,
  cellPx,
  showLabels,
  isVisualSelected,
  draggingVisualType,
  visualGhostPosition,
  getDefaultVisualSize,
}: VisualLayerProps) {
  return (
    <g data-visual-elements="">
      {([...visualElements].sort((a, b) => a.zIndex - b.zIndex)).map((ve) => {
        const isSelected = isVisualSelected(ve.id);
        const defaultFill: Record<VisualElementType, string> = {
          column: "#64748b", mezzanine: "rgba(100,116,139,0.5)", packing_station: "#475569", cart: "#94a3b8",
          wall: "#64748b", door: "#94a3b8", zone: "rgba(59,130,246,0.25)",
        };
        const fill = ve.color ?? defaultFill[ve.type];
        const cx = cellToPx(ve.x, cellPx) + cellToPx(ve.width, cellPx) / 2;
        const cy = cellToPx(ve.y, cellPx) + cellToPx(ve.height, cellPx) / 2;
        const rot = ve.rotation ?? 0;
        const strokeColor = isSelected ? "#e0f2fe" : "#475569";
        const drawColumn = () => {
          if (ve.type !== "column") return null;
          if ((ve.columnShape === "circle") && (ve.diameter != null && ve.diameter > 0)) {
            const r = cellToPx(ve.diameter / 2, cellPx);
            return (
              <circle cx={cx} cy={cy} r={Math.max(2, r - 1)} fill={fill} stroke={strokeColor} strokeWidth={isSelected ? 2 : 0.5} />
            );
          }
          return (
            <rect x={cellToPx(ve.x, cellPx) + 1} y={cellToPx(ve.y, cellPx) + 1} width={cellToPx(ve.width, cellPx) - 2} height={cellToPx(ve.height, cellPx) - 2} fill={fill} stroke={strokeColor} strokeWidth={isSelected ? 2 : 0.5} rx={0} />
          );
        };
        const drawCart = () => {
          if (ve.type !== "cart") return null;
          const w = cellToPx(ve.width, cellPx) - 2;
          const h = cellToPx(ve.height, cellPx) - 2;
          const scale = Math.min(w, h) / 22;
          const content = (
            <>
              <rect x={cellToPx(ve.x, cellPx) + 1} y={cellToPx(ve.y, cellPx) + 1} width={w} height={h} fill={fill} stroke={strokeColor} strokeWidth={isSelected ? 2 : 0.5} rx={2} />
              <g transform={`translate(${cx},${cy}) scale(${scale}) translate(-12,-12)`} style={{ transformOrigin: "12px 12px" }}>
                <path fill="none" stroke="#1e293b" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" d="M2 10h2l1-4h6l1 4h2M2 10v6a1 1 0 001 1h14a1 1 0 001-1v-6M6 17a1 1 0 11-2 0 1 1 0 012 0zM18 17a1 1 0 11-2 0 1 1 0 012 0z" />
              </g>
            </>
          );
          if (rot !== 0) return <g transform={`rotate(${rot} ${cx} ${cy})`}>{content}</g>;
          return <g>{content}</g>;
        };
        const drawWall = () => {
          if (ve.type !== "wall") return null;
          const len = cellToPx(ve.length ?? ve.width, cellPx);
          const th = cellToPx(ve.thickness ?? ve.height, cellPx);
          const content = (
            <>
              <rect x={cellToPx(ve.x, cellPx) + 1} y={cellToPx(ve.y, cellPx) + 1} width={len - 2} height={Math.max(2, th - 2)} fill={fill} stroke={strokeColor} strokeWidth={isSelected ? 2 : 0.5} />
              {isSelected && (
                <>
                  <circle cx={cellToPx(ve.x, cellPx) + cellPx / 2} cy={cellToPx(ve.y, cellPx) + th / 2} r={cellPx / 2} fill="#22d3ee" stroke="#e0f2fe" strokeWidth={1} opacity={0.9} />
                  <circle cx={cellToPx(ve.x, cellPx) + len - cellPx / 2} cy={cellToPx(ve.y, cellPx) + th / 2} r={cellPx / 2} fill="#22d3ee" stroke="#e0f2fe" strokeWidth={1} opacity={0.9} />
                </>
              )}
            </>
          );
          if (rot !== 0) return <g transform={`rotate(${rot} ${cellToPx(ve.x, cellPx) + len/2} ${cellToPx(ve.y, cellPx) + th/2})`}>{content}</g>;
          return <g>{content}</g>;
        };
        const drawDoor = () => {
          if (ve.type !== "door") return null;
          const w = cellToPx(ve.width, cellPx) - 2;
          const h = cellToPx(ve.height, cellPx) - 2;
          const vx = cellToPx(ve.x, cellPx);
          const vy = cellToPx(ve.y, cellPx);
          const content = (
            <>
              <rect x={vx + 1} y={vy + 1} width={w} height={h} fill={fill} stroke={strokeColor} strokeWidth={isSelected ? 2 : 0.5} rx={1} />
              {ve.doorStyle === "sliding" ? (
                <path stroke="#1e293b" strokeWidth={1} fill="none" d={`M${vx + 4} ${cy} h${w - 8} M${vx + w/2 - 4} ${cy - 4} v8 M${vx + w/2 + 4} ${cy - 4} v8`} />
              ) : (
                <path stroke="#1e293b" strokeWidth={1} fill="none" d={`M${vx + 2} ${vy + 2} L${vx + 2} ${vy + h} L${vx + w/2} ${vy + h/2} Z`} />
              )}
            </>
          );
          if (rot !== 0) return <g transform={`rotate(${rot} ${cx} ${cy})`}>{content}</g>;
          return <g>{content}</g>;
        };
        const drawZone = () => {
          if (ve.type !== "zone") return null;
          return (
            <rect x={cellToPx(ve.x, cellPx) + 1} y={cellToPx(ve.y, cellPx) + 1} width={cellToPx(ve.width, cellPx) - 2} height={cellToPx(ve.height, cellPx) - 2} fill={fill} stroke={strokeColor} strokeWidth={isSelected ? 2 : 0.5} rx={4} />
          );
        };
        const drawGeneric = () => {
          if (["column", "cart", "wall", "door", "zone"].includes(ve.type)) return null;
          const content = (
            <rect x={cellToPx(ve.x, cellPx) + 1} y={cellToPx(ve.y, cellPx) + 1} width={cellToPx(ve.width, cellPx) - 2} height={cellToPx(ve.height, cellPx) - 2} fill={fill} stroke={strokeColor} strokeWidth={isSelected ? 2 : 0.5} rx={2} />
          );
          if (rot !== 0) return <g transform={`rotate(${rot} ${cx} ${cy})`}>{content}</g>;
          return <g>{content}</g>;
        };
        const showLabel = showLabels && (ve.label ?? ve.name);
        return (
          <g key={ve.id} style={{ pointerEvents: "auto" }}>
            {ve.type === "column" && drawColumn()}
            {ve.type === "cart" && drawCart()}
            {ve.type === "wall" && drawWall()}
            {ve.type === "door" && drawDoor()}
            {ve.type === "zone" && drawZone()}
            {drawGeneric()}
            {showLabel && (
              <text
                x={cellToPx(ve.x, cellPx) + cellToPx(ve.width, cellPx) / 2}
                y={cellToPx(ve.y, cellPx) + cellToPx(ve.height, cellPx) + 10}
                textAnchor="middle"
                fill="#e0f2fe"
                fontSize={Math.max(8, Math.min(10, cellToPx(ve.width, cellPx) / 10))}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {ve.label ?? ve.name}
              </text>
            )}
          </g>
        );
      })}
      {draggingVisualType && visualGhostPosition && (() => {
        const { w, h } = getDefaultVisualSize(draggingVisualType);
        return (
          <rect
            x={cellToPx(visualGhostPosition.x, cellPx) + 2}
            y={cellToPx(visualGhostPosition.y, cellPx) + 2}
            width={cellToPx(w, cellPx) - 4}
            height={cellToPx(h, cellPx) - 4}
            fill="rgba(251,191,36,0.35)"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="4 2"
            rx={RACK_RADIUS_PX}
            pointerEvents="none"
          />
        );
      })()}
    </g>
  );
}
