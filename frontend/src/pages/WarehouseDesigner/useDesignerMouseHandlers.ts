import { useCallback } from "react";
import type { LayoutState } from "../../types/warehouse";
import { cellsToCm } from "../../components/warehouse/warehouseUtils";
import { findSnapToRowPosition, reindexGeometricRow } from "../../components/warehouse/warehouseUtils";
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
import { getCellFromClientPosition, getWallFromClientPosition } from "./utils/designerMouseUtils";
import type { CatalogItem } from "../../types/warehouse";
import type { Dispatch, SetStateAction } from "react";
import { usePanInteraction } from "./interactions/usePanInteraction";
import { usePlacementInteraction } from "./interactions/usePlacementInteraction";
import { useRowInteraction } from "./interactions/useRowInteraction";
import { useVisualInteraction } from "./interactions/useVisualInteraction";
import { useRackInteraction } from "./interactions/useRackInteraction";
import { useSelectionInteraction } from "./interactions/useSelectionInteraction";

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
  isLiveView: boolean;
  mainView: "magazyn" | "layout";
  layoutMode: LayoutMode;
  selectedWarehouseId: number | null;
  selectedRackIds: Array<number | string>;
  selectedVisualIds: string[];
  snapToGrid: boolean;
  aisleWidthCm: number;
  ghostW: number;
  ghostH: number;
  copyPlacementMode?: boolean;
  copiedRack?: import("../../types/warehouse").RackState | null;
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
  setSelectedRackId: Dispatch<SetStateAction<number | string | null>>;
  setSelectedRackIds: Dispatch<SetStateAction<Array<number | string>>>;
  setSelectedVisualId: Dispatch<SetStateAction<string | null>>;
  setSelectedVisualIds: Dispatch<SetStateAction<string[]>>;
  setSelectedAisleIndex: Dispatch<SetStateAction<number | null>>;
  setShowElevationForRackId: Dispatch<SetStateAction<number | string | null>>;
  setDraggingRackId: Dispatch<SetStateAction<number | string | null>>;
  setDragOffset: Dispatch<SetStateAction<{ dx: number; dy: number } | null>>;
  setDraggingVisualId: Dispatch<SetStateAction<string | null>>;
  setDragOffsetVisual: Dispatch<SetStateAction<{ dx: number; dy: number } | null>>;
  setDraggingWallEnd: Dispatch<SetStateAction<{ visualId: string; end: 0 | 1 } | null>>;
  setRowDrawStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setMarqueeStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setAisleDrawStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setSelectedRowContainerId: Dispatch<SetStateAction<string | null>>;
  setSelectedRowContainerIds: Dispatch<SetStateAction<string[]>>;
  setDraggingRowId: Dispatch<SetStateAction<string | null>>;
  setMainView: (v: "magazyn" | "layout") => void;
  setSelectedRackIdForSideView: Dispatch<SetStateAction<number | string | null>>;
  setSelectedLocationForProducts: Dispatch<SetStateAction<{ level_index: number; segment_index: number } | null>>;
  setProductSearchQuery: (v: string) => void;
  setShowAllProductsInSidebar: (v: boolean) => void;
  setRowToolTemplate: Dispatch<SetStateAction<CatalogItem | null>>;
  setSelectedWallElementId?: Dispatch<SetStateAction<string | null>>;
}

export interface UseDesignerMouseHandlersCallbacks {
  stampRackAt: (cell: { x: number; y: number }) => void;
  addSpecialLocation: (cell: { x: number; y: number }, type: "PICK_START" | "PACKING" | "DOCK") => void;
  placeCopiedRack?: (cell: { x: number; y: number }) => void;
  onAddWallElement?: (wall: "north" | "south" | "east" | "west", position_cm: number, type: "door" | "gate", gateType?: "courier" | "supplier" | "both") => void;
  onRequestGatePlacement?: (wall: "north" | "south" | "east" | "west", position_cm: number) => void;
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
    canvasWidthPx?: number;
    canvasHeightPx?: number;
    gridUnitCm?: number;
    wallElementTool?: "door" | "gate" | null;
  };
}

export function useDesignerMouseHandlers(params: UseDesignerMouseHandlersParams) {
  const { layout, refs, state, setters, callbacks, helpers, options } = params;
  const { placeCopiedRack, onAddWallElement, onRequestGatePlacement } = callbacks;
  const { canvasWidthPx = 0, canvasHeightPx = 0, gridUnitCm = 10, wallElementTool } = options;
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
    isLiveView,
    mainView,
    selectedWarehouseId,
  selectedRackIds,
  selectedVisualIds,
  snapToGrid,
  aisleWidthCm,
  ghostW,
  ghostH,
  copyPlacementMode = false,
  copiedRack = null,
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
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedVisualId,
    setSelectedVisualIds,
    setSelectedAisleIndex,
    setShowElevationForRackId,
    setDraggingRackId,
    setDragOffset,
    setDraggingVisualId,
    setDragOffsetVisual,
    setDraggingWallEnd,
    setRowDrawStart,
    setMarqueeStart,
    setAisleDrawStart,
    setSelectedRowContainerId,
    setSelectedRowContainerIds,
    setDraggingRowId,
    setMainView,
    setSelectedRackIdForSideView,
    setSelectedLocationForProducts,
    setProductSearchQuery,
    setShowAllProductsInSidebar,
  setRowToolTemplate,
  setSelectedWallElementId,
  } = setters;
  const { stampRackAt, addSpecialLocation } = callbacks;
  const { placeRowWithTemplateRef, placeEmptyRowRef, canMoveRowToRef, moveRowToPositionRef, moveRackWithinRowRef } = refs;
  const { snapRowPreviewToDistance: snapRowPreview } = helpers;
  const { panMode, aisleToolActive } = options;

  const getCellFromEvent = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      return getCellFromClientPosition(
        e.clientX,
        e.clientY,
        rect,
        layout.grid_cols,
        layout.grid_rows
      );
    },
    [layout.grid_cols, layout.grid_rows, svgRef]
  );

  function clearAllSelections() {
    setSelectedRackId(null);
    setSelectedRackIds([]);
    setSelectedVisualId(null);
    setSelectedVisualIds([]);
    setSelectedAisleIndex(null);
    if (setSelectedWallElementId) setSelectedWallElementId(null);
  }

  const pan = usePanInteraction({
    panStartRef,
    isPanning,
    setPan,
    setIsPanning,
    panMode,
  });

  const placement = usePlacementInteraction({
    layout,
    placementMode,
    ghostW,
    ghostH,
    selectedWarehouseId,
    layoutMode: state.layoutMode,
    isLiveView,
    refs: { lastMouseRef, svgRef, rafIdRef },
    getCellFromEvent,
    setGhostPosition,
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedVisualId,
    setSelectedVisualIds,
    setSelectedAisleIndex,
    setShowElevationForRackId,
    stampRackAt,
    addSpecialLocation,
    copyPlacementMode,
    copiedRack,
    placeCopiedRack,
  });

  const row = useRowInteraction({
    layout,
    rowToolActive,
    rowDrawStart,
    rowDrawEnd,
    rowToolTemplate,
    draggingRowId,
    rowDragPreviewStart,
    refs: {
      rowDragPointerOffsetRef,
      rowDragPreviewStartRef,
      rowDrawEndPendingRef,
      rowDrawEndRafRef,
      rowDrawTemplateRef,
      placeRowWithTemplateRef,
      placeEmptyRowRef,
      canMoveRowToRef,
      moveRowToPositionRef,
      lastMouseRef,
      svgRef,
    },
    getCellFromEvent,
    snapRowPreviewToDistance: snapRowPreview,
    setRowDrawStart,
    setRowDrawEnd,
    setRowPreviewCursor,
    setRowDragPreviewStart,
    setDraggingRowId,
    setRowToolTemplate,
  });

  const visual = useVisualInteraction({
    layout,
    selectedVisualIds,
    draggingVisualId,
    dragOffsetVisual,
    draggingWallEnd,
    setSelectedVisualIds,
    setSelectedVisualId,
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedAisleIndex,
    setDraggingVisualId,
    setDragOffsetVisual,
    setDraggingWallEnd,
    setLayout,
  });

  const rack = useRackInteraction({
    layout,
    draggingRackId,
    dragOffset,
    selectedRackIds,
    rackDragPreviewPosition,
    mainView,
    snapToGrid,
    aisleWidthCm,
    refs: { moveRackWithinRowRef },
    helpers: {
      findSnapToRowPosition: helpers.findSnapToRowPosition,
      snapPosition: helpers.snapPosition,
      canPlaceGroup: helpers.canPlaceGroup,
      getRowStart: helpers.getRowStart,
      computeRowSlotPositions: helpers.computeRowSlotPositions,
      filterEmptyRowContainers: helpers.filterEmptyRowContainers,
      findRowAndSlotForRack: helpers.findRowAndSlotForRack,
      findEmptySlotAt: helpers.findEmptySlotAt,
      reindexGeometricRow: helpers.reindexGeometricRow,
    },
    setSelectedRackId,
    setSelectedRackIds,
    setDraggingRackId,
    setDragOffset,
    setRackDragPreviewPosition,
    setLayout,
    setMainView,
    setSelectedRackIdForSideView,
    setSelectedLocationForProducts,
    setProductSearchQuery,
    setShowAllProductsInSidebar,
  });

  const selection = useSelectionInteraction({
    layout,
    marqueeStart,
    marqueeEnd,
    aisleDrawStart,
    aisleToolActive,
    draggingRackId,
    draggingRowId,
    rowToolActive,
    placementMode,
    refs: { lastMouseRef, svgRef },
    findEmptySlotAt: helpers.findEmptySlotAt,
    setMarqueeStart,
    setMarqueeEnd,
    setAisleDrawStart,
    setSelectedRackIds,
    setSelectedRackId,
    setSelectedRowContainerIds,
    setSelectedRowContainerId,
    setSelectedAisleIndex,
    setLayout,
    setRowToolTemplate,
    clearAllSelections,
  });

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      lastMouseRef.current = { clientX: e.clientX, clientY: e.clientY };
      const cell = getCellFromEvent(e);
      function handleCursorUpdate() {
        if (!cell) return;
        const x = cellsToCm(cell.x);
        const y = cellsToCm(cell.y);
        cursorPendingRef.current = { x, y };
        if (cursorRafRef.current == null) {
          cursorRafRef.current = requestAnimationFrame(() => {
            cursorRafRef.current = null;
            const pending = cursorPendingRef.current;
            if (pending) setCursorCm((prev) => (prev != null && prev.x === pending.x && prev.y === pending.y ? prev : pending));
          });
        }
      }
      handleCursorUpdate();
      pan.handlePanMove(e, cell);
      placement.handleMouseMove(e, cell);
      row.handleMouseMove(e, cell);
      selection.handleMouseMove(e, cell);
      rack.handleMouseMove(e, cell);
      visual.handleMouseMove(e, cell);
    },
    [getCellFromEvent, pan, placement, row, selection, rack, visual]
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const cell = getCellFromEvent(e);
      if (pan.handlePanStart(e)) return;
      if (wallElementTool && (onAddWallElement || onRequestGatePlacement) && svgRef.current && canvasWidthPx > 0 && canvasHeightPx > 0) {
        const rect = svgRef.current.getBoundingClientRect();
        const hit = getWallFromClientPosition(e.clientX, e.clientY, rect, canvasWidthPx, canvasHeightPx, layout.grid_cols, layout.grid_rows, gridUnitCm);
        if (hit) {
          e.preventDefault();
          e.stopPropagation();
          if (wallElementTool === "gate" && onRequestGatePlacement) {
            onRequestGatePlacement(hit.wall, hit.position_cm);
          } else if (wallElementTool === "door" && onAddWallElement) {
            onAddWallElement(hit.wall, hit.position_cm, "door");
          }
          return;
        }
      }
      if (!cell) {
        if (e.button === 0) clearAllSelections();
        return;
      }
      if (placement.handleMouseDown(e, cell)) return;
      if (row.handleMouseDown(e, cell)) return;
      if (selection.handleAislePart(e, cell)) return;
      if (visual.handleMouseDown(e, cell)) return;
      if (rack.handleMouseDown(e, cell)) return;
      selection.handleMarqueePart(e, cell);
    },
    [getCellFromEvent, clearAllSelections, pan, placement, row, selection, visual, rack, wallElementTool, onAddWallElement, onRequestGatePlacement, layout.grid_cols, layout.grid_rows, canvasWidthPx, canvasHeightPx, gridUnitCm]
  );

  const handleCanvasMouseUp = useCallback(() => {
    row.handleMouseUp();
    selection.handleMouseUp();
    pan.handlePanEnd();
    rack.handleMouseUp();
    visual.handleMouseUpCleanup();
  }, [row, selection, pan, rack, visual]);

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
