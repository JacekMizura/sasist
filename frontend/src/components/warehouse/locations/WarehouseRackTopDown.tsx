import type { MouseEvent } from "react";
import type { LocationVisualRackGridCell } from "../../../api/wmsLocationVisualApi";
import { zoneMeta } from "./warehouseFloorPlanUtils";

type Props = {
  cell: LocationVisualRackGridCell;
  x: number;
  y: number;
  width: number;
  height: number;
  isActive: boolean;
  isFocused: boolean;
  uid: string;
  onFocus?: () => void;
  onHover?: (e: MouseEvent<SVGGElement>) => void;
  onHoverMove?: (e: MouseEvent<SVGGElement>) => void;
};

/** Regał widziany z góry — metalowa konstrukcja, segmenty, cień na posadzce. */
export function WarehouseRackTopDown({
  cell,
  x,
  y,
  width,
  height,
  isActive,
  isFocused,
  uid,
  onFocus,
  onHover,
  onHoverMove,
}: Props) {
  const meta = zoneMeta(cell.zone_code);
  const bayCount = Math.max(2, Math.min(8, Math.round(width / 14)));
  const levelLines = Math.max(2, Math.min(5, Math.round(height / 22)));
  const depthX = Math.min(10, width * 0.08);
  const depthY = Math.min(10, height * 0.08);
  const frame = Math.max(2.5, Math.min(5, width * 0.04));

  return (
    <g
      className="cursor-pointer"
      onClick={onFocus}
      onMouseEnter={onHover}
      onMouseMove={onHoverMove}
      style={{ transition: "opacity 0.2s ease" }}
    >
      {/* Cień na posadzce */}
      <rect
        x={x + depthX * 0.6}
        y={y + depthY * 0.8}
        width={width}
        height={height}
        fill="#000"
        opacity={isActive ? 0.45 : 0.28}
        filter={`url(#${uid}-shadow-blur)`}
      />

      {isActive ? (
        <>
          <rect
            x={x - 6}
            y={y - 6}
            width={width + 12}
            height={height + 12}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            opacity="0.35"
            className={`wh-loc-pulse-ring-${uid}`}
          />
          <rect
            x={x - 3}
            y={y - 3}
            width={width + 6}
            height={height + 6}
            fill={meta.glow}
            opacity="0.25"
            filter={`url(#${uid}-active-glow)`}
          />
        </>
      ) : null}

      {/* Platforma / footprint regału */}
      <rect x={x} y={y} width={width} height={height} fill={`url(#${uid}-rack-surface)`} />

      {/* Rama metalowa — obrys */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke={isActive ? "#7dd3fc" : isFocused ? "#94a3b8" : "#3d4a5c"}
        strokeWidth={isActive ? frame + 1 : frame}
      />

      {/* Słupy boczne (widoczne z góry jako grube krawędzie) */}
      <rect x={x} y={y} width={frame * 1.2} height={height} fill={`url(#${uid}-upright)`} opacity="0.95" />
      <rect
        x={x + width - frame * 1.2}
        y={y}
        width={frame * 1.2}
        height={height}
        fill={`url(#${uid}-upright)`}
        opacity="0.95"
      />

      {/* Segmenty (bays) */}
      {Array.from({ length: bayCount - 1 }).map((_, i) => {
        const bx = x + frame * 1.2 + ((width - frame * 2.4) / bayCount) * (i + 1);
        return (
          <line
            key={`bay-${cell.id}-${i}`}
            x1={bx}
            y1={y + frame * 0.5}
            x2={bx}
            y2={y + height - frame * 0.5}
            stroke="#1a2332"
            strokeWidth="1.2"
            opacity="0.55"
          />
        );
      })}

      {/* Poziomy / belki */}
      {Array.from({ length: levelLines - 1 }).map((_, i) => {
        const ly = y + frame + ((height - frame * 2) / levelLines) * (i + 1);
        return (
          <g key={`lvl-${cell.id}-${i}`}>
            <line x1={x + frame} x2={x + width - frame} y1={ly} y2={ly} stroke="#2d3748" strokeWidth="2" opacity="0.7" />
            <line
              x1={x + frame}
              x2={x + width - frame}
              y1={ly + 1}
              y2={ly + 1}
              stroke="#64748b"
              strokeWidth="0.6"
              opacity="0.35"
            />
          </g>
        );
      })}

      {/* Wypełnienie strefowe — subtelne */}
      {isFocused && !isActive ? (
        <rect x={x + frame} y={y + frame} width={width - frame * 2} height={height - frame * 2} fill={meta.floorTint} />
      ) : null}

      {/* Etykieta wytłoczona */}
      <text
        x={x + width / 2}
        y={y + height / 2 + 3}
        textAnchor="middle"
        fill={isActive ? "#e0f2fe" : "#94a3b8"}
        fontSize={Math.max(8, Math.min(12, width / 9))}
        fontWeight="700"
        letterSpacing="0.04em"
        opacity="0.92"
      >
        {cell.name}
      </text>

      {isActive ? (
        <g transform={`translate(${x + width / 2}, ${y - 8})`}>
          <polygon points="0,0 -10,14 10,14" fill="#0ea5e9" filter={`url(#${uid}-beacon-glow)`} />
          <rect x="-18" y="-26" width={36} height={18} rx={2} fill="#0c4a6e" stroke="#38bdf8" strokeWidth="1" />
          <text x="0" y="-13" textAnchor="middle" fill="#e0f2fe" fontSize="9" fontWeight="800" letterSpacing="0.12em">
            TU
          </text>
        </g>
      ) : null}
    </g>
  );
}
