import React, { useState, useCallback, useEffect, useRef, type RefObject } from "react";
import { MapPin, Package } from "lucide-react";
import type { LayoutState, RackState, WallElement } from "../../types/warehouse";
import type { CatalogItem, VisualElementType } from "../../types/warehouse";
import { GRID_UNIT_CM } from "../../types/warehouse";
import { layoutCmToCellsX, layoutCmToCellsY, layoutCellsToMetersX, layoutCellsToMetersY } from "../../utils/warehouseGridMetrics";
import {
  getCatalogItemSpec,
  resolveRowContainerBinDirection,
  resolveRowContainerRackDirection,
  rowDrawSegmentExtents,
  rowDrawRackPositionsAlongCursor,
} from "./warehouseUtils";
import { RowPreviewOverlay } from "./RowPreviewOverlay";
import { WAREHOUSE_CANVAS_CELL_PX } from "./renderUtils";
import { LayoutModeBadge, LayoutMode, LAYOUT_MODE_CURSORS } from "../warehouse-layout";
import { colors, radius } from "../../layout/designTokens";
import { RackLayer } from "./WarehouseCanvas/RackLayer";
import { RowLayer } from "./WarehouseCanvas/RowLayer";
import { VisualLayer } from "./WarehouseCanvas/VisualLayer";
import { SelectionOverlay } from "./WarehouseCanvas/SelectionOverlay";
import { WallElementsLayer } from "./WarehouseCanvas/WallElementsLayer";
import { PathLayer } from "./WarehouseCanvas/PathLayer";
import { RouteStopLayer } from "./WarehouseCanvas/RouteStopLayer";

const RACK_RADIUS_PX = parseFloat(radius.small) || 6;

/** Major / strong grid lines in cell counts (grid space only; not meters). */
const GRID_MAJOR_CELLS = 10;
const GRID_STRONG_CELLS = 50;

/** Ctrl/Cmd + wheel zoom (Figma-like); aligned with `useDesignerCanvas` persistence clamp. */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;

const VIEWPORT_TRANSITION_MS = 200;

/** Row-draw preview: rack starts from mousedown toward cursor (±step); grid-filtered; length from first to last rack. */
function computeRowDrawGhostPreview(
  layout: LayoutState,
  rowDrawStart: { x: number; y: number },
  rowDrawEnd: { x: number; y: number },
  rowToolTemplate: CatalogItem | null,
  defaultRowSlotW: number,
  defaultRowSlotH: number,
  rowGapCm: number
): { positions: { x: number; y: number }[]; rackCount: number; lengthMeters: number } {
  const gridCols = layout.grid_cols;
  const gridRows = layout.grid_rows;
  const { isHorizontal } = rowDrawSegmentExtents(rowDrawStart, rowDrawEnd);
  const spec = rowToolTemplate ? getCatalogItemSpec(rowToolTemplate) : null;
  const spanX = spec ? layoutCmToCellsX(layout, spec.width_cm) : defaultRowSlotW;
  const spanY = spec ? layoutCmToCellsY(layout, spec.depth_cm) : defaultRowSlotH;
  const gapCells = isHorizontal ? layoutCmToCellsX(layout, rowGapCm) : layoutCmToCellsY(layout, rowGapCm);
  const orientedW = isHorizontal ? spanX : spanY;
  const orientedH = isHorizontal ? spanY : spanX;
  const stepAlong = isHorizontal ? orientedW + gapCells : orientedH + gapCells;
  const rackWidthCells = isHorizontal ? orientedW : orientedH;

  if (isHorizontal) {
    const lineY = rowDrawStart.y;
    let along = rowDrawRackPositionsAlongCursor(rowDrawStart.x, rowDrawEnd.x, stepAlong);
    along = along.filter((a) => a >= 0 && a + orientedW <= gridCols);
    const count = along.length;
    const positions = along.map((x) => ({ x, y: lineY }));
    const totalCells =
      count > 0 ? Math.max(...along) - Math.min(...along) + orientedW : 0;
    return { positions, rackCount: count, lengthMeters: layoutCellsToMetersX(layout, totalCells) };
  }

  const lineX = rowDrawStart.x;
  let along = rowDrawRackPositionsAlongCursor(rowDrawStart.y, rowDrawEnd.y, stepAlong);
  along = along.filter((a) => a >= 0 && a + orientedH <= gridRows);
  const count = along.length;
  const positions = along.map((y) => ({ x: lineX, y }));
  const totalCells =
    count > 0 ? Math.max(...along) - Math.min(...along) + orientedH : 0;
  return { positions, rackCount: count, lengthMeters: layoutCellsToMetersY(layout, totalCells) };
}

export type WarehouseCanvasProps = {
  /** edit = full designer interactions; read = view-only; export = clean map for PDF (racks, labels, occupancy only). */
  mode?: "edit" | "read" | "export";
  layout: LayoutState;
  selectedWarehouseId: number | null;
  loading: boolean;
  zoom: number;
  setZoom: (fn: (z: number) => number) => void;
  pan: { x: number; y: number };
  setPan: (fn: (p: { x: number; y: number }) => { x: number; y: number }) => void;
  placementMode: boolean;
  ghostPosition: { x: number; y: number } | null;
  ghostW: number;
  ghostH: number;
  ghostCollision: boolean;
  draggingFromCatalog: CatalogItem | null;
  catalogGhostPosition: { x: number; y: number } | null;
  setCatalogGhostPosition: (pos: { x: number; y: number } | null) => void;
  stampRackFromCatalogItem: (cell: { x: number; y: number }, item: CatalogItem) => void;
  /** Drop a catalog item into a specific row slot (direct slot drop target). */
  stampRackIntoSlot?: (rowId: string, slotIndex: number, item: CatalogItem) => void;
  /** When provided, used to snap catalog ghost and drop to empty row slots. */
  getCatalogDropCell?: (cell: { x: number; y: number }, item: CatalogItem) => { x: number; y: number };
  /** Report cell under cursor during catalog drag (to highlight empty slot). */
  setCatalogHoveredSlotFromCell?: (cell: { x: number; y: number } | null) => void;
  /** Set hovered slot directly (when dragging over a slot rect). */
  setCatalogHoveredSlot?: (slot: { rowId: string; slotIndex: number } | null) => void;
  /** When dragging from catalog, the empty slot under cursor (for blue border). */
  catalogHoveredSlot?: { rowId: string; slotIndex: number } | null;
  getCellFromEvent: (e: { clientX: number; clientY: number }) => { x: number; y: number } | null;
  /** When set, empty slots with width < this (cells) are hidden for horizontal rows; for vertical, slot.w >= depth and slot.h >= width. */
  minEmptySlotWidthCells?: number;
  /** For vertical rows: minimum slot width (depth direction) in cells. Used with minEmptySlotWidthCells for fit. */
  minEmptySlotDepthCells?: number;
  snapPosition: (
    desired: { x: number; y: number },
    ghostW: number,
    ghostH: number,
    racks: { x: number; y: number; width: number; height: number }[],
    gridCols: number,
    gridRows: number,
    aisleWidthCm?: number
  ) => { x: number; y: number };
  rectsOverlap: (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ) => boolean;
  cellPx: number;
  width: number;
  height: number;
  svgRef: RefObject<SVGSVGElement | null>;
  canvasContainerRef: RefObject<HTMLDivElement | null>;
  /** When set, points at the map-only wrapper (no toolbar) for PDF raster capture. */
  mapExportCaptureRef?: RefObject<HTMLDivElement | null>;
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  panMode: boolean;
  isPanning?: boolean;
  selectedRackIds: Array<number | string>;
  collisionRackId: number | string | null;
  /** When set (e.g. group drag invalid), all these racks show as collision (red). */
  collisionRackIds?: Array<number | string> | null;
  /** Racks to highlight (e.g. product locator). Values are String(rack.id ?? rack.rack_index). */
  highlightedRackIds?: Set<string>;
  /** Optional rack click handler (primarily for read mode). */
  onRackClick?: (rackId: number | string) => void;
  /** Optional rack click handler that should not prevent canvas click behavior. */
  onRackClickPassthrough?: (rackId: number | string) => void;
  /** When true, racks show route-planning hover affordance (pointer + highlight). Clicks use canvas mousedown, not passthrough. */
  isRoutePlanningMode?: boolean;
  /** Optional rack double-click handler (primarily for read mode). */
  onRackDoubleClick?: (rackId: number | string) => void;
  /** Read mode only: click on map background (not rack, visual zone overlay, etc.) — e.g. clear map selection. */
  onReadModeCanvasBackgroundClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
  /** Racks outside building boundary; drawn with red stroke. */
  outsideRackIds?: Array<number | string>;
  selectedRack: RackState | undefined;
  editingRackId?: number | string | null;
  isMultiSelect: boolean;
  setInternalLayoutRackId: (id: number | string | null) => void;
  setShowElevationForRackId: (id: number | string | null) => void;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  setSelectedRackId: (id: number | string | null) => void;
  setSelectedRackIds: (ids: Array<number | string>) => void;
  marqueeStart: { x: number; y: number } | null;
  marqueeEnd: { x: number; y: number } | null;
  cursorCm: { x: number; y: number } | null;
  /** Returns paste position in cm (cursor, last cursor, or layout center). Used so paste works when mouse left canvas. */
  getPastePosition?: () => { x: number; y: number };
  draggingRackId: number | string | null;
  /** When set, the rack being dragged is drawn at this position (smooth drag). */
  rackDragPreviewPosition: { x: number; y: number } | null;
  /** When dragging multiple racks, preview position for each (id -> {x,y}). Overrides rackDragPreviewPosition for each. */
  rackDragPreviewPositions?: Record<string, { x: number; y: number }> | null;
  /** When dragging a rack: valid drop slots (green) and occupied/invalid slots (red). */
  dragSlotHighlights: { validSlots: Array<{ x: number; y: number; width: number; height: number }>; invalidSlots: Array<{ x: number; y: number; width: number; height: number }> } | null;
  /** Default slot size (cells) for "Draw Row" ghost when no template selected. */
  defaultRowSlotW?: number;
  defaultRowSlotH?: number;
  selectedRowContainerId?: string | null;
  /** When set (e.g. from marquee), all these row containers are shown as selected. */
  selectedRowContainerIds?: string[];
  /** Called when user clicks on an empty slot (to select the row container). */
  onSelectRowContainer?: (rowId: string) => void;
  /** Fill all empty slots in the selected row with the given template. */
  fillSelectedRowWithTemplate?: (item: CatalogItem) => void;
  /** Remove the selected empty row from the layout. */
  deleteSelectedRow?: () => void;
  /** Remove trailing empty slots from the selected row. */
  trimSelectedRowEnd?: () => void;
  /** Toggle the selected row between horizontal and vertical orientation. */
  rotateSelectedRow?: () => void;
  /** When set, the row is being dragged; show ghost at rowDragPreviewStart and use grabbing cursor. */
  draggingRowId?: string | null;
  rowDragPreviewStart?: { x: number; y: number } | null;
  /** Call on mousedown on the row drag handle to start moving the whole row. */
  onStartRowDrag?: (e: React.MouseEvent | { clientX: number; clientY: number }) => void;
  aisleToolActive: boolean;
  setAisleToolActive: (fn: (a: boolean) => boolean) => void;
  rowToolActive: boolean;
  setRowToolActive: (fn: (a: boolean) => boolean) => void;
  /** When provided, activating "Rysuj Rząd" will clear the selected template so user can draw empty rows. */
  setRowToolTemplate?: (item: CatalogItem | null) => void;
  rowToolTemplate: CatalogItem | null;
  rowDrawStart: { x: number; y: number } | null;
  rowDrawEnd: { x: number; y: number } | null;
  /** Cursor position (clientX, clientY) while dragging to draw a row; for RowPreviewOverlay. */
  rowPreviewCursor?: { x: number; y: number } | null;
  rowGapCm: number;
  /** Optional: when provided, „Siła przyciągania” in toolbar; passed to snapPosition for magnetic snapping (catalog drag). */
  aisleWidthCm?: number;
  setAisleWidthCm?: (v: number) => void;
  setRowGapCm?: (v: number) => void;
  showGrid: boolean;
  setShowGrid: (fn: (v: boolean) => boolean) => void;
  showLabels: boolean;
  setShowLabels: (fn: (v: boolean) => boolean) => void;
  selectedAisleIndex: number | null;
  draggingVisualType: VisualElementType | null;
  setDraggingVisualType: (t: VisualElementType | null) => void;
  visualGhostPosition: { x: number; y: number } | null;
  setVisualGhostPosition: (p: { x: number; y: number } | null) => void;
  addVisualElement: (cell: { x: number; y: number }, type: VisualElementType) => void;
  getDefaultVisualSize: (type: VisualElementType) => { w: number; h: number };
  selectedVisualId: string | null;
  onExportPdf?: () => void | Promise<void>;
  selectedVisualIds?: string[];
  isLiveView?: boolean;
  /** Layout mode badge (top-right of canvas) */
  layoutModeLabel?: string;
  layoutModeColor?: string;
  /** Current layout mode (drives cursor on canvas) */
  layoutMode?: LayoutMode;
  /** Set layout mode (for Add Start / Pack / Dock tools) */
  setLayoutMode?: (mode: LayoutMode | ((prev: LayoutMode) => LayoutMode)) => void;
  /** Special warehouse nodes (PICK_START, PACKING, DOCK) for rendering above shelves */
  specialLocations?: {
    pick_start: { id: number; x: number; y: number } | null;
    packing: { id: number; x: number; y: number } | null;
    dock: { id: number; x: number; y: number } | null;
  };
  /** Update special location position (cell in grid cells). Parent converts to cm and calls API. */
  onUpdateSpecialLocation?: (locationId: number, cell: { x: number; y: number }) => void;
  /** Delete special location by id. */
  onDeleteSpecialLocation?: (locationId: number) => void;
  /** Copy rack from toolbar → enter copy placement mode. */
  onCopyRack?: (rack: RackState) => void;
  /** When true, ghost shows copied rack and click places duplicate. */
  copyPlacementMode?: boolean;
  /** Rack being placed in copy placement mode (for ghost size). */
  copiedRack?: RackState | null;
  /** Doors and gates on building perimeter. */
  wallElements?: WallElement[];
  selectedWallElementId?: string | null;
  setSelectedWallElementId?: (id: string | null) => void;
  draggingWallElementId?: string | null;
  dragPreviewPositionCm?: number | null;
  onStartWallElementDrag?: (el: WallElement) => void;
  /** Optional: simple visual path in grid cells (v1). */
  pathPoints?: { x: number; y: number }[] | null;
  /** Optional: path split into segments (e.g. route stop-to-stop); when set, drawn as single neutral line when routeMode. */
  pathSegments?: { x: number; y: number }[][] | null;
  /** Optional numbered markers for path (used when not in route stop-first mode). */
  pathMarkers?: { x: number; y: number; label: string }[] | null;
  /** Stop-first route: stops to show as primary markers (numbered on racks). When set, path is secondary neutral line. */
  routeStops?: { rackId: string; position: { x: number; y: number } }[] | null;
  /** Toggle route visualization layers without changing route data. */
  showRoute?: boolean;
  /** Optional product quantity badge per highlighted rack. */
  rackQuantities?: Map<string, number>;
  /** Magazyn: highlight specific bins (location UUIDs) on the map. */
  highlightedBinUUIDs?: Set<string>;
  /** Magazyn: primary bin when multiple are highlighted (e.g. product list → map). */
  focusedBinUUID?: string | null;
  /** Magazyn: single bin highlight from sidebar location row hover (does not affect selection). */
  hoveredLocationUUID?: string | null;
  getRackDisplayId?: (r: RackState) => string;
  /** Stop index highlighted from sidebar click (highlight marker + rack). */
  highlightedStopIndex?: number | null;
  /** Current step: this stop strong, previous dimmed, next normal. */
  currentStopIndex?: number | null;
  /** Step navigation: badges only on current + next rack (see RackLayer). */
  routeStepBadges?: {
    currentRackId: string;
    nextRackId: string | null;
    currentOrder: number;
    nextOrder: number | null;
  } | null;
  /** Packing / route end in grid cells (optional path terminus). */
  routeEndCell?: { x: number; y: number } | null;
  /** Precomputed aisle-graph polyline for route mode (overrides point-to-point path). */
  routeGraphPolyline?: { x: number; y: number }[] | null;
  /** When false, hide START/PACK on the map (step-by-step navigation). */
  showRouteEndpointMarkers?: boolean;
  /** Extra SVG layer (e.g. authored Routing Graph overlay in Routes workspace). */
  svgOverlay?: React.ReactNode;
};

function WarehouseCanvasInner({
  mode = "edit",
  layout,
  selectedWarehouseId,
  loading,
  zoom,
  setZoom,
  pan,
  setPan,
  placementMode,
  ghostPosition,
  ghostW,
  ghostH,
  ghostCollision,
  draggingFromCatalog,
  catalogGhostPosition,
  setCatalogGhostPosition,
  stampRackFromCatalogItem,
  stampRackIntoSlot,
  getCatalogDropCell,
  setCatalogHoveredSlotFromCell,
  setCatalogHoveredSlot,
  catalogHoveredSlot = null,
  getCellFromEvent,
  minEmptySlotWidthCells,
  minEmptySlotDepthCells,
  snapPosition,
  rectsOverlap,
  cellPx: _cellPxProp,
  width: _widthProp,
  height: _heightProp,
  svgRef,
  canvasContainerRef,
  mapExportCaptureRef,
  onMouseMove,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  panMode,
  isPanning,
  selectedRackIds,
  collisionRackId,
  collisionRackIds = null,
  highlightedRackIds,
  onRackClick,
  onRackClickPassthrough,
  isRoutePlanningMode = false,
  onRackDoubleClick,
  onReadModeCanvasBackgroundClick,
  outsideRackIds,
  selectedRack,
  editingRackId = null,
  isMultiSelect,
  setInternalLayoutRackId,
  setShowElevationForRackId,
  setLayout,
  setSelectedRackId,
  setSelectedRackIds,
  marqueeStart,
  marqueeEnd,
  cursorCm,
  draggingRackId,
  rackDragPreviewPosition,
  rackDragPreviewPositions = null,
  dragSlotHighlights,
  defaultRowSlotW = 12,
  defaultRowSlotH = 8,
  selectedRowContainerId = null,
  selectedRowContainerIds = [],
  onSelectRowContainer,
  fillSelectedRowWithTemplate,
  deleteSelectedRow,
  trimSelectedRowEnd,
  rotateSelectedRow,
  draggingRowId = null,
  rowDragPreviewStart = null,
  onStartRowDrag,
  aisleToolActive,
  setAisleToolActive,
  rowToolActive,
  setRowToolActive,
  setRowToolTemplate,
  rowToolTemplate,
  rowDrawStart,
  rowDrawEnd,
  rowPreviewCursor = null,
  rowGapCm,
  aisleWidthCm,
  setAisleWidthCm,
  setRowGapCm,
  showGrid,
  setShowGrid,
  showLabels,
  setShowLabels,
  selectedAisleIndex,
  draggingVisualType,
  setDraggingVisualType,
  visualGhostPosition,
  setVisualGhostPosition,
  addVisualElement,
  getDefaultVisualSize,
  selectedVisualId,
  onExportPdf: _onExportPdf,
  selectedVisualIds = [],
  isLiveView,
  layoutModeLabel,
  layoutModeColor,
  layoutMode,
  setLayoutMode,
  specialLocations = { pick_start: null, packing: null, dock: null },
  onUpdateSpecialLocation,
  onDeleteSpecialLocation,
  onCopyRack,
  copyPlacementMode = false,
  copiedRack = null,
  wallElements = [],
  selectedWallElementId = null,
  setSelectedWallElementId,
  draggingWallElementId = null,
  dragPreviewPositionCm = null,
  onStartWallElementDrag,
  pathPoints = null,
  pathSegments = null,
  pathMarkers = null,
  routeStops = null,
  showRoute = true,
  rackQuantities,
  highlightedBinUUIDs,
  focusedBinUUID = null,
  hoveredLocationUUID = null,
  getRackDisplayId,
  highlightedStopIndex = null,
  currentStopIndex = null,
  routeStepBadges = null,
  routeEndCell = null,
  routeGraphPolyline = null,
  /** When false, START/PACK markers are hidden (step-by-step uses rack badges only). */
  showRouteEndpointMarkers = true,
  svgOverlay = null,
}: WarehouseCanvasProps) {
  void _cellPxProp;
  const isExportMode = mode === "export";
  const isReadMode = mode === "read";
  const isEditMode = mode === "edit";
  /** True when the event target is inside an interactive map layer (rack, zone overlay, wall, …). */
  const readModeClickTargetIsInteractive = useCallback((target: EventTarget | null) => {
    const el = target as Element | null;
    if (!el || typeof el.closest !== "function") return false;
    if (el.closest("[data-rack-interactive]")) return true;
    if (el.closest("[data-special-location]")) return true;
    if (el.closest('[data-layer="wall-elements"]')) return true;
    if (el.closest("[data-row-empty-slot]")) return true;
    if (el.closest("[data-visual-elements]")) return true;
    if (el.closest("[data-visual-zone-cell]")) return true;
    return false;
  }, []);

  const handleReadModeCanvasBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!onReadModeCanvasBackgroundClick) return;
      if (readModeClickTargetIsInteractive(e.target)) return;
      onReadModeCanvasBackgroundClick(e as unknown as React.MouseEvent<SVGSVGElement>);
    },
    [onReadModeCanvasBackgroundClick, readModeClickTargetIsInteractive]
  );
  type SpecialKey = "pick_start" | "packing" | "dock";
  const [draggingSpecial, setDraggingSpecial] = useState<{ key: SpecialKey; id: number } | null>(null);
  const [dragPreviewCell, setDragPreviewCell] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: number; key: SpecialKey; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onDocClick = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [contextMenu]);

  const handleSpecialPointerDown = useCallback(
    (e: React.PointerEvent, key: SpecialKey, id: number) => {
      e.stopPropagation();
      if (!isEditMode) return;
      if (onUpdateSpecialLocation) setDraggingSpecial({ key, id });
    },
    [isEditMode, onUpdateSpecialLocation]
  );

  const handleSpecialContextMenu = useCallback(
    (e: React.MouseEvent, key: SpecialKey, id: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (onDeleteSpecialLocation) setContextMenu({ id, key, x: e.clientX, y: e.clientY });
    },
    [onDeleteSpecialLocation]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!isEditMode) return;
      if (draggingSpecial && getCellFromEvent(e)) {
        setDragPreviewCell(getCellFromEvent(e)!);
        return;
      }
      onMouseMove(e as unknown as React.MouseEvent<SVGSVGElement>);
    },
    [isEditMode, draggingSpecial, getCellFromEvent, onMouseMove]
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!isEditMode) return;
      if (draggingSpecial) return;
      onMouseDown(e as unknown as React.MouseEvent<SVGSVGElement>);
    },
    [isEditMode, draggingSpecial, onMouseDown]
  );

  const handleCanvasMouseUp = useCallback(() => {
    if (!isEditMode) return;
    if (draggingSpecial && onUpdateSpecialLocation) {
      const cell = dragPreviewCell ?? (specialLocations[draggingSpecial.key] ? { x: Math.round((specialLocations[draggingSpecial.key]!.x / GRID_UNIT_CM)), y: Math.round((specialLocations[draggingSpecial.key]!.y / GRID_UNIT_CM)) } : null);
      if (cell) onUpdateSpecialLocation(draggingSpecial.id, cell);
      setDraggingSpecial(null);
      setDragPreviewCell(null);
      return;
    }
    onMouseUp();
  }, [isEditMode, draggingSpecial, dragPreviewCell, specialLocations, onUpdateSpecialLocation, onMouseUp]);

  const handleCanvasMouseLeave = useCallback(() => {
    if (!isEditMode) return;
    if (draggingSpecial) return;
    onMouseLeave();
  }, [isEditMode, draggingSpecial, onMouseLeave]);

  const visualIdSet = new Set(selectedVisualIds);
  const isVisualSelected = (id: string) => selectedVisualId === id || visualIdSet.has(id);
  const rowDrawGhostPreview =
    rowDrawStart && rowDrawEnd
      ? computeRowDrawGhostPreview(
          layout,
          rowDrawStart,
          rowDrawEnd,
          rowToolTemplate,
          defaultRowSlotW,
          defaultRowSlotH,
          rowGapCm
        )
      : { positions: [] as { x: number; y: number }[], rackCount: 0, lengthMeters: 0 };
  const rowGhostPositions = rowDrawGhostPreview.positions;
  const rowGhostSpec = rowToolTemplate ? getCatalogItemSpec(rowToolTemplate) : null;
  const rowGhostPw = rowGhostSpec ? layoutCmToCellsX(layout, rowGhostSpec.width_cm) : defaultRowSlotW;
  const rowGhostPh = rowGhostSpec ? layoutCmToCellsY(layout, rowGhostSpec.depth_cm) : defaultRowSlotH;
  const rowPreviewCount = rowDrawGhostPreview.rackCount;
  const rowPreviewLengthMeters = rowDrawGhostPreview.lengthMeters;
  const showRowPreview =
    !isExportMode &&
    layoutMode === LayoutMode.DRAW_ROW &&
    rowDrawStart != null &&
    rowDrawEnd != null &&
    rowPreviewCursor != null;
  const [hoveredRackId, setHoveredRackId] = React.useState<number | string | null>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [enableTransition, setEnableTransition] = React.useState(false);

  /** Fixed cell size; scrollable viewport; inner layer uses CSS scale(zoom). */
  const gridCols = layout.grid_cols;
  const gridRows = layout.grid_rows;
  const cellPx = WAREHOUSE_CANVAS_CELL_PX;
  const width = gridCols * cellPx;
  const height = gridRows * cellPx;
  const scaledCanvasW = width * zoom;
  const scaledCanvasH = height * zoom;

  const viewResetKeyRef = React.useRef<string | null>(null);
  /** Warehouse or layout document identity change: pan 0, scroll reset (zoom stays — persisted in designer). */
  React.useLayoutEffect(() => {
    if (selectedWarehouseId == null) return;
    const key = `${selectedWarehouseId}:${layout.layout_id ?? "null"}`;
    if (viewResetKeyRef.current === key) return;
    viewResetKeyRef.current = key;
    setPan(() => ({ x: 0, y: 0 }));
    const el = viewportRef.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  }, [selectedWarehouseId, layout.layout_id, setPan]);

  /** Ctrl/Cmd + wheel: zoom. Plain wheel: native scroll on viewport. */
  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.001)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  /** Reset zoom to 100%, pan, scroll top-left. */
  const fitViewport = React.useCallback(() => {
    setEnableTransition(true);
    setZoom(() => 1);
    setPan(() => ({ x: 0, y: 0 }));
    const el = viewportRef.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
    setTimeout(() => setEnableTransition(false), VIEWPORT_TRANSITION_MS);
  }, [setZoom, setPan]);

  const gridOpacity = React.useMemo(
    () => ({
      minor: "rgba(60,90,110,0.011)",
      major: "rgba(60,90,110,0.028)",
      strong: "rgba(60,90,110,0.045)",
    }),
    []
  );

  const effectiveShowGrid = isExportMode ? false : showGrid;
  const effectiveShowLabels = isExportMode ? true : showLabels;
  const noopHoverRack = React.useCallback(() => {}, []);
  const exportEmptySelection = React.useMemo(() => [] as Array<number | string>, []);

  return (
    <main
      ref={canvasContainerRef}
      className="m-0 flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col items-stretch justify-start overflow-hidden pl-3.5 pt-3.5"
      style={{ backgroundColor: colors.background, ...(isLiveView ? { overscrollBehavior: "contain" as const } : {}) }}
    >
      {selectedWarehouseId == null ? (
        <div className="flex flex-1 items-start justify-start p-3" style={{ color: colors.textSecondary }}>Wybierz magazyn lub utwórz nowy.</div>
      ) : loading ? (
        <div className="flex flex-1 items-start justify-start p-3" style={{ color: colors.textSecondary }}>Ładowanie…</div>
      ) : (
        <>
          {contextMenu && onDeleteSpecialLocation && (
            <div
              ref={contextMenuRef}
              className="fixed z-[100] min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              role="menu"
            >
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  onDeleteSpecialLocation(contextMenu.id);
                  setContextMenu(null);
                }}
              >
                Usuń
              </button>
            </div>
          )}
          {isEditMode && (
          <div
            className="flex min-h-0 min-w-0 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-slate-200/55 bg-gradient-to-b from-slate-50/98 to-white/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-[4px]"
          >
            <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-slate-200/60 bg-slate-100/50 p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
                className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-white hover:text-slate-900 hover:shadow-sm active:scale-95"
                style={{ color: colors.textSecondary }}
                title="Powiększ"
              >
                +
              </button>
              <span className="min-w-[2.75rem] text-center font-mono text-[11px] tabular-nums text-slate-500">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
                className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-white hover:text-slate-900 hover:shadow-sm active:scale-95"
                style={{ color: colors.textSecondary }}
                title="Pomniejsz"
              >
                −
              </button>
              {!isLiveView && (
                <button
                  type="button"
                  onClick={fitViewport}
                  className="h-8 rounded-md px-2.5 text-[11px] font-medium text-slate-600 transition-all duration-150 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                  style={{ color: colors.textSecondary }}
                  title="Zoom 100%, przewijanie lewy górny róg, pan wyzerowany"
                >
                  Reset
                </button>
              )}
            </div>
            <span className="hidden h-6 w-px shrink-0 bg-slate-200/80 sm:block" aria-hidden />
            {!isLiveView && (
              <div
                className="flex items-center gap-1 rounded-lg border border-slate-200/55 bg-slate-100/40 p-0.5"
                role="group"
                aria-label="Narzędzia rysowania i lokalizacji"
              >
                <button type="button" onClick={() => { const next = !rowToolActive; if (next) setRowToolTemplate?.(null); setRowToolActive((a) => !a); }} className={`h-8 rounded-md px-2.5 text-[11px] font-medium transition-all duration-150 ${rowToolActive ? "bg-white text-sky-900 shadow-sm ring-1 ring-sky-200/80" : "text-slate-600 hover:bg-white/80 hover:text-slate-900"}`} title="Narysuj rząd pustych slotów (bez szablonu). Później przeciągnij szablon do slotu.">Rysuj Rząd</button>
                {setLayoutMode && (
                  <>
                    <button type="button" onClick={() => setLayoutMode(LayoutMode.ADD_START)} className={`h-8 rounded-md px-2.5 text-[11px] font-medium transition-all duration-150 ${layoutMode === LayoutMode.ADD_START ? "bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-200/80" : "text-slate-600 hover:bg-white/80 hover:text-slate-900"}`} title="Punkt startowy kompletacji">Start</button>
                    <button type="button" onClick={() => setLayoutMode(LayoutMode.ADD_PACK)} className={`h-8 rounded-md px-2.5 text-[11px] font-medium transition-all duration-150 ${layoutMode === LayoutMode.ADD_PACK ? "bg-white text-sky-900 shadow-sm ring-1 ring-sky-200/80" : "text-slate-600 hover:bg-white/80 hover:text-slate-900"}`} title="Stacja pakowania">Pakowanie</button>
                  </>
                )}
              </div>
            )}
            {!isLiveView && (
              <>
                <span className="hidden h-6 w-px shrink-0 bg-slate-200/80 sm:block" aria-hidden />
                <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2" role="group" aria-label="Elementy pomocnicze">
                  <span className="whitespace-nowrap pl-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Pomocnicze</span>
                  <div className="flex items-center rounded-lg border border-slate-200/55 bg-slate-100/40 p-0.5">
                    <button
                      type="button"
                      onClick={() => setAisleToolActive((a) => !a)}
                      className={`h-8 rounded-md px-3 text-[11px] font-semibold transition-all duration-150 ${aisleToolActive ? "bg-white text-teal-900 shadow-sm ring-1 ring-teal-200/80" : "text-slate-600 hover:bg-white/80 hover:text-slate-900"}`}
                      title="Strefa to element wizualny – nie wpływa na routing ani logistykę"
                    >
                      Strefa
                    </button>
                  </div>
                </div>
              </>
            )}
            <span className="hidden h-6 w-px shrink-0 bg-slate-200/80 md:block" aria-hidden />
            <div className="flex items-center rounded-lg border border-slate-200/55 bg-slate-100/40 p-0.5" role="group" aria-label="Widok siatki i etykiet">
              <button type="button" onClick={() => setShowGrid((g) => !g)} className={`h-8 rounded-md px-3 text-[11px] font-semibold transition-all duration-150 ${showGrid ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/90" : "text-slate-600 hover:bg-white/80 hover:text-slate-900"}`} title="Widoczna siatka">Siatka</button>
              <span className="w-px self-stretch bg-slate-200/70" aria-hidden />
              <button type="button" onClick={() => setShowLabels((v) => !v)} className={`h-8 rounded-md px-3 text-[11px] font-semibold transition-all duration-150 ${showLabels ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/90" : "text-slate-600 hover:bg-white/80 hover:text-slate-900"}`} title="Nazwy regałów i etykiety elementów">Etykiety</button>
            </div>
            {rowToolActive && rowGhostPositions.length > 0 && (
              <span className="text-[10px] font-mono text-slate-500">
                → {rowGhostPositions.length} {rowToolTemplate ? "regałów" : "slotów"} · {rowPreviewLengthMeters.toFixed(1)} m
              </span>
            )}
            {selectedRowContainerId && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                {(["rack", "bin"] as const).map((kind) => {
                  const rcSel = (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId);
                  const current =
                    kind === "rack"
                      ? rcSel
                        ? resolveRowContainerRackDirection(rcSel)
                        : "LTR"
                      : rcSel
                        ? resolveRowContainerBinDirection(rcSel)
                        : "LTR";
                  const shortLabel = kind === "rack" ? "Regały" : "Lokalizacje";
                  const aria =
                    kind === "rack"
                      ? "Kierunek numeracji regałów w rzędzie"
                      : "Kierunek numeracji lokalizacji w rzędzie";
                  const name = kind === "rack" ? "canvas-rack-direction" : "canvas-bin-direction";
                  return (
                    <fieldset key={kind} className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0">
                      <legend className="sr-only">{aria}</legend>
                      <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-slate-400">{shortLabel}</span>
                      <div
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-slate-50/80 px-2 py-1"
                        role="radiogroup"
                        aria-label={aria}
                      >
                        {(["LTR", "RTL"] as const).map((dir) => (
                          <label key={dir} className="flex cursor-pointer items-center gap-1 text-[10px] text-slate-700">
                            <input
                              type="radio"
                              name={name}
                              className="h-3 w-3 border-slate-300 text-cyan-600 focus:ring-cyan-500"
                              checked={current === dir}
                              onChange={() => {
                                setLayout((prev) => ({
                                  ...prev,
                                  row_containers: (prev.row_containers ?? []).map((rc) => {
                                    if (rc.id !== selectedRowContainerId) return rc;
                                    if (kind === "rack") return { ...rc, rack_direction: dir };
                                    return { ...rc, bin_direction: dir };
                                  }),
                                }));
                              }}
                            />
                            <span>{dir === "LTR" ? "Lewo → prawo" : "Prawo → lewo"}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
                {onStartRowDrag && (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); onStartRowDrag(e); }}
                    className="flex h-8 cursor-grab items-center gap-1 rounded-lg border border-slate-200/70 bg-white px-2.5 text-[11px] font-medium text-slate-700 shadow-sm transition-all duration-150 hover:bg-slate-50 hover:shadow-md active:cursor-grabbing"
                    title="Przeciągnij rząd (przesuń cały rząd)"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                    Przenieś rząd
                  </button>
                )}
                {rowToolTemplate && fillSelectedRowWithTemplate && (
                  <button type="button" onClick={() => fillSelectedRowWithTemplate(rowToolTemplate)} className="flex h-8 items-center gap-1 rounded-lg border border-slate-200/70 bg-white px-2.5 text-[11px] font-medium text-slate-700 shadow-sm transition-all duration-150 hover:bg-slate-50 hover:shadow-md" title="Wypełnij wszystkie puste sloty w zaznaczonym rzędzie wybranym szablonem">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Wypełnij rząd
                  </button>
                )}
                {deleteSelectedRow && (
                  <button type="button" onClick={deleteSelectedRow} className="flex h-8 items-center gap-1 rounded-lg border border-slate-200/70 bg-white px-2.5 text-[11px] font-medium text-slate-700 shadow-sm transition-all duration-150 hover:bg-slate-50 hover:shadow-md" title="Usuń zaznaczony rząd (puste sloty i regały w tym rzędzie)">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Usuń rząd
                  </button>
                )}
                {trimSelectedRowEnd && (
                  <button type="button" onClick={trimSelectedRowEnd} className="flex h-8 items-center gap-1 rounded-lg border border-slate-200/70 bg-white px-2.5 text-[11px] font-medium text-slate-700 shadow-sm transition-all duration-150 hover:bg-slate-50 hover:shadow-md" title="Usuń puste sloty na końcu rzędu">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h6" /></svg>
                    Skróć rząd
                  </button>
                )}
                {rotateSelectedRow && (
                  <button type="button" onClick={rotateSelectedRow} className="flex h-8 items-center gap-1 rounded-lg border border-slate-200/70 bg-white px-2.5 text-[11px] font-medium text-slate-700 shadow-sm transition-all duration-150 hover:bg-slate-50 hover:shadow-md" title="Obróć rząd (poziomo ↔ pionowo)">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Obróć rząd
                  </button>
                )}
              </div>
            )}
            {!isLiveView && setAisleWidthCm != null && (
              <span className="ml-auto flex items-center gap-1.5">
                <label className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-slate-400">Magnes (cm)</label>
                <input type="number" min={50} step={10} value={aisleWidthCm ?? 250} onChange={(e) => setAisleWidthCm(Number(e.target.value) || 250)} className="h-8 w-16 rounded-lg border border-slate-200/70 bg-white px-2 text-[11px] text-slate-800 shadow-sm transition-colors duration-150 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20" style={{ color: colors.textPrimary }} title="Odległość magnetycznego przyciągania przy przeciąganiu z katalogu" />
              </span>
            )}
          </div>
          )}
          <div
            ref={viewportRef}
            className="warehouse-map-viewport relative m-0 h-full min-h-0 w-full min-w-0 max-w-full flex-1 basis-0 overflow-auto p-0"
            style={{
              background: isExportMode ? "#ffffff" : "linear-gradient(165deg, #f8fafc 0%, #eef2f7 55%, #e8edf3 100%)",
              border: isExportMode ? "1px solid #e5e7eb" : "1px solid rgba(148, 163, 184, 0.38)",
              borderRadius: "12px",
              boxShadow: isExportMode ? undefined : "inset 0 1px 0 rgba(255,255,255,0.65), 0 1px 2px rgba(15, 23, 42, 0.04)",
              overscrollBehavior: "contain",
              cursor: isExportMode
                ? "default"
                : draggingFromCatalog
                  ? "copy"
                  : draggingRowId
                    ? "grabbing"
                    : rowToolActive || aisleToolActive
                      ? "crosshair"
                      : rowToolTemplate
                        ? "cell"
                        : "default",
            }}
            tabIndex={0}
            role="application"
            aria-label="Kanwa magazynu"
            title="Kółko: przewijanie • Ctrl lub ⌘ + kółko: zoom"
            onDragOver={(e) => {
              e.preventDefault();
              if (!isEditMode) return;
              if (draggingVisualType) {
                const cell = getCellFromEvent(e);
                if (cell) setVisualGhostPosition(cell);
                return;
              }
              if (!draggingFromCatalog) return;
              const cell = getCellFromEvent(e);
              if (!cell) {
                setCatalogHoveredSlotFromCell?.(null);
                return;
              }
              setCatalogHoveredSlotFromCell?.(cell);
              const pos = getCatalogDropCell
                ? getCatalogDropCell(cell, draggingFromCatalog)
                : (() => {
                    const spec = getCatalogItemSpec(draggingFromCatalog);
                    const pw = layoutCmToCellsX(layout, spec.width_cm);
                    const ph = layoutCmToCellsY(layout, spec.depth_cm);
                    return snapPosition(cell, pw, ph, layout.racks, layout.grid_cols, layout.grid_rows, aisleWidthCm);
                  })();
              setCatalogGhostPosition(pos);
            }}
            onDragLeave={() => {
              if (!isEditMode) return;
              setCatalogGhostPosition(null);
              setVisualGhostPosition(null);
              setCatalogHoveredSlotFromCell?.(null);
              setCatalogHoveredSlot?.(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!isEditMode) return;
              const cell = getCellFromEvent(e);
              if (cell && draggingVisualType) {
                addVisualElement(cell, draggingVisualType);
                setVisualGhostPosition(null);
                setDraggingVisualType(null);
                return;
              }
              let catalogItem: CatalogItem | null = draggingFromCatalog;
              if (!catalogItem && e.dataTransfer?.types?.includes("application/x-warehouse-catalog")) {
                try {
                  const raw = e.dataTransfer.getData("application/x-warehouse-catalog");
                  if (raw) catalogItem = JSON.parse(raw) as CatalogItem;
                } catch {}
              }
              if (cell && catalogItem) {
                const dropCell = getCatalogDropCell ? getCatalogDropCell(cell, catalogItem) : cell;
                stampRackFromCatalogItem(dropCell, catalogItem);
              }
            }}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onMouseDown(e as unknown as React.MouseEvent<SVGSVGElement>);
              }
            }}
          >
            {isEditMode && !isLiveView && layoutModeLabel != null && layoutModeColor != null && (
              <LayoutModeBadge modeLabel={layoutModeLabel} modeColor={layoutModeColor} layoutMode={layoutMode} />
            )}
            <RowPreviewOverlay
              visible={showRowPreview}
              x={rowPreviewCursor?.x ?? 0}
              y={rowPreviewCursor?.y ?? 0}
              rackCount={rowPreviewCount}
              rowLengthMeters={rowPreviewLengthMeters}
              useFixedPosition
            />
            <div
              ref={mapExportCaptureRef}
              className="warehouse-map-canvas-wrap flex shrink-0"
              style={{
                width: scaledCanvasW,
                height: scaledCanvasH,
                minWidth: scaledCanvasW,
                minHeight: scaledCanvasH,
                position: "relative",
                boxSizing: "border-box",
                backgroundColor: isExportMode ? "#ffffff" : undefined,
              }}
            >
              <div
                className="warehouse-map-canvas relative min-h-0 min-w-0"
                style={{
                  width,
                  height,
                  overflow: "visible",
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                  transition: enableTransition ? `transform ${VIEWPORT_TRANSITION_MS}ms ease-in-out` : "none",
                  cursor: isPanning
                    ? "grabbing"
                    : panMode
                      ? "grab"
                      : placementMode || copyPlacementMode
                        ? "none"
                        : draggingRackId
                          ? "grabbing"
                          : isRoutePlanningMode
                            ? "pointer"
                            : layoutMode != null
                              ? LAYOUT_MODE_CURSORS[layoutMode]
                              : "default",
                }}
                onMouseMove={handleCanvasMouseMove}
                onMouseDown={handleCanvasMouseDown}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseLeave}
                onClick={isReadMode && onReadModeCanvasBackgroundClick ? handleReadModeCanvasBackgroundClick : undefined}
              >
                {effectiveShowGrid && (
                  <>
                    <div
                      className="absolute left-0 top-0 pointer-events-none"
                      style={{
                        width,
                        height,
                        backgroundSize: `${cellPx}px ${cellPx}px`,
                        backgroundImage: `linear-gradient(to right, ${gridOpacity.minor} 1px, transparent 1px),
                          linear-gradient(to bottom, ${gridOpacity.minor} 1px, transparent 1px)`,
                      }}
                      aria-hidden
                    />
                    <div
                      className="absolute left-0 top-0 pointer-events-none"
                      style={{
                        width,
                        height,
                        backgroundSize: `${cellPx * GRID_MAJOR_CELLS}px ${cellPx * GRID_MAJOR_CELLS}px`,
                        backgroundImage: `linear-gradient(to right, ${gridOpacity.major} 1.5px, transparent 1.5px),
                          linear-gradient(to bottom, ${gridOpacity.major} 1.5px, transparent 1.5px)`,
                      }}
                      aria-hidden
                    />
                    <div
                      className="absolute left-0 top-0 pointer-events-none"
                      style={{
                        width,
                        height,
                        backgroundSize: `${cellPx * GRID_STRONG_CELLS}px ${cellPx * GRID_STRONG_CELLS}px`,
                        backgroundImage: `linear-gradient(to right, ${gridOpacity.strong} 2px, transparent 2px),
                          linear-gradient(to bottom, ${gridOpacity.strong} 2px, transparent 2px)`,
                      }}
                      aria-hidden
                    />
                  </>
                )}
                <svg
                  id="warehouse-canvas"
                  ref={svgRef}
                  width={width}
                  height={height}
                  viewBox={`0 0 ${width} ${height}`}
                  className="relative z-10 block bg-transparent"
                  style={{
                    /* Root is transparent to hits except on descendants with pointer-events: auto — wheel over empty map hits the HTML wrapper / viewport for native scroll. */
                    pointerEvents: "none",
                    overflow: "visible",
                  }}
                >
                  <rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    fill="none"
                    stroke={isExportMode ? "#e2e8f0" : "rgba(71, 85, 105, 0.35)"}
                    strokeWidth={isExportMode ? 1 : 1.5}
                    pointerEvents="none"
                  />
                  {!isExportMode && wallElements.length > 0 && (
                    <WallElementsLayer
                      wallElements={wallElements}
                      gridCols={layout.grid_cols}
                      gridRows={layout.grid_rows}
                      cellPx={cellPx}
                      widthPx={width}
                      heightPx={height}
                      selectedWallElementId={selectedWallElementId}
                      draggingWallElementId={draggingWallElementId}
                      dragPreviewPositionCm={dragPreviewPositionCm}
                      onSelect={setSelectedWallElementId ?? (() => {})}
                      onPointerDown={onStartWallElementDrag ? (e, el) => { e.preventDefault(); onStartWallElementDrag(el); } : undefined}
                    />
                  )}
                  {isEditMode && dragSlotHighlights && (
                    <SelectionOverlay
                      part="dragSlots"
                      dragSlotHighlights={dragSlotHighlights}
                      cellPx={cellPx}
                    />
                  )}
                  {/* Temporary snap guidelines: show dragged rack's snapped x/y lines. */}
                  {isEditMode && draggingRackId != null && rackDragPreviewPosition != null && (
                    <g pointerEvents="none" opacity={0.85}>
                      <line
                        x1={rackDragPreviewPosition.x * cellPx}
                        y1={0}
                        x2={rackDragPreviewPosition.x * cellPx}
                        y2={height}
                        stroke="#06b6d4"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                      />
                      <line
                        x1={0}
                        y1={rackDragPreviewPosition.y * cellPx}
                        x2={width}
                        y2={rackDragPreviewPosition.y * cellPx}
                        stroke="#06b6d4"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                      />
                    </g>
                  )}
                  {!isExportMode && (
                  <RowLayer
                    part="emptySlots"
                    layout={layout}
                    cellPx={cellPx}
                    minEmptySlotWidthCells={minEmptySlotWidthCells}
                    minEmptySlotDepthCells={minEmptySlotDepthCells}
                    catalogHoveredSlot={catalogHoveredSlot ?? null}
                    selectedRowContainerId={selectedRowContainerId ?? null}
                    selectedRowContainerIds={selectedRowContainerIds ?? []}
                    setCatalogHoveredSlot={setCatalogHoveredSlot}
                    stampRackIntoSlot={stampRackIntoSlot}
                  />
                  )}
                  {!isExportMode && layout.aisles.map((a, i) => {
                    const isSelected = selectedAisleIndex === i;
                    return (
                      <rect
                        key={a.id ?? `a-${a.x}-${a.y}-${i}`}
                        data-visual-zone-cell=""
                        x={a.x * cellPx + 1}
                        y={a.y * cellPx + 1}
                        width={a.width * cellPx - 2}
                        height={a.height * cellPx - 2}
                        fill={isSelected ? "#0ea5e9" : "#94a3b8"}
                        fillOpacity={isSelected ? 0.55 : 0.38}
                        stroke={isSelected ? "#e0f2fe" : "#64748b"}
                        strokeOpacity={isSelected ? 1 : 0.85}
                        strokeWidth={isSelected ? 2 : 0.5}
                        rx={RACK_RADIUS_PX}
                        pointerEvents="auto"
                      />
                    );
                  })}
                  {/* Route path under rack tiles (no line through rack bodies) */}
                  {!isExportMode &&
                    showRoute &&
                    specialLocations.pick_start &&
                    ((pathSegments && pathSegments.length > 0) ||
                      (pathPoints && pathPoints.length >= 2) ||
                      (routeGraphPolyline && routeGraphPolyline.length >= 2) ||
                      (routeStops && routeStops.length >= 2)) && (
                    <PathLayer
                      points={pathPoints ?? []}
                      cellPx={cellPx}
                      markers={
                        routeStops && routeStops.length > 0 ? undefined : pathMarkers ?? undefined
                      }
                      segments={pathSegments && pathSegments.length > 0 ? pathSegments : undefined}
                      routeMode={Boolean(routeStops && routeStops.length > 0)}
                      highlightedStopIndex={highlightedStopIndex ?? undefined}
                      routeStops={routeStops ?? undefined}
                      routeStart={
                        specialLocations.pick_start
                          ? {
                              x: specialLocations.pick_start.x / GRID_UNIT_CM,
                              y: specialLocations.pick_start.y / GRID_UNIT_CM,
                            }
                          : undefined
                      }
                      routeEnd={routeEndCell ?? undefined}
                      routeGraphPolyline={routeGraphPolyline ?? undefined}
                    />
                  )}
                  <RackLayer
                    racks={layout.racks}
                    layout={layout}
                    zoom={zoom}
                    cellPx={cellPx}
                    draggingRackId={isExportMode ? null : draggingRackId}
                    selectedRackIds={isExportMode ? exportEmptySelection : selectedRackIds}
                    rackDragPreviewPositions={isExportMode ? null : rackDragPreviewPositions}
                    rackDragPreviewPosition={isExportMode ? null : rackDragPreviewPosition}
                    collisionRackId={isExportMode ? null : collisionRackId}
                    collisionRackIds={isExportMode ? null : collisionRackIds}
                    outsideRackIds={isExportMode ? undefined : outsideRackIds}
                    showLabels={effectiveShowLabels}
                    hoveredRackId={isExportMode ? null : hoveredRackId}
                    setHoveredRackId={isExportMode ? noopHoverRack : setHoveredRackId}
                    highlightedRackIds={isExportMode ? undefined : highlightedRackIds}
                    rackQuantities={isExportMode ? undefined : rackQuantities}
                    highlightedBinUUIDs={isExportMode ? undefined : highlightedBinUUIDs}
                    focusedBinUUID={isExportMode ? null : focusedBinUUID}
                    hoveredLocationUUID={isExportMode ? null : hoveredLocationUUID}
                    onRackClick={onRackClick}
                    onRackClickPassthrough={onRackClickPassthrough}
                    onRackDoubleClick={onRackDoubleClick}
                    routeStepBadges={isExportMode ? undefined : routeStepBadges}
                    routeStops={isExportMode ? null : routeStops ?? null}
                    isRoutePlanningMode={isExportMode ? false : isRoutePlanningMode}
                    neutralRackStyle={isExportMode}
                  />
                  {/* START / PACK only — visit order on rack badges */}
                  {!isExportMode &&
                    showRoute &&
                    routeStops &&
                    routeStops.length > 0 &&
                    specialLocations.pick_start && (
                    <RouteStopLayer
                      routeStops={routeStops}
                      racks={layout.racks}
                      pickStartCell={{
                        x: specialLocations.pick_start.x / GRID_UNIT_CM,
                        y: specialLocations.pick_start.y / GRID_UNIT_CM,
                      }}
                      cellPx={cellPx}
                      getRackDisplayId={getRackDisplayId}
                      highlightedStopIndex={highlightedStopIndex ?? null}
                      currentStopIndex={currentStopIndex ?? null}
                      markerPlacement={mode === "read" ? "path" : "rack"}
                      routeEndCell={routeEndCell}
                      showEndpointMarkers={showRouteEndpointMarkers}
                    />
                  )}
                  {/* Special warehouse nodes (above shelves) — draggable, right-click to delete */}
                  {!isExportMode && specialLocations.pick_start && (() => {
                    const isDragging = draggingSpecial?.key === "pick_start";
                    const px = isDragging && dragPreviewCell
                      ? dragPreviewCell.x * cellPx + cellPx / 2
                      : (specialLocations.pick_start.x / GRID_UNIT_CM) * cellPx + cellPx / 2;
                    const py = isDragging && dragPreviewCell
                      ? dragPreviewCell.y * cellPx + cellPx / 2
                      : (specialLocations.pick_start.y / GRID_UNIT_CM) * cellPx + cellPx / 2;
                    const iconSize = Math.min(24, Math.max(14, cellPx * 0.6));
                    const half = iconSize / 2;
                    return (
                      <g
                        key="special-pick_start"
                        data-special-location="pick_start"
                        data-special-id={specialLocations.pick_start.id}
                        transform={`translate(${px - half}, ${py - half})`}
                        style={{
                          pointerEvents: "auto",
                          color: "#22c55e",
                          cursor: isDragging ? "grabbing" : onUpdateSpecialLocation ? "grab" : "default",
                        }}
                        onPointerDown={(e) => handleSpecialPointerDown(e, "pick_start", specialLocations.pick_start!.id)}
                        onContextMenu={(e) => handleSpecialContextMenu(e, "pick_start", specialLocations.pick_start!.id)}
                      >
                        <circle cx={half} cy={half} r={half + 2} fill="#dcfce7" stroke="#166534" strokeWidth={1.5} />
                        <MapPin size={iconSize} strokeWidth={2} style={{ overflow: "visible" }} />
                      </g>
                    );
                  })()}
                  {!isExportMode && specialLocations.packing && (() => {
                    const isDragging = draggingSpecial?.key === "packing";
                    const px = isDragging && dragPreviewCell
                      ? dragPreviewCell.x * cellPx + cellPx / 2
                      : (specialLocations.packing.x / GRID_UNIT_CM) * cellPx + cellPx / 2;
                    const py = isDragging && dragPreviewCell
                      ? dragPreviewCell.y * cellPx + cellPx / 2
                      : (specialLocations.packing.y / GRID_UNIT_CM) * cellPx + cellPx / 2;
                    const iconSize = Math.min(24, Math.max(14, cellPx * 0.6));
                    const half = iconSize / 2;
                    return (
                      <g
                        key="special-packing"
                        data-special-location="packing"
                        data-special-id={specialLocations.packing.id}
                        transform={`translate(${px - half}, ${py - half})`}
                        style={{
                          pointerEvents: "auto",
                          color: "#1d4ed8",
                          cursor: isDragging ? "grabbing" : onUpdateSpecialLocation ? "grab" : "default",
                        }}
                        onPointerDown={(e) => handleSpecialPointerDown(e, "packing", specialLocations.packing!.id)}
                        onContextMenu={(e) => handleSpecialContextMenu(e, "packing", specialLocations.packing!.id)}
                      >
                        <circle cx={half} cy={half} r={half + 2} fill="#dbeafe" stroke="#1d4ed8" strokeWidth={1.5} />
                        <Package size={iconSize} strokeWidth={2} style={{ overflow: "visible" }} />
                      </g>
                    );
                  })()}
                  {!isExportMode && specialLocations.dock && (() => {
                    const isDragging = draggingSpecial?.key === "dock";
                    const px = isDragging && dragPreviewCell
                      ? dragPreviewCell.x * cellPx + cellPx / 2
                      : (specialLocations.dock.x / GRID_UNIT_CM) * cellPx + cellPx / 2;
                    const py = isDragging && dragPreviewCell
                      ? dragPreviewCell.y * cellPx + cellPx / 2
                      : (specialLocations.dock.y / GRID_UNIT_CM) * cellPx + cellPx / 2;
                    const size = cellPx * 0.5;
                    const points = `${px},${py - size} ${px + size},${py} ${px},${py + size} ${px - size},${py}`;
                    return (
                      <g
                        key="special-dock"
                        data-special-location="dock"
                        data-special-id={specialLocations.dock.id}
                        style={{
                          pointerEvents: "auto",
                          cursor: isDragging ? "grabbing" : onUpdateSpecialLocation ? "grab" : "default",
                        }}
                        onPointerDown={(e) => handleSpecialPointerDown(e, "dock", specialLocations.dock!.id)}
                        onContextMenu={(e) => handleSpecialContextMenu(e, "dock", specialLocations.dock!.id)}
                      >
                        <polygon points={points} fill="#6b7280" stroke="#4b5563" strokeWidth={2} />
                        <text x={px} y={py + 1} textAnchor="middle" fontSize={Math.max(8, cellPx * 0.3)} fill="#fff" fontWeight="bold">DOCK</text>
                      </g>
                    );
                  })()}
                  {!isExportMode && (
                  <VisualLayer
                    visualElements={layout.visual_elements ?? []}
                    cellPx={cellPx}
                    showLabels={effectiveShowLabels}
                    isVisualSelected={isVisualSelected}
                    draggingVisualType={draggingVisualType}
                    visualGhostPosition={visualGhostPosition}
                    getDefaultVisualSize={getDefaultVisualSize}
                  />
                  )}
                  {isEditMode && placementMode && ghostPosition && (
                    <rect
                      x={ghostPosition.x * cellPx + 2}
                      y={ghostPosition.y * cellPx + 2}
                      width={ghostW * cellPx - 4}
                      height={ghostH * cellPx - 4}
                      fill={ghostCollision ? "rgba(239, 68, 68, 0.5)" : "rgba(59, 130, 246, 0.4)"}
                      stroke={ghostCollision ? "#dc2626" : "#3b82f6"}
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      rx={RACK_RADIUS_PX}
                      pointerEvents="none"
                    />
                  )}
                  {isEditMode && copyPlacementMode && ghostPosition && copiedRack && (
                    <rect
                      x={ghostPosition.x * cellPx + 2}
                      y={ghostPosition.y * cellPx + 2}
                      width={(copiedRack.width ?? ghostW) * cellPx - 4}
                      height={(copiedRack.height ?? ghostH) * cellPx - 4}
                      fill="rgba(59, 130, 246, 0.4)"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      rx={RACK_RADIUS_PX}
                      pointerEvents="none"
                    />
                  )}
                  {isEditMode && rowToolActive && rowGhostPositions.length > 0 && (
                    <g pointerEvents="none">
                      {(() => {
                        const isHorizontal = rowDrawStart && rowDrawEnd
                          ? rowDrawSegmentExtents(rowDrawStart, rowDrawEnd).isHorizontal
                          : true;
                        const orientedW = isHorizontal ? rowGhostPw : rowGhostPh;
                        const orientedH = isHorizontal ? rowGhostPh : rowGhostPw;
                        const ghostW = orientedW;
                        const ghostH = orientedH;
                        return rowGhostPositions.map((pos, i) => {
                          const overlap = layout.racks.some((r) =>
                            rectsOverlap({ x: pos.x, y: pos.y, width: ghostW, height: ghostH }, r)
                          );
                          const fill = overlap ? "rgba(239,68,68,0.4)" : rowGhostSpec?.color ? `${rowGhostSpec.color}66` : "rgba(148,163,184,0.5)";
                          const stroke = overlap ? "#f87171" : rowGhostSpec?.color || "#94a3b8";
                          return (
                            <rect
                              key={i}
                              x={pos.x * cellPx + 2}
                              y={pos.y * cellPx + 2}
                              width={ghostW * cellPx - 4}
                              height={ghostH * cellPx - 4}
                              fill={fill}
                              stroke={stroke}
                              strokeWidth={2}
                              strokeDasharray="4 2"
                              rx={RACK_RADIUS_PX}
                            />
                          );
                        });
                      })()}
                    </g>
                  )}
                  {isEditMode && draggingFromCatalog && catalogGhostPosition &&
                    (() => {
                      const spec = getCatalogItemSpec(draggingFromCatalog);
                      const pw = layoutCmToCellsX(layout, spec.width_cm);
                      const ph = layoutCmToCellsY(layout, spec.depth_cm);
                      const overlap = layout.racks.some((r) =>
                        rectsOverlap({ x: catalogGhostPosition.x, y: catalogGhostPosition.y, width: pw, height: ph }, r)
                      );
                      const ghostFill = overlap ? "rgba(239,68,68,0.4)" : spec.color ? `${spec.color}66` : "rgba(34,211,238,0.35)";
                      const ghostStroke = overlap ? "#f87171" : spec.color || "#22d3ee";
                      return (
                        <g pointerEvents="none">
                          <rect
                            x={catalogGhostPosition.x * cellPx + 2}
                            y={catalogGhostPosition.y * cellPx + 2}
                            width={pw * cellPx - 4}
                            height={ph * cellPx - 4}
                            fill={ghostFill}
                            stroke={ghostStroke}
                            strokeWidth={2}
                            strokeDasharray="4 2"
                            rx={RACK_RADIUS_PX}
                          />
                          <text
                            x={catalogGhostPosition.x * cellPx + (pw * cellPx) / 2}
                            y={catalogGhostPosition.y * cellPx + (ph * cellPx) / 2 - 6}
                            textAnchor="middle"
                            fill="#e0f2fe"
                            fontSize={10}
                            fontWeight="bold"
                          >
                            {spec.width_cm}×{spec.depth_cm} cm
                          </text>
                        </g>
                      );
                    })()}
                  {isEditMode && marqueeStart && marqueeEnd && (
                    <SelectionOverlay
                      part="marquee"
                      marqueeStart={marqueeStart}
                      marqueeEnd={marqueeEnd}
                      cellPx={cellPx}
                    />
                  )}
                  {isEditMode && (
                  <RowLayer
                    part="rowDragGhost"
                    layout={layout}
                    cellPx={cellPx}
                    draggingRowId={draggingRowId ?? null}
                    rowDragPreviewStart={rowDragPreviewStart ?? null}
                  />
                  )}
                  {svgOverlay}
                </svg>
                {/* HTML drop zones over empty slots. When rowToolActive, do not capture so SVG receives draw events. */}
                {isEditMode && (
                <div className="absolute left-0 top-0 pointer-events-none" style={{ width, height, zIndex: 10 }}>
                  {(layout.row_containers ?? []).flatMap((rc) =>
                    rc.slots.map((slot, i) => {
                      if (slot.rackId != null) return null;
                      const isVerticalRow = (rc.orientation ?? "horizontal") === "vertical";
                      if (isVerticalRow) {
                        if (minEmptySlotDepthCells != null && slot.w < minEmptySlotDepthCells) return null;
                        if (minEmptySlotWidthCells != null && slot.h < minEmptySlotWidthCells) return null;
                      } else if (minEmptySlotWidthCells != null && slot.w < minEmptySlotWidthCells) return null;
                      const fillSlot = () => {
                        if (rowToolTemplate && stampRackIntoSlot) stampRackIntoSlot(rc.id, i, rowToolTemplate);
                        else onSelectRowContainer?.(rc.id);
                      };
                      return (
                        <div
                          key={`drop-${rc.id}-${i}`}
                          className={rowToolActive ? "pointer-events-none" : "pointer-events-auto"}
                          style={{
                            position: "absolute",
                            left: slot.x * cellPx + 1,
                            top: slot.y * cellPx + 1,
                            width: slot.w * cellPx - 2,
                            height: slot.h * cellPx - 2,
                            cursor: draggingFromCatalog ? "copy" : rowToolTemplate ? "cell" : "default",
                          }}
                          onMouseDown={(e) => {
                            if (e.button === 0) {
                              e.preventDefault();
                              e.stopPropagation();
                              fillSlot();
                            }
                          }}
                          onClick={(e) => {
                            if (e.button === 0) {
                              e.preventDefault();
                              e.stopPropagation();
                              fillSlot();
                            }
                          }}
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
                        />
                      );
                    })
                  )}
                </div>
                )}
                {isEditMode && (
                  <SelectionOverlay
                    part="toolbar"
                    selectedRack={selectedRack}
                    isMultiSelect={isMultiSelect}
                    draggingRackId={draggingRackId}
                    editingRackId={editingRackId}
                    cellPx={cellPx}
                    setInternalLayoutRackId={setInternalLayoutRackId}
                    setShowElevationForRackId={setShowElevationForRackId}
                    setLayout={setLayout}
                    setSelectedRackId={setSelectedRackId}
                    setSelectedRackIds={setSelectedRackIds}
                    onCopyRack={onCopyRack}
                  />
                )}
              </div>
            </div>
            {!isExportMode && cursorCm != null && (placementMode || copyPlacementMode || draggingRackId != null) && (
              <p className="text-xs text-cyan-200/80 mt-1 font-mono absolute bottom-0 left-0">
                {cursorCm.x} cm × {cursorCm.y} cm
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}

/** Memoized to avoid re-renders when parent updates but canvas props are unchanged (e.g. cursor same cell). */
export const WarehouseCanvas = React.memo(WarehouseCanvasInner);
