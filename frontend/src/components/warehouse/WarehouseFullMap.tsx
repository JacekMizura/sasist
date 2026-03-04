import type { LayoutState } from "../../types/warehouse";
import { getRackDisplayId, getRackLabelStyle } from "./warehouseUtils";

const DEFAULT_RACK_FILL = "#3b82f6";
/** Rack occupancy colors: low (<70%) = green/blueish, 70–90% = yellow, ≥90% = red */
const RACK_OCCUPANCY_LOW = "#0d9488";
const RACK_OCCUPANCY_MID = "#eab308";
const RACK_OCCUPANCY_HIGH = "#ef4444";
const RACK_SELECTED_FILL = "#0ea5e9";

function rackFillByOccupancy(occupancyPct: number | undefined): string {
  if (occupancyPct == null) return DEFAULT_RACK_FILL;
  if (occupancyPct < 70) return RACK_OCCUPANCY_LOW;
  if (occupancyPct < 90) return RACK_OCCUPANCY_MID;
  return RACK_OCCUPANCY_HIGH;
}

export type WarehouseFullMapProps = {
  layout: LayoutState;
  selectedRackId: number | string | null;
  onSelectRack: (rackId: number | string) => void;
  /** Per-rack occupancy % (used/total*100). When set, racks are colored by occupancy. */
  rackOccupancyPct?: Record<string, number>;
  showRackLabels?: boolean;
  className?: string;
};

/** Minimum rack size (viewBox units) to show label; smaller racks hide text to avoid overflow. */
const MIN_RACK_VIEWBOX_FOR_LABEL = 1.5;

/**
 * Full-screen interactive warehouse map for Magazyn tab. Same layout as "Projekt Layoutu".
 * Clicking a rack switches to Side View of that rack.
 */
export function WarehouseFullMap({
  layout,
  selectedRackId,
  onSelectRack,
  rackOccupancyPct,
  showRackLabels = true,
  className = "",
}: WarehouseFullMapProps) {
  const { racks, grid_cols, grid_rows } = layout;
  const viewW = Math.max(1, grid_cols);
  const viewH = Math.max(1, grid_rows);

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50/50 text-sm text-slate-600">
        Kliknij regał na mapie, aby zobaczyć widok z boku
      </div>
      <div className="flex-1 min-h-0 w-full overflow-hidden bg-slate-100/50 rounded-b-xl">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full block cursor-pointer"
        >
          {layout.aisles?.map((a, i) => (
            <rect
              key={a.id ?? `a-${i}`}
              x={a.x + 0.02}
              y={a.y + 0.02}
              width={Math.max(0.04, a.width - 0.04)}
              height={Math.max(0.04, a.height - 0.04)}
              fill="#94a3b8"
              stroke="#64748b"
              strokeWidth={0.02}
              rx={0.2}
            />
          ))}
          {racks.map((r) => {
            const rid = r.id ?? r.rack_index;
            const ridStr = String(rid);
            const isSelected = selectedRackId != null && String(selectedRackId) === ridStr;
            const occupancyPct = rackOccupancyPct?.[ridStr];
            const fill = isSelected ? RACK_SELECTED_FILL : rackFillByOccupancy(occupancyPct);
            const label = getRackDisplayId(r);
            const rectW = Math.max(0.04, r.width - 0.04);
            const rectH = Math.max(0.04, r.height - 0.04);
            const showLabel = showRackLabels && Math.min(rectW, rectH) >= MIN_RACK_VIEWBOX_FOR_LABEL;
            const { displayText, fontSize } = getRackLabelStyle(rectW, rectH, label, true);
            const clipW = rectW * 0.9;
            const clipH = rectH * 0.9;
            const clipX = r.x + 0.02 + (rectW - clipW) / 2;
            const clipY = r.y + 0.02 + (rectH - clipH) / 2;
            const clipId = `rack-clip-${rid}`;
            return (
              <g key={ridStr} onClick={() => onSelectRack(rid)} style={{ cursor: "pointer" }}>
                <rect
                  x={r.x + 0.02}
                  y={r.y + 0.02}
                  width={rectW}
                  height={rectH}
                  fill={fill}
                  stroke={isSelected ? "#0f172a" : "#64748b"}
                  strokeWidth={isSelected ? 0.08 : 0.03}
                  rx={0.2}
                />
                {showLabel && (
                  <g clipPath={`url(#${clipId})`}>
                    <defs>
                      <clipPath id={clipId}>
                        <rect x={clipX} y={clipY} width={clipW} height={clipH} />
                      </clipPath>
                    </defs>
                    <text
                      x={r.x + r.width / 2}
                      y={r.y + r.height / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="white"
                      stroke="#0f172a"
                      strokeWidth={Math.max(0.06, fontSize * 0.06)}
                      fontSize={fontSize}
                      fontWeight="bold"
                      style={{ pointerEvents: "none", userSelect: "none", paintOrder: "stroke fill" }}
                    >
                      {displayText}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
