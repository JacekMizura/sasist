import { GhostButton, colors, radius, shadows } from "../../design-system";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

export type WarehouseZoomControlsProps = {
  zoom: number;
  setZoom: (fn: (z: number) => number) => void;
  className?: string;
};

/**
 * Shared floating zoom widget for live + designer map chrome.
 */
export function WarehouseZoomControls({ zoom, setZoom, className = "" }: WarehouseZoomControlsProps) {
  return (
    <div
      className={`pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-1${className ? ` ${className}` : ""}`}
    >
      <div
        className={`pointer-events-auto flex items-center gap-0.5 border ${colors.border.soft} ${radius.md} ${colors.surface.page}/95 p-0.5 ${shadows.sm} backdrop-blur-sm`}
      >
        <GhostButton
          type="button"
          density="compact"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
          className="!w-8 !px-0"
          title="Pomniejsz"
          aria-label="Pomniejsz"
        >
          −
        </GhostButton>
        <span className={`min-w-[2.75rem] text-center font-mono text-[11px] tabular-nums ${colors.text.muted}`}>
          {Math.round(zoom * 100)}%
        </span>
        <GhostButton
          type="button"
          density="compact"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
          className="!w-8 !px-0"
          title="Powiększ"
          aria-label="Powiększ"
        >
          +
        </GhostButton>
      </div>
    </div>
  );
}
