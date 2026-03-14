import React, { type RefObject } from "react";
import type { LayoutState } from "../../types/warehouse";
import type { CatalogItem, VisualElementType } from "../../types/warehouse";
import { cmToCells, getCatalogItemSpec, binVolumeDm3 } from "./warehouseUtils";
import { DimensionOverlay } from "./DimensionOverlay";
import { RowPreviewOverlay } from "./RowPreviewOverlay";
import { LayoutModeBadge, LayoutMode, LAYOUT_MODE_CURSORS } from "../warehouse-layout";
import { colors, radius } from "../../layout/designTokens";
import { RackLayer } from "./WarehouseCanvas/RackLayer";
import { RowLayer } from "./WarehouseCanvas/RowLayer";
import { VisualLayer } from "./WarehouseCanvas/VisualLayer";
import { PathLayer } from "./WarehouseCanvas/PathLayer";
import { SelectionOverlay } from "./WarehouseCanvas/SelectionOverlay";

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
  /** Optional: when provided, shown in toolbar and passed to snapPosition for magnetic aisle width */
  aisleWidthCm?: number;
  setAisleWidthCm?: (v: number) => void;
  setRowGapCm?: (v: number) => void;
  showGrid: boolean;
  setShowGrid: (fn: (v: boolean) => boolean) => void;
  /** Show dimension lines (distances to nearest rows/walls). */
  showDimensions?: boolean;
  setShowDimensions?: (fn: (v: boolean) => boolean) => void;
  /** Precomputed dimension lines (cell coords). Drawn when showDimensions is true. */
  dimensionLines?: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number }; distanceCm: number; isAisle?: boolean }>;
  /** Aisle zones (gap between parallel rows) to highlight. Cell coords. */
  aisleHighlights?: Array<{ x: number; y: number; w: number; h: number; widthCm: number }>;
  snapToGrid: boolean;
  setSnapToGrid: (fn: (v: boolean) => boolean) => void;
  showRackLabels: boolean;
  setShowRackLabels: (fn: (v: boolean) => boolean) => void;
  selectedAisleIndex: number | null;
  draggingVisualType: VisualElementType | null;
  setDraggingVisualType: (t: VisualElementType | null) => void;
  visualGhostPosition: { x: number; y: number } | null;
  setVisualGhostPosition: (p: { x: number; y: number } | null) => void;
  addVisualElement: (cell: { x: number; y: number }, type: VisualElementType) => void;
  getDefaultVisualSize: (type: VisualElementType) => { w: number; h: number };
  selectedVisualId: string | null;
  onExportPdf?: () => void | Promise<void>;
  showPickingPath?: boolean;
  setShowPickingPath?: (fn: (v: boolean) => boolean) => void;
  pickingPathPoints?: { x: number; y: number }[] | null;
  pathToolActive?: boolean;
  setPathToolActive?: (fn: (v: boolean) => boolean) => void;
  manualPathPoints?: { x: number; y: number }[];
  pathDistanceM?: number;
  onMagicWand?: () => void;
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
};

function WarehouseCanvasInner({
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
  showDimensions = false,
  setShowDimensions,
  dimensionLines = [],
  aisleHighlights = [],
  snapToGrid,
  setSnapToGrid,
  showRackLabels,
  setShowRackLabels,
  selectedAisleIndex,
  draggingVisualType,
  setDraggingVisualType,
  visualGhostPosition,
  setVisualGhostPosition,
  addVisualElement,
  getDefaultVisualSize,
  selectedVisualId,
  onExportPdf: _onExportPdf,
  showPickingPath,
  setShowPickingPath,
  pickingPathPoints,
  pathToolActive,
  setPathToolActive,
  manualPathPoints = [],
  pathDistanceM,
  onMagicWand,
  selectedVisualIds = [],
  isLiveView,
  layoutModeLabel,
  layoutModeColor,
  layoutMode,
  setLayoutMode,
  specialLocations = { pick_start: null, packing: null, dock: null },
}: WarehouseCanvasProps) {
  const SPECIAL_CELL_CM = 100;
  const visualIdSet = new Set(selectedVisualIds);
  const isVisualSelected = (id: string) => selectedVisualId === id || visualIdSet.has(id);
  const rowGhostPositions = (() => {
    if (!rowDrawStart || !rowDrawEnd) return [];
    const pw = rowToolTemplate ? cmToCells(getCatalogItemSpec(rowToolTemplate).width_cm) : defaultRowSlotW;
    const ph = rowToolTemplate ? cmToCells(getCatalogItemSpec(rowToolTemplate).depth_cm) : defaultRowSlotH;
    const gapCells = cmToCells(rowGapCm);
    const stepW = pw + gapCells;
    const stepH = ph + gapCells;
    const isHorizontal = Math.abs(rowDrawEnd.x - rowDrawStart.x) >= Math.abs(rowDrawEnd.y - rowDrawStart.y);
    if (isHorizontal) {
      const x0 = Math.min(rowDrawStart.x, rowDrawEnd.x);
      const x1 = Math.max(rowDrawStart.x, rowDrawEnd.x);
      const span = x1 - x0;
      const count = stepW > 0 ? Math.max(1, Math.floor(span / stepW)) : 1;
      return Array.from({ length: count }, (_, i) => ({ x: x0 + i * stepW, y: rowDrawStart.y }));
    }
    const y0 = Math.min(rowDrawStart.y, rowDrawEnd.y);
    const y1 = Math.max(rowDrawStart.y, rowDrawEnd.y);
    const span = y1 - y0;
    const count = stepH > 0 ? Math.max(1, Math.floor(span / stepH)) : 1;
    return Array.from({ length: count }, (_, i) => ({ x: rowDrawStart.x, y: y0 + i * stepH }));
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
  const [_viewportSize, setViewportSize] = React.useState<{ w: number; h: number } | null>(null);
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

  const fitToContent = React.useCallback(() => {
    const racks = layout.racks ?? [];
    if (racks.length === 0) return;
    const el = viewportRef.current;
    if (!el) return;
    const canvasWidth = el.clientWidth;
    const canvasHeight = el.clientHeight;
    if (canvasWidth <= 0 || canvasHeight <= 0) return;

    const minX = Math.min(...racks.map((r) => r.x));
    const minY = Math.min(...racks.map((r) => r.y));
    const maxX = Math.max(...racks.map((r) => r.x + r.width));
    const maxY = Math.max(...racks.map((r) => r.y + r.height));

    const layoutWidth = (maxX - minX) * cellPx;
    const layoutHeight = (maxY - minY) * cellPx;
    const paddedWidth = layoutWidth * 1.3;
    const paddedHeight = layoutHeight * 1.3;

    const zoomX = paddedWidth > 0 ? canvasWidth / paddedWidth : 1;
    const zoomY = paddedHeight > 0 ? canvasHeight / paddedHeight : 1;
    let newZoom = Math.min(zoomX, zoomY);
    newZoom = Math.max(FIT_MIN_ZOOM, Math.min(FIT_MAX_ZOOM, newZoom));

    const minXpx = minX * cellPx;
    const minYpx = minY * cellPx;
    const offsetX = (canvasWidth - layoutWidth * newZoom) / 2 - minXpx * newZoom;
    const offsetY = 60 - minYpx * newZoom;

    setEnableTransition(true);
    setZoom(() => newZoom);
    setPan(() => ({ x: offsetX, y: offsetY }));
    setTimeout(() => setEnableTransition(false), VIEWPORT_TRANSITION_MS);
  }, [layout.racks, cellPx, setZoom, setPan]);

  const gridOpacity = React.useMemo(() => {
    const minor = zoom > 1.5 ? 0.02 * 0.8 : 0.02;
    const major = zoom < 0.5 ? Math.min(1, 0.05 * 1.1) : 0.05;
    const strong = 0.08;
    return {
      minor: `rgba(60,90,110,${minor})`,
      major: `rgba(60,90,110,${major})`,
      strong: `rgba(60,90,110,${strong})`,
    };
  }, [zoom]);

  return (
    <main ref={canvasContainerRef} className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ backgroundColor: colors.background }}>
      {selectedWarehouseId == null ? (
        <div className="flex items-center justify-center flex-1" style={{ color: colors.textSecondary }}>Wybierz magazyn lub utwórz nowy.</div>
      ) : loading ? (
        <div className="flex items-center justify-center flex-1" style={{ color: colors.textSecondary }}>Ładowanie…</div>
      ) : (
        <>
          <div
            className="shrink-0 flex items-center gap-3 px-3"
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
              <button type="button" onClick={fitToContent} className="px-2 py-1 rounded bg-[#f3f4f6] text-xs font-medium hover:bg-[#e5e7eb]" style={{ color: colors.textSecondary }} title="Dopasuj widok do zawartości">Fit</button>
            </div>
            <span className="text-[#e5e7eb]" aria-hidden>|</span>
            {!isLiveView && (
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setAisleToolActive((a) => !a)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${aisleToolActive ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`}>Alejka</button>
                <button type="button" onClick={() => { const next = !rowToolActive; if (next) setRowToolTemplate?.(null); setRowToolActive((a) => !a); }} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${rowToolActive ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Narysuj rząd pustych slotów (bez szablonu). Później przeciągnij szablon do slotu.">Rysuj Rząd</button>
                <button type="button" onClick={() => setSnapToGrid((g) => !g)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${snapToGrid ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Przyciągnij do siatki">Przyciągnij do siatki</button>
                {setPathToolActive && (
                  <button type="button" onClick={() => setPathToolActive((v) => !v)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${pathToolActive ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Kliknij na siatce, aby dodać punkty ścieżki">Narzędzie ścieżki</button>
                )}
                {setLayoutMode && (
                  <>
                    <button type="button" onClick={() => setLayoutMode(LayoutMode.ADD_START)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${layoutMode === LayoutMode.ADD_START ? "bg-[#dcfce7] text-[#166534]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Punkt startowy kompletacji">Add Start Point</button>
                    <button type="button" onClick={() => setLayoutMode(LayoutMode.ADD_PACK)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${layoutMode === LayoutMode.ADD_PACK ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Stacja pakowania">Add Packing Station</button>
                    <button type="button" onClick={() => setLayoutMode(LayoutMode.ADD_DOCK)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${layoutMode === LayoutMode.ADD_DOCK ? "bg-[#e5e7eb] text-[#374151]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Rampa / dok wysyłkowy">Add Dock</button>
                  </>
                )}
                {onMagicWand && (
                  <button type="button" onClick={onMagicWand} className="px-2.5 py-1 rounded text-xs font-medium bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]" title="Optymalizuj ścieżkę (S-Shape)">Optymalizuj (S)</button>
                )}
              </div>
            )}
            <span className="text-[#e5e7eb]" aria-hidden>|</span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setShowGrid((g) => !g)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${showGrid ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Widoczna siatka">Widoczna siatka</button>
              <button type="button" onClick={() => setShowRackLabels((v) => !v)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${showRackLabels ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Nazwy regałów i etykiety elementów">Pokaż etykiety</button>
            </div>
            {setShowDimensions && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={showDimensions} onChange={(e) => setShowDimensions(() => e.target.checked)} className="rounded border-[#e5e7eb] text-[#1d4ed8] focus:ring-[#3b82f6]" />
                <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Pokaż wymiary</span>
              </label>
            )}
            {!isLiveView && setShowPickingPath && (
              <button type="button" onClick={() => setShowPickingPath((v) => !v)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${showPickingPath ? "bg-[#e6f0ff] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"}`} title="Ścieżka S (zig-zag)">Ścieżka kompletowania</button>
            )}
            {showPickingPath && pathDistanceM != null && pathDistanceM > 0 && (
              <span className="text-xs text-slate-600 font-mono">Dystans: {pathDistanceM} m</span>
            )}
            {rowToolActive && rowGhostPositions.length > 0 && (
              <span className="text-xs font-mono" style={{ color: colors.textSecondary }}>→ {rowGhostPositions.length} {rowToolTemplate ? "regałów" : "slotów"}</span>
            )}
            {selectedRowContainerId && (
              <div className="flex items-center gap-1.5">
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
            {rowToolActive && setRowGapCm && (
              <span className="flex items-center gap-1.5">
                <label className="text-[10px]" style={{ color: colors.textSecondary }}>Odstęp (cm):</label>
                <input type="number" min={0} step={5} value={rowGapCm} onChange={(e) => setRowGapCm(Number(e.target.value) || 0)} className="w-14 rounded-md border border-slate-200/80 bg-white px-1.5 py-0.5 text-xs" style={{ color: colors.textPrimary }} />
              </span>
            )}
            {!isLiveView && setAisleWidthCm != null && (
              <span className="flex items-center gap-1.5">
                <label className="text-[10px]" style={{ color: colors.textSecondary }}>Szer. alejki (cm):</label>
                <input type="number" min={50} step={10} value={aisleWidthCm ?? 250} onChange={(e) => setAisleWidthCm(Number(e.target.value) || 250)} className="w-16 rounded-md border border-slate-200/80 bg-white px-1.5 py-0.5 text-xs" style={{ color: colors.textPrimary }} title="Odległość przyciągania (magnetic edges)" />
              </span>
            )}
          </div>
          <div
            ref={viewportRef}
            className="flex-1 min-h-0 overflow-auto relative"
            style={{
              margin: "16px",
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              overflow: "hidden",
              cursor: draggingFromCatalog ? "copy" : draggingRowId ? "grabbing" : rowToolActive ? "crosshair" : rowToolTemplate ? "cell" : "default",
            }}
            tabIndex={0}
            role="application"
            aria-label="Kanwa magazynu"
            onWheel={(e) => {
              e.preventDefault();
              setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (e.deltaY > 0 ? -0.1 : 0.1))));
            }}
            onDragOver={(e) => {
              e.preventDefault();
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
                    return snapToGrid
                      ? snapPosition(cell, pw, ph, layout.racks, layout.grid_cols, layout.grid_rows, aisleWidthCm)
                      : { x: Math.max(0, Math.min(layout.grid_cols - pw, cell.x)), y: Math.max(0, Math.min(layout.grid_rows - ph, cell.y)) };
                  })();
              setCatalogGhostPosition(pos);
            }}
            onDragLeave={() => {
              setCatalogGhostPosition(null);
              setVisualGhostPosition(null);
              setCatalogHoveredSlotFromCell?.(null);
              setCatalogHoveredSlot?.(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
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
            {!isLiveView && layoutModeLabel != null && layoutModeColor != null && (
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
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                width,
                height,
                transition: enableTransition ? `transform ${VIEWPORT_TRANSITION_MS}ms ease-in-out` : "none",
              }}
              className="min-w-0 min-h-0"
            >
              <div className="relative" style={{ width, height }}>
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
                  viewBox={
                    layout.building_width_m != null && (layout.building_depth_m != null || layout.building_height_m != null)
                      ? `${-20} ${-18} ${width + 38} ${height + 18}`
                      : `0 0 ${width} ${height}`
                  }
                  className="relative z-10 block bg-transparent"
                  style={{ cursor: isPanning ? "grabbing" : panMode ? "grab" : placementMode ? "none" : draggingRackId ? "grabbing" : (layoutMode != null ? LAYOUT_MODE_CURSORS[layoutMode] : "default"), overflow: "visible" }}
                  onMouseMove={onMouseMove}
                  onMouseDown={onMouseDown}
                  onMouseUp={onMouseUp}
                  onMouseLeave={onMouseLeave}
                >
                  <rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    fill="none"
                    stroke="#666"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  {layout.building_width_m != null && (layout.building_depth_m != null || layout.building_height_m != null) && (() => {
                    const depthM = layout.building_depth_m ?? layout.building_height_m;
                    return depthM != null ? (
                      <g pointerEvents="none" aria-hidden>
                        <text x={width / 2} y={-10} textAnchor="middle" fontSize={12} fill="#888">
                          {layout.building_width_m} m
                        </text>
                        <text x={width + 10} y={height / 2} transform={`rotate(-90 ${width + 10} ${height / 2})`} textAnchor="middle" fontSize={12} fill="#888">
                          {depthM} m
                        </text>
                      </g>
                    ) : null;
                  })()}
                  {dragSlotHighlights && (
                    <SelectionOverlay
                      part="dragSlots"
                      dragSlotHighlights={dragSlotHighlights}
                      cellPx={cellPx}
                    />
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
                        x={a.x * cellPx + 1}
                        y={a.y * cellPx + 1}
                        width={a.width * cellPx - 2}
                        height={a.height * cellPx - 2}
                        fill={isSelected ? "#0ea5e9" : "#94a3b8"}
                        stroke={isSelected ? "#e0f2fe" : "#64748b"}
                        strokeWidth={isSelected ? 2 : 0.5}
                        rx={RACK_RADIUS_PX}
                      />
                    );
                  })}
                  <RackLayer
                    racks={layout.racks}
                    cellPx={cellPx}
                    draggingRackId={draggingRackId}
                    selectedRackIds={selectedRackIds}
                    rackDragPreviewPositions={rackDragPreviewPositions}
                    rackDragPreviewPosition={rackDragPreviewPosition}
                    collisionRackId={collisionRackId}
                    collisionRackIds={collisionRackIds}
                    outsideRackIds={outsideRackIds}
                    showRackLabels={showRackLabels}
                    hoveredRackId={hoveredRackId}
                    setHoveredRackId={setHoveredRackId}
                  />
                  {/* Special warehouse nodes (above shelves) */}
                  {specialLocations.pick_start && (() => {
                    const px = (specialLocations.pick_start.x / SPECIAL_CELL_CM) * cellPx + cellPx / 2;
                    const py = (specialLocations.pick_start.y / SPECIAL_CELL_CM) * cellPx + cellPx / 2;
                    const r = cellPx * 0.45;
                    return (
                      <g key="special-pick_start" pointerEvents="none">
                        <circle cx={px} cy={py} r={r} fill="#22c55e" stroke="#166534" strokeWidth={2} />
                        <text x={px} y={py + 1} textAnchor="middle" fontSize={Math.max(8, cellPx * 0.3)} fill="#fff" fontWeight="bold">START</text>
                      </g>
                    );
                  })()}
                  {specialLocations.packing && (() => {
                    const px = (specialLocations.packing.x / SPECIAL_CELL_CM) * cellPx + cellPx / 2;
                    const py = (specialLocations.packing.y / SPECIAL_CELL_CM) * cellPx + cellPx / 2;
                    const s = cellPx * 0.7;
                    return (
                      <g key="special-packing" pointerEvents="none">
                        <rect x={px - s / 2} y={py - s / 2} width={s} height={s} fill="#3b82f6" stroke="#1d4ed8" strokeWidth={2} rx={2} />
                        <text x={px} y={py + 1} textAnchor="middle" fontSize={Math.max(8, cellPx * 0.3)} fill="#fff" fontWeight="bold">PACK</text>
                      </g>
                    );
                  })()}
                  {specialLocations.dock && (() => {
                    const px = (specialLocations.dock.x / SPECIAL_CELL_CM) * cellPx + cellPx / 2;
                    const py = (specialLocations.dock.y / SPECIAL_CELL_CM) * cellPx + cellPx / 2;
                    const size = cellPx * 0.5;
                    const points = `${px},${py - size} ${px + size},${py} ${px},${py + size} ${px - size},${py}`;
                    return (
                      <g key="special-dock" pointerEvents="none">
                        <polygon points={points} fill="#6b7280" stroke="#4b5563" strokeWidth={2} />
                        <text x={px} y={py + 1} textAnchor="middle" fontSize={Math.max(8, cellPx * 0.3)} fill="#fff" fontWeight="bold">DOCK</text>
                      </g>
                    );
                  })()}
                  <VisualLayer
                    visualElements={layout.visual_elements ?? []}
                    cellPx={cellPx}
                    showRackLabels={showRackLabels}
                    isVisualSelected={isVisualSelected}
                    draggingVisualType={draggingVisualType}
                    visualGhostPosition={visualGhostPosition}
                    getDefaultVisualSize={getDefaultVisualSize}
                  />
                  {pickingPathPoints && pickingPathPoints.length >= 2 && (
                    <PathLayer
                      pickingPathPoints={pickingPathPoints}
                      manualPathPoints={manualPathPoints}
                      cellPx={cellPx}
                    />
                  )}
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
                    />
                  )}
                  {rowToolActive && rowGhostPositions.length > 0 && (
                    <g>
                      {(() => {
                        const isHorizontal = rowDrawStart && rowDrawEnd
                          ? Math.abs(rowDrawEnd.x - rowDrawStart.x) >= Math.abs(rowDrawEnd.y - rowDrawStart.y)
                          : true;
                        const ghostW = isHorizontal ? rowGhostPw : rowGhostPh;
                        const ghostH = isHorizontal ? rowGhostPh : rowGhostPw;
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
                        <g>
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
                  {marqueeStart && marqueeEnd && (
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
                {/* Visual-only overlay: dimension lines and aisle width. Does not modify layout or slots. */}
                {showDimensions && (
                  <DimensionOverlay
                    width={width}
                    height={height}
                    cellPx={cellPx}
                    dimensionLines={dimensionLines}
                    aisleHighlights={aisleHighlights}
                  />
                )}
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
                />
              </div>
            </div>
            {cursorCm != null && (placementMode || draggingRackId != null) && (
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
