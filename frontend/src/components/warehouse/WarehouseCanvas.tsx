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
import { LayoutMode, LAYOUT_MODE_CURSORS } from "../warehouse-layout";
import { colors, radius } from "../../layout/designTokens";
import { RackLayer } from "./WarehouseCanvas/RackLayer";
import { RowLayer } from "./WarehouseCanvas/RowLayer";
import { VisualLayer } from "./WarehouseCanvas/VisualLayer";
import { SelectionOverlay } from "./WarehouseCanvas/SelectionOverlay";
import { WallElementsLayer } from "./WarehouseCanvas/WallElementsLayer";
import { PathLayer } from "./WarehouseCanvas/PathLayer";
import { MagazynPreviewPathLayer } from "./WarehouseCanvas/MagazynPreviewPathLayer";
import { PassageDrawPreview } from "../../pages/WarehouseDesigner/passages/PassageDrawPreview";
import { useWarehouseModeOptional } from "./WarehouseModeContext";
import { WarehouseZoomControls } from "./WarehouseZoomControls";
import {
  CardButton,
  GhostButton,
  DangerButton,
  Input,
  SecondaryButton,
  colors as dsColors,
  radius as dsRadius,
  shadows as dsShadows,
  warehouseToolGroupClass,
} from "../../design-system";
import {
  MapLocationVisualizationLayer,
  type MapVisualizationModeId,
} from "./magazyn/mapVisualization";

const RACK_RADIUS_PX = parseFloat(radius.small) || 6;

const EMPTY_OCCUPIED_SET: ReadonlySet<string> = new Set();

/** Major / strong grid lines in cell counts (grid space only; not meters). */
const GRID_MAJOR_CELLS = 10;
const GRID_STRONG_CELLS = 50;

/** Ctrl/Cmd + wheel zoom (Figma-like); aligned with `useDesignerCanvas` persistence clamp. */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

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
  /** Multi-rack passage draw tool (Projektowanie). */
  passageToolActive?: boolean;
  setPassageToolActive?: (fn: (a: boolean) => boolean) => void;
  passageDrawStart?: { x: number; y: number } | null;
  passageDrawEnd?: { x: number; y: number } | null;
  passageWidthCm?: number;
  setPassageWidthCm?: (v: number) => void;
  passageShiftKey?: boolean;
  selectedPassage?: { rackUuid: string; passageUuid: string } | null;
  setSelectedPassage?: React.Dispatch<React.SetStateAction<{ rackUuid: string; passageUuid: string } | null>>;
  onPassageDragStart?: (rackUuid: string, passageUuid: string, grabOffsetCm: number) => void;
  /** Open rack template editor (INHERITED passage → TemplateCreator). */
  onOpenPassageTemplate?: () => void;
  /**
   * Scroll/zoom viewport to layout cm point (e.g. problem location / rack center).
   * Change identity (seq) to re-trigger focus.
   */
  canvasFocusCm?: { x: number; y: number; zoom?: number; seq: number } | null;
  /** TRASY workspace: passages visible but non-interactive. */
  routesWorkspace?: boolean;
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
  /**
   * When true, Magazyn skips auto-fit on open (restored camera exists for this warehouse).
   * Explicit „Dopasuj do ekranu” still runs fit.
   */
  skipInitialLiveFit?: boolean;
  /** Restored scroll after camera hydrate (viewport scrollLeft/Top). */
  restoredScroll?: { left: number; top: number } | null;
  /** Persist viewport scroll (debounced upstream). */
  onViewportScroll?: (scroll: { left: number; top: number }) => void;
  /** Called after fit-to-screen so parent can persist the new camera. */
  onCameraFitApplied?: (camera: {
    zoom: number;
    panX: number;
    panY: number;
    scrollLeft: number;
    scrollTop: number;
  }) => void;
  /** Magazyn map visualization mode (opacity overlay only). */
  mapVisualizationMode?: MapVisualizationModeId;
  /** Occupied location UUIDs for visualization modes (O(1) lookup). */
  occupiedLocationUuids?: ReadonlySet<string>;
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
  /** Notify parent when a special map icon is selected (for Delete wiring). */
  onSpecialLocationSelect?: (key: "pick_start" | "packing" | "dock" | null) => void;
  /** Controlled selection from parent (optional). */
  selectedSpecialLocationKey?: "pick_start" | "packing" | "dock" | null;
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
  /** Magazyn SSOT: per-rack occupancy for bottom bars + selected inline detail. */
  rackOccupancyStats?: Map<string, import("../../pages/WarehouseDesigner/productLocationIndex").RackOccupancyStats>;
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
  /** Extra HTML overlay sibling to SVG (e.g. SelectionQuickToolbar). */
  htmlOverlay?: React.ReactNode;
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
  passageToolActive = false,
  setPassageToolActive,
  passageDrawStart = null,
  passageDrawEnd = null,
  passageWidthCm = 90,
  setPassageWidthCm,
  passageShiftKey = false,
  selectedPassage = null,
  setSelectedPassage,
  onPassageDragStart,
  onOpenPassageTemplate,
  canvasFocusCm = null,
  routesWorkspace = false,
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
  isLiveView: isLiveViewProp,
  skipInitialLiveFit = false,
  restoredScroll = null,
  onViewportScroll,
  onCameraFitApplied,
  mapVisualizationMode = "all",
  occupiedLocationUuids,
  layoutModeLabel,
  layoutModeColor,
  layoutMode,
  setLayoutMode,
  specialLocations = { pick_start: null, packing: null, dock: null },
  onUpdateSpecialLocation,
  onDeleteSpecialLocation,
  onSpecialLocationSelect,
  selectedSpecialLocationKey = null,
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
  rackOccupancyStats,
  getRackDisplayId,
  highlightedStopIndex = null,
  currentStopIndex = null,
  routeStepBadges = null,
  routeEndCell = null,
  routeGraphPolyline = null,
  /** When false, START/PACK markers are hidden (step-by-step uses rack badges only). */
  showRouteEndpointMarkers = true,
  svgOverlay = null,
  htmlOverlay = null,
}: WarehouseCanvasProps) {
  void _cellPxProp;
  const modeCtx = useWarehouseModeOptional();
  /** Prefer ModeContext; prop kept for ProductLocationMapModal and other hosts outside Provider. */
  const isLiveView = modeCtx?.isLive ?? Boolean(isLiveViewProp);
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
  const [internalSelectedSpecialKey, setInternalSelectedSpecialKey] = useState<SpecialKey | null>(null);
  /** Prefer controlled key when parent wires selection; else local state. */
  const effectiveSelectedSpecialKey =
    onSpecialLocationSelect != null ? (selectedSpecialLocationKey ?? null) : internalSelectedSpecialKey;

  const setSelectedSpecialKey = useCallback(
    (key: SpecialKey | null) => {
      if (onSpecialLocationSelect) onSpecialLocationSelect(key);
      else setInternalSelectedSpecialKey(key);
    },
    [onSpecialLocationSelect]
  );

  const [contextMenu, setContextMenu] = useState<{ id: number; key: SpecialKey; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [mapNavHintVisible, setMapNavHintVisible] = useState(false);

  useEffect(() => {
    if (isExportMode || isLiveView) return;
    try {
      if (sessionStorage.getItem("wh-map-nav-hint-seen") === "1") return;
    } catch {
      /* ignore */
    }
    setMapNavHintVisible(true);
    const t = window.setTimeout(() => {
      setMapNavHintVisible(false);
      try {
        sessionStorage.setItem("wh-map-nav-hint-seen", "1");
      } catch {
        /* ignore */
      }
    }, 4500);
    return () => window.clearTimeout(t);
  }, [isExportMode, isLiveView]);

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

  useEffect(() => {
    if (!effectiveSelectedSpecialKey || !onDeleteSpecialLocation || !isEditMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable=true]")) return;
      const loc = specialLocations[effectiveSelectedSpecialKey];
      if (!loc) return;
      e.preventDefault();
      e.stopPropagation();
      onDeleteSpecialLocation(loc.id);
      setSelectedSpecialKey(null);
      setContextMenu(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [effectiveSelectedSpecialKey, onDeleteSpecialLocation, isEditMode, specialLocations, setSelectedSpecialKey]);

  const handleSpecialPointerDown = useCallback(
    (e: React.PointerEvent, key: SpecialKey, id: number) => {
      e.stopPropagation();
      if (!isEditMode) return;
      setSelectedSpecialKey(key);
      // Only primary button starts drag — right-click must reach contextmenu for Usuń.
      if (e.button !== 0) return;
      if (onUpdateSpecialLocation) setDraggingSpecial({ key, id });
    },
    [isEditMode, onUpdateSpecialLocation]
  );

  const handleSpecialContextMenu = useCallback(
    (e: React.MouseEvent, key: SpecialKey, id: number) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedSpecialKey(key);
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
      const el = e.target as Element | null;
      if (!el?.closest?.("[data-special-location]")) {
        setSelectedSpecialKey(null);
      }
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
  /** Room above first rack row for selection chrome (Copy / Grid / Delete). */
  const mapContentSafeTopPx = isExportMode ? 0 : 40;

  const viewResetKeyRef = React.useRef<string | null>(null);
  /** Warehouse or layout document identity change: only reset pan/scroll when there is no stored camera. */
  React.useLayoutEffect(() => {
    if (selectedWarehouseId == null) return;
    const key = `${selectedWarehouseId}:${layout.layout_id ?? "null"}`;
    if (viewResetKeyRef.current === key) return;
    viewResetKeyRef.current = key;
    if (skipInitialLiveFit) {
      const el = viewportRef.current;
      if (el && restoredScroll) {
        el.scrollLeft = restoredScroll.left;
        el.scrollTop = restoredScroll.top;
      }
      return;
    }
    setPan(() => ({ x: 0, y: 0 }));
    const el = viewportRef.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  }, [selectedWarehouseId, layout.layout_id, setPan, skipInitialLiveFit, restoredScroll]);

  /** Apply restored scroll after hydrate (cameraEpoch changes via restoredScroll identity). */
  React.useLayoutEffect(() => {
    if (!skipInitialLiveFit || !restoredScroll) return;
    const el = viewportRef.current;
    if (!el) return;
    el.scrollLeft = restoredScroll.left;
    el.scrollTop = restoredScroll.top;
  }, [skipInitialLiveFit, restoredScroll]);

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

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el || !onViewportScroll) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t != null) clearTimeout(t);
      t = setTimeout(() => {
        onViewportScroll({ left: el.scrollLeft, top: el.scrollTop });
      }, 120);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (t != null) clearTimeout(t);
    };
  }, [onViewportScroll, selectedWarehouseId]);

  /** Reset zoom to 100%, pan, scroll top-left (layout editor). */
  const fitViewport = React.useCallback(() => {
    setEnableTransition(true);
    setZoom(() => 1);
    setPan(() => ({ x: 0, y: 0 }));
    const el = viewportRef.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
    onCameraFitApplied?.({ zoom: 1, panX: 0, panY: 0, scrollLeft: 0, scrollTop: 0 });
    setTimeout(() => setEnableTransition(false), VIEWPORT_TRANSITION_MS);
  }, [setZoom, setPan, onCameraFitApplied]);

  /** Magazyn: scale content to fill viewport (first visit or explicit „Dopasuj do ekranu”). */
  const applyLiveFit = React.useCallback(() => {
    if (!isLiveView || selectedWarehouseId == null || loading) return;
    const el = viewportRef.current;
    if (!el) return;
    if (width <= 0 || height <= 0 || el.clientWidth <= 0 || el.clientHeight <= 0) return;
    const pad = 24;
    const fitZ = Math.min((el.clientWidth - pad) / width, (el.clientHeight - pad) / height);
    const nextZ = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitZ));
    setEnableTransition(false);
    setZoom(() => nextZ);
    setPan(() => ({ x: 0, y: 0 }));
    el.scrollLeft = 0;
    el.scrollTop = 0;
    onCameraFitApplied?.({
      zoom: nextZ,
      panX: 0,
      panY: 0,
      scrollLeft: 0,
      scrollTop: 0,
    });
  }, [
    isLiveView,
    selectedWarehouseId,
    loading,
    width,
    height,
    setZoom,
    setPan,
    onCameraFitApplied,
  ]);

  const liveFitKeyRef = React.useRef<string | null>(null);
  React.useLayoutEffect(() => {
    if (!isLiveView) {
      liveFitKeyRef.current = null;
      return;
    }
    if (skipInitialLiveFit) return;
    const key = `${selectedWarehouseId}:${layout.layout_id ?? "null"}:${layout.grid_cols}x${layout.grid_rows}`;
    if (liveFitKeyRef.current === key) return;
    liveFitKeyRef.current = key;
    const id = requestAnimationFrame(() => applyLiveFit());
    return () => cancelAnimationFrame(id);
  }, [
    isLiveView,
    skipInitialLiveFit,
    applyLiveFit,
    selectedWarehouseId,
    layout.layout_id,
    layout.grid_cols,
    layout.grid_rows,
  ]);

  /** Focus a layout-cm point inside the scrollable viewport (problem locate). */
  React.useEffect(() => {
    if (!canvasFocusCm) return;
    const el = viewportRef.current;
    if (!el) return;
    if (canvasFocusCm.zoom != null && Number.isFinite(canvasFocusCm.zoom)) {
      setZoom(() => canvasFocusCm.zoom as number);
    }
    const z = canvasFocusCm.zoom ?? zoom;
    const px = (canvasFocusCm.x / GRID_UNIT_CM) * cellPx * z;
    const py = (canvasFocusCm.y / GRID_UNIT_CM) * cellPx * z;
    requestAnimationFrame(() => {
      const vp = viewportRef.current;
      if (!vp) return;
      vp.scrollLeft = Math.max(0, px - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, py - vp.clientHeight / 2);
    });
  }, [canvasFocusCm, cellPx, setZoom, zoom]);

  const gridOpacity = React.useMemo(
    () => ({
      minor: "rgba(60,90,110,0.011)",
      major: "rgba(60,90,110,0.028)",
      strong: "rgba(60,90,110,0.045)",
    }),
    []
  );

  const effectiveShowGrid = isExportMode || isLiveView ? false : showGrid;
  const effectiveShowLabels = isExportMode ? true : showLabels;
  const noopHoverRack = React.useCallback(() => {}, []);
  const exportEmptySelection = React.useMemo(() => [] as Array<number | string>, []);

  return (
    <main
      ref={canvasContainerRef}
      className="relative m-0 flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col items-stretch justify-start overflow-hidden p-0"
      style={{
        backgroundColor: "#ffffff",
        overscrollBehavior: "contain",
      }}
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
              className={`fixed z-[100] min-w-[120px] ${dsRadius.md} border ${dsColors.border.default} ${dsColors.surface.page} py-1 ${dsShadows.md}`}
              style={{ left: contextMenu.x, top: contextMenu.y }}
              role="menu"
            >
              <GhostButton
                density="compact"
                className="!w-full !justify-start !rounded-none"
                onClick={() => {
                  onDeleteSpecialLocation(contextMenu.id);
                  setContextMenu(null);
                }}
              >
                Usuń
              </GhostButton>
            </div>
          )}
          {isEditMode && (
          <div
            className="flex min-h-0 min-w-0 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-slate-200/55 bg-gradient-to-b from-slate-50/98 to-white/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-[4px]"
          >
            <div className={`flex shrink-0 ${warehouseToolGroupClass}`}>
              <GhostButton
                density="compact"
                onClick={fitViewport}
                title="Zoom 100%, przewijanie lewy górny róg, pan wyzerowany"
              >
                Reset
              </GhostButton>
            </div>
            <span className="hidden h-6 w-px shrink-0 bg-slate-200/80 sm:block" aria-hidden />
            {!isLiveView && (
              <div
                className={warehouseToolGroupClass}
                role="group"
                aria-label="Narzędzia rysowania i lokalizacji"
              >
                <CardButton
                  density="compact"
                  active={rowToolActive}
                  onClick={() => { const next = !rowToolActive; if (next) setRowToolTemplate?.(null); setRowToolActive((a) => !a); }}
                  title="Narysuj rząd pustych slotów (bez szablonu). Później przeciągnij szablon do slotu."
                >
                  Rysuj Rząd
                </CardButton>
                {setPassageToolActive && (
                  <CardButton
                    density="compact"
                    active={passageToolActive}
                    onClick={() => setPassageToolActive((a) => !a)}
                    title="Utwórz przejazd pod regałem (przeciągnij pas przez regały). Shift = dowolny kąt. Skrót: J"
                  >
                    Dodaj przejazd
                  </CardButton>
                )}
                {setLayoutMode && (
                  <>
                    <CardButton
                      density="compact"
                      active={layoutMode === LayoutMode.ADD_START}
                      onClick={() => setLayoutMode(LayoutMode.ADD_START)}
                      title="Punkt startowy kompletacji"
                    >
                      Start
                    </CardButton>
                    <CardButton
                      density="compact"
                      active={layoutMode === LayoutMode.ADD_PACK}
                      onClick={() => setLayoutMode(LayoutMode.ADD_PACK)}
                      title="Stacja pakowania"
                    >
                      Pakowanie
                    </CardButton>
                  </>
                )}
              </div>
            )}
            {!isLiveView && (
              <>
                <span className="hidden h-6 w-px shrink-0 bg-slate-200/80 sm:block" aria-hidden />
                <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2" role="group" aria-label="Elementy pomocnicze">
                  <span className="whitespace-nowrap pl-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Pomocnicze</span>
                  <div className={warehouseToolGroupClass}>
                    <CardButton
                      density="compact"
                      active={aisleToolActive}
                      onClick={() => setAisleToolActive((a) => !a)}
                      title="Strefa to element wizualny – nie wpływa na routing ani logistykę"
                    >
                      Strefa
                    </CardButton>
                  </div>
                </div>
              </>
            )}
            <span className="hidden h-6 w-px shrink-0 bg-slate-200/80 md:block" aria-hidden />
            <div className={warehouseToolGroupClass} role="group" aria-label="Widok siatki i etykiet">
              <CardButton density="compact" active={showGrid} onClick={() => setShowGrid((g) => !g)} title="Widoczna siatka">
                Siatka
              </CardButton>
              <span className="w-px self-stretch bg-slate-200/70" aria-hidden />
              <CardButton density="compact" active={showLabels} onClick={() => setShowLabels((v) => !v)} title="Nazwy regałów i etykiety elementów">
                Etykiety
              </CardButton>
            </div>
            {passageToolActive && setPassageWidthCm && (
              <span className="ml-1 flex items-center gap-1.5">
                <label className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-slate-400">Szer. (cm)</label>
                <Input
                  type="number"
                  density="compact"
                  min={40}
                  max={200}
                  step={5}
                  value={passageWidthCm}
                  onChange={(e) => setPassageWidthCm(Number(e.target.value) || 90)}
                  className="!w-14"
                  title="Domyślna szerokość przejazdu"
                />
              </span>
            )}
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
                        className={`flex items-center gap-1.5 ${dsRadius.md} border ${dsColors.border.soft} bg-slate-50/80 px-2 py-1`}
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
                  <SecondaryButton
                    density="compact"
                    onMouseDown={(e) => { e.preventDefault(); onStartRowDrag(e); }}
                    className="!cursor-grab active:!cursor-grabbing"
                    title="Przeciągnij rząd (przesuń cały rząd)"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                    Przenieś rząd
                  </SecondaryButton>
                )}
                {rowToolTemplate && fillSelectedRowWithTemplate && (
                  <SecondaryButton density="compact" onClick={() => fillSelectedRowWithTemplate(rowToolTemplate)} title="Wypełnij wszystkie puste sloty w zaznaczonym rzędzie wybranym szablonem">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Wypełnij rząd
                  </SecondaryButton>
                )}
                {deleteSelectedRow && (
                  <DangerButton density="compact" onClick={deleteSelectedRow} title="Usuń zaznaczony rząd (puste sloty i regały w tym rzędzie)">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Usuń rząd
                  </DangerButton>
                )}
                {trimSelectedRowEnd && (
                  <SecondaryButton density="compact" onClick={trimSelectedRowEnd} title="Usuń puste sloty na końcu rzędu">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h6" /></svg>
                    Skróć rząd
                  </SecondaryButton>
                )}
                {rotateSelectedRow && (
                  <SecondaryButton density="compact" onClick={rotateSelectedRow} title="Obróć rząd (poziomo ↔ pionowo)">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Obróć rząd
                  </SecondaryButton>
                )}
              </div>
            )}
            {!isLiveView && setAisleWidthCm != null && (
              <span className="ml-auto flex items-center gap-1.5">
                <label className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-slate-400">Magnes (cm)</label>
                <Input
                  type="number"
                  density="compact"
                  min={50}
                  step={10}
                  value={aisleWidthCm ?? 250}
                  onChange={(e) => setAisleWidthCm(Number(e.target.value) || 250)}
                  className="!w-16"
                  title="Odległość magnetycznego przyciągania przy przeciąganiu z katalogu"
                />
              </span>
            )}
          </div>
          )}
          <div className="relative m-0 flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col overflow-hidden p-0">
            {!isExportMode ? (
              <WarehouseZoomControls zoom={zoom} setZoom={setZoom} className="!z-30" />
            ) : null}
            {mapNavHintVisible ? (
              <div
                className={`pointer-events-none absolute bottom-3 left-3 z-30 max-w-[16rem] ${dsRadius.md} border ${dsColors.border.soft} bg-white/95 px-3 py-2 text-[11px] leading-snug ${dsColors.text.body} ${dsShadows.sm} backdrop-blur-sm`}
                role="status"
              >
                Kółko: przewijanie · Ctrl/⌘ + kółko: zoom
              </div>
            ) : null}
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
                    : rowToolActive || passageToolActive || aisleToolActive
                      ? "crosshair"
                      : rowToolTemplate
                        ? "cell"
                        : "default",
            }}
            tabIndex={0}
            role="application"
            aria-label="Kanwa magazynu"
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
                boxSizing: "content-box",
                paddingTop: mapContentSafeTopPx,
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
                  <defs>
                    <pattern id="magazynAisleHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(35)">
                      <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
                    </pattern>
                  </defs>
                  <rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    fill={isLiveView ? "#ffffff" : "none"}
                    stroke={isExportMode ? "#e2e8f0" : isLiveView ? "rgba(148, 163, 184, 0.2)" : "rgba(71, 85, 105, 0.35)"}
                    strokeWidth={isExportMode ? 1 : isLiveView ? 1 : 1.5}
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
                    const ax = a.x * cellPx;
                    const ay = a.y * cellPx;
                    const aw = a.width * cellPx;
                    const ah = a.height * cellPx;
                    const alongX = aw >= ah;
                    const midX = ax + aw / 2;
                    const midY = ay + ah / 2;
                    const dash = Math.max(8, Math.min(16, (alongX ? aw : ah) * 0.07));
                    const roadFill = isLiveView
                      ? isSelected
                        ? "#c5ccd6"
                        : "#bcc4cf"
                      : isSelected
                        ? "#cbd5e1"
                        : "#dce3eb";
                    return (
                      <g key={a.id ?? `a-${a.x}-${a.y}-${i}`} pointerEvents="auto">
                        <rect
                          data-visual-zone-cell=""
                          x={ax}
                          y={ay}
                          width={aw}
                          height={ah}
                          fill={roadFill}
                          fillOpacity={1}
                          stroke={isLiveView ? "none" : isSelected ? "#94a3b8" : "#c5ced9"}
                          strokeOpacity={isLiveView ? 0 : 1}
                          strokeWidth={isLiveView ? 0 : isSelected ? 1.25 : 0.75}
                          rx={isLiveView ? 0 : RACK_RADIUS_PX}
                        />
                        {isLiveView && (
                          <rect
                            x={ax}
                            y={ay}
                            width={aw}
                            height={ah}
                            fill="url(#magazynAisleHatch)"
                            opacity={0.35}
                            pointerEvents="none"
                          />
                        )}
                        <line
                          x1={alongX ? ax + 6 : midX}
                          y1={alongX ? midY : ay + 6}
                          x2={alongX ? ax + aw - 6 : midX}
                          y2={alongX ? midY : ay + ah - 6}
                          stroke={isLiveView ? "rgba(255,255,255,0.55)" : isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.8)"}
                          strokeWidth={isLiveView ? 1 : 1.25}
                          strokeDasharray={`${dash} ${dash * 0.7}`}
                          strokeLinecap="round"
                          pointerEvents="none"
                        />
                        {isLiveView && (
                          <polygon
                            points={
                              alongX
                                ? `${ax + aw - 5},${midY} ${ax + aw - 10},${midY - 2.4} ${ax + aw - 10},${midY + 2.4}`
                                : `${midX},${ay + ah - 5} ${midX - 2.4},${ay + ah - 10} ${midX + 2.4},${ay + ah - 10}`
                            }
                            fill="rgba(148,163,184,0.4)"
                            pointerEvents="none"
                          />
                        )}
                      </g>
                    );
                  })}
                  {isLiveView && !isExportMode && layout.aisles.length > 0 && (
                    <MagazynPreviewPathLayer
                      aisles={layout.aisles}
                      cellPx={cellPx}
                      startCell={
                        specialLocations.pick_start
                          ? {
                              x: specialLocations.pick_start.x / GRID_UNIT_CM,
                              y: specialLocations.pick_start.y / GRID_UNIT_CM,
                            }
                          : null
                      }
                    />
                  )}
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
                    rackOccupancyStats={isExportMode ? undefined : rackOccupancyStats}
                    onRackClick={onRackClick}
                    onRackClickPassthrough={onRackClickPassthrough}
                    onRackDoubleClick={onRackDoubleClick}
                    routeStepBadges={isExportMode ? undefined : routeStepBadges}
                    routeStops={isExportMode ? null : routeStops ?? null}
                    isRoutePlanningMode={isExportMode ? false : isRoutePlanningMode}
                    neutralRackStyle={isExportMode}
                    passageInteractive={false}
                    passageSubtle={routesWorkspace}
                    selectedPassage={null}
                    selectedPassageUuids={null}
                    onPassageSelect={undefined}
                    onPassageDragStart={undefined}
                  />
                  {isLiveView && !isExportMode ? (
                    <MapLocationVisualizationLayer
                      mode={mapVisualizationMode}
                      racks={layout.racks}
                      cellPx={cellPx}
                      occupiedLocationUuids={occupiedLocationUuids ?? EMPTY_OCCUPIED_SET}
                    />
                  ) : null}
                  {isEditMode && passageToolActive && passageDrawStart && passageDrawEnd && (
                    <PassageDrawPreview
                      racks={layout.racks}
                      passageDrawStart={passageDrawStart}
                      passageDrawEnd={passageDrawEnd}
                      passageWidthCm={passageWidthCm}
                      cellPx={cellPx}
                      shiftKey={passageShiftKey}
                    />
                  )}
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
                        <circle
                          cx={half}
                          cy={half}
                          r={half + 2}
                          fill="#dcfce7"
                          stroke={effectiveSelectedSpecialKey === "pick_start" ? "#14532d" : "#166534"}
                          strokeWidth={effectiveSelectedSpecialKey === "pick_start" ? 2.5 : 1.5}
                        />
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
                        <circle
                          cx={half}
                          cy={half}
                          r={half + 2}
                          fill="#dbeafe"
                          stroke={effectiveSelectedSpecialKey === "packing" ? "#1e3a8a" : "#1d4ed8"}
                          strokeWidth={effectiveSelectedSpecialKey === "packing" ? 2.5 : 1.5}
                        />
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
                        <polygon
                          points={points}
                          fill="#6b7280"
                          stroke={effectiveSelectedSpecialKey === "dock" ? "#111827" : "#4b5563"}
                          strokeWidth={effectiveSelectedSpecialKey === "dock" ? 3 : 2}
                        />
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
                {htmlOverlay ? (
                  <div className="absolute left-0 top-0 pointer-events-none" style={{ width, height, zIndex: 55 }}>
                    {htmlOverlay}
                  </div>
                ) : null}
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
                    setLayout={setLayout}
                    setSelectedRackId={setSelectedRackId}
                    setSelectedRackIds={setSelectedRackIds}
                    onCopyRack={onCopyRack}
                  />
                )}
                {isEditMode &&
                  effectiveSelectedSpecialKey != null &&
                  onDeleteSpecialLocation &&
                  specialLocations[effectiveSelectedSpecialKey] != null &&
                  (() => {
                    const loc = specialLocations[effectiveSelectedSpecialKey]!;
                    const isDragging = draggingSpecial?.key === effectiveSelectedSpecialKey;
                    const cx =
                      isDragging && dragPreviewCell
                        ? dragPreviewCell.x * cellPx + cellPx / 2
                        : (loc.x / GRID_UNIT_CM) * cellPx + cellPx / 2;
                    const cy =
                      isDragging && dragPreviewCell
                        ? dragPreviewCell.y * cellPx + cellPx / 2
                        : (loc.y / GRID_UNIT_CM) * cellPx + cellPx / 2;
                    return (
                      <DangerButton
                        density="compact"
                        className="absolute z-[50]"
                        style={{ left: cx + 16, top: cy - 14, pointerEvents: "auto" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSpecialLocation(loc.id);
                          setSelectedSpecialKey(null);
                          setContextMenu(null);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        Usuń
                      </DangerButton>
                    );
                  })()}
              </div>
            </div>
            {!isExportMode && cursorCm != null && (placementMode || copyPlacementMode || draggingRackId != null) && (
              <p className="text-xs text-cyan-200/80 mt-1 font-mono absolute bottom-0 left-0">
                {cursorCm.x} cm × {cursorCm.y} cm
              </p>
            )}
          </div>
          </div>
        </>
      )}
    </main>
  );
}

/** Memoized to avoid re-renders when parent updates but canvas props are unchanged (e.g. cursor same cell). */
export const WarehouseCanvas = React.memo(WarehouseCanvasInner);
