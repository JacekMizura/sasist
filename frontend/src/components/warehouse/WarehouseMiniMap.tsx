import type { LayoutState, RackState } from "../../types/warehouse";

const DEFAULT_RACK_FILL = "#3b82f6";

function rackFill(rack: RackState): string {
  const c = rack.color;
  if (typeof c !== "string" || c.trim() === "") return DEFAULT_RACK_FILL;
  return c.trim();
}

export type WarehouseMiniMapProps = {
  layout: LayoutState;
  selectedRackId: number | string | null;
  onSelectRack: (rackId: number | string) => void;
  className?: string;
  height?: number;
};

/**
 * Simplified floor plan for Magazyn tab: click a rack to switch Side View to that rack.
 */
export function WarehouseMiniMap({
  layout,
  selectedRackId,
  onSelectRack,
  className = "",
  height = 140,
}: WarehouseMiniMapProps) {
  const { racks, grid_cols, grid_rows } = layout;
  const viewW = Math.max(1, grid_cols);
  const viewH = Math.max(1, grid_rows);

  return (
    <div className={`flex flex-col shrink-0 ${className}`}>
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-2 pb-1.5">
        Mapa regałów
      </div>
      <div
        className="w-full border border-slate-200 rounded-lg overflow-hidden bg-slate-50"
        style={{ height: `${height}px` }}
      >
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full block cursor-pointer"
        >
          {racks.map((r) => {
            const rid = r.id ?? r.rack_index;
            const isSelected = selectedRackId != null && String(rid) === String(selectedRackId);
            return (
              <g
                key={String(rid)}
                onClick={() => onSelectRack(rid)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={r.x + 0.05}
                  y={r.y + 0.05}
                  width={Math.max(0.1, r.width - 0.1)}
                  height={Math.max(0.1, r.height - 0.1)}
                  fill={rackFill(r)}
                  stroke={isSelected ? "#0f172a" : "#94a3b8"}
                  strokeWidth={isSelected ? 0.4 : 0.15}
                  rx={0.3}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-[10px] text-slate-500 mt-1 px-2">
        Kliknij regał, aby zobaczyć widok z boku
      </p>
    </div>
  );
}
