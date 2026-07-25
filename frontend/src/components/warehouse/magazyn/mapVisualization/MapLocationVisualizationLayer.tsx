import { memo, useMemo, type ReactNode } from "react";
import type { RackState } from "../../../../types/warehouse";
import { clampRackRectLayout } from "../../../../utils/rackMapVisual";
import { activeBinsForRack, getLevelConfig } from "../../warehouseUtils";
import {
  isMapVisualizationActive,
  locationMatchesMode,
  type MapVisualizationModeId,
} from "./MapVisualizationMode";

function rackDrawAt(rack: RackState): { x: number; y: number } {
  return { x: rack.x, y: rack.y };
}

/** Soft tint for focused (matching) locations — whole bin, no gray placeholder tiles. */
function focusFill(mode: MapVisualizationModeId): string {
  if (mode === "free") return "rgba(16, 185, 129, 0.38)";
  if (mode === "occupied") return "rgba(249, 115, 22, 0.36)";
  return "rgba(249, 115, 22, 0.3)";
}

function focusStroke(mode: MapVisualizationModeId): string {
  if (mode === "free") return "rgba(5, 150, 105, 0.75)";
  if (mode === "occupied") return "rgba(234, 88, 12, 0.8)";
  return "rgba(234, 88, 12, 0.7)";
}

/** Same geometry as RackLayer bin highlights — kept local to avoid coupling. */
function binRectPx(
  rack: RackState,
  bin: { level_index: number; segment_index: number },
  cellPx: number
): { x: number; y: number; width: number; height: number } | null {
  const drawAt = rackDrawAt(rack);
  const layoutRect = clampRackRectLayout(drawAt, rack, cellPx);
  const lc = getLevelConfig(rack);
  const L = lc.length;
  if (L === 0) return null;
  const lev = bin.level_index;
  const seg = bin.segment_index;
  if (lev < 0 || lev >= L) return null;
  const S = Math.max(1, lc[lev]?.locations ?? 1);
  if (seg < 0 || seg >= S) return null;
  const { rectX, rectY, rectW, rectH } = layoutRect;
  const rowH = rectH / L;
  const colW = rectW / S;
  const y = rectY + rectH - (lev + 1) * rowH;
  const x = rectX + seg * colW;
  const inset = 1.2;
  return { x: x + inset, y: y + inset, width: colW - inset * 2, height: rowH - inset * 2 };
}

export type MapLocationVisualizationLayerProps = {
  mode: MapVisualizationModeId;
  racks: RackState[];
  cellPx: number;
  /** O(1) occupied lookup — precomputed Set of location UUIDs. */
  occupiedLocationUuids: ReadonlySet<string>;
};

/**
 * Visualization overlay: highlights matching whole locations (soft tint).
 * Non-matching bins stay as rack chrome — no gray placeholder tiles.
 * Renders nothing for mode `all`.
 */
function MapLocationVisualizationLayerInner({
  mode,
  racks,
  cellPx,
  occupiedLocationUuids,
}: MapLocationVisualizationLayerProps) {
  const active = isMapVisualizationActive(mode);

  const nodes = useMemo(() => {
    if (!active) return null;
    const fill = focusFill(mode);
    const stroke = focusStroke(mode);
    const out: ReactNode[] = [];
    for (const rack of racks) {
      const rid = String(rack.uuid ?? rack.id ?? rack.rack_index);
      for (const bin of activeBinsForRack(rack)) {
        const uuid = (bin.locationUUID ?? "").trim();
        if (!uuid) continue;
        const occupied = occupiedLocationUuids.has(uuid);
        if (!locationMatchesMode(mode, { occupied })) continue;
        const dims = binRectPx(rack, bin, cellPx);
        if (!dims || dims.width <= 0 || dims.height <= 0) continue;
        out.push(
          <rect
            key={`${rid}-${bin.level_index}-${bin.segment_index}-${uuid}`}
            x={dims.x}
            y={dims.y}
            width={dims.width}
            height={dims.height}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.25}
            rx={2}
            pointerEvents="none"
          />
        );
      }
    }
    return out;
  }, [active, racks, cellPx, occupiedLocationUuids, mode]);

  if (!active || nodes == null || nodes.length === 0) return null;

  return (
    <g data-map-visualization-layer="" pointerEvents="none" aria-hidden>
      {nodes}
    </g>
  );
}

export const MapLocationVisualizationLayer = memo(MapLocationVisualizationLayerInner);
