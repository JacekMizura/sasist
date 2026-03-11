import { useCallback, useEffect } from "react";
import type { LayoutState } from "../../types/warehouse";
import { GRID_UNIT_CM } from "../../types/warehouse";
import { findSnapToRowPosition } from "../../components/warehouse/warehouseUtils";
import { LayoutMode } from "../../warehouse-layout";
import {
  getRowStart,
  computeRowSlotPositions,
  filterEmptyRowContainers,
  findEmptySlotAt,
  findRowAndSlotForRack,
  canPlaceGroup,
  snapRowPreviewToDistance,
  snapPosition,
} from "./DesignerRackPlacement";
import type { CatalogItem } from "../../types/warehouse";
import type { Dispatch, SetStateAction } from "react";

export interface UseDesignerMouseHandlersRefs {
  svgRef: React.RefObject<SVGSVGElement | null>;
  panStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
  lastMouseRef: React.MutableRefObject<{ clientX: number; clientY: number } | null>;
  cursorPendingRef: React.MutableRefObject<{ x: number; y: number } | null>;
  cursorRafRef: React.MutableRefObject<number | null>;
  rafIdRef: React.MutableRefObject<number>;
  rowDragPointerOffsetRef: React.MutableRefObject<{ dx: number; dy: number } | null>;
  rowDragPreviewStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
  rowDrawEndPendingRef: React.MutableRefObject<{ x: number; y: number } | null>;
  rowDrawEndRafRef: React.MutableRefObject<number | null>;
  rowDrawTemplateRef: React.MutableRefObject<CatalogItem | null>;
  placeRowWithTemplateRef: React.MutableRefObject<((start: { x: number; y: number }, end: { x: number; y: number }, item: CatalogItem) => void) | null>;
  placeEmptyRowRef: React.MutableRefObject<((start: { x: number; y: number }, end: { x: number; y: number }) => void) | null>;
  canMoveRowToRef: React.MutableRefObject<((rowId: string, newStart: { x: number; y: number }) => boolean) | null>;
  moveRowToPositionRef: React.MutableRefObject<((rowId: string, newStartX: number, newStartY: number) => void) | null>;
  moveRackWithinRowRef: React.MutableRefObject<((rowId: string, rackId: number | string, fromSlotIndex: number, toSlotIndex: number) => void) | null>;
}

export interface UseDesignerMouseHandlersState {
  layout: LayoutState;
  isPanning: boolean;
  placementMode: boolean;
  draggingRackId: number | string | null;
  dragOffset: { dx: number; dy: number } | null;
  draggingVisualId: string | null;
  dragOffsetVisual: { dx: number; dy: number } | null;
  draggingWallEnd: { visualId: string; end: 0 | 1 } | null;
  draggingPathPointIndex: number | null;
  marqueeStart: { x: number; y: number } | null;
  marqueeEnd: { x: number; y: number } | null;
  rowToolActive: boolean;
  rowDrawStart: { x: number; y: number } | null;
  rowDrawEnd: { x: number; y: number } | null;
  rowToolTemplate: CatalogItem | null;
  aisleDrawStart: { x: number; y: number } | null;
  draggingRowId: string | null;
  rowDragPreviewStart: { x: number; y: number } | null;
  rackDragPreviewPosition: { x: number; y: number } | null;
  manualPathPoints: { x: number; y: number }[];
  showPickingPath: boolean;
  pathToolActive: boolean;
  isLiveView: boolean;
  mainView: "magazyn" | "layout";
  layoutMode: LayoutMode;
  selectedWarehouseId: number | null;
  selectedRackIds: Array<number | string>;
  selectedVisualIds: string[];
  showDimensions: boolean;
  snapToGrid: boolean;
  aisleWidthCm: number;
  ghostW: number;
  ghostH: number;
}

export interface UseDesignerMouseHandlersSetters {
  setIsPanning: (v: boolean) => void;
  setPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
  setCursorCm: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setGhostPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setRowDragPreviewStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setRowPreviewCursor: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setRowDrawEnd: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setMarqueeEnd: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setRackDragPreviewPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setLayout: Dispatch<SetStateAction<LayoutState>>;
  setManualPathPoints: Dispatch<SetStateAction<{ x: number; y: number }[]>>;
  setSelectedRackId: Dispatch<SetStateAction<number | string | null>>;
  setSelectedRackIds: Dispatch<SetStateAction<Array<number | string>>>;
  setSelectedVisualId: Dispatch<SetStateAction<string | null>>;
  setSelectedVisualIds: Dispatch<SetStateAction<string[]>>;
  setSelectedPathPointIndex: Dispatch<SetStateAction<number | null>>;
  setSelectedPathLine: (v: boolean) => void;
  setSelectedAisleIndex: Dispatch<SetStateAction<number | null>>;
  setShowElevationForRackId: Dispatch<SetStateAction<number | string | null>>;
  setDraggingRackId: Dispatch<SetStateAction<number | string | null>>;
  setDragOffset: Dispatch<SetStateAction<{ dx: number; dy: number } | null>>;
  setDraggingVisualId: Dispatch<SetStateAction<string | null>>;
  setDragOffsetVisual: Dispatch<SetStateAction<{ dx: number; dy: number } | null>>;
  setDraggingWallEnd: Dispatch<SetStateAction<{ visualId: string; end: 0 | 1 } | null>>;
  setDraggingPathPointIndex: Dispatch<SetStateAction<number | null>>;
  setRowDrawStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setMarqueeStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setAisleDrawStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setShowPickingPath: (v: boolean) => void;
  setSelectedRowContainerId: Dispatch<SetStateAction<string | null>>;
  setSelectedRowContainerIds: Dispatch<SetStateAction<string[]>>;
  setDraggingRowId: Dispatch<SetStateAction<string | null>>;
  setMainView: (v: "magazyn" | "layout") => void;
  setSelectedRackIdForSideView: Dispatch<SetStateAction<number | string | null>>;
  setSelectedLocationForProducts: Dispatch<SetStateAction<{ level_index: number; segment_index: number } | null>>;
  setProductSearchQuery: (v: string) => void;
  setShowAllProductsInSidebar: (v: boolean) => void;
  setRowToolTemplate: Dispatch<SetStateAction<CatalogItem | null>>;
}

export interface UseDesignerMouseHandlersCallbacks {
  stampRackAt: (cell: { x: number; y: number }) => void;
  addSpecialLocation: (cell: { x: number; y: number }, type: "PICK_START" | "PACKING" | "DOCK") => void;
}

export interface UseDesignerMouseHandlersParams {
  layout: LayoutState;
  refs: UseDesignerMouseHandlersRefs;
  state: UseDesignerMouseHandlersState;
  setters: UseDesignerMouseHandlersSetters;
  callbacks: UseDesignerMouseHandlersCallbacks;
  helpers: {
    findSnapToRowPosition: typeof findSnapToRowPosition;
    snapPosition: typeof snapPosition;
    snapRowPreviewToDistance: typeof snapRowPreviewToDistance;
    findEmptySlotAt: typeof findEmptySlotAt;
    findRowAndSlotForRack: typeof findRowAndSlotForRack;
    canPlaceGroup: typeof canPlaceGroup;
    getRowStart: typeof getRowStart;
    computeRowSlotPositions: typeof computeRowSlotPositions;
    filterEmptyRowContainers: typeof filterEmptyRowContainers;
    reindexGeometricRow: typeof reindexGeometricRow;
  };
  options: {
    ghostW: number;
    ghostH: number;
    panMode: boolean;
    aisleToolActive: boolean;
  };
}

export function useDesignerMouseHandlers(params: UseDesignerMouseHandlersParams) {
  const { layout, refs, state, setters, callbacks, helpers, options } = params;
  const {
    svgRef,
    panStartRef,
    lastMouseRef,
    cursorPendingRef,
    cursorRafRef,
    rafIdRef,
    rowDragPointerOffsetRef,
    rowDragPreviewStartRef,
    rowDrawEndPendingRef,
    rowDrawEndRafRef,
    rowDrawTemplateRef,
  } = refs;
  const {
    isPanning,
    placementMode,
    draggingRackId,
    dragOffset,
    draggingVisualId,
    dragOffsetVisual,
    draggingWallEnd,
    draggingPathPointIndex,
    marqueeStart,
    marqueeEnd,
    rowToolActive,
    rowDrawStart,
    rowDrawEnd,
    rowToolTemplate,
    aisleDrawStart,
    draggingRowId,
    rowDragPreviewStart,
    rackDragPreviewPosition,
    manualPathPoints,
    showPickingPath,
    pathToolActive,
    isLiveView,
    mainView,
    layoutMode,
    selectedWarehouseId,
  selectedRackIds,
  selectedVisualIds,
  showDimensions,
  snapToGrid,
  aisleWidthCm,
  ghostW,
  ghostH,
  } = state;
  const {
    setIsPanning,
    setPan,
    setCursorCm,
    setGhostPosition,
    setRowDragPreviewStart,
    setRowPreviewCursor,
    setRowDrawEnd,
    setMarqueeEnd,
    setRackDragPreviewPosition,
    setLayout,
    setManualPathPoints,
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedVisualId,
    setSelectedVisualIds,
    setSelectedPathPointIndex,
    setSelectedPathLine,
    setSelectedAisleIndex,
    setShowElevationForRackId,
    setDraggingRackId,
    setDragOffset,
    setDraggingVisualId,
    setDragOffsetVisual,
    setDraggingWallEnd,
    setDraggingPathPointIndex,
    setRowDrawStart,
    setMarqueeStart,
    setAisleDrawStart,
    setShowPickingPath,
    setSelectedRowContainerId,
    setSelectedRowContainerIds,
    setDraggingRowId,
    setMainView,
    setSelectedRackIdForSideView,
    setSelectedLocationForProducts,
    setProductSearchQuery,
    setShowAllProductsInSidebar,
  setRowToolTemplate,
  } = setters;
  const { stampRackAt, addSpecialLocation } = callbacks;
  const { placeRowWithTemplateRef, placeEmptyRowRef, canMoveRowToRef, moveRowToPositionRef, moveRackWithinRowRef } = refs;
  const { findSnapToRowPosition: findSnap, snapPosition: snapPos, snapRowPreviewToDistance: snapRowPreview } = helpers;
  const { panMode, aisleToolActive } = options;

  const getCellFromEvent = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const col = (e.clientX - rect.left) / rect.width * layout.grid_cols;
      const row = (e.clientY - rect.top) / rect.height * layout.grid_rows;
      const x = Math.max(0, Math.min(layout.grid_cols - 1, Math.round(col)));
      const y = Math.max(0, Math.min(layout.grid_rows - 1, Math.round(row)));
      return { x, y };
    },
    [layout.grid_cols, layout.grid_rows, svgRef]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      lastMouseRef.current = { clientX: e.clientX, clientY: e.clientY };
      const cell = getCellFromEvent(e);
      if (cell) {
        const x = cell.x * GRID_UNIT_CM;
        const y = cell.y * GRID_UNIT_CM;
        cursorPendingRef.current = { x, y };
        if (cursorRafRef.current == null) {
          cursorRafRef.current = requestAnimationFrame(() => {
            cursorRafRef.current = null;
            const pending = cursorPendingRef.current;
            if (pending) setCursorCm((prev) => (prev != null && prev.x === pending.x && prev.y === pending.y ? prev : pending));
          });
        }
      }
      if (isPanning) {
        const ne = e.nativeEvent as MouseEvent;
        const movX = typeof ne.movementX === "number" ? ne.movementX : (panStartRef.current ? e.clientX - panStartRef.current.x : 0);
        const movY = typeof ne.movementY === "number" ? ne.movementY : (panStartRef.current ? e.clientY - panStartRef.current.y : 0);
        setPan((p) => ({ x: p.x + movX, y: p.y + movY }));
        panStartRef.current = { x: e.clientX, y: e.clientY };
      }
      if (placementMode && cell) {
        if (rafIdRef.current === 0) {
          rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = 0;
            const last = lastMouseRef.current;
            if (last && svgRef.current) {
              const c = getCellFromEvent(last);
              if (c) {
                const x = Math.max(0, Math.min(layout.grid_cols - ghostW, c.x));
                const y = Math.max(0, Math.min(layout.grid_rows - ghostH, c.y));
                setGhostPosition((p) => (p?.x === x && p?.y === y ? p : { x, y }));
              }
            }
          });
        }
      }
      if (draggingRowId != null && rowDragPointerOffsetRef.current && cell) {
        const { dx, dy } = rowDragPointerOffsetRef.current;
        let px = Math.max(0, Math.min(layout.grid_cols - 1, Math.round(cell.x - dx)));
        let py = Math.max(0, Math.min(layout.grid_rows - 1, Math.round(cell.y - dy)));
        if (showDimensions) {
          const row = layout.row_containers?.find((rc) => rc.id === draggingRowId);
          if (row) {
            const snapped = snapRowPreview(row, { x: px, y: py }, layout);
            px = snapped.x;
            py = snapped.y;
          }
        }
        setRowDragPreviewStart((prev) => (prev?.x === px && prev?.y === py ? prev : { x: px, y: py }));
        rowDragPreviewStartRef.current = { x: px, y: py };
      }
      if (rowToolActive && rowDrawStart && cell) {
        setRowPreviewCursor({ x: e.clientX, y: e.clientY });
        rowDrawEndPendingRef.current = cell;
        if (rowDrawEndRafRef.current == null) {
          rowDrawEndRafRef.current = requestAnimationFrame(() => {
            rowDrawEndRafRef.current = null;
            const pending = rowDrawEndPendingRef.current;
            if (pending) setRowDrawEnd((prev) => (prev?.x === pending.x && prev?.y === pending.y ? prev : pending));
          });
        }
      }
      if (marqueeStart != null && cell && draggingRackId == null && draggingRowId == null && !rowToolActive && !aisleDrawStart && !placementMode) {
        setMarqueeEnd((prev) => (prev?.x === cell.x && prev?.y === cell.y ? prev : cell));
      }
      if (draggingRackId != null && dragOffset != null && cell) {
        const desired = { x: cell.x - dragOffset.dx, y: cell.y - dragOffset.dy };
        const anchorRack = layout.racks.find((r) => (r.id ?? r.rack_index) === draggingRackId);
        const w = anchorRack?.width ?? 1;
        const h = anchorRack?.height ?? 1;
        if (selectedRackIds.length > 1 && anchorRack) {
          const snappedAnchor = {
            x: Math.round(desired.x),
            y: Math.round(desired.y),
          };
          setRackDragPreviewPosition(snappedAnchor);
        } else {
          const excludeIds = selectedRackIds.length > 1 ? selectedRackIds : [draggingRackId];
          const rowSnap = findSnap(layout.racks, desired.x, desired.y, w, h, draggingRackId);
          const freeSnap = snapToGrid
            ? snapPos(desired, w, h, layout.racks.filter((r) => !excludeIds.includes(r.id ?? r.rack_index)), layout.grid_cols, layout.grid_rows, aisleWidthCm)
            : { x: Math.max(0, Math.min(layout.grid_cols - w, Math.round(desired.x))), y: Math.max(0, Math.min(layout.grid_rows - h, Math.round(desired.y))) };
          const SNAP_THRESHOLD = 2.5;
          const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
          let pos: { x: number; y: number };
          if (rowSnap && dist(desired, rowSnap) <= SNAP_THRESHOLD * SNAP_THRESHOLD) {
            pos = { x: rowSnap.x, y: rowSnap.y };
          } else if (dist(desired, freeSnap) <= SNAP_THRESHOLD * SNAP_THRESHOLD) {
            pos = freeSnap;
          } else {
            pos = { x: Math.max(0, Math.min(layout.grid_cols - w, Math.round(desired.x))), y: Math.max(0, Math.min(layout.grid_rows - h, Math.round(desired.y))) };
          }
          setRackDragPreviewPosition(pos);
        }
      }
      if (draggingVisualId != null && dragOffsetVisual != null && cell) {
        const ve = layout.visual_elements?.find((v) => v.id === draggingVisualId);
        if (ve) {
          const desired = { x: cell.x - dragOffsetVisual.dx, y: cell.y - dragOffsetVisual.dy };
          const w = ve.width;
          const h = ve.height;
          const pos = {
            x: Math.max(0, Math.min(layout.grid_cols - w, Math.round(desired.x))),
            y: Math.max(0, Math.min(layout.grid_rows - h, Math.round(desired.y))),
          };
          setLayout((prev) => ({
            ...prev,
            visual_elements: (prev.visual_elements ?? []).map((el) => (el.id === draggingVisualId ? { ...el, x: pos.x, y: pos.y } : el)),
          }));
        }
      }
      if (draggingPathPointIndex !== null && cell) {
        setManualPathPoints((prev) => prev.map((p, i) => (i === draggingPathPointIndex ? { x: Math.max(0, Math.min(layout.grid_cols - 1, cell.x)), y: Math.max(0, Math.min(layout.grid_rows - 1, cell.y)) } : p)));
      }
      if (draggingWallEnd != null && cell) {
        const ve = (layout.visual_elements ?? []).find((v) => v.id === draggingWallEnd.visualId);
        if (ve && ve.type === "wall") {
          const len = ve.length ?? ve.width;
          if (draggingWallEnd.end === 0) {
            const newX = Math.max(0, Math.min(ve.x + len - 1, Math.round(cell.x)));
            const newLen = ve.x + len - newX;
            setLayout((prev) => ({
              ...prev,
              visual_elements: (prev.visual_elements ?? []).map((el) => (el.id === ve.id ? { ...el, x: newX, width: Math.max(1, newLen), length: Math.max(1, newLen) } : el)),
            }));
          } else {
            const newLen = Math.max(1, Math.round(cell.x - ve.x));
            setLayout((prev) => ({
              ...prev,
              visual_elements: (prev.visual_elements ?? []).map((el) => (el.id === ve.id ? { ...el, width: newLen, length: newLen } : el)),
            }));
          }
        }
      }
    },
    [placementMode, draggingRackId, dragOffset, draggingVisualId, dragOffsetVisual, draggingWallEnd, draggingPathPointIndex, getCellFromEvent, layout.racks, layout.visual_elements, layout.grid_cols, layout.grid_rows, layout.row_containers, ghostW, ghostH, isPanning, marqueeStart, rowToolActive, rowDrawStart, snapToGrid, aisleWidthCm, draggingRowId, selectedRackIds, showDimensions, aisleDrawStart]
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const cell = getCellFromEvent(e);
      if (e.button === 1) {
        e.preventDefault();
        panStartRef.current = { x: e.clientX, y: e.clientY };
        setIsPanning(true);
        return;
      }
      if (panMode && e.button === 0) {
        panStartRef.current = { x: e.clientX, y: e.clientY };
        setIsPanning(true);
        return;
      }
      if (!cell) {
        if (e.button === 0) {
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedVisualId(null);
          setSelectedVisualIds([]);
          setSelectedPathPointIndex(null);
          setSelectedPathLine(false);
          setSelectedAisleIndex(null);
        }
        return;
      }
      if (e.button === 0 && selectedWarehouseId != null && (layoutMode === LayoutMode.ADD_START || layoutMode === LayoutMode.ADD_PACK || layoutMode === LayoutMode.ADD_DOCK)) {
        const type = layoutMode === LayoutMode.ADD_START ? "PICK_START" : layoutMode === LayoutMode.ADD_PACK ? "PACKING" : "DOCK";
        addSpecialLocation(cell, type);
        return;
      }
      if (isLiveView && e.button === 0) {
        const hit = layout.racks.find((r) => cell.x >= r.x && cell.x < r.x + r.width && cell.y >= r.y && cell.y < r.y + r.height);
        if (hit) {
          setSelectedRackId(hit.id ?? hit.rack_index);
          setSelectedRackIds([hit.id ?? hit.rack_index]);
          setShowElevationForRackId(hit.id ?? hit.rack_index);
          setSelectedVisualId(null);
          setSelectedVisualIds([]);
          setSelectedAisleIndex(null);
        } else {
          const aisleIndex = layout.aisles.findIndex((a) => cell.x >= a.x && cell.x < a.x + a.width && cell.y >= a.y && cell.y < a.y + a.height);
          if (aisleIndex >= 0) {
            setSelectedAisleIndex(aisleIndex);
            setSelectedRackId(null);
            setSelectedRackIds([]);
            setShowElevationForRackId(null);
          } else {
            setSelectedRackId(null);
            setSelectedRackIds([]);
            setSelectedAisleIndex(null);
            setShowElevationForRackId(null);
          }
        }
        return;
      }
      if (e.button === 0 && showPickingPath && manualPathPoints.length > 0) {
        const pathPoints = manualPathPoints.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
        const pathPointIndex = manualPathPoints.length > 0 ? manualPathPoints.findIndex((p) => Math.abs(p.x + 0.5 - (cell.x + 0.5)) <= 1 && Math.abs(p.y + 0.5 - (cell.y + 0.5)) <= 1) : -1;
        if (pathPointIndex >= 0) {
          setSelectedPathPointIndex(pathPointIndex);
          setSelectedPathLine(false);
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedVisualId(null);
          setSelectedVisualIds([]);
          setSelectedAisleIndex(null);
          if (pathToolActive) setDraggingPathPointIndex(pathPointIndex);
          return;
        }
        const cx = cell.x + 0.5;
        const cy = cell.y + 0.5;
        let lineHitSegmentIndex = -1;
        let insertAt: { x: number; y: number } | null = null;
        if (manualPathPoints.length >= 2) {
          for (let i = 0; i < manualPathPoints.length - 1; i++) {
            const ax = pathPoints[i].x;
            const ay = pathPoints[i].y;
            const bx = pathPoints[i + 1].x;
            const by = pathPoints[i + 1].y;
            const t = Math.max(0, Math.min(1, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
            const px = ax + t * (bx - ax);
            const py = ay + t * (by - ay);
            if (Math.hypot(cx - px, cy - py) <= 1.5) {
              lineHitSegmentIndex = i;
              insertAt = { x: Math.round(px - 0.5), y: Math.round(py - 0.5) };
              break;
            }
          }
        }
        if (pathToolActive && lineHitSegmentIndex >= 0 && insertAt) {
          setManualPathPoints((prev) => {
            const next = [...prev.slice(0, lineHitSegmentIndex + 1), insertAt!, ...prev.slice(lineHitSegmentIndex + 1)];
            return next;
          });
          setSelectedPathPointIndex(lineHitSegmentIndex + 1);
          setSelectedPathLine(false);
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedVisualId(null);
          setSelectedVisualIds([]);
          setSelectedAisleIndex(null);
          setDraggingPathPointIndex(lineHitSegmentIndex + 1);
          return;
        }
        if (lineHitSegmentIndex >= 0) {
          setSelectedPathLine(true);
          setSelectedPathPointIndex(null);
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedVisualId(null);
          setSelectedVisualIds([]);
          setSelectedAisleIndex(null);
          return;
        }
      }
      setSelectedPathPointIndex(null);
      setSelectedPathLine(false);
      if (pathToolActive && e.button === 0) {
        const pathPointIndex = manualPathPoints.findIndex((p) => Math.abs(p.x - cell.x) <= 1 && Math.abs(p.y - cell.y) <= 1);
        if (pathPointIndex >= 0) {
          setDraggingPathPointIndex(pathPointIndex);
          return;
        }
        const aisleIdx = layout.aisles.findIndex((a) => cell.x >= a.x && cell.x < a.x + a.width && cell.y >= a.y && cell.y < a.y + a.height);
        const hitRack = layout.racks.find((r) => cell.x >= r.x && cell.x < r.x + r.width && cell.y >= r.y && cell.y < r.y + r.height);
        const vs = [...(layout.visual_elements ?? [])].sort((a, b) => b.zIndex - a.zIndex);
        const hitV = vs.find((ve) => cell.x >= ve.x && cell.x < ve.x + ve.width && cell.y >= ve.y && cell.y < ve.y + ve.height);
        if (aisleIdx < 0 && !hitRack && !hitV) {
          setManualPathPoints((prev) => [...prev, { x: cell.x, y: cell.y }]);
          setShowPickingPath(true);
          return;
        }
      }
      if (placementMode) {
        stampRackAt(cell);
        return;
      }
      if (rowToolActive && e.button === 0) {
        if (!rowDrawStart) {
          rowDrawTemplateRef.current = rowToolTemplate?.type === "custom"
            ? { type: "custom" as const, template: { ...rowToolTemplate.template } }
            : rowToolTemplate ?? null;
          setRowDrawStart(cell);
          setRowDrawEnd(cell);
        }
        return;
      }
      if (aisleToolActive && e.button === 0) {
        setAisleDrawStart(cell);
        return;
      }
      const aisleIndex = layout.aisles.findIndex(
        (a) => cell.x >= a.x && cell.x < a.x + a.width && cell.y >= a.y && cell.y < a.y + a.height
      );
      if (aisleIndex >= 0 && e.button === 0) {
        setSelectedAisleIndex(aisleIndex);
        setSelectedRackId(null);
        setSelectedRackIds([]);
        setSelectedVisualId(null);
        setSelectedVisualIds([]);
        setSelectedPathPointIndex(null);
        setSelectedPathLine(false);
        return;
      }
      if (e.button === 0 && selectedVisualIds.length > 0) {
        for (const vid of selectedVisualIds) {
          const ve = (layout.visual_elements ?? []).find((v) => v.id === vid);
          if (ve?.type !== "wall") continue;
          const len = ve.length ?? ve.width;
          const th = ve.thickness ?? ve.height;
          const leftEnd = { x: ve.x, y: ve.y + th / 2 };
          const rightEnd = { x: ve.x + len, y: ve.y + th / 2 };
          if (Math.abs(cell.x - leftEnd.x) <= 1.5 && Math.abs(cell.y - leftEnd.y) <= 1.5) {
            setDraggingWallEnd({ visualId: ve.id, end: 0 });
            return;
          }
          if (Math.abs(cell.x - rightEnd.x) <= 1.5 && Math.abs(cell.y - rightEnd.y) <= 1.5) {
            setDraggingWallEnd({ visualId: ve.id, end: 1 });
            return;
          }
        }
      }
      const visuals = [...(layout.visual_elements ?? [])].sort((a, b) => b.zIndex - a.zIndex);
      const hitVisual = visuals.find((ve) => cell.x >= ve.x && cell.x < ve.x + ve.width && cell.y >= ve.y && cell.y < ve.y + ve.height);
      if (hitVisual && e.button === 0) {
        setSelectedPathPointIndex(null);
        setSelectedPathLine(false);
        if (e.shiftKey) {
          setSelectedVisualIds((prev) =>
            prev.includes(hitVisual.id) ? prev.filter((id) => id !== hitVisual.id) : [...prev, hitVisual.id]
          );
          setSelectedVisualId(hitVisual.id);
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedAisleIndex(null);
          setDraggingVisualId(hitVisual.id);
          setDragOffsetVisual({ dx: cell.x - hitVisual.x, dy: cell.y - hitVisual.y });
        } else {
          setSelectedVisualIds([hitVisual.id]);
          setSelectedVisualId(hitVisual.id);
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedAisleIndex(null);
          setDraggingVisualId(hitVisual.id);
          setDragOffsetVisual({ dx: cell.x - hitVisual.x, dy: cell.y - hitVisual.y });
        }
        return;
      }
      const hit = layout.racks.find(
        (r) => cell.x >= r.x && cell.x < r.x + r.width && cell.y >= r.y && cell.y < r.y + r.height
      );
      if (hit) {
        setSelectedPathPointIndex(null);
        setSelectedPathLine(false);
        const rid = hit.id ?? hit.rack_index;
        if (e.ctrlKey || e.metaKey) {
          setSelectedRackIds((prev) => (prev.includes(rid) ? prev.filter((id) => id !== rid) : [...prev, rid]));
          setSelectedRackId(rid);
        } else {
          setSelectedRackId(rid);
          setSelectedRackIds((prev) => (prev.includes(rid) ? prev : [rid]));
          setDraggingRackId(rid);
          setDragOffset({ dx: cell.x - hit.x, dy: cell.y - hit.y });
          setRackDragPreviewPosition({ x: hit.x, y: hit.y });
          if (mainView !== "layout") {
            setMainView("magazyn");
            setSelectedRackIdForSideView(rid);
            setSelectedLocationForProducts(null);
            setProductSearchQuery("");
            setShowAllProductsInSidebar(false);
            setDraggingRackId(null);
          }
        }
      } else {
        const emptySlotHit = helpers.findEmptySlotAt(layout.row_containers, cell);
        if (emptySlotHit && e.button === 0 && !(e.ctrlKey || e.metaKey)) {
          setSelectedRowContainerId(emptySlotHit.rowContainer.id);
          setSelectedRowContainerIds([emptySlotHit.rowContainer.id]);
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedAisleIndex(null);
          setSelectedVisualId(null);
          setSelectedVisualIds([]);
          setSelectedPathPointIndex(null);
          setSelectedPathLine(false);
          return;
        }
        if (!(e.ctrlKey || e.metaKey)) {
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedRowContainerId(null);
          setSelectedRowContainerIds([]);
          setSelectedAisleIndex(null);
          setSelectedVisualId(null);
          setSelectedVisualIds([]);
          setSelectedPathPointIndex(null);
          setSelectedPathLine(false);
          if (e.button === 0) setRowToolTemplate(null);
        }
        setMarqueeStart(cell);
        setMarqueeEnd(cell);
      }
    },
    [getCellFromEvent, placementMode, layout.racks, layout.aisles, layout.visual_elements, layout.row_containers, stampRackAt, panMode, aisleToolActive, rowToolActive, rowToolTemplate, rowDrawStart, pathToolActive, manualPathPoints, isLiveView, mainView, layoutMode, selectedWarehouseId, addSpecialLocation, selectedVisualIds]
  );

  const handleCanvasMouseUp = useCallback(() => {
    const templateAtDrawStart = rowDrawTemplateRef.current;
    if (rowToolActive && rowDrawStart) {
      let end = rowDrawEndPendingRef.current ?? rowDrawEnd;
      if (end == null && lastMouseRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const col = (lastMouseRef.current.clientX - rect.left) / rect.width * layout.grid_cols;
        const row = (lastMouseRef.current.clientY - rect.top) / rect.height * layout.grid_rows;
        end = { x: Math.max(0, Math.min(layout.grid_cols - 1, Math.round(col))), y: Math.max(0, Math.min(layout.grid_rows - 1, Math.round(row))) };
      }
      if (end) {
        const activeTemplate = templateAtDrawStart ?? rowToolTemplate;
        const placeRowWithTemplate = placeRowWithTemplateRef.current;
        const placeEmptyRow = placeEmptyRowRef.current;
        if (activeTemplate && placeRowWithTemplate) {
          placeRowWithTemplate(rowDrawStart, end, activeTemplate);
        } else if (placeEmptyRow) {
          placeEmptyRow(rowDrawStart, end);
        }
      }
      rowDrawTemplateRef.current = null;
      rowDrawEndPendingRef.current = null;
      if (rowDrawEndRafRef.current != null) {
        cancelAnimationFrame(rowDrawEndRafRef.current);
        rowDrawEndRafRef.current = null;
      }
      setRowDrawStart(null);
      setRowDrawEnd(null);
      setRowPreviewCursor(null);
    }
    if (marqueeStart && marqueeEnd) {
      const x0 = Math.min(marqueeStart.x, marqueeEnd.x);
      const y0 = Math.min(marqueeStart.y, marqueeEnd.y);
      const x1 = Math.max(marqueeStart.x, marqueeEnd.x);
      const y1 = Math.max(marqueeStart.y, marqueeEnd.y);
      const hasExtent = marqueeStart.x !== marqueeEnd.x || marqueeStart.y !== marqueeEnd.y;
      if (hasExtent) {
        const inBoxRacks = layout.racks.filter((r) => r.x < x1 + r.width && r.x + r.width > x0 && r.y < y1 + r.height && r.y + r.height > y0);
        const rowIdsInBox = new Set<string>();
        for (const rc of layout.row_containers ?? []) {
          const intersects = rc.slots.some((s) => !(s.x + s.w <= x0 || x1 <= s.x || s.y + s.h <= y0 || y1 <= s.y));
          if (intersects) rowIdsInBox.add(rc.id);
        }
        setSelectedRackIds(inBoxRacks.map((r) => r.id ?? r.rack_index));
        setSelectedRackId(inBoxRacks.length > 0 ? inBoxRacks[0].id ?? inBoxRacks[0].rack_index : null);
        setSelectedRowContainerIds(Array.from(rowIdsInBox));
        setSelectedRowContainerId(rowIdsInBox.size > 0 ? Array.from(rowIdsInBox)[0] ?? null : null);
      }
      setMarqueeStart(null);
      setMarqueeEnd(null);
    }
    if (aisleDrawStart) {
      let end: { x: number; y: number } | null = aisleDrawStart;
      if (lastMouseRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const col = (lastMouseRef.current.clientX - rect.left) / rect.width * layout.grid_cols;
        const row = (lastMouseRef.current.clientY - rect.top) / rect.height * layout.grid_rows;
        end = { x: Math.max(0, Math.min(layout.grid_cols - 1, Math.round(col))), y: Math.max(0, Math.min(layout.grid_rows - 1, Math.round(row))) };
      }
      if (end) {
        const x = Math.min(aisleDrawStart.x, end.x);
        const y = Math.min(aisleDrawStart.y, end.y);
        const w = Math.max(1, Math.abs(end.x - aisleDrawStart.x) + 1);
        const h = Math.max(1, Math.abs(end.y - aisleDrawStart.y) + 1);
        setLayout((prev) => ({
          ...prev,
          aisles: [...prev.aisles, { x, y, width: w, height: h, two_way: true, name: `Alejka ${prev.aisles.length + 1}` }],
        }));
      }
      setAisleDrawStart(null);
    }
    setIsPanning(false);
    panStartRef.current = null;
    const canMoveRowTo = canMoveRowToRef.current;
    const moveRowToPosition = moveRowToPositionRef.current;
    if (draggingRowId != null && rowDragPreviewStart != null && canMoveRowTo && moveRowToPosition) {
      if (canMoveRowTo(draggingRowId, rowDragPreviewStart)) {
        moveRowToPosition(draggingRowId, rowDragPreviewStart.x, rowDragPreviewStart.y);
      }
      setDraggingRowId(null);
      setRowDragPreviewStart(null);
      rowDragPointerOffsetRef.current = null;
    }
    if (draggingRackId != null) {
      const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === draggingRackId);
      const finalPos = rackDragPreviewPosition ?? (rack ? { x: rack.x, y: rack.y } : { x: 0, y: 0 });
      if (selectedRackIds.length > 1 && rack) {
        const groupIds = new Set(selectedRackIds);
        const positions = new Map<number | string, { x: number; y: number }>();
        for (const id of selectedRackIds) {
          const r = layout.racks.find((ra) => (ra.id ?? ra.rack_index) === id);
          if (!r) continue;
          positions.set(id, {
            x: finalPos.x + (r.x - rack.x),
            y: finalPos.y + (r.y - rack.y),
          });
        }
        if (helpers.canPlaceGroup(layout, groupIds, positions)) {
          setLayout((prev) => {
            const clearedRowSlots = (prev.row_containers ?? []).map((rc) => ({
              ...rc,
              slots: rc.slots.map((s) =>
                s.rackId != null && groupIds.has(s.rackId) ? { ...s, rackId: undefined } : s
              ),
            }));
            const newSlotsByRow = clearedRowSlots.map((rc) => {
              const { x: startX, y: startY } = helpers.getRowStart(rc);
              return { ...rc, slots: helpers.computeRowSlotPositions(rc.slots, startX, startY, rc.orientation ?? "horizontal") };
            });
            const updatedRacks = prev.racks.map((r) => {
              const pos = positions.get(r.id ?? r.rack_index);
              if (pos) return { ...r, x: pos.x, y: pos.y };
              const slotForRack = newSlotsByRow.flatMap((rc) => rc.slots).find((s) => s.rackId != null && String(s.rackId) === String(r.id ?? r.rack_index));
              if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
              return r;
            });
            return {
              ...prev,
              racks: updatedRacks,
              row_containers: helpers.filterEmptyRowContainers(newSlotsByRow),
            };
          });
        }
        setRackDragPreviewPosition(null);
      } else {
        const rowSlot = helpers.findRowAndSlotForRack(layout.row_containers, draggingRackId);
        const emptyAtDrop = helpers.findEmptySlotAt(layout.row_containers, finalPos);
        const moveRackWithinRow = moveRackWithinRowRef.current;
        const sameRowDrop = rowSlot && emptyAtDrop && emptyAtDrop.rowContainer.id === rowSlot.rowContainer.id
          && (emptyAtDrop.slot.w >= (rack?.width ?? 0)) && rowSlot.slotIndex !== emptyAtDrop.slotIndex;
        if (sameRowDrop && moveRackWithinRow) {
          moveRackWithinRow(rowSlot!.rowContainer.id, draggingRackId, rowSlot!.slotIndex, emptyAtDrop!.slotIndex);
        } else if (rowSlot) {
          const currentSlot = rowSlot.rowContainer.slots[rowSlot.slotIndex];
          const stayedInSlot = currentSlot && finalPos.x >= currentSlot.x && finalPos.x < currentSlot.x + currentSlot.w
            && finalPos.y >= currentSlot.y && finalPos.y < currentSlot.y + currentSlot.h;
          if (!stayedInSlot) {
            setLayout((prev) => {
              const rc = prev.row_containers ?? [];
              const row = rc.find((r) => r.id === rowSlot.rowContainer.id);
              if (!row) return prev;
              const { x: startX, y: startY } = helpers.getRowStart(row);
              const cleared = row.slots.map((s, i) =>
                i === rowSlot.slotIndex ? { x: 0, y: startY, w: s.w, h: s.h } : s
              );
              const newSlots = helpers.computeRowSlotPositions(cleared, startX, startY, row.orientation ?? "horizontal");
              const updatedRacks = prev.racks.map((r) => {
                if ((r.id ?? r.rack_index) === draggingRackId) return { ...r, x: finalPos.x, y: finalPos.y };
                const slotForRack = newSlots.find((s) => s.rackId != null && String(s.rackId) === String(r.id ?? r.rack_index));
                if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
                return r;
              });
              return {
                ...prev,
                racks: helpers.reindexGeometricRow(updatedRacks, draggingRackId),
                row_containers: rc.map((r) => (r.id === rowSlot.rowContainer.id ? { ...r, slots: newSlots } : r)),
              };
            });
          }
        } else {
          setLayout((prev) => {
            const withPosition = { ...prev, racks: prev.racks.map((r) => (r.id ?? r.rack_index) === draggingRackId ? { ...r, x: finalPos.x, y: finalPos.y } : r) };
            return { ...withPosition, racks: helpers.reindexGeometricRow(withPosition.racks, draggingRackId) };
          });
        }
        setRackDragPreviewPosition(null);
      }
    }
    setDraggingRackId(null);
    setDragOffset(null);
    setDraggingVisualId(null);
    setDragOffsetVisual(null);
    setDraggingWallEnd(null);
    setDraggingPathPointIndex(null);
  }, [marqueeStart, marqueeEnd, layout.racks, layout.row_containers, aisleDrawStart, layout.grid_cols, layout.grid_rows, rowToolActive, rowDrawStart, rowDrawEnd, rowToolTemplate, draggingRackId, rackDragPreviewPosition, draggingRowId, rowDragPreviewStart, selectedRackIds, showDimensions]);

  useEffect(() => {
    const onWindowMouseUp = () => {
      setIsPanning(false);
      panStartRef.current = null;
    };
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, [setIsPanning, panStartRef]);

  useEffect(() => {
    if (!isPanning) return;
    const onWindowMouseMove = (e: MouseEvent) => {
      const movX = typeof e.movementX === "number" ? e.movementX : (panStartRef.current ? e.clientX - panStartRef.current.x : 0);
      const movY = typeof e.movementY === "number" ? e.movementY : (panStartRef.current ? e.clientY - panStartRef.current.y : 0);
      setPan((p) => ({ x: p.x + movX, y: p.y + movY }));
      panStartRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onWindowMouseMove);
    return () => window.removeEventListener("mousemove", onWindowMouseMove);
  }, [isPanning, setPan, panStartRef]);

  useEffect(() => {
    if (!draggingRowId) return;
    const onWindowMouseMove = (ev: MouseEvent) => {
      const cell = getCellFromEvent(ev);
      if (!cell || !rowDragPointerOffsetRef.current) return;
      const { dx, dy } = rowDragPointerOffsetRef.current;
      let px = Math.max(0, Math.min(layout.grid_cols - 1, Math.round(cell.x - dx)));
      let py = Math.max(0, Math.min(layout.grid_rows - 1, Math.round(cell.y - dy)));
      if (showDimensions) {
        const row = layout.row_containers?.find((rc) => rc.id === draggingRowId);
        if (row) {
          const snapped = snapRowPreview(row, { x: px, y: py }, layout);
          px = snapped.x;
          py = snapped.y;
        }
      }
      setRowDragPreviewStart((prev) => (prev?.x === px && prev?.y === py ? prev : { x: px, y: py }));
      rowDragPreviewStartRef.current = { x: px, y: py };
    };
    const onWindowMouseUp = () => {
      const preview = rowDragPreviewStartRef.current;
      const canMoveRowTo = canMoveRowToRef.current;
      const moveRowToPosition = moveRowToPositionRef.current;
      if (draggingRowId && preview != null && canMoveRowTo && moveRowToPosition) {
        if (canMoveRowTo(draggingRowId, preview)) {
          moveRowToPosition(draggingRowId, preview.x, preview.y);
        }
        setDraggingRowId(null);
        setRowDragPreviewStart(null);
        rowDragPointerOffsetRef.current = null;
        rowDragPreviewStartRef.current = null;
      }
    };
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [draggingRowId, getCellFromEvent, layout.grid_cols, layout.grid_rows, layout.row_containers, showDimensions]);

  const handleCanvasMouseLeave = useCallback(() => {
    setCursorCm(null);
    setGhostPosition(null);
    setDraggingRackId(null);
    setDragOffset(null);
    setDraggingVisualId(null);
    setDragOffsetVisual(null);
    setRowDrawEnd(null);
  }, []);

  return {
    getCellFromEvent,
    handleCanvasMouseMove,
    handleCanvasMouseDown,
    handleCanvasMouseUp,
    handleCanvasMouseLeave,
  };
}
