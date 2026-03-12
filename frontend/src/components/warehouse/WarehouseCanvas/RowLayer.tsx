import React from "react";
import type { LayoutState, RackState } from "../../../types/warehouse";
import type { CatalogItem } from "../../../types/warehouse";
import { radius } from "../../../layout/designTokens";

const RACK_RADIUS_PX = parseFloat(radius.small) || 6;
const DEFAULT_RACK_FILL = "#3b82f6";

function rackFillColor(rack: RackState): string {
  const c = rack.color;
  if (typeof c !== "string" || c.trim() === "") return DEFAULT_RACK_FILL;
  return c.trim();
}

type RowLayerEmptySlotsProps = {
  part: "emptySlots";
  layout: LayoutState;
  cellPx: number;
  minEmptySlotWidthCells?: number;
  minEmptySlotDepthCells?: number;
  catalogHoveredSlot: { rowId: string; slotIndex: number } | null;
  selectedRowContainerId: string | null;
  selectedRowContainerIds: string[];
  setCatalogHoveredSlot: ((slot: { rowId: string; slotIndex: number } | null) => void) | undefined;
  stampRackIntoSlot: ((rowId: string, slotIndex: number, item: CatalogItem) => void) | undefined;
};

type RowLayerRowDragGhostProps = {
  part: "rowDragGhost";
  layout: LayoutState;
  cellPx: number;
  draggingRowId: string | null;
  rowDragPreviewStart: { x: number; y: number } | null;
};

export type RowLayerProps = RowLayerEmptySlotsProps | RowLayerRowDragGhostProps;

export function RowLayer(props: RowLayerProps) {
  if (props.part === "rowDragGhost") {
    const { layout, cellPx, draggingRowId, rowDragPreviewStart } = props;
    return (
      <>
        {draggingRowId && rowDragPreviewStart != null && (() => {
          const row = (layout.row_containers ?? []).find((rc) => rc.id === draggingRowId);
          if (!row?.slots.length) return null;
          const isVertical = (row.orientation ?? "horizontal") === "vertical";
          let gx = rowDragPreviewStart.x;
          let gy = rowDragPreviewStart.y;
          const ghostSlots = row.slots.map((s) => {
            const out = { ...s, x: gx, y: gy };
            if (isVertical) gy += s.h; else gx += s.w;
            return out;
          });
          return (
            <g key="row-ghost" pointerEvents="none" fillOpacity={0.5} strokeOpacity={0.8}>
              {ghostSlots.map((slot, i) => (
                <rect
                  key={`ghost-slot-${i}`}
                  x={slot.x * cellPx + 1}
                  y={slot.y * cellPx + 1}
                  width={slot.w * cellPx - 2}
                  height={slot.h * cellPx - 2}
                  fill="rgba(148,163,184,0.6)"
                  stroke="#64748b"
                  strokeWidth={1}
                  rx={RACK_RADIUS_PX}
                />
              ))}
              {ghostSlots.map((slot, i) => {
                if (slot.rackId == null) return null;
                const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === slot.rackId);
                if (!rack) return null;
                const rx = slot.x * cellPx + 1;
                const ry = slot.y * cellPx + 1;
                const rw = rack.width * cellPx - 2;
                const rh = rack.height * cellPx - 2;
                return (
                  <rect
                    key={`ghost-rack-${i}`}
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill={rackFillColor(rack)}
                    stroke="#64748b"
                    strokeWidth={1}
                    rx={RACK_RADIUS_PX}
                  />
                );
              })}
            </g>
          );
        })()}
      </>
    );
  }
  const {
    layout,
    cellPx,
    minEmptySlotWidthCells,
    minEmptySlotDepthCells,
    catalogHoveredSlot,
    selectedRowContainerId,
    selectedRowContainerIds,
    setCatalogHoveredSlot,
    stampRackIntoSlot,
  } = props;
  return (
    <>
      {(layout.row_containers ?? []).flatMap((rc) =>
        rc.slots.map((slot, i) => {
          if (slot.rackId != null) return null;
          const isVerticalRow = (rc.orientation ?? "horizontal") === "vertical";
          if (isVerticalRow) {
            if (minEmptySlotDepthCells != null && slot.w < minEmptySlotDepthCells) return null;
            if (minEmptySlotWidthCells != null && slot.h < minEmptySlotWidthCells) return null;
          } else if (minEmptySlotWidthCells != null && slot.w < minEmptySlotWidthCells) return null;
          const isHoveredByCatalog = catalogHoveredSlot?.rowId === rc.id && catalogHoveredSlot?.slotIndex === i;
          const isRowSelected = (selectedRowContainerId != null && rc.id === selectedRowContainerId) || (selectedRowContainerIds?.includes(rc.id) ?? false);
          const fillColor = isHoveredByCatalog
            ? "rgba(34,197,94,0.18)"
            : isRowSelected
              ? "rgba(6,182,212,0.10)"
              : "rgba(148,163,184,0.08)";
          const strokeColor = isHoveredByCatalog
            ? "#22c55e"
            : isRowSelected
              ? "#06b6d4"
              : "rgba(100,116,139,0.65)";
          const strokeW = isHoveredByCatalog || isRowSelected ? 2 : 1;
          return (
            <g
              key={`${rc.id}-${i}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                setCatalogHoveredSlot?.({ rowId: rc.id, slotIndex: i });
              }}
              onDragLeave={() => setCatalogHoveredSlot?.(null)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                let item: CatalogItem | null = null;
                try {
                  const raw = e.dataTransfer.getData("application/x-warehouse-catalog");
                  if (raw) item = JSON.parse(raw) as CatalogItem;
                } catch {}
                if (item && stampRackIntoSlot) {
                  stampRackIntoSlot(rc.id, i, item);
                }
              }}
              style={{ cursor: isHoveredByCatalog ? "copy" : "pointer" }}
            >
              <rect
                x={slot.x * cellPx + 1}
                y={slot.y * cellPx + 1}
                width={slot.w * cellPx - 2}
                height={slot.h * cellPx - 2}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeW}
                rx={RACK_RADIUS_PX}
                strokeDasharray={isHoveredByCatalog ? undefined : "4 3"}
                pointerEvents="auto"
              />
            </g>
          );
        })
      )}
    </>
  );
}
