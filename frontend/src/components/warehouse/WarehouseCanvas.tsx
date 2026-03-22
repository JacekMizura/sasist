import React, { useState, useCallback, useEffect, useRef, type RefObject } from "react";
import { MapPin, Package } from "lucide-react";
import type { LayoutState, RackState, WallElement } from "../../types/warehouse";
import type { CatalogItem, VisualElementType } from "../../types/warehouse";
import { GRID_UNIT_CM } from "../../types/warehouse";
import { cmToCells, getCatalogItemSpec, binVolumeDm3 } from "./warehouseUtils";
import { RowPreviewOverlay } from "./RowPreviewOverlay";
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

const CELLS_PER_METER = 10;
const GRID_STRONG_METERS = 5;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
/** Zoom range for fitToContent only; avoids unnatural 200%+ browser-scale feel. */
const FIT_MIN_ZOOM = 0.7;
const FIT_MAX_ZOOM = 1.4;

const VIEWPORT_TRANSITION_MS = 200;

export type WarehouseCanvasProps = {
  /** edit = full designer interactions; read = view-only (no drag/resize/create; click/hover still allowed). */
  mode?: "edit" | "read";
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
  cellPx,
  width,
  height,
  svgRef,
  canvasContainerRef,
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
  hoveredLocationUUID = null,
  getRackDisplayId,
  highlightedStopIndex = null,
  currentStopIndex = null,
  routeStepBadges = null,
  routeEndCell = null,
  routeGraphPolyline = null,
  /** When false, START/PACK markers are hidden (step-by-step uses rack badges only). */
  showRouteEndpointMarkers = true,
}: WarehouseCanvasProps) {
  const isReadMode = mode === "read";
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

  useEffect(() => {
    if (!showRoute && !pathPoints && !pathSegments) return;
    console.log("[WarehouseCanvas] route visibility", {
      showRoute,
      pathPointsCount: pathPoints?.length ?? 0,
      pathSegmentsCount: pathSegments?.length ?? 0,
      routeStopsCount: routeStops?.length ?? 0,
      willRenderPathLayer: Boolean(
        showRoute &&
          specialLocations.pick_start &&
          ((pathSegments && pathSegments.length > 0) ||
            (pathPoints && pathPoints.length >= 2) ||
            (routeGraphPolyline && routeGraphPolyline.length >= 2) ||
            (routeStops && routeStops.length >= 2))
      ),
      willRenderRouteStopLayer: Boolean(showRoute && routeStops && routeStops.length > 0 && specialLocations.pick_start),
    });
  }, [showRoute, pathPoints, pathSegments, routeStops, routeGraphPolyline, specialLocations.pick_start, getRackDisplayId]);

  const handleSpecialPointerDown = useCallback(
    (e: React.PointerEvent, key: SpecialKey, id: number) => {
      e.stopPropagation();
      if (isReadMode) return;
      if (onUpdateSpecialLocation) setDraggingSpecial({ key, id });
    },
    [isReadMode, onUpdateSpecialLocation]
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
      if (isReadMode) return;
      if (draggingSpecial && getCellFromEvent(e)) {
        setDragPreviewCell(getCellFromEvent(e)!);
        return;
      }
      onMouseMove(e as unknown as React.MouseEvent<SVGSVGElement>);
    },
    [isReadMode, draggingSpecial, getCellFromEvent, onMouseMove]
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (isReadMode) return;
      if (draggingSpecial) return;
      onMouseDown(e as unknown as React.MouseEvent<SVGSVGElement>);
    },
    [isReadMode, draggingSpecial, onMouseDown]
  );

  const handleCanvasMouseUp = useCallback(() => {
    if (isReadMode) return;
    if (draggingSpecial && onUpdateSpecialLocation) {
      const cell = dragPreviewCell ?? (specialLocations[draggingSpecial.key] ? { x: Math.round((specialLocations[draggingSpecial.key]!.x / GRID_UNIT_CM)), y: Math.round((specialLocations[draggingSpecial.key]!.y / GRID_UNIT_CM)) } : null);
      if (cell) onUpdateSpecialLocation(draggingSpecial.id, cell);
      setDraggingSpecial(null);
      setDragPreviewCell(null);
      return;
    }
    onMouseUp();
  }, [isReadMode, draggingSpecial, dragPreviewCell, specialLocations, onUpdateSpecialLocation, onMouseUp]);

  const handleCanvasMouseLeave = useCallback(() => {
    if (isReadMode) return;
    if (draggingSpecial) return;
    onMouseLeave();
  }, [isReadMode, draggingSpecial, onMouseLeave]);

  const visualIdSet = new Set(selectedVisualIds);
  const isVisualSelected = (id: string) => selectedVisualId === id || visualIdSet.has(id);
  const rowGhostPositions = (() => {
    if (!rowDrawStart || !rowDrawEnd) return [];
    const pw = rowToolTemplate ? cmToCells(getCatalogItemSpec(rowToolTemplate).width_cm) : defaultRowSlotW;
    const ph = rowToolTemplate ? cmToCells(getCatalogItemSpec(rowToolTemplate).depth_cm) : defaultRowSlotH;
    const gapCells = cmToCells(rowGapCm);
    const isHorizontal = Math.abs(rowDrawEnd.x - rowDrawStart.x) >= Math.abs(rowDrawEnd.y - rowDrawStart.y);
    const orientedW = isHorizontal ? pw : ph;
    const orientedH = isHorizontal ? ph : pw;
    const stepX = orientedW + gapCells;
    const stepY = orientedH + gapCells;
    if (isHorizontal) {
      const x0 = Math.min(rowDrawStart.x, rowDrawEnd.x);
      const x1 = Math.max(rowDrawStart.x, rowDrawEnd.x);
      const span = x1 - x0;
      const count = stepX > 0 ? Math.max(1, Math.floor(span / stepX)) : 1;
      return Array.from({ length: count }, (_, i) => ({ x: x0 + i * stepX, y: rowDrawStart.y }));
    }
    const y0 = Math.min(rowDrawStart.y, rowDrawEnd.y);
    const y1 = Math.max(rowDrawStart.y, rowDrawEnd.y);
    const span = y1 - y0;
    console.assert(stepY >= orientedH, "[row-ghost] vertical stepY is smaller than ghostH", {
      stepY,
      ghostH: orientedH,
      gapCells,
      pw,
      ph,
    });
    const count = stepY > 0 ? Math.max(1, Math.floor(span / stepY)) : 1;
    return Array.from({ length: count }, (_, i) => ({ x: rowDrawStart.x, y: y0 + i * stepY }));
  })();
  const rowGhostSpec = rowToolTemplate ? getCatalogItemSpec(rowToolTemplate) : null;
  const rowGhostPw = rowGhostSpec ? cmToCells(rowGhostSpec.width_cm) : defaultRowSlotW;
  const rowGhostPh = rowGhostSpec ? cmToCells(rowGhostSpec.depth_cm) : defaultRowSlotH;
  const rowPreviewCount = rowGhostPositions.length;
  const rowPreviewLengthM =
    rowPreviewCount > 0 && rowDrawStart && rowDrawEnd
      ? (() => {
          const isHorizontal = Math.abs(rowDrawEnd.x - rowDrawStart.x) >= Math.abs(rowDrawEnd.y - rowDrawStart.y);
          const rackWidthCells = isHorizontal ? rowGhostPw : rowGhostPh;
          return rowPreviewCount * (rackWidthCells / CELLS_PER_METER);
        })()
      : 0;
  const showRowPreview =
    layoutMode === LayoutMode.DRAW_ROW &&
    rowDrawStart != null &&
    rowDrawEnd != null &&
    rowPreviewCursor != null;
  const [hoveredRackId, setHoveredRackId] = React.useState<number | string | null>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = React.useState<{ w: number; h: number } | null>(null);
  const [enableTransition, setEnableTransition] = React.useState(false);

  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /** Fit full grid in viewport; user `zoom` multiplies on top (wheel / toolbar). */
  const baseFitScale =
    viewportSize != null &&
    viewportSize.w > 0 &&
    viewportSize.h > 0 &&
    width > 0 &&
    height > 0
      ? Math.min(viewportSize.w / width, viewportSize.h / height)
      : 1;
  const displayScale = baseFitScale * zoom;
  const scaledLayoutW = width * displayScale;
  const scaledLayoutH = height * displayScale;

  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    const cw = viewportSize?.w ?? 0;
    const ch = viewportSize?.h ?? 0;
    const base =
      cw > 0 && ch > 0 && width > 0 && height > 0 ? Math.min(cw / width, ch / height) : 0;
    console.log("[WarehouseCanvas][dimensions]", {
      containerCssPx: { w: cw, h: ch },
      gridLogicalPx: { w: width, h: height },
      baseFitScale: base > 0 ? base : null,
      userZoom: zoom,
      displayScale: base > 0 ? base * zoom : null,
      scrollWrapperCssPx:
        base > 0 ? { w: width * base * zoom, h: height * base * zoom } : null,
    });
  }, [viewportSize, width, height, zoom]);

  /** Ctrl/⌘ + wheel → zoom only (non-passive so preventDefault works). Plain wheel uses native scroll on the viewport. */
  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (e.deltaY > 0 ? -0.1 : 0.1))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom, loading, selectedWarehouseId]);

  const fitToContent = React.useCallback(() => {
    const racks = layout.racks ?? [];
    if (racks.length === 0) return;
    const el = viewportRef.current;
    if (!el) return;
    const canvasWidth = el.clientWidth;
    const canvasHeight = el.clientHeight;
    if (canvasWidth <= 0 || canvasHeight <= 0 || width <= 0 || height <= 0) return;

    const baseFit = Math.min(canvasWidth / width, canvasHeight / height);

    const minX = Math.min(...racks.map((r) => r.x));
    const minY = Math.min(...racks.map((r) => r.y));
    const maxX = Math.max(...racks.map((r) => r.x + r.width));
    const maxY = Math.max(...racks.map((r) => r.y + r.height));

    const layoutWidth = (maxX - minX) * cellPx;
    const layoutHeight = (maxY - minY) * cellPx;
    const paddedWidth = layoutWidth * 1.3;
    const paddedHeight = layoutHeight * 1.3;

    const zoomX = paddedWidth > 0 ? canvasWidth / (paddedWidth * baseFit) : 1;
    const zoomY = paddedHeight > 0 ? canvasHeight / (paddedHeight * baseFit) : 1;
    let newZoom = Math.min(zoomX, zoomY);
    newZoom = Math.max(FIT_MIN_ZOOM, Math.min(FIT_MAX_ZOOM, newZoom));

    const minXpx = minX * cellPx;
    const minYpx = minY * cellPx;
    const display = baseFit * newZoom;
    const offsetX = -minXpx * display;
    const offsetY = -minYpx * display;

    setEnableTransition(true);
    setZoom(() => newZoom);
    setPan(() => ({ x: offsetX, y: offsetY }));
    setTimeout(() => setEnableTransition(false), VIEWPORT_TRANSITION_MS);
  }, [layout.racks, cellPx, width, height, setZoom, setPan]);

  const gridOpacity = React.useMemo(() => {
    const z = displayScale;
    const minor = z > 1.5 ? 0.02 * 0.8 : 0.02;
    const major = z < 0.5 ? Math.min(1, 0.05 * 1.1) : 0.05;
    const strong = 0.08;
    return {
      minor: `rgba(60,90,110,${minor})`,
      major: `rgba(60,90,110,${major})`,
      strong: `rgba(60,90,110,${strong})`,
    };
  }, [displayScale]);

  return (
    <main
      ref={canvasContainerRef}
      className="m-0 flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col items-stretch justify-start overflow-hidden pl-4 pt-4"
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
          <div
            className="flex min-w-0 shrink-0 items-center gap-3 overflow-x-auto px-3"
            style={{
              background: "#ffffff",
              borderBottom: "1px solid #e5e7eb",
              paddingTop: "8px",
              paddingBottom: "8px",
            }}
          >
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.25))} className="px-2 py-1 rounded bg-[#f3f4f6] text-sm font-medium hover:bg-[#e5e7eb]" style={{ color: colors.textSecondary }}>+</button>
              <span className="text-xs font-mono w-10 min-w-0" style={{ color: colors.textSecondary }}>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.25))} className="px-2 py-1 rounded bg-[#f3f4f6] text-sm font-medium hover:bg-[#e5e7eb]" style={{ color: colors.textSecondary }}>−</button>
              {!isLiveView && (
                <button type="button" onClick={fitToContent} className="px-2 py-1 rounded bg-[#f3f4f6] text-xs font-medium hover:bg-[#e5e7eb]" style={{ color: colors.textSecondary }} title="Dopasuj widok do zawartości">Dopasuj</button>
              )}
            </div>
            <span className="text-[#e5e7eb]" aria-hidden>|</span>
            {!isLiveView && (
              <div
                className="flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-slate-50/90 px-1.5 py-0.5"
                role="group"
                aria-label="Narzędzia rysowania i lokalizacji"
              >
                <button type="button" onClick={() => { const next = !rowToolActive; if (next) setRowToolTemplate?.(null); setRowToolActive((a) => !a); }} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${rowToolActive ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Narysuj rząd pustych slotów (bez szablonu). Później przeciągnij szablon do slotu.">Rysuj Rząd</button>
                {setLayoutMode && (
                  <>
                    <button type="button" onClick={() => setLayoutMode(LayoutMode.ADD_START)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${layoutMode === LayoutMode.ADD_START ? "bg-[#dcfce7] text-[#166534]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Punkt startowy kompletacji">Punkt startowy</button>
                    <button type="button" onClick={() => setLayoutMode(LayoutMode.ADD_PACK)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${layoutMode === LayoutMode.ADD_PACK ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Stacja pakowania">Stacja pakowania</button>
                  </>
                )}
              </div>
            )}
            {!isLiveView && (
              <>
                <span className="text-[#e5e7eb]" aria-hidden>|</span>
                <div className="flex items-center gap-2 shrink-0" role="group" aria-label="Elementy pomocnicze">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">Elementy pomocnicze</span>
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50/70 px-1.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => setAisleToolActive((a) => !a)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${aisleToolActive ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`}
                      title="Strefa to element wizualny – nie wpływa na routing ani logistykę"
                    >
                      Rysuj strefę
                    </button>
                  </div>
                </div>
              </>
            )}
            <span className="text-[#e5e7eb]" aria-hidden>|</span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setShowGrid((g) => !g)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${showGrid ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Widoczna siatka">Widoczna siatka</button>
              <button type="button" onClick={() => setShowLabels((v) => !v)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${showLabels ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Nazwy regałów i etykiety elementów">Pokaż etykiety</button>
            </div>
            {rowToolActive && rowGhostPositions.length > 0 && (
              <span className="text-xs font-mono" style={{ color: colors.textSecondary }}>→ {rowGhostPositions.length} {rowToolTemplate ? "regałów" : "slotów"}</span>
            )}
            {selectedRowContainerId && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <label className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                  Kierunek liczenia
                  <select
                    className="max-w-[148px] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-800"
                    aria-label="Kierunek liczenia regałów w rzędzie"
                    value={
                      (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId)?.direction ?? "LTR"
                    }
                    onChange={(e) => {
                      const v = e.target.value as "LTR" | "RTL";
                      setLayout((prev) => ({
                        ...prev,
                        row_containers: (prev.row_containers ?? []).map((rc) =>
                          rc.id === selectedRowContainerId ? { ...rc, direction: v } : rc
                        ),
                      }));
                    }}
                  >
                    <option value="LTR">Lewo → prawo</option>
                    <option value="RTL">Prawo → lewo</option>
                  </select>
                </label>
                {onStartRowDrag && (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); onStartRowDrag(e); }}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb] flex items-center gap-1 cursor-grab active:cursor-grabbing"
                    title="Przeciągnij rząd (przesuń cały rząd)"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                    Przenieś rząd
                  </button>
                )}
                {rowToolTemplate && fillSelectedRowWithTemplate && (
                  <button type="button" onClick={() => fillSelectedRowWithTemplate(rowToolTemplate)} className="px-2.5 py-1 rounded text-xs font-medium bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb] flex items-center gap-1" title="Wypełnij wszystkie puste sloty w zaznaczonym rzędzie wybranym szablonem">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Wypełnij rząd
                  </button>
                )}
                {deleteSelectedRow && (
                  <button type="button" onClick={deleteSelectedRow} className="px-2.5 py-1 rounded text-xs font-medium bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb] flex items-center gap-1" title="Usuń zaznaczony rząd (puste sloty i regały w tym rzędzie)">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Usuń rząd
                  </button>
                )}
                {trimSelectedRowEnd && (
                  <button type="button" onClick={trimSelectedRowEnd} className="px-2.5 py-1 rounded text-xs font-medium bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb] flex items-center gap-1" title="Usuń puste sloty na końcu rzędu">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h6" /></svg>
                    Skróć rząd
                  </button>
                )}
                {rotateSelectedRow && (
                  <button type="button" onClick={rotateSelectedRow} className="px-2.5 py-1 rounded text-xs font-medium bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb] flex items-center gap-1" title="Obróć rząd (poziomo ↔ pionowo)">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Obróć rząd
                  </button>
                )}
              </div>
            )}
            {!isLiveView && setAisleWidthCm != null && (
              <span className="flex items-center gap-1.5">
                <label className="text-[10px]" style={{ color: colors.textSecondary }}>Siła przyciągania (cm):</label>
                <input type="number" min={50} step={10} value={aisleWidthCm ?? 250} onChange={(e) => setAisleWidthCm(Number(e.target.value) || 250)} className="w-16 rounded-md border border-slate-200/80 bg-white px-1.5 py-0.5 text-xs" style={{ color: colors.textPrimary }} title="Odległość magnetycznego przyciągania przy przeciąganiu z katalogu" />
              </span>
            )}
          </div>
          <div
            ref={viewportRef}
            className="relative m-0 min-h-0 min-w-0 max-w-full flex-1 basis-0 overflow-auto p-0"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              overscrollBehavior: "contain",
              cursor: draggingFromCatalog ? "copy" : draggingRowId ? "grabbing" : rowToolActive || aisleToolActive ? "crosshair" : rowToolTemplate ? "cell" : "default",
            }}
            tabIndex={0}
            role="application"
            aria-label="Kanwa magazynu"
            title="Ctrl lub ⌘ + kółko myszy: zoom • kółko: przewijanie"
            onWheel={(e) => {
              if (import.meta.env.DEV && !e.ctrlKey && !e.metaKey) {
                console.log("wheel");
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (isReadMode) return;
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
                    const pw = cmToCells(spec.width_cm);
                    const ph = cmToCells(spec.depth_cm);
                    return snapPosition(cell, pw, ph, layout.racks, layout.grid_cols, layout.grid_rows, aisleWidthCm);
                  })();
              setCatalogGhostPosition(pos);
            }}
            onDragLeave={() => {
              if (isReadMode) return;
              setCatalogGhostPosition(null);
              setVisualGhostPosition(null);
              setCatalogHoveredSlotFromCell?.(null);
              setCatalogHoveredSlot?.(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (isReadMode) return;
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
            {!isReadMode && !isLiveView && layoutModeLabel != null && layoutModeColor != null && (
              <LayoutModeBadge modeLabel={layoutModeLabel} modeColor={layoutModeColor} />
            )}
            <RowPreviewOverlay
              visible={showRowPreview}
              x={rowPreviewCursor?.x ?? 0}
              y={rowPreviewCursor?.y ?? 0}
              rackCount={rowPreviewCount}
              totalLength={rowPreviewLengthM}
              useFixedPosition
            />
            <div
              className="min-h-0 min-w-0 shrink-0"
              style={{
                width: scaledLayoutW,
                height: scaledLayoutH,
                position: "relative",
              }}
            >
              <div
                className="relative min-h-0 min-w-0"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width,
                  height,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${displayScale})`,
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
                {showGrid && (
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
                        backgroundSize: `${cellPx * CELLS_PER_METER}px ${cellPx * CELLS_PER_METER}px`,
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
                        backgroundSize: `${cellPx * CELLS_PER_METER * GRID_STRONG_METERS}px ${cellPx * CELLS_PER_METER * GRID_STRONG_METERS}px`,
                        backgroundImage: `linear-gradient(to right, ${gridOpacity.strong} 2px, transparent 2px),
                          linear-gradient(to bottom, ${gridOpacity.strong} 2px, transparent 2px)`,
                      }}
                      aria-hidden
                    />
                  </>
                )}
                <svg
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
                    stroke="#666"
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                  {wallElements.length > 0 && (
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
                  {!isReadMode && dragSlotHighlights && (
                    <SelectionOverlay
                      part="dragSlots"
                      dragSlotHighlights={dragSlotHighlights}
                      cellPx={cellPx}
                    />
                  )}
                  {/* Temporary snap guidelines: show dragged rack's snapped x/y lines. */}
                  {draggingRackId != null && rackDragPreviewPosition != null && (
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
                  {layout.aisles.map((a, i) => {
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
                  {showRoute &&
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
                    cellPx={cellPx}
                    draggingRackId={draggingRackId}
                    selectedRackIds={selectedRackIds}
                    rackDragPreviewPositions={rackDragPreviewPositions}
                    rackDragPreviewPosition={rackDragPreviewPosition}
                    collisionRackId={collisionRackId}
                    collisionRackIds={collisionRackIds}
                    outsideRackIds={outsideRackIds}
                    showLabels={showLabels}
                    hoveredRackId={hoveredRackId}
                    setHoveredRackId={setHoveredRackId}
                    highlightedRackIds={highlightedRackIds}
                    rackQuantities={rackQuantities}
                    highlightedBinUUIDs={highlightedBinUUIDs}
                    hoveredLocationUUID={hoveredLocationUUID}
                    onRackClick={onRackClick}
                    onRackClickPassthrough={onRackClickPassthrough}
                    onRackDoubleClick={onRackDoubleClick}
                    routeStepBadges={routeStepBadges}
                    routeStops={routeStops ?? null}
                    isRoutePlanningMode={isRoutePlanningMode}
                  />
                  {/* START / PACK only — visit order on rack badges */}
                  {showRoute && routeStops && routeStops.length > 0 && specialLocations.pick_start && (
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
                  {specialLocations.pick_start && (() => {
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
                  {specialLocations.packing && (() => {
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
                  {specialLocations.dock && (() => {
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
                  <VisualLayer
                    visualElements={layout.visual_elements ?? []}
                    cellPx={cellPx}
                    showLabels={showLabels}
                    isVisualSelected={isVisualSelected}
                    draggingVisualType={draggingVisualType}
                    visualGhostPosition={visualGhostPosition}
                    getDefaultVisualSize={getDefaultVisualSize}
                  />
                  {placementMode && ghostPosition && (
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
                  {copyPlacementMode && ghostPosition && copiedRack && (
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
                  {rowToolActive && rowGhostPositions.length > 0 && (
                    <g pointerEvents="none">
                      {(() => {
                        const isHorizontal = rowDrawStart && rowDrawEnd
                          ? Math.abs(rowDrawEnd.x - rowDrawStart.x) >= Math.abs(rowDrawEnd.y - rowDrawStart.y)
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
                  {draggingFromCatalog && catalogGhostPosition &&
                    (() => {
                      const spec = getCatalogItemSpec(draggingFromCatalog);
                      const pw = cmToCells(spec.width_cm);
                      const ph = cmToCells(spec.depth_cm);
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
                  {!isReadMode && marqueeStart && marqueeEnd && (
                    <SelectionOverlay
                      part="marquee"
                      marqueeStart={marqueeStart}
                      marqueeEnd={marqueeEnd}
                      cellPx={cellPx}
                    />
                  )}
                  <RowLayer
                    part="rowDragGhost"
                    layout={layout}
                    cellPx={cellPx}
                    draggingRowId={draggingRowId ?? null}
                    rowDragPreviewStart={rowDragPreviewStart ?? null}
                  />
                </svg>
                {/* HTML drop zones over empty slots. When rowToolActive, do not capture so SVG receives draw events. */}
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
                {!isReadMode && (
                  <SelectionOverlay
                    part="toolbar"
                    selectedRack={selectedRack}
                    isMultiSelect={isMultiSelect}
                    cellPx={cellPx}
                    setInternalLayoutRackId={setInternalLayoutRackId}
                    setShowElevationForRackId={setShowElevationForRackId}
                    setLayout={setLayout}
                    setSelectedRackId={setSelectedRackId}
                    setSelectedRackIds={setSelectedRackIds}
                    selectedRackIds={selectedRackIds}
                    onCopyRack={onCopyRack}
                  />
                )}
              </div>
            </div>
            {cursorCm != null && (placementMode || copyPlacementMode || draggingRackId != null) && (
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
