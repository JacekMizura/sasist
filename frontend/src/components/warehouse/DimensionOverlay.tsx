import React from "react";

/**
 * Visual-only overlay for dimension lines and aisle width.
 * Does NOT modify layout, slots, or any warehouse data. Read-only display.
 */

export type DimensionLine = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  distanceCm: number;
  isAisle?: boolean;
};

export type AisleHighlight = {
  x: number;
  y: number;
  w: number;
  h: number;
  widthCm: number;
};

export type DimensionOverlayProps = {
  width: number;
  height: number;
  cellPx: number;
  dimensionLines: DimensionLine[];
  aisleHighlights: AisleHighlight[];
};

function DimensionOverlayInner({
  width,
  height,
  cellPx,
  dimensionLines,
  aisleHighlights,
}: DimensionOverlayProps) {
  const hasContent = dimensionLines.length > 0 || aisleHighlights.length > 0;
  if (!hasContent) return null;

  return (
    <div
      className="absolute left-0 top-0 pointer-events-none"
      style={{ width, height, zIndex: 50 }}
      aria-hidden
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        <defs>
          <marker id="dim-arrow-end" markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
            <path d="M0 0 L6 3 L0 6 Z" fill="#3b82f6" stroke="#1e40af" strokeWidth={0.5} />
          </marker>
          <marker id="dim-arrow-start" markerWidth={8} markerHeight={6} refX={1} refY={3} orient="auto">
            <path d="M6 0 L0 3 L6 6 Z" fill="#3b82f6" stroke="#1e40af" strokeWidth={0.5} />
          </marker>
        </defs>
        {aisleHighlights.map((zone, i) => {
          const zx = zone.x * cellPx;
          const zy = zone.y * cellPx;
          const zw = zone.w * cellPx;
          const zh = zone.h * cellPx;
          const cx = zx + zw / 2;
          const cy = zy + zh / 2;
          const isVertical = zh > zw;
          const arrowLen = Math.min(24, (isVertical ? zh : zw) * 0.4);
          return (
            <g key={`aisle-${i}`}>
              <rect
                x={zx}
                y={zy}
                width={zw}
                height={zh}
                fill="rgba(59,130,246,0.15)"
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                rx={2}
              />
              {isVertical ? (
                <line
                  x1={cx}
                  y1={zy + arrowLen}
                  x2={cx}
                  y2={zy + zh - arrowLen}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  markerStart="url(#dim-arrow-start)"
                  markerEnd="url(#dim-arrow-end)"
                />
              ) : (
                <line
                  x1={zx + arrowLen}
                  y1={cy}
                  x2={zx + zw - arrowLen}
                  y2={cy}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  markerStart="url(#dim-arrow-start)"
                  markerEnd="url(#dim-arrow-end)"
                />
              )}
              <rect x={cx - 28} y={cy - 10} width={56} height={20} rx={4} fill="white" stroke="#3b82f6" strokeWidth={1.5} />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#1e40af" fontSize={11} fontWeight="bold" style={{ userSelect: "none" }}>
                Strefa {zone.widthCm} cm
              </text>
            </g>
          );
        })}
        {dimensionLines.map((line) => {
          const x1 = line.from.x * cellPx;
          const y1 = line.from.y * cellPx;
          const x2 = line.to.x * cellPx;
          const y2 = line.to.y * cellPx;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const label = line.isAisle ? `Strefa ${line.distanceCm} cm` : `${line.distanceCm} cm`;
          const labelW = Math.max(44, label.length * 6);
          return (
            <g key={line.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 3" opacity={1} />
              <rect x={mx - labelW / 2} y={my - 10} width={labelW} height={20} rx={4} fill="white" stroke="#1e40af" strokeWidth={1.5} />
              <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fill="#1e40af" fontSize={11} fontWeight="bold" style={{ userSelect: "none" }}>
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Memoized so overlay only re-renders when dimension data actually changes (selection/drag), not on every mouse move. */
export const DimensionOverlay = React.memo(DimensionOverlayInner);
