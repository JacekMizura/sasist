import { useMemo } from "react";
import type { LayoutState } from "../../types/warehouse";
import { GRID_UNIT_CM } from "../../types/warehouse";
import { getRowBounds } from "./DesignerRackPlacement";

export interface UseDesignerDimensionsParams {
  showDimensions: boolean;
  layout: LayoutState;
  selectedRowContainerId: string | null;
  selectedRowContainerIds: string[];
  selectedRackIds: Array<number | string>;
  draggingRowId: string | null;
  rowDragPreviewStart: { x: number; y: number } | null;
  rackDragPreviewPositions: Record<string, { x: number; y: number }> | null;
  draggingRackId: number | string | null;
}

export function useDesignerDimensions(params: UseDesignerDimensionsParams) {
  const {
    showDimensions,
    layout,
    selectedRowContainerId,
    selectedRowContainerIds,
    selectedRackIds,
    draggingRowId,
    rowDragPreviewStart,
    rackDragPreviewPositions,
    draggingRackId,
  } = params;

  const dimensionData = useMemo((): { dimensionLines: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number }; distanceCm: number; isAisle?: boolean }>; aisleHighlights: Array<{ x: number; y: number; w: number; h: number; widthCm: number }> } => {
    const lines: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number }; distanceCm: number; isAisle?: boolean }> = [];
    const aisleHighlights: Array<{ x: number; y: number; w: number; h: number; widthCm: number }> = [];
    if (!showDimensions) return { dimensionLines: lines, aisleHighlights };
    const gridCols = layout.grid_cols;
    const gridRows = layout.grid_rows;
    const rows = layout.row_containers ?? [];
    const racks = layout.racks;

    let sel: { x: number; y: number; w: number; h: number } | null = null;
    let excludeRowIds = new Set<string>();
    let excludeRackIds = new Set<string | number>();

    if (draggingRowId != null && rowDragPreviewStart != null) {
      const row = rows.find((rc) => rc.id === draggingRowId);
      if (row?.slots.length) {
        const orient = row.orientation ?? "horizontal";
        let w = 0, h = 0;
        for (const s of row.slots) {
          if (orient === "horizontal") { w += s.w; h = Math.max(h, s.h); } else { w = Math.max(w, s.w); h += s.h; }
        }
        sel = { x: rowDragPreviewStart.x, y: rowDragPreviewStart.y, w, h };
        excludeRowIds.add(draggingRowId);
      }
    } else if (draggingRackId != null && rackDragPreviewPositions && selectedRackIds.length > 0) {
      const positions = selectedRackIds.map((id) => ({ id, pos: rackDragPreviewPositions[String(id)] })).filter((p) => p.pos);
      if (positions.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const { id, pos } of positions) {
          const r = racks.find((ra) => (ra.id ?? ra.rack_index) === id);
          if (!r) continue;
          minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
          maxX = Math.max(maxX, pos.x + r.width); maxY = Math.max(maxY, pos.y + r.height);
        }
        if (minX !== Infinity) sel = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        selectedRackIds.forEach((id) => excludeRackIds.add(id));
      }
    } else if (selectedRowContainerIds?.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of selectedRowContainerIds) {
        const rc = rows.find((r) => r.id === id);
        const b = rc ? getRowBounds(rc) : null;
        if (b) {
          minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
          excludeRowIds.add(id);
        }
      }
      if (minX !== Infinity) sel = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    } else if (selectedRowContainerId) {
      const rc = rows.find((r) => r.id === selectedRowContainerId);
      const b = rc ? getRowBounds(rc) : null;
      if (b) { sel = b; excludeRowIds.add(selectedRowContainerId); }
    } else if (selectedRackIds.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of selectedRackIds) {
        const r = racks.find((ra) => (ra.id ?? ra.rack_index) === id);
        if (r) {
          minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
          maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
          excludeRackIds.add(r.id ?? r.rack_index);
        }
      }
      if (minX !== Infinity) sel = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    if (!sel) return { dimensionLines: lines, aisleHighlights };

    const cx = sel.x + sel.w / 2;
    const cy = sel.y + sel.h / 2;
    const isHorizontal = sel.w >= sel.h;

    const obstacles: Array<{ y0: number; y1: number; x0: number; x1: number }> = [];
    for (const rc of rows) {
      if (excludeRowIds.has(rc.id)) continue;
      const b = getRowBounds(rc);
      if (b) obstacles.push({ y0: b.y, y1: b.y + b.h, x0: b.x, x1: b.x + b.w });
    }
    for (const r of racks) {
      if (excludeRackIds.has(r.id ?? r.rack_index)) continue;
      obstacles.push({ y0: r.y, y1: r.y + r.height, x0: r.x, x1: r.x + r.width });
    }

    if (isHorizontal) {
      const selTop = sel.y, selBottom = sel.y + sel.h;
      let nearestAbove = 0;
      let nearestBelow = gridRows;
      for (const o of obstacles) {
        if (o.x1 <= sel.x || o.x0 >= sel.x + sel.w) continue;
        if (o.y1 <= selTop) nearestAbove = Math.max(nearestAbove, o.y1);
        if (o.y0 >= selBottom) nearestBelow = Math.min(nearestBelow, o.y0);
      }
      const distAboveCm = (selTop - nearestAbove) * GRID_UNIT_CM;
      const distBelowCm = (nearestBelow - selBottom) * GRID_UNIT_CM;
      if (distAboveCm > 0) lines.push({ id: "dim-above", from: { x: cx, y: nearestAbove }, to: { x: cx, y: selTop }, distanceCm: Math.round(distAboveCm) });
      if (distBelowCm > 0) {
        const isAisle = nearestBelow < gridRows && nearestAbove < selTop;
        lines.push({ id: "dim-below", from: { x: cx, y: selBottom }, to: { x: cx, y: nearestBelow }, distanceCm: Math.round(distBelowCm), isAisle });
        if (isAisle && nearestBelow - selBottom > 0) {
          aisleHighlights.push({ x: sel.x, y: selBottom, w: sel.w, h: nearestBelow - selBottom, widthCm: Math.round(distBelowCm) });
        }
      }
    } else {
      const selLeft = sel.x, selRight = sel.x + sel.w;
      let nearestLeft = 0;
      let nearestRight = gridCols;
      for (const o of obstacles) {
        if (o.y1 <= sel.y || o.y0 >= sel.y + sel.h) continue;
        if (o.x1 <= selLeft) nearestLeft = Math.max(nearestLeft, o.x1);
        if (o.x0 >= selRight) nearestRight = Math.min(nearestRight, o.x0);
      }
      const distLeftCm = (selLeft - nearestLeft) * GRID_UNIT_CM;
      const distRightCm = (nearestRight - selRight) * GRID_UNIT_CM;
      if (distLeftCm > 0) lines.push({ id: "dim-left", from: { x: nearestLeft, y: cy }, to: { x: selLeft, y: cy }, distanceCm: Math.round(distLeftCm) });
      if (distRightCm > 0) lines.push({ id: "dim-right", from: { x: selRight, y: cy }, to: { x: nearestRight, y: cy }, distanceCm: Math.round(distRightCm) });
    }
    return { dimensionLines: lines, aisleHighlights };
  }, [showDimensions, layout.row_containers, layout.racks, layout.grid_cols, layout.grid_rows, selectedRowContainerId, selectedRowContainerIds, selectedRackIds, draggingRowId, rowDragPreviewStart, rackDragPreviewPositions]);

  return { dimensionData };
}
