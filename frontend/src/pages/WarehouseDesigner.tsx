import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import api from "../api/axios";
import type { RackState, BinState, InternalStructure, LayoutState, RackTemplate, CustomRackTemplate, CatalogItem, VisualElementType, VisualElementState, ColumnShape, DoorStyle, ZoneType, WarehouseProduct, RowContainer, EmptyRowSlot } from "../types/warehouse";
import { GRID_UNIT_CM } from "../types/warehouse";
import { formatVolume, createBinsForRack, binsToLevels, volumePerBin, volumePerBinFromTotal, cmToCells, getCatalogItemSpec, getLevelConfig, getTotalLocations, getNextIndexInRow, ROW_LABEL_ADDRESS_PATTERN, reindexRowByPrefix, reindexGeometricRow, findSnapToRowPosition, getDragSlotHighlights, pathDistanceMeters, binUsedVolumeDm3, binVolumeDm3, getRackDisplayId, getAllPositionsFromRacks } from "../components/warehouse/warehouseUtils";
import { RackSidebar } from "../components/warehouse/RackSidebar";
import { RackSideViewGrid } from "../components/warehouse/RackSideViewGrid";
import type { EditProductModalProps } from "../components/warehouse/EditProductModal";
import { WarehouseModals } from "../components/warehouse/WarehouseModals";
import { WarehouseMainView } from "../components/warehouse/WarehouseMainView";
import { WarehouseFullMap } from "../components/warehouse/WarehouseFullMap";
import { WarehouseLegend } from "../components/warehouse/WarehouseLegend";
import { UI_STRINGS } from "../constants/uiStrings";
import PageLayout from "../components/layout/PageLayout";
import { LayoutMode } from "../warehouse-layout";
import { useLayoutModeShortcuts, useLayoutModeDisplay } from "../warehouse-layout";

const CELLS_PER_METER = 10;
const BASE_PX_PER_CELL = 5;
const GRID_COLS = 240;
const GRID_ROWS = 160;
const TENANT_ID = 1;
/** Backend special locations use cm; 1 grid cell = 100 cm for API. */
const SPECIAL_LOCATION_CELL_CM = 100;
/** Default slot size (cells) for "Draw Row" when no template is selected. 120×80 cm. */
const DEFAULT_ROW_SLOT_W = 12;
const DEFAULT_ROW_SLOT_H = 8;

function snapToGrid(val: number, gridStep: number = 1): number {
  return Math.round(val / gridStep) * gridStep;
}

/** Row start position (from first slot). Used to recompute slot positions. */
function getRowStart(row: RowContainer): { x: number; y: number } {
  const first = row.slots[0];
  if (!first) return { x: 0, y: 0 };
  return { x: first.x, y: first.y };
}

/** Recompute slot x,y. Horizontal: x increases, y = startY. Vertical: x = startX, y increases. */
function computeRowSlotPositions(
  slots: EmptyRowSlot[],
  startX: number,
  startY: number,
  orientation: "horizontal" | "vertical" = "horizontal"
): EmptyRowSlot[] {
  if (orientation === "vertical") {
    let y = startY;
    return slots.map((s) => {
      const out: EmptyRowSlot = { ...s, x: startX, y };
      y += s.h;
      return out;
    });
  }
  let x = startX;
  return slots.map((s) => {
    const out: EmptyRowSlot = { ...s, x, y: startY };
    x += s.w;
    return out;
  });
}

/** Bounding box of a row (from its slots) in cell coordinates. */
function getRowBounds(rc: RowContainer): { x: number; y: number; w: number; h: number } | null {
  if (!rc.slots.length) return null;
  let minX = rc.slots[0]!.x, minY = rc.slots[0]!.y, maxX = rc.slots[0]!.x + rc.slots[0]!.w, maxY = rc.slots[0]!.y + rc.slots[0]!.h;
  for (const s of rc.slots) {
    minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const SNAP_DISTANCES_CM = [100, 200, 300];
const SNAP_DISTANCE_THRESHOLD_CM = 15;

/** Optionally snap row drag position so distance to nearest obstacle is 100/200/300 cm. */
function snapRowPreviewToDistance(
  row: RowContainer,
  candidate: { x: number; y: number },
  layout: LayoutState
): { x: number; y: number } {
  const orient = row.orientation ?? "horizontal";
  let w = 0, h = 0;
  for (const s of row.slots) {
    if (orient === "horizontal") { w += s.w; h = Math.max(h, s.h); } else { w = Math.max(w, s.w); h += s.h; }
  }
  const sel = { x: candidate.x, y: candidate.y, w, h };
  const rows = layout.row_containers ?? [];
  const racks = layout.racks;
  const obstacles: Array<{ y0: number; y1: number; x0: number; x1: number }> = [];
  for (const rc of rows) {
    if (rc.id === row.id) continue;
    const b = getRowBounds(rc);
    if (b) obstacles.push({ y0: b.y, y1: b.y + b.h, x0: b.x, x1: b.x + b.w });
  }
  for (const r of racks) {
    const inRow = rows.some((rc) => rc.slots.some((s) => s.rackId === (r.id ?? r.rack_index)));
    if (inRow) continue;
    obstacles.push({ y0: r.y, y1: r.y + r.height, x0: r.x, x1: r.x + r.width });
  }
  const gridRows = layout.grid_rows;
  const gridCols = layout.grid_cols;
  if (orient === "horizontal") {
    const selTop = sel.y, selBottom = sel.y + sel.h;
    let nearestAbove = 0, nearestBelow = gridRows;
    for (const o of obstacles) {
      if (o.x1 <= sel.x || o.x0 >= sel.x + sel.w) continue;
      if (o.y1 <= selTop) nearestAbove = Math.max(nearestAbove, o.y1);
      if (o.y0 >= selBottom) nearestBelow = Math.min(nearestBelow, o.y0);
    }
    const distAboveCm = (selTop - nearestAbove) * GRID_UNIT_CM;
    const distBelowCm = (nearestBelow - selBottom) * GRID_UNIT_CM;
    for (const target of SNAP_DISTANCES_CM) {
      if (Math.abs(distAboveCm - target) <= SNAP_DISTANCE_THRESHOLD_CM) {
        const newY = nearestAbove + target / GRID_UNIT_CM;
        if (newY >= 0 && newY + sel.h <= gridRows) return { x: candidate.x, y: Math.round(newY) };
      }
      if (Math.abs(distBelowCm - target) <= SNAP_DISTANCE_THRESHOLD_CM) {
        const newY = nearestBelow - target / GRID_UNIT_CM - sel.h;
        if (newY >= 0 && newY + sel.h <= gridRows) return { x: candidate.x, y: Math.round(newY) };
      }
    }
  } else {
    const selLeft = sel.x, selRight = sel.x + sel.w;
    let nearestLeft = 0, nearestRight = gridCols;
    for (const o of obstacles) {
      if (o.y1 <= sel.y || o.y0 >= sel.y + sel.h) continue;
      if (o.x1 <= selLeft) nearestLeft = Math.max(nearestLeft, o.x1);
      if (o.x0 >= selRight) nearestRight = Math.min(nearestRight, o.x0);
    }
    const distLeftCm = (selLeft - nearestLeft) * GRID_UNIT_CM;
    const distRightCm = (nearestRight - selRight) * GRID_UNIT_CM;
    for (const target of SNAP_DISTANCES_CM) {
      if (Math.abs(distLeftCm - target) <= SNAP_DISTANCE_THRESHOLD_CM) {
        const newX = nearestLeft + target / GRID_UNIT_CM;
        if (newX >= 0 && newX + sel.w <= gridCols) return { x: Math.round(newX), y: candidate.y };
      }
      if (Math.abs(distRightCm - target) <= SNAP_DISTANCE_THRESHOLD_CM) {
        const newX = nearestRight - target / GRID_UNIT_CM - sel.w;
        if (newX >= 0 && newX + sel.w <= gridCols) return { x: Math.round(newX), y: candidate.y };
      }
    }
  }
  return candidate;
}

/** Remove row containers that have no racks (all slots empty). Prevents ghost rows. */
function filterEmptyRowContainers(rows: RowContainer[] | undefined): RowContainer[] {
  if (!rows?.length) return [];
  return rows.filter((rc) => rc.slots.some((s) => s.rackId != null));
}

/** Find an empty slot (no rackId) that contains the given cell. Slots must have x,y set (e.g. via computeRowSlotPositions). */
function findEmptySlotAt(
  rowContainers: RowContainer[] | undefined,
  cell: { x: number; y: number }
): { rowContainer: RowContainer; slotIndex: number; slot: EmptyRowSlot } | null {
  if (!rowContainers?.length) return null;
  for (const row of rowContainers) {
    for (let i = 0; i < row.slots.length; i++) {
      const s = row.slots[i]!;
      if (s.rackId != null) continue;
      if (cell.x >= s.x && cell.x < s.x + s.w && cell.y >= s.y && cell.y < s.y + s.h) return { rowContainer: row, slotIndex: i, slot: s };
    }
  }
  return null;
}

/** Find which row and slot index contain the given rack (by rackId). */
function findRowAndSlotForRack(
  rowContainers: RowContainer[] | undefined,
  rackId: number | string
): { rowContainer: RowContainer; slotIndex: number } | null {
  if (!rowContainers?.length) return null;
  const id = String(rackId);
  for (const row of rowContainers) {
    for (let i = 0; i < row.slots.length; i++) {
      if (row.slots[i]?.rackId != null && String(row.slots[i].rackId) === id) return { rowContainer: row, slotIndex: i };
    }
  }
  return null;
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

/** Check if a set of rack positions (id -> {x,y}) is valid: in bounds, no overlap with non-group racks or row slots. */
function canPlaceGroup(
  layout: LayoutState,
  groupIds: Set<number | string>,
  positions: Map<number | string, { x: number; y: number }>
): boolean {
  const gridCols = layout.grid_cols;
  const gridRows = layout.grid_rows;
  const otherRacks = layout.racks.filter((r) => !groupIds.has(r.id ?? r.rack_index));
  const rects: { rect: { x: number; y: number; width: number; height: number } }[] = [];
  for (const [id, pos] of positions) {
    const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === id);
    if (!rack) return false;
    const rect = { x: pos.x, y: pos.y, width: rack.width, height: rack.height };
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > gridCols || rect.y + rect.height > gridRows) return false;
    rects.push({ rect });
  }
  for (const { rect } of rects) {
    for (const r of otherRacks) {
      if (rectsOverlap(rect, { x: r.x, y: r.y, width: r.width, height: r.height })) return false;
    }
    for (const rc of layout.row_containers ?? []) {
      for (const s of rc.slots) {
        if (rectsOverlap(rect, { x: s.x, y: s.y, width: s.w, height: s.h })) return false;
      }
    }
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i]!.rect, rects[j]!.rect)) return false;
    }
  }
  return true;
}

const API_BASE_FOR_IMAGES = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? undefined;

/** Parse numeric value (volume dm³ or quantity); accepts comma as decimal separator. */
function safeVolumeDm3(v: unknown): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
/** Parse quantity (szt.); accepts comma as decimal separator. */
function safeQuantity(v: unknown): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Resolve product image URL: support image_url, imageUrl; semicolon-separated → first. Relative paths (e.g. /uploads/x) get API base prepended when VITE_API_URL is set. */
function getProductImageUrl(p: { image_url?: string | null; imageUrl?: string | null }): string | null {
  const raw = (p.image_url ?? (p as { imageUrl?: string }).imageUrl ?? "").trim();
  if (!raw) return null;
  const first = raw.split(";").map((s) => s.trim()).find(Boolean) ?? null;
  if (!first) return null;
  if (first.startsWith("/") && API_BASE_FOR_IMAGES) return API_BASE_FOR_IMAGES.replace(/\/$/, "") + first;
  return first;
}

/** Aisle width in cm for "magnetic" snap (new row exactly this distance from existing rack/row) */
const DEFAULT_AISLE_WIDTH_CM = 250;

/** Snap position to 10cm grid, warehouse walls, existing racks, and aisle-width offset (magnetic edges) */
function snapPosition(
  desired: { x: number; y: number },
  ghostW: number,
  ghostH: number,
  racks: { x: number; y: number; width: number; height: number }[],
  gridCols: number,
  gridRows: number,
  aisleWidthCm: number = DEFAULT_AISLE_WIDTH_CM
): { x: number; y: number } {
  const aisleCells = Math.round(aisleWidthCm / GRID_UNIT_CM);
  const candX = new Set<number>([0, gridCols - ghostW, snapToGrid(desired.x)]);
  const candY = new Set<number>([0, gridRows - ghostH, snapToGrid(desired.y)]);
  racks.forEach((r) => {
    candX.add(r.x);
    candX.add(r.x + r.width);
    candX.add(Math.max(0, r.x - ghostW));
    candX.add(Math.min(gridCols - ghostW, r.x + r.width));
    candX.add(Math.max(0, r.x + r.width + aisleCells));
    candX.add(Math.min(gridCols - ghostW, r.x - ghostW - aisleCells));
  });
  racks.forEach((r) => {
    candY.add(r.y);
    candY.add(r.y + r.height);
    candY.add(Math.max(0, r.y - ghostH));
    candY.add(Math.min(gridRows - ghostH, r.y + r.height));
    candY.add(Math.max(0, r.y + r.height + aisleCells));
    candY.add(Math.min(gridRows - ghostH, r.y - ghostH - aisleCells));
  });
  let best = { x: Math.max(0, Math.min(gridCols - ghostW, snapToGrid(desired.x))), y: Math.max(0, Math.min(gridRows - ghostH, snapToGrid(desired.y))) };
  let bestDist = Infinity;
  const otherRacks = racks;
  for (const x of candX) {
    for (const y of candY) {
      const xx = Math.max(0, Math.min(gridCols - ghostW, x));
      const yy = Math.max(0, Math.min(gridRows - ghostH, y));
      const overlaps = otherRacks.some((r) => rectsOverlap({ x: xx, y: yy, width: ghostW, height: ghostH }, r));
      if (overlaps) continue;
      const dist = (desired.x - xx) ** 2 + (desired.y - yy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: xx, y: yy };
      }
    }
  }
  return best;
}

export default function WarehouseDesigner() {
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [layout, setLayout] = useState<LayoutState>({
    layout_id: null,
    warehouse_id: null,
    warehouse_name: "",
    name: "Layout 1",
    grid_cols: GRID_COLS,
    grid_rows: GRID_ROWS,
    racks: [],
    aisles: [],
    visual_elements: [],
    row_containers: [],
  });
  const [selectedRackId, setSelectedRackId] = useState<number | string | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [ghostPosition, setGhostPosition] = useState<{ x: number; y: number } | null>(null);
  const [rackRotation, setRackRotation] = useState<"vertical" | "horizontal">("vertical");
  const [draggingRackId, setDraggingRackId] = useState<number | string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  /** During rack drag: preview position (smooth). Layout is updated only on mouse up. */
  const [rackDragPreviewPosition, setRackDragPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const dragSlotHighlights = useMemo(() => {
    if (draggingRackId == null || rackDragPreviewPosition == null) return null;
    const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === draggingRackId);
    if (!rack) return null;
    return getDragSlotHighlights(
      layout.racks,
      rackDragPreviewPosition.x,
      rackDragPreviewPosition.y,
      rack.width,
      rack.height,
      draggingRackId
    );
  }, [layout.racks, draggingRackId, rackDragPreviewPosition]);

  const [selectedRackIds, setSelectedRackIds] = useState<Array<number | string>>([]);

  /** During group drag: preview position for each selected rack (anchor + relative offset). Used by Canvas to draw all ghosts. */
  const rackDragPreviewPositions = useMemo(() => {
    if (draggingRackId == null || rackDragPreviewPosition == null || selectedRackIds.length === 0) return null;
    const anchorRack = layout.racks.find((r) => (r.id ?? r.rack_index) === draggingRackId);
    if (!anchorRack) return null;
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of selectedRackIds) {
      const r = layout.racks.find((rack) => (rack.id ?? rack.rack_index) === id);
      if (!r) continue;
      out[String(id)] = {
        x: rackDragPreviewPosition.x + (r.x - anchorRack.x),
        y: rackDragPreviewPosition.y + (r.y - anchorRack.y),
      };
    }
    return Object.keys(out).length ? out : null;
  }, [layout.racks, draggingRackId, rackDragPreviewPosition, selectedRackIds]);
  const [template, _setTemplate] = useState<RackTemplate>({
    namePrefix: "A",
    width_cm: 120,
    depth_cm: 80,
    height_cm: 200,
    levels: 4,
    bins_per_level: 4,
    aisle_letter: "A",
  });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 80 });
  const [cursorCm, setCursorCm] = useState<{ x: number; y: number } | null>(null);
  const [internalLayoutRackId, setInternalLayoutRackId] = useState<number | string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panMode, _setPanMode] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const [showCreateWarehouse, setShowCreateWarehouse] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("Magazyn Główny");
  const [showElevationForRackId, setShowElevationForRackId] = useState<number | string | null>(null);
  const [selectedBinForFilter, setSelectedBinForFilter] = useState<{ level_index: number; segment_index: number } | null>(null);
  /** In Magazyn tab: which rack to show in the side-view panel. */
  const [selectedRackIdForSideView, setSelectedRackIdForSideView] = useState<number | string | null>(null);
  /** Magazyn tab: selected location (level_index, segment_index) for inventory filter and highlight. */
  const [selectedLocationForProducts, setSelectedLocationForProducts] = useState<{ level_index: number; segment_index: number } | null>(null);
  /** Inventory products (Magazyn); drive bin occupancy and quantity display. */
  const [products, setProducts] = useState<WarehouseProduct[]>(() =>
    [
      { id: "p1", name: "Paleta Euro 120x80", sku: "PAL-EUR-01", ean: "5901234123457", quantity: 4, volume_dm3: 240, location_id: null },
      { id: "p2", name: "Karton 40x30x25", sku: "KAR-40-01", ean: "5901234123458", quantity: 12, volume_dm3: 36, location_id: null },
      { id: "p3", name: "Opakowanie zbiorcze", sku: "OPZ-01", ean: "5901234123459", quantity: 2, volume_dm3: 80, location_id: null },
    ]
  );
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showAllProductsInSidebar, setShowAllProductsInSidebar] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [draggingFromCatalog, setDraggingFromCatalog] = useState<CatalogItem | null>(null);
  const [customTemplates, setCustomTemplates] = useState<CustomRackTemplate[]>([]);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(LayoutMode.SELECT);
  const rowToolActive = layoutMode === LayoutMode.DRAW_ROW;
  const aisleToolActive = layoutMode === LayoutMode.DRAW_AISLE;
  const pathToolActive = layoutMode === LayoutMode.PATH_TOOL;
  const setRowToolActive = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLayoutMode((prev) => (typeof v === "function" ? v(prev === LayoutMode.DRAW_ROW) : v) ? LayoutMode.DRAW_ROW : LayoutMode.SELECT);
  }, []);
  const setAisleToolActive = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLayoutMode((prev) => (typeof v === "function" ? v(prev === LayoutMode.DRAW_AISLE) : v) ? LayoutMode.DRAW_AISLE : LayoutMode.SELECT);
  }, []);
  const setPathToolActive = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLayoutMode((prev) => (typeof v === "function" ? v(prev === LayoutMode.PATH_TOOL) : v) ? LayoutMode.PATH_TOOL : LayoutMode.SELECT);
  }, []);
  useLayoutModeShortcuts(layoutMode, setLayoutMode);
  const layoutModeDisplay = useLayoutModeDisplay(layoutMode);
  type SpecialLocationsState = { pick_start: { id: number; x: number; y: number } | null; packing: { id: number; x: number; y: number } | null; dock: { id: number; x: number; y: number } | null };
  const [specialLocations, setSpecialLocations] = useState<SpecialLocationsState>({ pick_start: null, packing: null, dock: null });
  const [aisleDrawStart, setAisleDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [rowToolTemplate, setRowToolTemplate] = useState<CatalogItem | null>(null);
  const [rowDrawStart, setRowDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [rowDrawEnd, setRowDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [rowPreviewCursor, setRowPreviewCursor] = useState<{ x: number; y: number } | null>(null);
  const [rowGapCm, setRowGapCm] = useState(0);
  const [selectedRowContainerId, setSelectedRowContainerId] = useState<string | null>(null);
  const [selectedRowContainerIds, setSelectedRowContainerIds] = useState<string[]>([]);
  /** When dragging the whole row by its handle: row id and preview position (cell) for ghost. */
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [rowDragPreviewStart, setRowDragPreviewStart] = useState<{ x: number; y: number } | null>(null);
  /** Offset from pointer (cell) to row start when drag started, so we can compute preview from current cell. */
  const rowDragPointerOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  /** Latest preview position for row drag (so window mouseup can read it). */
  const rowDragPreviewStartRef = useRef<{ x: number; y: number } | null>(null);
  const [catalogHoveredSlot, setCatalogHoveredSlot] = useState<{ rowId: string; slotIndex: number } | null>(null);
  /** When dragging a template from catalog, the empty slot under the cursor (for blue highlight). */
  const [currentRowPrefix, setCurrentRowPrefix] = useState("A");
  const [aisleWidthCm, setAisleWidthCm] = useState(DEFAULT_AISLE_WIDTH_CM);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showRackLabels, setShowRackLabels] = useState(true);
  const [selectedAisleIndex, setSelectedAisleIndex] = useState<number | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [draggingVisualType, setDraggingVisualType] = useState<VisualElementType | null>(null);
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null);
  const [draggingVisualId, setDraggingVisualId] = useState<string | null>(null);
  const [dragOffsetVisual, setDragOffsetVisual] = useState<{ dx: number; dy: number } | null>(null);
  const [visualGhostPosition, setVisualGhostPosition] = useState<{ x: number; y: number } | null>(null);
  const [clipboard, setClipboard] = useState<RackState[]>([]);
  const [catalogGhostPosition, setCatalogGhostPosition] = useState<{ x: number; y: number } | null>(null);
  const [showPickingPath, setShowPickingPath] = useState(false);
  const [manualPathPoints, setManualPathPoints] = useState<{ x: number; y: number }[]>([]);
  const [snackbar, setSnackbar] = useState<{ message: string; undo?: () => void; undoLabel?: string } | null>(null);
  const [selectedVisualIds, setSelectedVisualIds] = useState<string[]>([]);
  const deletedForUndoRef = useRef<{ racks?: RackState[]; visuals?: VisualElementState[]; row_containers?: LayoutState["row_containers"] } | null>(null);
  const [draggingWallEnd, setDraggingWallEnd] = useState<{ visualId: string; end: 0 | 1 } | null>(null);
  const [draggingPathPointIndex, setDraggingPathPointIndex] = useState<number | null>(null);
  const [selectedPathPointIndex, setSelectedPathPointIndex] = useState<number | null>(null);
  const [selectedPathLine, setSelectedPathLine] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  /** Single view mode: Magazyn (live) | Projektant Layoutu */
  const [mainView, setMainView] = useState<"magazyn" | "layout">(() =>
    searchParams.get("view") === "layout" ? "layout" : "layout"
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const isLiveView = mainView === "magazyn";
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const lastMouseRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const rafIdRef = useRef<number>(0);
  const CELLS_PER_METER_FOR_PATH = 10;
  const rowDrawTemplateRef = useRef<CatalogItem | null>(null);
  const rowDrawEndPendingRef = useRef<{ x: number; y: number } | null>(null);
  const rowDrawEndRafRef = useRef<number | null>(null);
  const cursorPendingRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRafRef = useRef<number | null>(null);

  /** When "Rysuj Rząd" is turned off, clear all temp row-draw state so no extra slot can leak into rows. */
  useEffect(() => {
    if (rowToolActive) return;
    setRowDrawStart(null);
    setRowDrawEnd(null);
    setRowPreviewCursor(null);
    rowDrawTemplateRef.current = null;
    rowDrawEndPendingRef.current = null;
    if (rowDrawEndRafRef.current != null) {
      cancelAnimationFrame(rowDrawEndRafRef.current);
      rowDrawEndRafRef.current = null;
    }
  }, [rowToolActive]);

  useEffect(() => {
    const v = searchParams.get("view") === "layout" ? "layout" : "layout";
    setMainView((prev) => (prev === "magazyn" ? prev : v));
  }, [searchParams]);

  /** Top-level state to avoid ReferenceError; synced from selection. */
  const selectedObjectIdDerived = useMemo<string | null>(() => {
    if (selectedPathPointIndex !== null) return `pathNode:${selectedPathPointIndex}`;
    if (selectedPathLine) return "path";
    if (selectedRackIds.length > 0) return `rack:${selectedRackIds[0]}`;
    if (selectedVisualIds.length > 0) return `visual:${selectedVisualIds[0]}`;
    return null;
  }, [selectedPathPointIndex, selectedPathLine, selectedRackIds, selectedVisualIds]);

  /** Top-level state to avoid ReferenceError; synced from selection. */
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedObjectId(selectedObjectIdDerived);
  }, [selectedObjectIdDerived]);

  /** Selected rack for Magazyn view (for product/location and display rack). */
  const selectedRackForMagazyn = useMemo(
    () => (selectedRackIdForSideView != null ? layout.racks.find((r) => String(r.id ?? r.rack_index) === String(selectedRackIdForSideView)) ?? null : null),
    [layout.racks, selectedRackIdForSideView]
  );
  /** Set of location_id / label values for bins in the selected rack (for filtering products to this rack only). */
  const selectedRackBinLabels = useMemo(() => {
    if (!selectedRackForMagazyn) return new Set<string>();
    return new Set(
      selectedRackForMagazyn.bins
        .map((b) => (b.label ?? b.location_id ?? "").trim())
        .filter(Boolean)
    );
  }, [selectedRackForMagazyn]);
  /** Set of locationUUIDs for bins in the selected rack (for filtering by assignedLocations). */
  const selectedRackBinUUIDs = useMemo(() => {
    if (!selectedRackForMagazyn) return new Set<string>();
    return new Set(
      selectedRackForMagazyn.bins
        .map((b) => b.locationUUID)
        .filter((u): u is string => Boolean(u))
    );
  }, [selectedRackForMagazyn]);
  /** Helper: used volume (dm³) at a bin from products (location_id or assignedLocations by locationUUID). Uses safe parsing for decimals. */
  const usedVolumeAtBin = useCallback(
    (bin: BinState) => {
      const locId = (bin.label ?? bin.location_id ?? "").trim();
      const uuid = bin.locationUUID;
      let used = 0;
      for (const p of products) {
        const vol = safeVolumeDm3(p.volume_dm3);
        if (uuid && p.assignedLocations?.length) {
          const a = p.assignedLocations.find((a) => a.locationUUID === uuid);
          if (a) used += safeQuantity(a.quantity) * vol;
        } else if (locId && p.location_id === locId) {
          used += safeQuantity(p.quantity) * vol;
        }
      }
      return used;
    },
    [products]
  );
  /** Rack with bins' used_volume_dm3 derived from products (for occupancy bar). */
  const displayRack = useMemo(() => {
    if (!selectedRackForMagazyn) return null;
    const bins = selectedRackForMagazyn.bins.map((b) => {
      const used = usedVolumeAtBin(b);
      return { ...b, used_volume_dm3: used, current_load_dm3: used };
    });
    return { ...selectedRackForMagazyn, bins };
  }, [selectedRackForMagazyn, products, usedVolumeAtBin]);
  /** Per-bin total quantity (szt.) and unique product count for grid display. */
  const binItemCounts = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const out: Record<string, number> = {};
    for (const b of selectedRackForMagazyn.bins) {
      const locId = (b.label ?? b.location_id ?? "").trim();
      const uuid = b.locationUUID;
      let qty = 0;
      for (const p of products) {
        if (uuid && p.assignedLocations?.length) {
          const a = p.assignedLocations.find((a) => a.locationUUID === uuid);
          if (a) qty += safeQuantity(a.quantity);
        } else if (locId && p.location_id === locId) qty += safeQuantity(p.quantity);
      }
      out[`${b.level_index}-${b.segment_index}`] = qty;
    }
    return out;
  }, [selectedRackForMagazyn, products]);
  /** Per-bin count of different products (unique product rows in that bin). */
  const binUniqueProductCounts = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const out: Record<string, number> = {};
    for (const b of selectedRackForMagazyn.bins) {
      const locId = (b.label ?? b.location_id ?? "").trim();
      const uuid = b.locationUUID;
      const seen = new Set<string>();
      for (const p of products) {
        if (uuid && p.assignedLocations?.length) {
          if (p.assignedLocations.some((a) => a.locationUUID === uuid)) seen.add(p.id);
        } else if (locId && p.location_id === locId) seen.add(p.id);
      }
      out[`${b.level_index}-${b.segment_index}`] = seen.size;
    }
    return out;
  }, [selectedRackForMagazyn, products]);
  const deleteObject = useCallback((objectId: string | null) => {
    if (!objectId) return;
    if (objectId.startsWith("pathNode:")) {
      const idx = parseInt(objectId.slice(9), 10);
      if (!Number.isNaN(idx)) {
        setManualPathPoints((prev) => prev.filter((_, i) => i !== idx));
        setSelectedPathPointIndex(null);
        setSnackbar({ message: "Usunięto punkt ścieżki.", undo: () => setSnackbar(null) });
      }
      return;
    }
    if (objectId === "path") {
      setManualPathPoints([]);
      setShowPickingPath(false);
      setSelectedPathLine(false);
      setSnackbar({ message: "Usunięto ścieżkę.", undo: () => setSnackbar(null) });
      return;
    }
    if (objectId.startsWith("rack:")) {
      const toDelete = layout.racks.filter((r) => selectedRackIds.includes(r.id ?? r.rack_index));
      deletedForUndoRef.current = { racks: toDelete, row_containers: layout.row_containers };
      const removedIds = new Set(selectedRackIds.map(String));
      setLayout((prev) => ({
        ...prev,
        racks: prev.racks.filter((r) => !selectedRackIds.includes(r.id ?? r.rack_index)),
        row_containers: (prev.row_containers ?? []).map((rc) => ({
          ...rc,
          slots: rc.slots.map((s) => (s.rackId != null && removedIds.has(String(s.rackId)) ? { ...s, rackId: undefined } : s)),
        })),
      }));
      setSelectedRackId(null);
      setSelectedRackIds([]);
      setSnackbar({ message: selectedRackIds.length > 1 ? "Usunięto regały." : "Usunięto regał.", undo: () => {
        if (deletedForUndoRef.current?.racks) setLayout((prev) => ({
          ...prev,
          racks: [...prev.racks, ...deletedForUndoRef.current!.racks!],
          row_containers: deletedForUndoRef.current?.row_containers ?? prev.row_containers,
        }));
        setSnackbar(null);
        deletedForUndoRef.current = null;
      } });
      return;
    }
    if (objectId.startsWith("visual:")) {
      const toDelete = (layout.visual_elements ?? []).filter((ve) => selectedVisualIds.includes(ve.id));
      deletedForUndoRef.current = { visuals: toDelete };
      setLayout((prev) => ({ ...prev, visual_elements: (prev.visual_elements ?? []).filter((ve) => !selectedVisualIds.includes(ve.id)) }));
      setSelectedVisualId(null);
      setSelectedVisualIds([]);
      setSnackbar({ message: toDelete.length > 1 ? "Usunięto elementy." : "Usunięto element.", undo: () => {
        if (deletedForUndoRef.current?.visuals) setLayout((prev) => ({ ...prev, visual_elements: [...(prev.visual_elements ?? []), ...deletedForUndoRef.current!.visuals!] }));
        setSnackbar(null);
        deletedForUndoRef.current = null;
      } });
      return;
    }
  }, [layout.racks, layout.visual_elements, selectedRackIds, selectedVisualIds]);

  const loadWarehouses = useCallback(async () => {
    try {
      const res = await api.get(`/tenants/${TENANT_ID}/warehouses/`);
      const list = Array.isArray(res.data) ? res.data : [];
      setWarehouses(list);
      if (list.length > 0 && selectedWarehouseId === null) setSelectedWarehouseId(list[0].id);
      else if (list.length === 0) setSelectedWarehouseId(null);
    } catch {
      setWarehouses([]);
    }
  }, [selectedWarehouseId]);

  const loadLayout = useCallback(async (warehouseId: number) => {
    setLoading(true);
    try {
      const res = await api.get("/warehouse/layout", {
        params: { tenant_id: TENANT_ID, warehouse_id: warehouseId },
      });
      const d = res.data;
      console.log("Data from backend (rack colors):", (d.racks || []).map((r: Record<string, unknown>, i: number) => ({ index: i, color: r.color })));
      setLayout({
        layout_id: d.layout_id ?? null,
        warehouse_id: d.warehouse_id ?? warehouseId,
        warehouse_name: d.warehouse_name ?? "",
        name: d.name ?? "Layout 1",
        grid_cols: (d.grid_cols ?? 24) <= 24 ? (d.grid_cols ?? 24) * CELLS_PER_METER : (d.grid_cols ?? GRID_COLS),
        grid_rows: (d.grid_rows ?? 16) <= 16 ? (d.grid_rows ?? 16) * CELLS_PER_METER : (d.grid_rows ?? GRID_ROWS),
        racks: (d.racks || []).map((r: Record<string, unknown>) => {
          const isOldFormat = (d.grid_cols ?? 24) <= 24;
          const scale = isOldFormat ? CELLS_PER_METER : 1;
          const rawBins = (r.bins as Record<string, unknown>[] | undefined) ?? [];
          const bins: BinState[] = Array.isArray(rawBins)
            ? rawBins.map((b, bi) => {
                const rid = (r as { id?: number; rack_index?: number }).id ?? (r as { rack_index?: number }).rack_index ?? 0;
                return {
                id: typeof (b as { id?: number }).id === "number" ? (b as { id: number }).id : undefined,
                label: String((b as { label?: string }).label ?? ""),
                level_index: Number((b as { level_index?: number }).level_index ?? 0),
                segment_index: Number((b as { segment_index?: number }).segment_index ?? 0),
                volume_dm3: Number((b as { volume_dm3?: number }).volume_dm3 ?? 0),
                current_load_dm3: Number((b as { current_load_dm3?: number }).current_load_dm3 ?? (b as { used_volume_dm3?: number }).used_volume_dm3 ?? 0),
                location_id: typeof (b as { location_id?: string }).location_id === "string" ? (b as { location_id: string }).location_id : String((b as { label?: string }).label ?? ""),
                locationUUID: typeof (b as { location_uuid?: string }).location_uuid === "string" ? (b as { location_uuid: string }).location_uuid : typeof (b as { locationUUID?: string }).locationUUID === "string" ? (b as { locationUUID: string }).locationUUID : `gen-${rid}-${(b as { level_index?: number }).level_index ?? 0}-${(b as { segment_index?: number }).segment_index ?? bi}`,
                width_cm: typeof (b as { width_cm?: number }).width_cm === "number" ? (b as { width_cm: number }).width_cm : undefined,
                depth_cm: typeof (b as { depth_cm?: number }).depth_cm === "number" ? (b as { depth_cm: number }).depth_cm : undefined,
                height_cm: typeof (b as { height_cm?: number }).height_cm === "number" ? (b as { height_cm: number }).height_cm : undefined,
                barcode_data: typeof (b as { barcode_data?: string }).barcode_data === "string" ? (b as { barcode_data: string }).barcode_data : String((b as { label?: string }).label ?? ""),
                storage_type: (() => {
                  const raw = (b as { storage_type?: string }).storage_type;
                  if (!raw) return undefined;
                  const lower = String(raw).trim().toLowerCase();
                  if (lower === "reserve" || lower === "reserved" || lower === "reservation") return "reserve" as const;
                  if (lower === "primary") return "primary" as const;
                  return undefined;
                })(),
              }; })
            : [];
          return {
          id: r.id,
          name: typeof r.name === "string" ? r.name.trim() || undefined : undefined,
          x: Number(r.x) * scale,
          y: Number(r.y) * scale,
          width: Math.max(1, Number(r.width ?? 1) * scale),
          height: Math.max(1, Number(r.height ?? 1) * scale),
          orientation: String(r.orientation ?? "vertical"),
          levels: Number(r.levels ?? 4),
          bins_per_level: Number(r.bins_per_level ?? 4),
          levelConfig: Array.isArray(r.level_config) && r.level_config.length > 0
            ? r.level_config.map((row: { level?: number; locations?: number }) => ({ level: Number(row.level ?? 0), locations: Number(row.locations ?? 1) }))
            : undefined,
          length_cm: Number(r.length_cm ?? 100),
          width_cm: Number(r.width_cm ?? 80),
          height_cm: Number(r.height_cm ?? 200),
          aisle_letter: String(r.aisle_letter ?? "A"),
          rack_index: Number(r.rack_index ?? 1),
          bins,
          internal_structure: (r.internal_structure as InternalStructure | null) ?? null,
          total_capacity_dm3: Number(r.total_capacity_dm3 ?? 0),
          used_dm3: Number(r.used_dm3 ?? 0),
          color: (typeof r.color === "string" && r.color.trim() !== "") ? r.color.trim() : "#3b82f6",
          templateId: typeof r.templateId === "string" ? r.templateId : undefined,
          show_label: typeof r.show_label === "boolean" ? r.show_label : undefined,
          rowPrefix: typeof (r as { row_prefix?: string }).row_prefix === "string" ? (r as { row_prefix: string }).row_prefix.trim() || undefined : typeof (r as { rowPrefix?: string }).rowPrefix === "string" ? (r as { rowPrefix: string }).rowPrefix.trim() || undefined : undefined,
          indexInRow: typeof (r as { index_in_row?: number }).index_in_row === "number" ? (r as { index_in_row: number }).index_in_row : typeof (r as { indexInRow?: number }).indexInRow === "number" ? (r as { indexInRow: number }).indexInRow : undefined,
        };
        }),
        aisles: (d.aisles || []).map((a: Record<string, unknown>) => ({
          id: a.id,
          name: a.name,
          x: Number(a.x),
          y: Number(a.y),
          width: Number(a.width ?? 1),
          height: Number(a.height ?? 1),
          two_way: Boolean(a.two_way),
        })),
        visual_elements: Array.isArray(d.visual_elements) ? d.visual_elements.map((ve: Record<string, unknown>) => ({
          id: String(ve.id ?? `ve-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
          type: (["column", "mezzanine", "packing_station", "cart", "wall", "door", "zone"] as const).includes(String(ve.type) as VisualElementType) ? (String(ve.type) as VisualElementType) : "column",
          x: Number(ve.x ?? 0),
          y: Number(ve.y ?? 0),
          width: Number(ve.width ?? 1),
          height: Number(ve.height ?? 1),
          zIndex: Number(ve.zIndex ?? 0),
          name: typeof ve.name === "string" ? ve.name : undefined,
          label: typeof ve.label === "string" ? ve.label : undefined,
          length: typeof ve.length === "number" ? ve.length : undefined,
          thickness: typeof ve.thickness === "number" ? ve.thickness : undefined,
          doorStyle: ve.doorStyle === "sliding" || ve.doorStyle === "hinged" ? ve.doorStyle : undefined,
          zoneType: ve.zoneType === "shipping" || ve.zoneType === "reception" ? ve.zoneType : undefined,
          color: typeof ve.color === "string" ? ve.color : undefined,
          rotation: typeof ve.rotation === "number" ? ve.rotation : undefined,
          columnShape: ve.columnShape === "circle" || ve.columnShape === "rectangle" ? ve.columnShape : undefined,
          diameter: typeof ve.diameter === "number" ? ve.diameter : undefined,
          width_cm: typeof ve.width_cm === "number" ? ve.width_cm : undefined,
          depth_cm: typeof ve.depth_cm === "number" ? ve.depth_cm : undefined,
          height_cm: typeof ve.height_cm === "number" ? ve.height_cm : undefined,
          total_volume_dm3: typeof ve.total_volume_dm3 === "number" ? ve.total_volume_dm3 : undefined,
          current_occupancy_dm3: typeof ve.current_occupancy_dm3 === "number" ? ve.current_occupancy_dm3 : undefined,
        })) : [],
        picking_path: Array.isArray(d.picking_path) ? d.picking_path : undefined,
        row_containers: Array.isArray(d.row_containers) ? d.row_containers : [],
      });
      const pathPoints = Array.isArray(d.picking_path) ? d.picking_path : [];
      setManualPathPoints(pathPoints);
      if (pathPoints.length > 0) setShowPickingPath(true);
      // Sync product–location assignments from API so map shows products in correct slots
      const racksFromRes = (d.racks || []) as Array<{ bins?: Array<{ locationUUID?: string; location_uuid?: string; label?: string; location_id?: string }> }>;
      const resolveLabel = (locationUUID: string): string | null => {
        for (const r of racksFromRes) {
          for (const b of r.bins ?? []) {
            const uuid = b.locationUUID ?? b.location_uuid;
            if (uuid === locationUUID) return (b.label ?? b.location_id ?? null) || null;
          }
        }
        return null;
      };
      try {
        const prodRes = await api.get("/products/", { params: { tenant_id: TENANT_ID, limit: 5000 } });
        const raw = prodRes.data?.items ?? (Array.isArray(prodRes.data) ? prodRes.data : []);
        const list: WarehouseProduct[] = raw.map((p: Record<string, unknown>) => {
          const id = p.id != null ? String(p.id) : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const assigned = (Array.isArray(p.assigned_locations) ? p.assigned_locations : Array.isArray(p.assignedLocations) ? p.assignedLocations : []) as Array<{ locationUUID: string; quantity: number }>;
          const totalQty = assigned.reduce((s: number, a: { quantity?: unknown }) => s + safeQuantity(a.quantity), 0);
          const vol = safeVolumeDm3(p.volume);
          const firstLoc = assigned[0];
          const location_id = firstLoc ? resolveLabel(firstLoc.locationUUID) : null;
          return {
            id,
            name: String(p.name ?? ""),
            sku: String(p.symbol ?? p.sku ?? ""),
            ean: String(p.ean ?? ""),
            quantity: totalQty || safeQuantity(p.quantity),
            volume_dm3: vol,
            location_id: location_id ?? null,
            assignedLocations: assigned.length > 0 ? assigned : undefined,
            image_url: typeof p.image_url === "string" ? p.image_url : undefined,
          };
        });
        setProducts(list);
      } catch {
        // Keep existing products state on error (e.g. no products API)
      }
    } catch {
      setLayout((prev) => ({ ...prev, warehouse_id: warehouseId, warehouse_name: "", racks: [], aisles: [], visual_elements: prev.visual_elements ?? [] }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    const onWindowMouseUp = () => {
      setIsPanning(false);
      panStartRef.current = null;
    };
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);

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
  }, [isPanning]);

  useEffect(() => {
    if (selectedWarehouseId != null) loadLayout(selectedWarehouseId);
  }, [selectedWarehouseId, loadLayout]);

  useEffect(() => {
    if (isLiveView && selectedWarehouseId != null) loadLayout(selectedWarehouseId);
  }, [isLiveView, selectedWarehouseId, loadLayout]);

  /** When switching to Magazyn view, refresh products from API so assignments from Products tab are visible. */
  const fetchProductsForMap = useCallback(async () => {
    if (selectedWarehouseId == null) return;
    try {
      const [layoutRes, prodRes] = await Promise.all([
        api.get("/warehouse/layout", { params: { tenant_id: TENANT_ID, warehouse_id: selectedWarehouseId } }),
        api.get("/products/", { params: { tenant_id: TENANT_ID, limit: 5000 } }),
      ]);
      const d = layoutRes.data;
      const racksFromRes = (d?.racks || []) as Array<{ bins?: Array<{ locationUUID?: string; location_uuid?: string; label?: string; location_id?: string }> }>;
      const resolveLabel = (locationUUID: string): string | null => {
        for (const r of racksFromRes) {
          for (const b of r.bins ?? []) {
            const uuid = b.locationUUID ?? b.location_uuid;
            if (uuid === locationUUID) return (b.label ?? b.location_id ?? null) || null;
          }
        }
        return null;
      };
      const raw = prodRes.data?.items ?? (Array.isArray(prodRes.data) ? prodRes.data : []);
      const list: WarehouseProduct[] = raw.map((p: Record<string, unknown>) => {
        const id = p.id != null ? String(p.id) : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const assigned = (Array.isArray(p.assigned_locations) ? p.assigned_locations : Array.isArray(p.assignedLocations) ? p.assignedLocations : []) as Array<{ locationUUID: string; quantity: number }>;
        const totalQty = assigned.reduce((s: number, a: { quantity?: unknown }) => s + safeQuantity(a.quantity), 0);
        const vol = safeVolumeDm3(p.volume);
        const firstLoc = assigned[0];
        const location_id = firstLoc ? resolveLabel(firstLoc.locationUUID) : null;
        return {
          id,
          name: String(p.name ?? ""),
          sku: String(p.symbol ?? p.sku ?? ""),
          ean: String(p.ean ?? ""),
          quantity: totalQty || safeQuantity(p.quantity),
          volume_dm3: vol,
          location_id: location_id ?? null,
          assignedLocations: assigned.length > 0 ? assigned : undefined,
          image_url: typeof p.image_url === "string" ? p.image_url : undefined,
        };
      });
      setProducts(list);
    } catch {
      // Keep existing products
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (selectedWarehouseId == null) {
      setSpecialLocations({ pick_start: null, packing: null, dock: null });
      return;
    }
    api
      .get<SpecialLocationsState>(`/warehouse/${selectedWarehouseId}/special-locations`)
      .then((res) => setSpecialLocations(res.data ?? { pick_start: null, packing: null, dock: null }))
      .catch(() => setSpecialLocations({ pick_start: null, packing: null, dock: null }));
  }, [selectedWarehouseId]);

  const addSpecialLocation = useCallback(
    async (cell: { x: number; y: number }, type: "PICK_START" | "PACKING" | "DOCK") => {
      if (selectedWarehouseId == null) return;
      const x_cm = cell.x * SPECIAL_LOCATION_CELL_CM;
      const y_cm = cell.y * SPECIAL_LOCATION_CELL_CM;
      try {
        await api.post("/warehouse/special-location", { warehouse_id: selectedWarehouseId, x: x_cm, y: y_cm, type });
        const { data } = await api.get<SpecialLocationsState>(`/warehouse/${selectedWarehouseId}/special-locations`);
        setSpecialLocations(data ?? { pick_start: null, packing: null, dock: null });
        setLayoutMode(LayoutMode.SELECT);
      } catch (err) {
        console.error("Add special location:", err);
      }
    },
    [selectedWarehouseId]
  );

  useEffect(() => {
    if (isLiveView && layout.racks.length > 0) fetchProductsForMap();
  }, [isLiveView, layout.racks.length, fetchProductsForMap]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<CustomRackTemplate[]>("/warehouse/templates/", {
          params: { tenant_id: TENANT_ID },
        });
        if (!cancelled && Array.isArray(data)) {
          setCustomTemplates(data.map((t) => ({
            ...t,
            color: (typeof t.color === "string" && t.color.trim() !== "") ? t.color.trim() : "#3b82f6",
          })));
        }
      } catch {
        if (!cancelled) setCustomTemplates([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveNewTemplate = useCallback(async (payload: CustomRackTemplate): Promise<CustomRackTemplate | null> => {
    try {
      const { data } = await api.post<CustomRackTemplate>("/warehouse/templates/", payload, {
        params: { tenant_id: TENANT_ID },
      });
      return data ?? null;
    } catch (e) {
      console.error("Save template:", e);
      return null;
    }
  }, []);

  const deleteTemplate = useCallback((template: CustomRackTemplate) => {
    setCustomTemplates((prev) => prev.filter((x) => x.id !== template.id));
    setEditingTemplateId((id) => (id === template.id ? null : id));
    setRowToolTemplate((current) => {
      if (!current || current.type !== "custom") return current;
      return current.template.id === template.id ? null : current;
    });
    (async () => {
      try {
        await api.delete(`/warehouse/templates/${template.id}`, {
          params: { tenant_id: TENANT_ID },
        });
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status !== 404) setSnackbar({ message: "Nie udało się usunąć szablonu na serwerze." });
      }
    })();
  }, []);

  const createWarehouse = useCallback(async () => {
    try {
      await api.post(`/tenants/${TENANT_ID}/warehouses/`, { name: newWarehouseName });
      await loadWarehouses();
      setShowCreateWarehouse(false);
    } catch (e) {
      console.error("Create warehouse:", e);
    }
  }, [newWarehouseName, loadWarehouses]);

  const saveLayout = useCallback(async () => {
    const whId = selectedWarehouseId ?? layout.warehouse_id;
    if (whId == null) return;
    setSaving(true);
    try {
      const payload = {
        name: layout.name,
        grid_cols: layout.grid_cols,
        grid_rows: layout.grid_rows,
        width_m: layout.grid_cols / CELLS_PER_METER,
        length_m: layout.grid_rows / CELLS_PER_METER,
        racks: layout.racks.map((r) => ({
          id: r.id,
          name: r.name ?? getRackDisplayId(r),
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          orientation: r.orientation,
          levels: r.levels,
          bins_per_level: r.bins_per_level,
          level_config: r.levelConfig ?? undefined,
          length_cm: r.length_cm,
          width_cm: r.width_cm,
          height_cm: r.height_cm,
          aisle_letter: r.aisle_letter,
          rack_index: r.rack_index,
          bins: r.bins,
          internal_structure: r.internal_structure ?? undefined,
          color: (typeof r.color === "string" && r.color.trim() !== "") ? r.color.trim() : "#3b82f6",
          templateId: r.templateId ?? undefined,
          show_label: r.show_label,
          row_prefix: r.rowPrefix,
          index_in_row: r.indexInRow,
        })),
        aisles: layout.aisles.map((a) => ({
          id: a.id,
          name: a.name,
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
          two_way: a.two_way,
        })),
        visual_elements: layout.visual_elements ?? [],
        picking_path: manualPathPoints.length > 0 ? manualPathPoints : undefined,
        row_containers: layout.row_containers ?? [],
      };
      console.log("Saving payload (rack colors):", payload.racks.map((r, i) => ({ index: i, color: r.color })));
      await api.put(`/warehouse/${whId}/layout`, payload, { params: { tenant_id: TENANT_ID } });
      setLastSavedAt(Date.now());
      if (selectedWarehouseId) await loadLayout(selectedWarehouseId);
    } catch (e) {
      console.error("Save layout:", e);
    } finally {
      setSaving(false);
    }
  }, [layout, selectedWarehouseId, loadLayout, manualPathPoints]);

  const getCellFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const col = (e.clientX - rect.left) / rect.width * layout.grid_cols;
    const row = (e.clientY - rect.top) / rect.height * layout.grid_rows;
    const x = Math.max(0, Math.min(layout.grid_cols - 1, Math.round(col)));
    const y = Math.max(0, Math.min(layout.grid_rows - 1, Math.round(row)));
    return { x, y };
  }, [layout.grid_cols, layout.grid_rows]);

  const ghostW = rackRotation === "horizontal" ? cmToCells(template.depth_cm) : cmToCells(template.width_cm);
  const ghostH = rackRotation === "horizontal" ? cmToCells(template.width_cm) : cmToCells(template.depth_cm);

  const stampRackAt = useCallback((cell: { x: number; y: number }) => {
    const w = ghostW;
    const h = ghostH;
    const x = Math.max(0, Math.min(layout.grid_cols - w, cell.x));
    const y = Math.max(0, Math.min(layout.grid_rows - h, cell.y));
    const volPerBin = volumePerBin(template.width_cm, template.depth_cm, template.height_cm, template.levels, template.bins_per_level);
    const prefix = (template.aisle_letter || "A").trim() || "A";
    setLayout((prev) => {
      const rackIndex = prev.racks.length + 1;
      const indexInRow = getNextIndexInRow(prev.racks, prefix);
      const rackLabel = `${prefix}${indexInRow}`;
      const bins = createBinsForRack(template.aisle_letter, rackIndex, template.levels, template.bins_per_level, volPerBin, undefined, undefined, template.width_cm, template.depth_cm, template.height_cm);
      return {
        ...prev,
        racks: [
          ...prev.racks,
          {
            x,
            y,
            width: w,
            height: h,
            orientation: rackRotation,
            levels: template.levels,
            bins_per_level: template.bins_per_level,
            length_cm: template.depth_cm,
            width_cm: template.width_cm,
            height_cm: template.height_cm,
            aisle_letter: template.aisle_letter,
            rack_index: rackIndex,
            bins,
            color: "#3b82f6",
            name: rackLabel,
            rowPrefix: prefix,
            indexInRow,
          } as RackState,
        ],
      };
    });
  }, [template, rackRotation, layout.racks.length, layout.grid_cols, layout.grid_rows, ghostW, ghostH]);

  /** Place a rack from catalog into a specific row slot. Slot may be split; positions recomputed so racks sit side-by-side. */
  const stampRackIntoSlot = useCallback(
    (rowId: string, slotIndex: number, item: CatalogItem) => {
      const row = (layout.row_containers ?? []).find((rc) => rc.id === rowId);
      if (!row || slotIndex < 0 || slotIndex >= row.slots.length) return;
      const slot0 = row.slots[slotIndex];
      if (!slot0 || slot0.rackId != null) return;
      const spec = getCatalogItemSpec(item);
      const lc = getLevelConfig(spec);
      const totalBins = getTotalLocations(lc);
      const volPerBin = totalBins > 0
        ? volumePerBinFromTotal(spec.width_cm, spec.depth_cm, spec.height_cm, totalBins)
        : volumePerBin(spec.width_cm, spec.depth_cm, spec.height_cm, spec.levels, spec.bins_per_level);
      const reqW = cmToCells(spec.width_cm);
      const reqD = cmToCells(spec.depth_cm);
      const isVertical = (row.orientation ?? "horizontal") === "vertical";

      // Unlock all templates: if needed, consume multiple contiguous empty slots to fit the rack.
      // Horizontal rows grow along X (slot.w). Vertical rows grow along Y (slot.h).
      let consumedEnd = slotIndex;
      let consumedSpan = 0;
      if (isVertical) {
        // Rack rotates 90°: footprint is (depth × width) = (reqD × reqW).
        while (consumedEnd < row.slots.length) {
          const s = row.slots[consumedEnd];
          if (!s || s.rackId != null) break;
          if (s.w < reqD) break;
          consumedSpan += s.h;
          if (consumedSpan >= reqW) break;
          consumedEnd += 1;
        }
        if (consumedSpan < reqW) return;
      } else {
        // Footprint is (width × depth) = (reqW × reqD).
        while (consumedEnd < row.slots.length) {
          const s = row.slots[consumedEnd];
          if (!s || s.rackId != null) break;
          if (s.h < reqD) break;
          consumedSpan += s.w;
          if (consumedSpan >= reqW) break;
          consumedEnd += 1;
        }
        if (consumedSpan < reqW) return;
      }
      const prefix = ((row.rowPrefix ?? currentRowPrefix) || "A").trim() || "A";
      const indexInRow = 1 + row.slots.filter((s) => s.rackId != null).length;
      const rackIndex = layout.racks.length + 1;
      const rackLabel = `${prefix}${indexInRow}`;
      const bins = createBinsForRack(
        spec.aisle_letter,
        rackIndex,
        spec.levels,
        spec.bins_per_level,
        volPerBin,
        "M1",
        undefined,
        spec.width_cm,
        spec.depth_cm,
        spec.height_cm,
        spec.reserve_bin_keys,
        ROW_LABEL_ADDRESS_PATTERN,
        rackLabel,
        1,
        spec.binNamingType ?? "numeric",
        lc
      );
      const templateColor = item.type === "custom" ? item.template.color : spec.color;
      const rackColor = (typeof templateColor === "string" && templateColor.trim() !== "") ? templateColor.trim() : "#3b82f6";
      const { x: startX, y: startY } = getRowStart(row);

      // Keep the row thickness (cross-axis) unchanged for visuals; only consume along the row axis.
      const thickness = isVertical ? slot0.w : slot0.h;
      const filledSlot: EmptyRowSlot = isVertical
        ? { x: 0, y: startY, w: thickness, h: reqW, rackId: rackIndex }
        : { x: 0, y: startY, w: reqW, h: thickness, rackId: rackIndex };
      const remainder = Math.max(0, consumedSpan - reqW);
      const remainderSlot: EmptyRowSlot | null = remainder > 0
        ? (isVertical
            ? { x: 0, y: startY, w: thickness, h: remainder }
            : { x: 0, y: startY, w: remainder, h: thickness })
        : null;

      const newSlotsRaw: EmptyRowSlot[] = [
        ...row.slots.slice(0, slotIndex),
        filledSlot,
        ...(remainderSlot ? [remainderSlot] : []),
        ...row.slots.slice(consumedEnd + 1),
      ];
      const trimSize = reqW;
      let trimmedRaw = newSlotsRaw;
      while (
        trimmedRaw.length > 0 &&
        trimmedRaw[trimmedRaw.length - 1]?.rackId == null &&
        (isVertical ? (trimmedRaw[trimmedRaw.length - 1]?.h ?? 0) < trimSize : (trimmedRaw[trimmedRaw.length - 1]?.w ?? 0) < trimSize)
      ) {
        trimmedRaw = trimmedRaw.slice(0, -1);
      }
      const newSlots = computeRowSlotPositions(trimmedRaw, startX, startY, row.orientation ?? "horizontal");
      const filledSlotWithPos = newSlots.find((s) => s.rackId === rackIndex);
      const rackWidthCells = isVertical ? reqD : reqW;
      const rackHeightCells = isVertical ? reqW : reqD;
      const newRack: RackState = {
        x: filledSlotWithPos?.x ?? slot0.x,
        y: filledSlotWithPos?.y ?? slot0.y,
        width: rackWidthCells,
        height: rackHeightCells,
        orientation: "vertical",
        levels: lc.length,
        bins_per_level: lc[0]?.locations ?? spec.bins_per_level,
        levelConfig: lc,
        length_cm: spec.depth_cm,
        width_cm: spec.width_cm,
        height_cm: spec.height_cm,
        aisle_letter: spec.aisle_letter,
        rack_index: rackIndex,
        bins,
        rackLevels: binsToLevels(bins),
        color: rackColor,
        name: rackLabel,
        rowPrefix: prefix,
        indexInRow,
        ...(isVertical ? { rotationDegrees: 90 as const } : {}),
        ...(item.type === "custom" ? { templateId: item.template.id } : {}),
      };
      setLayout((prev) => {
        const updatedRacks = prev.racks.map((r) => {
          const slotForRack = newSlots.find((s) => s.rackId === (r.id ?? r.rack_index));
          if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
          return r;
        });
        const nextRacks = [...updatedRacks, newRack];
        return {
          ...prev,
          racks: reindexGeometricRow(nextRacks, newRack.rack_index),
          row_containers: (prev.row_containers ?? []).map((rc) => (rc.id === rowId ? { ...rc, slots: newSlots } : rc)),
        };
      });
      setDraggingFromCatalog(null);
      setCatalogGhostPosition(null);
      setCatalogHoveredSlot(null);
    },
    [layout.racks, layout.row_containers, currentRowPrefix]
  );

  const stampRackFromCatalogItem = useCallback((cell: { x: number; y: number }, item: CatalogItem) => {
    const emptySlot = findEmptySlotAt(layout.row_containers, cell);
    if (emptySlot) {
      stampRackIntoSlot(emptySlot.rowContainer.id, emptySlot.slotIndex, item);
      setDraggingFromCatalog(null);
      setCatalogGhostPosition(null);
      setCatalogHoveredSlot(null);
      return;
    }
    const spec = getCatalogItemSpec(item);
    const lc = getLevelConfig(spec);
    const totalBins = getTotalLocations(lc);
    const volPerBin = totalBins > 0
      ? volumePerBinFromTotal(spec.width_cm, spec.depth_cm, spec.height_cm, totalBins)
      : volumePerBin(spec.width_cm, spec.depth_cm, spec.height_cm, spec.levels, spec.bins_per_level);
    const w = cmToCells(spec.width_cm);
    const h = cmToCells(spec.depth_cm);
    const snap = findSnapToRowPosition(layout.racks, cell.x, cell.y, w, h);
    const x = snap ? Math.max(0, Math.min(layout.grid_cols - w, snap.x)) : Math.max(0, Math.min(layout.grid_cols - w, cell.x));
    const y = snap ? Math.max(0, Math.min(layout.grid_rows - h, snap.y)) : Math.max(0, Math.min(layout.grid_rows - h, cell.y));
    const prefix = snap ? snap.rowPrefix : (currentRowPrefix || "A").trim() || "A";
    const indexInRow = snap ? snap.indexInRow : getNextIndexInRow(layout.racks, prefix);
    const rackIndex = layout.racks.length + 1;
    const rackLabel = `${prefix}${indexInRow}`;
    const bins = createBinsForRack(
      spec.aisle_letter,
      rackIndex,
      spec.levels,
      spec.bins_per_level,
      volPerBin,
      "M1",
      undefined,
      spec.width_cm,
      spec.depth_cm,
      spec.height_cm,
      spec.reserve_bin_keys,
      ROW_LABEL_ADDRESS_PATTERN,
      rackLabel,
      1,
      spec.binNamingType ?? "numeric",
      lc
    );
    const templateColor = item.type === "custom" ? item.template.color : spec.color;
    const rackColor = (typeof templateColor === "string" && templateColor.trim() !== "") ? templateColor.trim() : "#3b82f6";
    const newRack: RackState = {
      x,
      y,
      width: w,
      height: h,
      orientation: "vertical",
      levels: lc.length,
      bins_per_level: lc[0]?.locations ?? spec.bins_per_level,
      levelConfig: lc,
      length_cm: spec.depth_cm,
      width_cm: spec.width_cm,
      height_cm: spec.height_cm,
      aisle_letter: spec.aisle_letter,
      rack_index: rackIndex,
      bins,
      color: rackColor,
      name: rackLabel,
      rowPrefix: prefix,
      indexInRow,
      ...(item.type === "custom" ? { templateId: item.template.id } : {}),
    };
    setLayout((prev) => ({ ...prev, racks: reindexGeometricRow([...prev.racks, newRack], newRack.rack_index) }));
    setDraggingFromCatalog(null);
    setCatalogGhostPosition(null);
    setCatalogHoveredSlot(null);
  }, [layout.racks, layout.row_containers, layout.grid_cols, layout.grid_rows, currentRowPrefix, stampRackIntoSlot]);

  /** Resolve catalog drop/ghost position: snap to empty row slot if over one and slot fits the rack, else snap to row or grid. */
  const getCatalogDropCell = useCallback(
    (cell: { x: number; y: number }, item: CatalogItem) => {
      const empty = findEmptySlotAt(layout.row_containers, cell);
      if (empty) {
        const spec = getCatalogItemSpec(item);
        const reqW = cmToCells(spec.width_cm);
        const reqD = cmToCells(spec.depth_cm);
        const isVert = (empty.rowContainer.orientation ?? "horizontal") === "vertical";
        // Conservative snap: if thickness fits, allow snapping to slot origin and let stampRackIntoSlot decide span.
        if (isVert) {
          if (empty.slot.w >= reqD && empty.slot.h >= Math.min(reqW, empty.slot.h)) return { x: empty.slot.x, y: empty.slot.y };
        } else {
          if (empty.slot.h >= reqD && empty.slot.w >= Math.min(reqW, empty.slot.w)) return { x: empty.slot.x, y: empty.slot.y };
        }
      }
      const spec = getCatalogItemSpec(item);
      const w = cmToCells(spec.width_cm);
      const h = cmToCells(spec.depth_cm);
      const snap = findSnapToRowPosition(layout.racks, cell.x, cell.y, w, h);
      if (snap) return { x: Math.max(0, Math.min(layout.grid_cols - w, snap.x)), y: Math.max(0, Math.min(layout.grid_rows - h, snap.y)) };
      return snapPosition(cell, w, h, layout.racks, layout.grid_cols, layout.grid_rows, aisleWidthCm);
    },
    [layout.row_containers, layout.racks, layout.grid_cols, layout.grid_rows, aisleWidthCm]
  );

  /** Remove the selected empty row (and any racks placed in its slots) from the layout. */
  const deleteSelectedRow = useCallback(() => {
    if (!selectedRowContainerId) return;
    const row = (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId);
    if (!row) return;
    const rackIdsInRow = new Set(row.slots.map((s) => s.rackId).filter((id): id is number | string => id != null));
    setLayout((prev) => ({
      ...prev,
      row_containers: (prev.row_containers ?? []).filter((rc) => rc.id !== selectedRowContainerId),
      racks: prev.racks.filter((r) => !rackIdsInRow.has(r.id ?? r.rack_index)),
    }));
    setSelectedRowContainerId(null);
  }, [selectedRowContainerId, layout.row_containers]);

  /** Toggle the selected row between horizontal and vertical orientation. */
  const rotateSelectedRow = useCallback(() => {
    if (!selectedRowContainerId) return;
    const row = (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId);
    if (!row?.slots.length) return;
    const nextOrientation = row.orientation === "vertical" ? "horizontal" : "vertical";
    const { x: startX, y: startY } = getRowStart(row);
    const newSlots = computeRowSlotPositions(row.slots, startX, startY, nextOrientation);
    setLayout((prev) => ({
      ...prev,
      row_containers: (prev.row_containers ?? []).map((rc) =>
        rc.id === selectedRowContainerId ? { ...rc, orientation: nextOrientation, slots: newSlots } : rc
      ),
    }));
  }, [selectedRowContainerId, layout.row_containers]);

  /** Remove trailing empty slots from the selected row (trim row end). */
  const trimSelectedRowEnd = useCallback(() => {
    if (!selectedRowContainerId) return;
    const row = (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId);
    if (!row?.slots.length) return;
    const trimmed = [...row.slots];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1]?.rackId == null) trimmed.pop();
    if (trimmed.length === row.slots.length) return;
    const { x: startX, y: startY } = getRowStart(row);
    const newSlots = computeRowSlotPositions(trimmed, startX, startY, row.orientation ?? "horizontal");
    setLayout((prev) => ({
      ...prev,
      row_containers: (prev.row_containers ?? []).map((rc) => (rc.id === selectedRowContainerId ? { ...rc, slots: newSlots } : rc)),
    }));
  }, [selectedRowContainerId, layout.row_containers]);

  /** Check if moving the row to (newStartX, newStartY) is valid: no overlap with other rows/racks, within grid. */
  const canMoveRowTo = useCallback(
    (rowId: string, newStart: { x: number; y: number }) => {
      const row = (layout.row_containers ?? []).find((rc) => rc.id === rowId);
      if (!row?.slots.length) return false;
      const newSlots = computeRowSlotPositions(row.slots, newStart.x, newStart.y, row.orientation ?? "horizontal");
      const rackIdsInRow = new Set(row.slots.map((s) => s.rackId).filter((id): id is number | string => id != null));
      const otherRows = (layout.row_containers ?? []).filter((rc) => rc.id !== rowId);
      const otherRacks = layout.racks.filter((r) => !rackIdsInRow.has(r.id ?? r.rack_index));
      const gridCols = layout.grid_cols;
      const gridRows = layout.grid_rows;
      for (const s of newSlots) {
        const rect = { x: s.x, y: s.y, width: s.w, height: s.h };
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > gridCols || rect.y + rect.height > gridRows) return false;
        for (const rc of otherRows) {
          for (const os of rc.slots) {
            if (rectsOverlap(rect, { x: os.x, y: os.y, width: os.w, height: os.h })) return false;
          }
        }
        for (const r of otherRacks) {
          if (rectsOverlap(rect, { x: r.x, y: r.y, width: r.width, height: r.height })) return false;
        }
      }
      for (const slot of newSlots) {
        if (slot.rackId == null) continue;
        const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === slot.rackId);
        if (!rack) continue;
        const rect = { x: slot.x, y: slot.y, width: rack.width, height: rack.height };
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > gridCols || rect.y + rect.height > gridRows) return false;
        for (const rc of otherRows) {
          for (const os of rc.slots) {
            if (rectsOverlap(rect, { x: os.x, y: os.y, width: os.w, height: os.h })) return false;
          }
        }
        for (const r of otherRacks) {
          if (rectsOverlap(rect, { x: r.x, y: r.y, width: r.width, height: r.height })) return false;
        }
      }
      return true;
    },
    [layout.row_containers, layout.racks, layout.grid_cols, layout.grid_rows]
  );

  /** Move the entire row (all slots and racks) to a new start position. Call only when canMoveRowTo returned true. */
  const moveRowToPosition = useCallback(
    (rowId: string, newStartX: number, newStartY: number) => {
      const row = (layout.row_containers ?? []).find((rc) => rc.id === rowId);
      if (!row?.slots.length) return;
      const newSlots = computeRowSlotPositions(row.slots, newStartX, newStartY, row.orientation ?? "horizontal");
      setLayout((prev) => {
        const updatedRacks = prev.racks.map((r) => {
          const slotForRack = newSlots.find((s) => s.rackId != null && String(s.rackId) === String(r.id ?? r.rack_index));
          if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
          return r;
        });
        const updatedRows = (prev.row_containers ?? []).map((rc) => (rc.id === rowId ? { ...rc, slots: newSlots } : rc));
        return {
          ...prev,
          racks: updatedRacks,
          row_containers: filterEmptyRowContainers(updatedRows),
        };
      });
    },
    [layout.row_containers, layout.racks]
  );

  /** Select a row container (e.g. when clicking an empty slot overlay). Clears rack/aisle/visual selection. */
  const onSelectRowContainer = useCallback((rowId: string) => {
    setSelectedRowContainerId(rowId);
    setSelectedRackId(null);
    setSelectedRackIds([]);
    setSelectedAisleIndex(null);
    setSelectedVisualId(null);
    setSelectedVisualIds([]);
    setSelectedPathPointIndex(null);
    setSelectedPathLine(false);
  }, []);

  /** Start dragging the selected row by its handle. Call on mousedown on the drag handle. */
  const onStartRowDrag = useCallback(
    (e: React.MouseEvent | { clientX: number; clientY: number }) => {
      if (!selectedRowContainerId) return;
      const row = (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId);
      if (!row?.slots.length) return;
      const rowStart = getRowStart(row);
      const cell = getCellFromEvent(e as { clientX: number; clientY: number });
      if (!cell) return;
      setDraggingRowId(selectedRowContainerId);
      setRowDragPreviewStart(rowStart);
      rowDragPointerOffsetRef.current = { dx: cell.x - rowStart.x, dy: cell.y - rowStart.y };
      rowDragPreviewStartRef.current = rowStart;
    },
    [selectedRowContainerId, layout.row_containers, getCellFromEvent]
  );

  /** Move an already-placed rack within the same row from one slot index to another. Frees the source slot and inserts into the target (splits if needed). */
  const moveRackWithinRow = useCallback(
    (rowId: string, rackId: number | string, fromSlotIndex: number, toSlotIndex: number) => {
      const row = (layout.row_containers ?? []).find((rc) => rc.id === rowId);
      if (!row || fromSlotIndex < 0 || fromSlotIndex >= row.slots.length || toSlotIndex < 0 || toSlotIndex >= row.slots.length) return;
      const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === rackId);
      if (!rack) return;
      const w = rack.width;
      const h = rack.height;
      const fromSlot = row.slots[fromSlotIndex];
      const toSlot = row.slots[toSlotIndex];
      if (!fromSlot || fromSlot.rackId == null || String(fromSlot.rackId) !== String(rackId)) return;
      const isVertical = row.orientation === "vertical";
      const targetFits = isVertical ? (toSlot?.h >= h) : (toSlot?.w >= w);
      if (toSlot?.rackId != null) return; // target must be empty
      if (!toSlot || !targetFits) return;
      const { x: startX, y: startY } = getRowStart(row);
      const afterRemove: EmptyRowSlot[] = row.slots.map((s, i) =>
        i === fromSlotIndex ? { x: 0, y: startY, w: s.w, h: s.h } : s
      );
      const filled: EmptyRowSlot = { x: 0, y: startY, w, h, rackId };
      const remainder = isVertical
        ? (toSlot.h > h ? [{ x: 0, y: startY, w: toSlot.w, h: toSlot.h - h }] : [])
        : (toSlot.w > w ? [{ x: 0, y: startY, w: toSlot.w - w, h: toSlot.h }] : []);
      const newSlotsRaw: EmptyRowSlot[] = [
        ...afterRemove.slice(0, toSlotIndex),
        filled,
        ...remainder,
        ...afterRemove.slice(toSlotIndex + 1),
      ];
      const newSlots = computeRowSlotPositions(newSlotsRaw, startX, startY, row.orientation ?? "horizontal");
      setLayout((prev) => {
        const updatedRacks = prev.racks.map((r) => {
          const slotForRack = newSlots.find((s) => s.rackId != null && String(s.rackId) === String(r.id ?? r.rack_index));
          if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
          return r;
        });
        return {
          ...prev,
          racks: reindexGeometricRow(updatedRacks, rackId),
          row_containers: (prev.row_containers ?? []).map((rc) => (rc.id === rowId ? { ...rc, slots: newSlots } : rc)),
        };
      });
    },
    [layout.row_containers, layout.racks]
  );

  /** Report which empty slot is under the cursor during catalog drag (for blue highlight). */
  const setCatalogHoveredSlotFromCell = useCallback(
    (cell: { x: number; y: number } | null) => {
      if (!cell) {
        setCatalogHoveredSlot(null);
        return;
      }
      const empty = findEmptySlotAt(layout.row_containers, cell);
      setCatalogHoveredSlot(empty ? { rowId: empty.rowContainer.id, slotIndex: empty.slotIndex } : null);
    },
    [layout.row_containers]
  );

  /** Fill all empty slots in the selected row with the given template. Horizontal: split by width. Vertical: split by height. */
  const fillSelectedRowWithTemplate = useCallback(
    (item: CatalogItem) => {
      if (!selectedRowContainerId) return;
      const row = (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId);
      if (!row) return;
      const spec = getCatalogItemSpec(item);
      const lc = getLevelConfig(spec);
      const totalBins = getTotalLocations(lc);
      const volPerBin = totalBins > 0
        ? volumePerBinFromTotal(spec.width_cm, spec.depth_cm, spec.height_cm, totalBins)
        : volumePerBin(spec.width_cm, spec.depth_cm, spec.height_cm, spec.levels, spec.bins_per_level);
      const w = cmToCells(spec.width_cm);
      const h = cmToCells(spec.depth_cm);
      const prefix = ((row.rowPrefix ?? currentRowPrefix) || "A").trim() || "A";
      const templateColor = item.type === "custom" ? item.template.color : spec.color;
      const rackColor = (typeof templateColor === "string" && templateColor.trim() !== "") ? templateColor.trim() : "#3b82f6";
      const { x: startX, y: startY } = getRowStart(row);
      const isVertical = row.orientation === "vertical";
      const slotFits = (s: EmptyRowSlot) => isVertical ? (s.w >= h && s.h >= w) : (s.w >= w);
      const remainderSlot = (s: EmptyRowSlot): EmptyRowSlot => isVertical
        ? { x: 0, y: startY, w: s.w, h: s.h - w }
        : { x: 0, y: startY, w: s.w - w, h: s.h };
      setLayout((prev) => {
        const rc = (prev.row_containers ?? []).find((r) => r.id === selectedRowContainerId);
        if (!rc) return prev;
        const newSlotsRaw: EmptyRowSlot[] = [];
        const newRacks: RackState[] = [];
        let nextRackIndex = prev.racks.length + 1;
        let indexInRow = 1 + rc.slots.filter((s) => s.rackId != null).length;
        for (const s of rc.slots) {
          if (s.rackId != null) {
            newSlotsRaw.push(s);
            continue;
          }
          if (!slotFits(s)) {
            newSlotsRaw.push(s);
            continue;
          }
          newSlotsRaw.push({ x: 0, y: startY, w: isVertical ? h : w, h: isVertical ? w : h, rackId: nextRackIndex });
          const rackLabel = `${prefix}${indexInRow}`;
          const bins = createBinsForRack(
            spec.aisle_letter,
            nextRackIndex,
            spec.levels,
            spec.bins_per_level,
            volPerBin,
            "M1",
            undefined,
            spec.width_cm,
            spec.depth_cm,
            spec.height_cm,
            spec.reserve_bin_keys,
            ROW_LABEL_ADDRESS_PATTERN,
            rackLabel,
            1,
            spec.binNamingType ?? "numeric",
            lc
          );
          newRacks.push({
            x: 0,
            y: startY,
            width: isVertical ? h : w,
            height: isVertical ? w : h,
            orientation: "vertical",
            levels: lc.length,
            bins_per_level: lc[0]?.locations ?? spec.bins_per_level,
            levelConfig: lc,
            length_cm: spec.depth_cm,
            width_cm: spec.width_cm,
            height_cm: spec.height_cm,
            aisle_letter: spec.aisle_letter,
            rack_index: nextRackIndex,
            bins,
            color: rackColor,
            name: rackLabel,
            rowPrefix: prefix,
            indexInRow,
            ...(isVertical ? { rotationDegrees: 90 as const } : {}),
            ...(item.type === "custom" ? { templateId: item.template.id } : {}),
          } as RackState);
          nextRackIndex += 1;
          indexInRow += 1;
          if (isVertical ? (s.h > w) : s.w > w) newSlotsRaw.push(remainderSlot(s));
        }
        const newSlots = computeRowSlotPositions(newSlotsRaw, startX, startY, rc.orientation ?? "horizontal");
        const updatedRacks = prev.racks.map((r) => {
          const slotForRack = newSlots.find((sl) => sl.rackId === (r.id ?? r.rack_index));
          if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
          return r;
        });
        const newRacksWithPos = newRacks.map((rack) => {
          const slotForRack = newSlots.find((sl) => sl.rackId === rack.rack_index);
          return { ...rack, x: slotForRack?.x ?? 0, y: slotForRack?.y ?? startY };
        });
        let nextRacks = reindexGeometricRow([...updatedRacks, ...newRacksWithPos], newRacksWithPos[0]?.rack_index ?? prev.racks.length + 1);
        return {
          ...prev,
          racks: nextRacks,
          row_containers: (prev.row_containers ?? []).map((r) => (r.id === selectedRowContainerId ? { ...r, slots: newSlots } : r)),
        };
      });
    },
    [selectedRowContainerId, layout.row_containers, currentRowPrefix]
  );

  const getDefaultVisualSize = useCallback((type: VisualElementType): { w: number; h: number } => {
    switch (type) {
      case "column": return { w: 2, h: 2 };
      case "mezzanine": return { w: 20, h: 15 };
      case "packing_station": return { w: 6, h: 4 };
      case "cart": return { w: 3, h: 3 };
      case "wall": return { w: 10, h: 1 };
      case "door": return { w: 2, h: 3 };
      case "zone": return { w: 8, h: 6 };
      default: return { w: 2, h: 2 };
    }
  }, []);

  const addVisualElement = useCallback((cell: { x: number; y: number }, type: VisualElementType) => {
    const { w, h } = getDefaultVisualSize(type);
    const maxZ = Math.max(0, ...(layout.visual_elements ?? []).map((ve) => ve.zIndex));
    const newEl: VisualElementState = {
      id: `ve-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      x: Math.max(0, Math.min(layout.grid_cols - w, cell.x)),
      y: Math.max(0, Math.min(layout.grid_rows - h, cell.y)),
      width: w,
      height: h,
      zIndex: maxZ + 1,
      rotation: 0,
      ...(type === "column" ? { columnShape: "square" as ColumnShape } : {}),
      ...(type === "wall" ? { length: w, thickness: h } : {}),
      ...(type === "door" ? { doorStyle: "hinged" as DoorStyle } : {}),
      ...(type === "zone" ? {
        zoneType: "reception" as ZoneType,
        color: "#3b82f640",
        width_cm: w * GRID_UNIT_CM,
        depth_cm: 100,
        height_cm: h * GRID_UNIT_CM,
        total_volume_dm3: (w * GRID_UNIT_CM * 100 * h * GRID_UNIT_CM) / 1000,
        current_occupancy_dm3: 0,
      } : {}),
    };
    setLayout((prev) => ({ ...prev, visual_elements: [...(prev.visual_elements ?? []), newEl] }));
    setSelectedVisualId(newEl.id);
    setDraggingVisualType(null);
  }, [layout.visual_elements, layout.grid_cols, layout.grid_rows, getDefaultVisualSize]);

  const onSaveEditTemplate = useCallback(
    (templateId: string, template: CustomRackTemplate, updateExistingRacks: boolean) => {
      if (!updateExistingRacks) return;
      const w = cmToCells(template.width_cm);
      const h = cmToCells(template.depth_cm);
      const lcEdit = getLevelConfig(template);
      const totalEdit = getTotalLocations(lcEdit);
      const volPerBin = totalEdit > 0
        ? volumePerBinFromTotal(template.width_cm, template.depth_cm, template.height_cm, totalEdit)
        : volumePerBin(template.width_cm, template.depth_cm, template.height_cm, template.levels, template.bins_per_level);
      setLayout((prev) => ({
        ...prev,
        racks: prev.racks.map((r) => {
          if (r.templateId !== templateId) return r;
          const bins = createBinsForRack(template.aisle_letter, r.rack_index, template.levels, template.bins_per_level, volPerBin, "M1", template.naming_pattern, template.width_cm, template.depth_cm, template.height_cm, template.reserve_bin_keys, template.addressPattern, template.rowId, template.sectionStartIndex, template.binNamingType, lcEdit);
          return {
            ...r,
            width: w,
            height: h,
            width_cm: template.width_cm,
            length_cm: template.depth_cm,
            height_cm: template.height_cm,
            levels: lcEdit.length,
            bins_per_level: lcEdit[0]?.locations ?? template.bins_per_level,
            levelConfig: lcEdit,
            aisle_letter: template.aisle_letter,
            color: template.color,
            bins,
          };
        }),
      }));
    },
    []
  );

  /** Place a row of racks from cell A to cell B. Template properties (color, reserve bins, dimensions, rowId) are strictly inherited from the selected template. Section numbering is per-template (no global counter). */
  const _placeRowFromCatalogItem = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }, item: CatalogItem) => {
      const spec = getCatalogItemSpec(item);
      // Use a local copy of the template so we never fall back to another template (e.g. Template A) or stale state.
      const templateToApply: {
        color: string;
        rowId: string;
        aisle_letter: string;
        sectionStartIndex: number;
        nextSectionIndex?: number;
        templateId: string | null;
        levels: number;
        bins_per_level: number;
        levelConfig?: { level: number; locations: number }[];
        length_cm: number;
        width_cm: number;
        height_cm: number;
        naming_pattern?: string;
        addressPattern?: string;
        binNamingType?: "numeric" | "alpha";
        reserve_bin_keys?: string[];
      } = item.type === "custom"
        ? (JSON.parse(JSON.stringify({
          color: item.template.color ?? spec.color ?? "#3b82f6",
          rowId: item.template.rowId ?? item.template.aisle_letter,
          aisle_letter: item.template.aisle_letter,
          sectionStartIndex: item.template.sectionStartIndex ?? 1,
          nextSectionIndex: item.template.nextSectionIndex ?? item.template.sectionStartIndex ?? 1,
          templateId: item.template.id,
          levels: item.template.levels,
          bins_per_level: item.template.bins_per_level,
          levelConfig: item.template.levelConfig,
          length_cm: item.template.depth_cm,
          width_cm: item.template.width_cm,
          height_cm: item.template.height_cm,
          naming_pattern: item.template.naming_pattern,
          addressPattern: item.template.addressPattern,
          binNamingType: item.template.binNamingType ?? "numeric",
          reserve_bin_keys: item.template.reserve_bin_keys ? [...item.template.reserve_bin_keys] : undefined,
        })) as typeof templateToApply)
        : {
          color: spec.color ?? "#3b82f6",
          rowId: spec.rowId ?? spec.aisle_letter,
          aisle_letter: spec.aisle_letter,
          sectionStartIndex: spec.sectionStartIndex ?? 1,
          nextSectionIndex: spec.sectionStartIndex ?? 1,
          templateId: null,
          levels: spec.levels,
          bins_per_level: spec.bins_per_level,
          levelConfig: spec.levelConfig,
          length_cm: spec.depth_cm,
          width_cm: spec.width_cm,
          height_cm: spec.height_cm,
          naming_pattern: spec.naming_pattern,
          addressPattern: spec.addressPattern,
          binNamingType: spec.binNamingType ?? "numeric",
          reserve_bin_keys: spec.reserve_bin_keys ? [...spec.reserve_bin_keys] : undefined,
        };

      // Section numbering: use only templateToApply's section (independent per template/row). No global counter.
      const startSection = templateToApply.nextSectionIndex ?? templateToApply.sectionStartIndex;

      const pw = cmToCells(templateToApply.width_cm);
      const ph = cmToCells(templateToApply.length_cm);
      const gapCells = cmToCells(rowGapCm);
      const stepW = pw + gapCells;
      const stepH = ph + gapCells;
      const isHorizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
      let count: number;
      let positions: { x: number; y: number }[];
      if (isHorizontal) {
        const x0 = Math.min(start.x, end.x);
        const x1 = Math.max(start.x, end.x);
        const span = x1 - x0;
        count = stepW > 0 ? Math.max(0, Math.floor(span / stepW)) : 0;
        positions = Array.from({ length: count }, (_, i) => ({ x: x0 + i * stepW, y: start.y }));
      } else {
        const y0 = Math.min(start.y, end.y);
        const y1 = Math.max(start.y, end.y);
        const span = y1 - y0;
        count = stepH > 0 ? Math.max(0, Math.floor(span / stepH)) : 0;
        positions = Array.from({ length: count }, (_, i) => ({ x: start.x, y: y0 + i * stepH }));
      }
      const lcRow = getLevelConfig(templateToApply);
      const totalBinsRow = getTotalLocations(lcRow);
      const volPerBin = totalBinsRow > 0
        ? volumePerBinFromTotal(templateToApply.width_cm, templateToApply.length_cm, templateToApply.height_cm, totalBinsRow)
        : volumePerBin(templateToApply.width_cm, templateToApply.length_cm, templateToApply.height_cm, templateToApply.levels, templateToApply.bins_per_level);
      const rackStubs: { x: number; y: number }[] = [];
      for (const pos of positions) {
        const x = Math.max(0, Math.min(layout.grid_cols - pw, pos.x));
        const y = Math.max(0, Math.min(layout.grid_rows - ph, pos.y));
        const rect = { x, y, width: pw, height: ph };
        const overlapsExisting = layout.racks.some((r) => rectsOverlap(rect, r));
        const overlapsNew = rackStubs.some((s) => rectsOverlap(rect, { ...s, width: pw, height: ph }));
        if (overlapsExisting || overlapsNew) continue;
        rackStubs.push({ x, y });
      }
      if (rackStubs.length > 0) {
        const prefix = (currentRowPrefix || "A").trim() || "A";
        setLayout((prev) => {
          const nextRackIndexBase = prev.racks.length + 1;
          const startIndexInRow = getNextIndexInRow(prev.racks, prefix);
          const newRacks: RackState[] = rackStubs.map((pos, i) => {
            const rackIndex = nextRackIndexBase + i;
            const indexInRow = startIndexInRow + i;
            const rackLabel = `${prefix}${indexInRow}`;
            const bins = createBinsForRack(
              templateToApply.aisle_letter,
              rackIndex,
              templateToApply.levels,
              templateToApply.bins_per_level,
              volPerBin,
              "M1",
              undefined,
              templateToApply.width_cm,
              templateToApply.length_cm,
              templateToApply.height_cm,
              templateToApply.reserve_bin_keys,
              ROW_LABEL_ADDRESS_PATTERN,
              rackLabel,
              1,
              templateToApply.binNamingType ?? "numeric",
              lcRow
            );
            return {
              x: pos.x,
              y: pos.y,
              width: pw,
              height: ph,
              orientation: "vertical",
              levels: lcRow.length,
              bins_per_level: lcRow[0]?.locations ?? templateToApply.bins_per_level,
              levelConfig: lcRow,
              length_cm: templateToApply.length_cm,
              width_cm: templateToApply.width_cm,
              height_cm: templateToApply.height_cm,
              aisle_letter: templateToApply.aisle_letter,
              rack_index: rackIndex,
              bins,
              color: templateToApply.color,
              name: rackLabel,
              rowPrefix: prefix,
              indexInRow,
              ...(templateToApply.templateId != null ? { templateId: templateToApply.templateId } : {}),
            } as RackState;
          });
          return { ...prev, racks: [...prev.racks, ...newRacks] };
        });
        if (templateToApply.templateId != null) {
          setCustomTemplates((prev) =>
            prev.map((t) =>
              t.id === templateToApply.templateId ? { ...t, nextSectionIndex: startSection + rackStubs.length } : t
            )
          );
        }
      }
      setRowDrawStart(null);
      setRowDrawEnd(null);
      return rackStubs.length;
    },
    [layout.racks, layout.grid_cols, layout.grid_rows, rowGapCm, currentRowPrefix, setCustomTemplates]
  );
  void _placeRowFromCatalogItem;

  /** Create an empty row as one container of available space (one big slot). Racks placed later will split it and push slots right. */
  const placeEmptyRow = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const isHorizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
      const gapCells = Math.max(0, cmToCells(rowGapCm));

      const slotW = isHorizontal ? DEFAULT_ROW_SLOT_W : DEFAULT_ROW_SLOT_H;
      const slotH = isHorizontal ? DEFAULT_ROW_SLOT_H : DEFAULT_ROW_SLOT_W;
      const step = (isHorizontal ? slotW : slotH) + gapCells;

      const x0 = Math.min(start.x, end.x);
      const x1 = Math.max(start.x, end.x);
      const y0 = Math.min(start.y, end.y);
      const y1 = Math.max(start.y, end.y);

      const startX = Math.max(0, Math.min(layout.grid_cols - slotW, isHorizontal ? x0 : start.x));
      const startY = Math.max(0, Math.min(layout.grid_rows - slotH, isHorizontal ? start.y : y0));

      const span = isHorizontal ? (x1 - x0) : (y1 - y0);
      // Strictly match drag distance (no implicit extra slot at the end).
      const desiredCount = step > 0 ? Math.max(1, Math.floor(span / step)) : 1;
      const maxCount = step > 0
        ? Math.max(
            0,
            Math.floor((isHorizontal ? (layout.grid_cols - slotW - startX) : (layout.grid_rows - slotH - startY)) / step) + 1
          )
        : 0;
      const count = Math.max(0, Math.min(desiredCount, maxCount || desiredCount));
      if (count <= 0) return;

      const slots: EmptyRowSlot[] = Array.from({ length: count }, (_, i) => {
        const x = isHorizontal ? startX + i * step : startX;
        const y = isHorizontal ? startY : startY + i * step;
        return { x, y, w: slotW, h: slotH };
      });

      const overlapsExisting = slots.some((s) =>
        layout.racks.some((r) => rectsOverlap({ x: s.x, y: s.y, width: s.w, height: s.h }, r))
      );
      const overlapsOther = slots.some((s) =>
        (layout.row_containers ?? []).some((rc) =>
          rc.slots.some((o) => rectsOverlap({ x: s.x, y: s.y, width: s.w, height: s.h }, { x: o.x, y: o.y, width: o.w, height: o.h }))
        )
      );
      if (overlapsExisting || overlapsOther) return;

      const id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const rowPrefix = (currentRowPrefix || "A").trim() || "A";
      const orientation: "horizontal" | "vertical" = isHorizontal ? "horizontal" : "vertical";
      const newRow: RowContainer = { id, rowPrefix, orientation, slots };
      setLayout((prev) => ({ ...prev, row_containers: [...(prev.row_containers ?? []), newRow] }));
      setRowDrawStart(null);
      setRowDrawEnd(null);
    },
    [layout.racks, layout.grid_cols, layout.grid_rows, layout.row_containers, rowGapCm]
  );

  /** Create a row with orientation from drag and immediately fill it with the given template (vertical → swapped dims + rotation). */
  const placeRowWithTemplate = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }, item: CatalogItem) => {
      const ph = DEFAULT_ROW_SLOT_H;
      const isHorizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
      let x0: number, y0: number, span: number;
      if (isHorizontal) {
        x0 = Math.min(start.x, end.x);
        const x1 = Math.max(start.x, end.x);
        y0 = start.y;
        span = Math.max(1, x1 - x0);
      } else {
        x0 = start.x;
        y0 = Math.min(start.y, end.y);
        const y1 = Math.max(start.y, end.y);
        span = Math.max(1, y1 - y0);
      }
      const clampedX = Math.max(0, Math.min(layout.grid_cols - 1, x0));
      const clampedY = Math.max(0, Math.min(layout.grid_rows - (isHorizontal ? ph : span), y0));
      const w = isHorizontal ? Math.min(span, layout.grid_cols - clampedX) : DEFAULT_ROW_SLOT_H;
      const h = isHorizontal ? ph : Math.min(span, layout.grid_rows - clampedY);
      const rect = { x: clampedX, y: clampedY, width: w, height: h };
      const overlapsExisting = layout.racks.some((r) => rectsOverlap(rect, r));
      const overlapsOther = layout.row_containers?.some((rc) =>
        rc.slots.some((s) => rectsOverlap(rect, { x: s.x, y: s.y, width: s.w, height: s.h }))
      );
      if (overlapsExisting || overlapsOther) return;
      const id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const rowPrefix = (currentRowPrefix || "A").trim() || "A";
      const orientation: "horizontal" | "vertical" = isHorizontal ? "horizontal" : "vertical";
      const spec = getCatalogItemSpec(item);
      const lc = getLevelConfig(spec);
      const totalBins = getTotalLocations(lc);
      const volPerBin = totalBins > 0
        ? volumePerBinFromTotal(spec.width_cm, spec.depth_cm, spec.height_cm, totalBins)
        : volumePerBin(spec.width_cm, spec.depth_cm, spec.height_cm, spec.levels, spec.bins_per_level);
      const cellW = cmToCells(spec.width_cm);
      const cellH = cmToCells(spec.depth_cm);
      const templateColor = item.type === "custom" ? item.template.color : spec.color;
      const rackColor = (typeof templateColor === "string" && templateColor.trim() !== "") ? templateColor.trim() : "#3b82f6";
      const startX = clampedX;
      const startY = clampedY;
      const isVertical = orientation === "vertical";
      const slotFits = (s: EmptyRowSlot) => isVertical ? (s.w >= cellH && s.h >= cellW) : (s.w >= cellW);
      const remainderSlot = (s: EmptyRowSlot): EmptyRowSlot => isVertical
        ? { x: 0, y: startY, w: s.w, h: s.h - cellW }
        : { x: 0, y: startY, w: s.w - cellW, h: s.h };
      setLayout((prev) => {
        const initialSlots: EmptyRowSlot[] = [{ x: clampedX, y: clampedY, w, h }];
        const newSlotsRaw: EmptyRowSlot[] = [];
        const newRacks: RackState[] = [];
        let nextRackIndex = prev.racks.length + 1;
        let indexInRow = 1;
        const toProcess = [...initialSlots];
        while (toProcess.length > 0) {
          const s = toProcess.shift()!;
          if (s.rackId != null) {
            newSlotsRaw.push(s);
            continue;
          }
          if (!slotFits(s)) {
            newSlotsRaw.push(s);
            continue;
          }
          newSlotsRaw.push({ x: 0, y: startY, w: isVertical ? cellH : cellW, h: isVertical ? cellW : cellH, rackId: nextRackIndex });
          const rackLabel = `${rowPrefix}${indexInRow}`;
          const bins = createBinsForRack(
            spec.aisle_letter,
            nextRackIndex,
            spec.levels,
            spec.bins_per_level,
            volPerBin,
            "M1",
            undefined,
            spec.width_cm,
            spec.depth_cm,
            spec.height_cm,
            spec.reserve_bin_keys,
            ROW_LABEL_ADDRESS_PATTERN,
            rackLabel,
            1,
            spec.binNamingType ?? "numeric",
            lc
          );
          newRacks.push({
            x: 0,
            y: startY,
            width: isVertical ? cellH : cellW,
            height: isVertical ? cellW : cellH,
            orientation: "vertical",
            levels: lc.length,
            bins_per_level: lc[0]?.locations ?? spec.bins_per_level,
            levelConfig: lc,
            length_cm: spec.depth_cm,
            width_cm: spec.width_cm,
            height_cm: spec.height_cm,
            aisle_letter: spec.aisle_letter,
            rack_index: nextRackIndex,
            bins,
            rackLevels: binsToLevels(bins),
            color: rackColor,
            name: rackLabel,
            rowPrefix,
            indexInRow,
            ...(isVertical ? { rotationDegrees: 90 as const } : {}),
            ...(item.type === "custom" ? { templateId: item.template.id } : {}),
          } as RackState);
          nextRackIndex += 1;
          indexInRow += 1;
          if (isVertical ? (s.h > cellW) : (s.w > cellW)) toProcess.unshift(remainderSlot(s));
        }
        // Lock row length: do not leave a trailing "ghost" empty slot smaller than one rack (no extra kafelki on tool/template deselection).
        const minSlotAlongRow = isVertical ? cellW : cellW;
        while (
          newSlotsRaw.length > 0 &&
          newSlotsRaw[newSlotsRaw.length - 1]?.rackId == null &&
          (isVertical ? (newSlotsRaw[newSlotsRaw.length - 1]?.h ?? 0) < minSlotAlongRow : (newSlotsRaw[newSlotsRaw.length - 1]?.w ?? 0) < minSlotAlongRow)
        ) {
          newSlotsRaw.pop();
        }
        const newSlots = computeRowSlotPositions(newSlotsRaw, startX, startY, orientation);
        const updatedRacks = prev.racks.map((r) => {
          const slotForRack = newSlots.find((sl) => sl.rackId === (r.id ?? r.rack_index));
          if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
          return r;
        });
        const newRacksWithPos = newRacks.map((rack) => {
          const slotForRack = newSlots.find((sl) => sl.rackId === rack.rack_index);
          return { ...rack, x: slotForRack?.x ?? 0, y: slotForRack?.y ?? startY };
        });
        const nextRacks = reindexGeometricRow([...updatedRacks, ...newRacksWithPos], newRacksWithPos[0]?.rack_index ?? prev.racks.length + 1);
        return {
          ...prev,
          row_containers: [...(prev.row_containers ?? []), { id, rowPrefix, orientation, slots: newSlots }],
          racks: nextRacks,
        };
      });
      setRowDrawStart(null);
      setRowDrawEnd(null);
    },
    [layout.racks, layout.grid_cols, layout.grid_rows, layout.row_containers, currentRowPrefix]
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
            const snapped = snapRowPreviewToDistance(row, { x: px, y: py }, layout);
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
          const rowSnap = findSnapToRowPosition(layout.racks, desired.x, desired.y, w, h, draggingRackId);
          const freeSnap = snapToGrid
            ? snapPosition(desired, w, h, layout.racks.filter((r) => !excludeIds.includes(r.id ?? r.rack_index)), layout.grid_cols, layout.grid_rows, aisleWidthCm)
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
    [placementMode, draggingRackId, dragOffset, draggingVisualId, dragOffsetVisual, draggingWallEnd, draggingPathPointIndex, getCellFromEvent, layout.racks, layout.visual_elements, layout.grid_cols, layout.grid_rows, ghostW, ghostH, isPanning, marqueeStart, rowToolActive, rowDrawStart, snapToGrid, aisleWidthCm, draggingRowId, selectedRackIds]
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
        const emptySlotHit = findEmptySlotAt(layout.row_containers, cell);
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
    [getCellFromEvent, placementMode, layout.racks, layout.aisles, layout.visual_elements, layout.row_containers, stampRackAt, panMode, aisleToolActive, rowToolActive, rowToolTemplate, rowDrawStart, pathToolActive, manualPathPoints, isLiveView, mainView, setMainView, setSelectedRackIdForSideView, setSelectedLocationForProducts, setDraggingRackId, layoutMode, selectedWarehouseId, addSpecialLocation]
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
        if (activeTemplate) {
          placeRowWithTemplate(rowDrawStart, end, activeTemplate);
        } else {
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
    if (draggingRowId != null && rowDragPreviewStart != null) {
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
        if (canPlaceGroup(layout, groupIds, positions)) {
          setLayout((prev) => {
            const clearedRowSlots = (prev.row_containers ?? []).map((rc) => ({
              ...rc,
              slots: rc.slots.map((s) =>
                s.rackId != null && groupIds.has(s.rackId) ? { ...s, rackId: undefined } : s
              ),
            }));
            const newSlotsByRow = clearedRowSlots.map((rc) => {
              const { x: startX, y: startY } = getRowStart(rc);
              return { ...rc, slots: computeRowSlotPositions(rc.slots, startX, startY, rc.orientation ?? "horizontal") };
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
              row_containers: filterEmptyRowContainers(newSlotsByRow),
            };
          });
        }
        setRackDragPreviewPosition(null);
      } else {
        const rowSlot = findRowAndSlotForRack(layout.row_containers, draggingRackId);
        const emptyAtDrop = findEmptySlotAt(layout.row_containers, finalPos);
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
              const { x: startX, y: startY } = getRowStart(row);
              const cleared = row.slots.map((s, i) =>
                i === rowSlot.slotIndex ? { x: 0, y: startY, w: s.w, h: s.h } : s
              );
              const newSlots = computeRowSlotPositions(cleared, startX, startY, row.orientation ?? "horizontal");
              const updatedRacks = prev.racks.map((r) => {
                if ((r.id ?? r.rack_index) === draggingRackId) return { ...r, x: finalPos.x, y: finalPos.y };
                const slotForRack = newSlots.find((s) => s.rackId != null && String(s.rackId) === String(r.id ?? r.rack_index));
                if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
                return r;
              });
              return {
                ...prev,
                racks: reindexGeometricRow(updatedRacks, draggingRackId),
                row_containers: rc.map((r) => (r.id === rowSlot.rowContainer.id ? { ...r, slots: newSlots } : r)),
              };
            });
          }
        } else {
          setLayout((prev) => {
            const withPosition = { ...prev, racks: prev.racks.map((r) => (r.id ?? r.rack_index) === draggingRackId ? { ...r, x: finalPos.x, y: finalPos.y } : r) };
            return { ...withPosition, racks: reindexGeometricRow(withPosition.racks, draggingRackId) };
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
  }, [marqueeStart, marqueeEnd, layout.racks, layout.row_containers, aisleDrawStart, layout.grid_cols, layout.grid_rows, rowToolActive, rowDrawStart, rowDrawEnd, rowToolTemplate, placeRowWithTemplate, placeEmptyRow, draggingRackId, rackDragPreviewPosition, moveRackWithinRow, draggingRowId, rowDragPreviewStart, canMoveRowTo, moveRowToPosition, selectedRackIds, showDimensions]);

  // When dragging a row, listen to window mouse move/up so drag works and ends even when pointer leaves the canvas.
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
          const snapped = snapRowPreviewToDistance(row, { x: px, y: py }, layout);
          px = snapped.x;
          py = snapped.y;
        }
      }
      setRowDragPreviewStart((prev) => (prev?.x === px && prev?.y === py ? prev : { x: px, y: py }));
      rowDragPreviewStartRef.current = { x: px, y: py };
    };
    const onWindowMouseUp = () => {
      const preview = rowDragPreviewStartRef.current;
      if (draggingRowId && preview != null) {
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
  }, [draggingRowId, getCellFromEvent, layout.grid_cols, layout.grid_rows, layout.row_containers, canMoveRowTo, moveRowToPosition, showDimensions]);

  const sShapePathPoints = (() => {
    if (!layout.aisles?.length) return null;
    const packing = (layout.visual_elements ?? []).find((ve) => ve.type === "packing_station");
    const start = packing
      ? { x: packing.x + packing.width / 2, y: packing.y + packing.height / 2 }
      : { x: 0, y: 0 };
    const aisleCenters = layout.aisles.map((a) => ({
      cx: a.x + a.width / 2,
      cy: a.y + a.height / 2,
      index: 0,
    }));
    const rowTolerance = 2;
    const rows: { cx: number; cy: number }[][] = [];
    const sorted = [...aisleCenters].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    for (const a of sorted) {
      const row = rows.find((r) => r.length && Math.abs(r[0].cy - a.cy) <= rowTolerance);
      if (row) row.push(a);
      else rows.push([a]);
    }
    const sOrder: { x: number; y: number }[] = [];
    rows.forEach((row, ri) => {
      const byX = [...row].sort((a, b) => a.cx - b.cx);
      const ordered = ri % 2 === 1 ? byX.reverse() : byX;
      ordered.forEach((a) => sOrder.push({ x: a.cx, y: a.cy }));
    });
    return [start, ...sOrder, start];
  })();

  const pickingPathPoints = showPickingPath ? (manualPathPoints.length > 0
    ? manualPathPoints.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }))
    : sShapePathPoints)
    : null;

  const effectivePathPoints = manualPathPoints.length > 0
    ? manualPathPoints.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }))
    : sShapePathPoints;
  const pathDistanceM = effectivePathPoints ? pathDistanceMeters(effectivePathPoints, CELLS_PER_METER_FOR_PATH) : 0;

  const handleMagicWand = useCallback(() => {
    if (!sShapePathPoints || sShapePathPoints.length < 2) return;
    if (manualPathPoints.length > 0) {
      const manualDist = pathDistanceMeters(manualPathPoints.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 })), CELLS_PER_METER_FOR_PATH);
      const sShapeDist = pathDistanceMeters(sShapePathPoints, CELLS_PER_METER_FOR_PATH);
      if (sShapeDist < manualDist) {
        setSnackbar({
          message: `Sugerowana optymalizacja: ${(manualDist - sShapeDist).toFixed(1)} m krócej`,
          undo: () => {
            setManualPathPoints(sShapePathPoints.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })));
            setSnackbar(null);
          },
          undoLabel: "Zastosuj",
        });
        return;
      }
    }
    setManualPathPoints(sShapePathPoints.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })));
    setShowPickingPath(true);
  }, [sShapePathPoints, manualPathPoints.length]);

  const handleExportPdf = useCallback(async () => {
    const el = canvasContainerRef.current;
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#0f172a" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height / canvas.width) * w;
      const fitH = Math.min(imgH, h - 42);
      pdf.addImage(imgData, "PNG", 0, 0, w, fitH);
      pdf.setFontSize(9);
      pdf.setTextColor(60, 60, 60);
      const yLeg = fitH + 8;
      pdf.text(`Magazyn: ${layout.warehouse_name || layout.name || "—"}  |  Data eksportu: ${new Date().toLocaleString("pl-PL")}`, 10, yLeg);
      pdf.text(`Skala: 1 komórka = ${GRID_UNIT_CM} cm`, 10, yLeg + 6);
      pdf.text("Legenda: Zielony = niska zajętość (0–50%), Żółty = średnia (50–80%), Czerwony = wysoka (80–100%)  |  Niebieski = strefa pakowania  |  Szary = słupy/ściany/drzwi", 10, yLeg + 12);
      pdf.save(`plan-${(layout.name || "export").replace(/\s+/g, "-")}.pdf`);
    } catch (err) {
      console.error(err);
      alert(UI_STRINGS.warehouse.export.pdfFailed);
    }
  }, [layout.warehouse_name, layout.name]);

  const handleExportCsv = useCallback(() => {
    const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const headers = ["id", "aisle_letter", "rack_index", "x", "y", "width", "height", "width_cm", "length_cm", "height_cm", "levels", "bins_per_level"];
    const rows = layout.racks.map((r) =>
      headers.map((h) => escape(String((r as Record<string, unknown>)[h] ?? ""))).join(",")
    );
    const csv = "\uFEFF" + headers.join(",") + "\r\n" + rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `layout-${(layout.name || "export").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [layout.racks, layout.name]);

  const handleExportLocationsMapCsv = useCallback(() => {
    const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const headers = ["locationUUID", "name", "capacity_dm3"];
    const rows: string[] = [];
    for (const rack of layout.racks) {
      for (const bin of rack.bins ?? []) {
        const uuid = (bin as { locationUUID?: string }).locationUUID ?? (bin as { location_uuid?: string }).location_uuid ?? "";
        const name = (bin as { label?: string }).label ?? (bin as { location_id?: string }).location_id ?? uuid;
        const capacity = (bin as { volume_dm3?: number }).volume_dm3 ?? 0;
        rows.push([escape(uuid), escape(String(name)), String(capacity)].join(","));
      }
    }
    const csv = "\uFEFF" + headers.join(",") + "\r\n" + rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mapa-lokalizacji-${(layout.name || "export").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [layout.racks, layout.name]);

  const handleExportJson = useCallback(() => {
    const json = JSON.stringify({ ...layout, updatedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `layout-${(layout.name || "export").replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [layout]);

  const handleCanvasMouseLeave = useCallback(() => {
    setCursorCm(null);
    setGhostPosition(null);
    setDraggingRackId(null);
    setDragOffset(null);
    setDraggingVisualId(null);
    setDragOffsetVisual(null);
    setRowDrawEnd(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const inInput = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || (document.activeElement as HTMLElement).isContentEditable);
        if (inInput) return;
        if (mainView === "layout" && selectedRowContainerId && deleteSelectedRow) {
          e.preventDefault();
          deleteSelectedRow();
          return;
        }
        if (!selectedObjectId) return;
        if (mainView !== "magazyn") {
          e.preventDefault();
          deleteObject(selectedObjectId);
        }
      }
      if (e.code === "Space" || e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (placementMode) setRackRotation((prev) => (prev === "vertical" ? "horizontal" : "vertical"));
      }
      if (e.key === "Escape") {
        setPlacementMode(false);
        setLayoutMode(LayoutMode.SELECT);
        setGhostPosition(null);
        setRowToolTemplate(null);
        setRowDrawStart(null);
        setRowDrawEnd(null);
        setSelectedRowContainerId(null);
        setSelectedRowContainerIds([]);
        setSelectedRackId(null);
        setSelectedRackIds([]);
        setSelectedVisualId(null);
        setSelectedVisualIds([]);
        setSelectedPathPointIndex(null);
        setSelectedPathLine(false);
        setMarqueeStart(null);
        setMarqueeEnd(null);
        setAisleDrawStart(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (selectedRackIds.length > 0) {
          e.preventDefault();
          setClipboard(layout.racks.filter((r) => selectedRackIds.includes(r.id ?? r.rack_index)));
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (clipboard.length > 0 && cursorCm != null) {
          e.preventDefault();
          const cx = Math.round(cursorCm.x / GRID_UNIT_CM);
          const cy = Math.round(cursorCm.y / GRID_UNIT_CM);
          setLayout((prev) => ({
            ...prev,
            racks: [
              ...prev.racks,
              ...clipboard.map((r, i) => {
                const lc = getLevelConfig(r);
                const total = getTotalLocations(lc);
                const volPerBin = total > 0 ? volumePerBinFromTotal(r.width_cm, r.length_cm, r.height_cm, total) : volumePerBin(r.width_cm, r.length_cm, r.height_cm, r.levels, r.bins_per_level);
                const bins = createBinsForRack(r.aisle_letter, prev.racks.length + i + 1, r.levels, r.bins_per_level, volPerBin, undefined, undefined, r.width_cm, r.length_cm, r.height_cm, undefined, undefined, undefined, undefined, undefined, lc);
                return { ...r, id: undefined, x: cx + (i % 3) * (r.width + 1), y: cy + Math.floor(i / 3) * (r.height + 1), rack_index: prev.racks.length + i + 1, bins };
              }),
            ],
          }));
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        if (mainView !== "magazyn" && selectedRackIds.length > 0) {
          const toDup = layout.racks.filter((r) => selectedRackIds.includes(r.id ?? r.rack_index));
          if (toDup.length > 0 && cursorCm != null) {
            const cx = Math.round(cursorCm.x / GRID_UNIT_CM);
            const cy = Math.round(cursorCm.y / GRID_UNIT_CM);
            setLayout((prev) => ({
              ...prev,
              racks: [
                ...prev.racks,
                ...toDup.map((r, i) => {
                  const lc = getLevelConfig(r);
                  const total = getTotalLocations(lc);
                  const volPerBin = total > 0 ? volumePerBinFromTotal(r.width_cm, r.length_cm, r.height_cm, total) : volumePerBin(r.width_cm, r.length_cm, r.height_cm, r.levels, r.bins_per_level);
                  const bins = createBinsForRack(r.aisle_letter, prev.racks.length + i + 1, r.levels, r.bins_per_level, volPerBin, undefined, undefined, r.width_cm, r.length_cm, r.height_cm, undefined, undefined, undefined, undefined, undefined, lc);
                  return { ...r, id: undefined, x: cx + (i % 3) * (r.width + 1), y: cy + Math.floor(i / 3) * (r.height + 1), rack_index: prev.racks.length + i + 1, bins };
                }),
              ],
            }));
            setSnackbar({ message: "Sklonowano regały.", undo: () => setSnackbar(null) });
          }
        } else if (mainView !== "magazyn" && selectedVisualIds.length > 0) {
          const toDup = (layout.visual_elements ?? []).filter((ve) => selectedVisualIds.includes(ve.id));
          if (toDup.length > 0 && cursorCm != null) {
            const cx = Math.round(cursorCm.x / GRID_UNIT_CM);
            const cy = Math.round(cursorCm.y / GRID_UNIT_CM);
            const newEls: VisualElementState[] = toDup.map((ve, i) => ({
              ...ve,
              id: `ve-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
              x: cx + (i % 2) * 2,
              y: cy + Math.floor(i / 2) * 2,
            }));
            setLayout((prev) => ({ ...prev, visual_elements: [...(prev.visual_elements ?? []), ...newEls] }));
            setSelectedVisualIds(newEls.map((e) => e.id));
            setSelectedVisualId(newEls[0]?.id ?? null);
            setSnackbar({ message: "Sklonowano elementy.", undo: () => setSnackbar(null) });
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placementMode, selectedObjectId, deleteObject, deleteSelectedRow, clipboard, cursorCm, layout.racks, layout.visual_elements, mainView, selectedRackIds.length, selectedRowContainerId, selectedVisualIds.length]);

  const deleteSelectedRack = useCallback(() => {
    if (selectedRackId == null) return;
    setLayout((prev) => ({
      ...prev,
      racks: prev.racks.filter((r) => (r.id ?? r.rack_index) !== selectedRackId),
    }));
    setSelectedRackId(null);
  }, [selectedRackId]);
  void deleteSelectedRack;

  const totalCapacity = layout.racks.reduce((sum, r) => sum + (r.total_capacity_dm3 ?? r.bins.reduce((s, b) => s + (b.volume_dm3 ?? 0), 0)), 0);
  /** Volume (dm³) of all assigned products – location_id or assignedLocations; decimals parsed safely (comma → dot). */
  const productsAssignedVolumeDm3 = useMemo(() => {
    let total = 0;
    for (const p of products) {
      const vol = safeVolumeDm3(p.volume_dm3);
      if (p.assignedLocations?.length) {
        for (const a of p.assignedLocations) total += safeQuantity(a.quantity) * vol;
      } else if (p.location_id != null && p.location_id.trim() !== "") {
        total += safeQuantity(p.quantity) * vol;
      }
    }
    return total;
  }, [products]);
  const totalUsed = productsAssignedVolumeDm3;
  const utilizationPct = totalCapacity > 0 ? (productsAssignedVolumeDm3 / totalCapacity) * 100 : 0;

  /** Per-rack occupancy % for full map coloring (green / yellow / red). */
  const rackOccupancyPct = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of layout.racks) {
      let used = 0;
      let total = 0;
      for (const b of r.bins ?? []) {
        used += usedVolumeAtBin(b);
        total += binVolumeDm3(b, r);
      }
      const rid = String(r.id ?? r.rack_index);
      out[rid] = total > 0 ? (used / total) * 100 : 0;
    }
    return out;
  }, [layout.racks, usedVolumeAtBin]);

  const cellPx = BASE_PX_PER_CELL;
  const width = layout.grid_cols * cellPx;
  const height = layout.grid_rows * cellPx;

  const ghostCollision = placementMode && ghostPosition && layout.racks.some((r) =>
    rectsOverlap(
      { x: ghostPosition.x, y: ghostPosition.y, width: ghostW, height: ghostH },
      { x: r.x, y: r.y, width: r.width, height: r.height }
    )
  );
  const dragCollisionRackId =
    draggingRackId != null && selectedRackIds.length <= 1
      ? layout.racks.find((r) => {
          const key = r.id ?? r.rack_index;
          if (key !== draggingRackId) return false;
          return layout.racks.some(
            (other) =>
              (other.id ?? other.rack_index) !== draggingRackId &&
              rectsOverlap(
                { x: r.x, y: r.y, width: r.width, height: r.height },
                { x: other.x, y: other.y, width: other.width, height: other.height }
              )
          );
        })
      : null;
  const groupDragInvalid = useMemo(() => {
    if (draggingRackId == null || selectedRackIds.length <= 1 || !rackDragPreviewPositions) return false;
    const positions = new Map<number | string, { x: number; y: number }>();
    for (const id of selectedRackIds) {
      const pos = rackDragPreviewPositions[String(id)];
      if (pos) positions.set(id, pos);
    }
    if (positions.size !== selectedRackIds.length) return true;
    return !canPlaceGroup(layout, new Set(selectedRackIds), positions);
  }, [layout, draggingRackId, selectedRackIds, rackDragPreviewPositions]);
  const collisionRackId = groupDragInvalid
    ? draggingRackId
    : (dragCollisionRackId ? (dragCollisionRackId.id ?? dragCollisionRackId.rack_index) : null);
  const collisionRackIds = groupDragInvalid ? selectedRackIds : null;

  /** Visual-only: dimension lines and aisle highlights from selection/drag to nearest objects. READ-ONLY – never modifies layout, row_containers, or slots. */
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

  const selectedRack = layout.racks.find((r) => (r.id != null && r.id === selectedRackId) || r.rack_index === selectedRackId);
  const selectedRacks = layout.racks.filter((r) => selectedRackIds.includes(r.id ?? r.rack_index));
  const isMultiSelect = selectedRackIds.length > 1;

  const summaryByTemplate = useMemo(() => {
    const keyToRacks = new Map<string, RackState[]>();
    for (const r of layout.racks) {
      const key = r.templateId ?? "__preset__";
      if (!keyToRacks.has(key)) keyToRacks.set(key, []);
      keyToRacks.get(key)!.push(r);
    }
    return Array.from(keyToRacks.entries()).map(([templateKey, racks]) => {
      const first = racks[0]!;
      const template = templateKey !== "__preset__" ? customTemplates.find((t) => t.id === templateKey) : null;
      const templateName = template?.name ?? UI_STRINGS.warehouse.summary.presetLabel;
      const color = template?.color ?? first.color ?? "#3b82f6";
      const totalRacks = racks.length;
      const totalBins = racks.reduce((n, r) => n + (r.bins?.length ?? 0), 0);
      const reserveCount = racks.reduce((n, r) => n + (r.bins?.filter((b) => b.storage_type === "reserve").length ?? 0), 0);
      const capacityDm3 = racks.reduce((sum, r) => sum + (r.total_capacity_dm3 ?? r.bins.reduce((s, b) => s + (b.volume_dm3 ?? 0), 0)), 0);
      return {
        templateKey,
        templateName,
        color,
        width_cm: first.width_cm,
        depth_cm: first.length_cm,
        height_cm: first.height_cm,
        totalRacks,
        totalBins,
        reserveCount,
        capacityDm3,
      };
    });
  }, [layout.racks, customTemplates]);

  const onSaveInternalLayout = useCallback(
    (internal_structure: InternalStructure, bins: BinState[] | undefined) => {
      setLayout((prev) => ({
        ...prev,
        racks: prev.racks.map((r) =>
          (r.id ?? r.rack_index) === internalLayoutRackId
            ? { ...r, internal_structure, ...(bins ? { bins } : {}) }
            : r
        ),
      }));
      setInternalLayoutRackId(null);
    },
    [internalLayoutRackId]
  );

  const editProductModalProps = useMemo((): EditProductModalProps | null => {
    if (mainView !== "layout" || editingProductId == null || showElevationForRackId == null) return null;
    const rackForModal = layout.racks.find((r) => String(r.id ?? r.rack_index) === String(showElevationForRackId)) ?? null;
    if (!rackForModal) return null;
    return {
      product: editingProductId === "new" ? null : products.find((p) => p.id === editingProductId) ?? null,
      locationOptions: rackForModal.bins.map((b) => ({ value: b.label ?? b.location_id ?? "", label: b.label ?? b.location_id ?? "" })),
      positionsForPicker: getAllPositionsFromRacks(layout.racks),
      initialLocationId: undefined,
      getBinCapacityDm3: (locId) => {
        const b = rackForModal.bins.find((bin) => (bin.label ?? bin.location_id) === locId);
        return b ? binVolumeDm3(b, rackForModal) : 0;
      },
      getBinUsedVolumeDm3: (locId, excludeProductId) =>
        products
          .filter((p) => p.location_id === locId && p.id !== excludeProductId)
          .reduce((s, p) => s + safeQuantity(p.quantity) * safeVolumeDm3(p.volume_dm3), 0),
      getMaxQuantityByUUID: (locationUUID, excludeProductId, volumePerUnitDm3) => {
        const rack = layout.racks.find((r) =>
          (r.rackLevels ?? binsToLevels(r.bins ?? [])).some((lev) =>
            lev.positions.some((pos) => pos.locationUUID === locationUUID)
          )
        );
        if (!rack) return undefined;
        const bin = rack.bins.find((b) => b.locationUUID === locationUUID);
        if (!bin) return undefined;
        const capacityDm3 = binVolumeDm3(bin, rack);
        if (capacityDm3 <= 0) return undefined;
        let usedDm3 = 0;
        for (const p of products) {
          if (p.id === excludeProductId) continue;
          const vol = safeVolumeDm3(p.volume_dm3);
          if (p.assignedLocations?.length) {
            const a = p.assignedLocations.find((a) => a.locationUUID === locationUUID);
            if (a) usedDm3 += safeQuantity(a.quantity) * vol;
          } else if ((p.location_id && bin.label === p.location_id) || (bin.location_id && p.location_id === bin.location_id))
            usedDm3 += safeQuantity(p.quantity) * vol;
        }
        const freeDm3 = Math.max(0, capacityDm3 - usedDm3);
        if (volumePerUnitDm3 == null || volumePerUnitDm3 <= 0) return undefined;
        return Math.floor(freeDm3 / volumePerUnitDm3);
      },
      getUsedVolumeDm3ByUUID: (locationUUID) => {
        const excludeProductId = editingProductId === "new" ? undefined : editingProductId;
        let usedDm3 = 0;
        for (const p of products) {
          if (p.id === excludeProductId) continue;
          const vol = safeVolumeDm3(p.volume_dm3);
          if (p.assignedLocations?.length) {
            const a = p.assignedLocations.find((a) => a.locationUUID === locationUUID);
            if (a) usedDm3 += safeQuantity(a.quantity) * vol;
          } else {
            const rack = layout.racks.find((r) =>
              (r.rackLevels ?? binsToLevels(r.bins ?? [])).some((lev) =>
                lev.positions.some((pos) => pos.locationUUID === locationUUID)
              )
            );
            const bin = rack?.bins.find((b) => b.locationUUID === locationUUID);
            if (bin && ((p.location_id && bin.label === p.location_id) || (bin.location_id && p.location_id === bin.location_id)))
              usedDm3 += safeQuantity(p.quantity) * vol;
          }
        }
        return usedDm3;
      },
      getAvailableQuantity: (key, excludeProductId) => {
        const sameProduct = (p: WarehouseProduct) => {
          if (p.name.trim().toLowerCase() !== key.name.trim().toLowerCase()) return false;
          if (key.sku?.trim()) return p.sku?.trim() === key.sku.trim();
          if (key.ean?.trim()) return p.ean?.trim() === key.ean.trim();
          return true;
        };
        const assigned = products
          .filter((p) => sameProduct(p) && p.id !== excludeProductId)
          .reduce((s, p) => s + (p.assignedLocations?.reduce((t, a) => t + a.quantity, 0) ?? p.quantity), 0);
        return Math.max(0, 999999 - assigned);
      },
      onSave: (payload) => {
        const next = {
          ...payload,
          location_id: payload.location_id || null,
          assignedLocations: payload.assignedLocations,
          image_url: payload.image_url ?? undefined,
        };
        if (editingProductId !== "new" && editingProductId != null) {
          setProducts((prev) => prev.map((q) => (q.id === editingProductId ? { ...q, ...next } : q)));
          const numericId = Number(editingProductId);
          if (Number.isInteger(numericId) && numericId > 0) {
            api.put(`/products/${numericId}/`, {
              name: next.name,
              ean: next.ean ?? "",
              symbol: next.sku ?? "",
              assigned_locations: next.assignedLocations ?? [],
              tenant_id: TENANT_ID,
            }, { params: { tenant_id: TENANT_ID } }).catch(() => {});
          }
        } else {
          setProducts((prev) => [...prev, { ...next, id: `p${Date.now()}` }]);
        }
        setEditingProductId(null);
      },
      onClose: () => setEditingProductId(null),
    };
  }, [
    mainView,
    editingProductId,
    showElevationForRackId,
    layout.racks,
    products,
    safeQuantity,
    safeVolumeDm3,
    binVolumeDm3,
    binsToLevels,
    getAllPositionsFromRacks,
  ]);

  return (
    <PageLayout
      fillHeight
      title={UI_STRINGS.warehouse.title}
      actions={
        <>
          <nav className="flex rounded-xl bg-slate-100 p-0.5 border border-slate-100 shadow-sm" aria-label="Tryby">
            <button
              type="button"
              onClick={() => { setMainView("magazyn"); setEditingProductId(null); const next = new URLSearchParams(searchParams); next.delete("view"); setSearchParams(next); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mainView === "magazyn" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-slate-200"}`}
            >
              {UI_STRINGS.warehouse.designerSubTabs.magazyn}
            </button>
            <button
              type="button"
              onClick={() => { setMainView("layout"); const next = new URLSearchParams(searchParams); next.set("view", "layout"); setSearchParams(next); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mainView === "layout" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-slate-200"}`}
            >
              {UI_STRINGS.warehouse.designerSubTabs.layoutDesigner}
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <select
              value={selectedWarehouseId ?? ""}
              onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2 min-w-[200px] focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
            >
              <option value="">{UI_STRINGS.warehouse.selector.selectWarehouse}</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>{wh.name}</option>
              ))}
            </select>
            {layout.warehouse_name ? (
              <span className="text-sm text-slate-600">{layout.warehouse_name}</span>
            ) : null}
            <span className={`text-xs font-mono px-2 py-1 rounded ${lastSavedAt != null ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`} title={lastSavedAt != null ? UI_STRINGS.warehouse.selector.savedToDb : UI_STRINGS.warehouse.selector.unsavedChanges}>
              {lastSavedAt != null ? UI_STRINGS.warehouse.selector.syncSaved : UI_STRINGS.warehouse.selector.notSaved}
            </span>
          </div>
        </>
      }
    >
      <WarehouseModals
        showCreateWarehouse={showCreateWarehouse}
        onCloseCreateWarehouse={() => setShowCreateWarehouse(false)}
        newWarehouseName={newWarehouseName}
        onNewWarehouseNameChange={setNewWarehouseName}
        onCreateWarehouse={createWarehouse}
        mainView={mainView}
        showElevationForRackId={showElevationForRackId}
        layout={layout}
        setShowElevationForRackId={setShowElevationForRackId}
        setSelectedBinForFilter={setSelectedBinForFilter}
        products={products}
        selectedBinForFilter={selectedBinForFilter}
        setEditingProductId={setEditingProductId}
        internalLayoutRackId={internalLayoutRackId}
        onSaveInternalLayout={onSaveInternalLayout}
        onCloseInternalLayout={() => setInternalLayoutRackId(null)}
        editProductModalProps={editProductModalProps}
        snackbar={snackbar}
        setSnackbar={setSnackbar}
      />

      <div className="flex flex-1 min-h-0 -mx-6 -mb-6">
        {mainView === "magazyn" ? (
          <div className="w-[250px] shrink-0 flex flex-col min-h-0 overflow-hidden gap-3">
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-black uppercase text-slate-500 mb-3">Pulpit magazynu</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-600 text-sm">Liczba regałów</span>
                  <span className="font-mono font-bold text-[#1E293B]">{layout.racks.length}</span>
                </div>
                <div className="border-t border-slate-100 pt-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Regały wg typu</p>
                  <ul className="space-y-1">
                    {summaryByTemplate.map(({ templateName, totalRacks, color }) => (
                      <li key={templateName} className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-slate-700 truncate">{templateName}</span>
                        </span>
                        <span className="font-mono font-semibold text-slate-800">{totalRacks}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-slate-100 pt-2">
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-slate-600">Zajętość (dm³)</span>
                    <span className="font-mono font-semibold text-[#1E293B]">{formatVolume(productsAssignedVolumeDm3)} / {formatVolume(totalCapacity)}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${utilizationPct <= 50 ? "bg-emerald-500" : utilizationPct <= 80 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(100, utilizationPct)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Wykorzystanie: <span className="font-mono font-semibold text-slate-700">{utilizationPct.toFixed(1)}%</span></p>
                </div>
              </div>
            </div>
            <RackSidebar
            layout={layout}
            selectedRackId={selectedRackId}
            selectedRackIds={selectedRackIds}
            setSelectedRackId={setSelectedRackId}
            setSelectedRackIds={setSelectedRackIds}
            setDraggingFromCatalog={setDraggingFromCatalog}
            setCatalogGhostPosition={setCatalogGhostPosition}
            customTemplates={customTemplates}
            setCustomTemplates={setCustomTemplates}
            editingTemplateId={editingTemplateId}
            setEditingTemplateId={setEditingTemplateId}
            onSaveEditTemplate={onSaveEditTemplate}
            onSaveNewTemplate={saveNewTemplate}
            onDeleteTemplate={deleteTemplate}
            setLayout={setLayout}
            rowToolActive={rowToolActive}
            rowToolTemplate={rowToolTemplate}
            setRowToolTemplate={setRowToolTemplate}
            rowGapCm={rowGapCm}
            setRowGapCm={setRowGapCm}
            draggingVisualType={draggingVisualType}
            setDraggingVisualType={setDraggingVisualType}
            setVisualGhostPosition={setVisualGhostPosition}
            saveLayout={saveLayout}
            saving={saving}
            selectedWarehouseId={selectedWarehouseId}
            totalUsed={totalUsed}
            totalCapacity={totalCapacity}
            onExportPdf={handleExportPdf}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            onExportLocationsMapCsv={handleExportLocationsMapCsv}
            currentRowPrefix={currentRowPrefix}
            setCurrentRowPrefix={setCurrentRowPrefix}
            onReindexRow={(rackId, prefix) => setLayout((prev) => ({ ...prev, racks: rackId != null ? reindexGeometricRow(prev.racks, rackId) : reindexRowByPrefix(prev.racks, prefix) }))}
            showOnlyCatalog
          />
          </div>
        ) : mainView === "layout" ? (
          <RackSidebar
            layout={layout}
            selectedRackId={selectedRackId}
            selectedRackIds={selectedRackIds}
            setSelectedRackId={setSelectedRackId}
            setSelectedRackIds={setSelectedRackIds}
            setDraggingFromCatalog={setDraggingFromCatalog}
            setCatalogGhostPosition={setCatalogGhostPosition}
            customTemplates={customTemplates}
            setCustomTemplates={setCustomTemplates}
            editingTemplateId={editingTemplateId}
            setEditingTemplateId={setEditingTemplateId}
            onSaveEditTemplate={onSaveEditTemplate}
            onSaveNewTemplate={saveNewTemplate}
            onDeleteTemplate={deleteTemplate}
            setLayout={setLayout}
            rowToolActive={rowToolActive}
            rowToolTemplate={rowToolTemplate}
            setRowToolTemplate={setRowToolTemplate}
            rowGapCm={rowGapCm}
            setRowGapCm={setRowGapCm}
            draggingVisualType={draggingVisualType}
            setDraggingVisualType={setDraggingVisualType}
            setVisualGhostPosition={setVisualGhostPosition}
            saveLayout={saveLayout}
            saving={saving}
            selectedWarehouseId={selectedWarehouseId}
            totalUsed={totalUsed}
            totalCapacity={totalCapacity}
            onExportPdf={handleExportPdf}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            onExportLocationsMapCsv={handleExportLocationsMapCsv}
            currentRowPrefix={currentRowPrefix}
            setCurrentRowPrefix={setCurrentRowPrefix}
            onReindexRow={(rackId, prefix) => setLayout((prev) => ({ ...prev, racks: rackId != null ? reindexGeometricRow(prev.racks, rackId) : reindexRowByPrefix(prev.racks, prefix) }))}
          />
        ) : null}

        {mainView === "magazyn" ? (
          <>
            <div className="flex-1 min-w-0 flex flex-col bg-white rounded-xl border border-slate-100 shadow-md overflow-hidden" style={{ height: "calc(100vh - 200px)", minHeight: 0 }}>
              {layout.racks.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 p-8 text-slate-500">
                  <p className="text-sm">Brak regałów. Przejdź do Projektu Layoutu, aby dodać regały i zobaczyć widok z boku.</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col shrink-0">
                    {selectedRackIdForSideView == null ? (
                      <WarehouseFullMap
                        layout={layout}
                        selectedRackId={null}
                        rackOccupancyPct={rackOccupancyPct}
                        onSelectRack={(id) => {
                          setSelectedRackIdForSideView(id);
                          setSelectedLocationForProducts(null);
                          setProductSearchQuery("");
                          setShowAllProductsInSidebar(false);
                        }}
                      />
                    ) : (() => {
                const rack = displayRack ?? selectedRackForMagazyn;
                const used = rack ? rack.bins.reduce((s, b) => s + binUsedVolumeDm3(b), 0) : 0;
                const total = rack ? (rack.total_capacity_dm3 ?? rack.bins.reduce((s, b) => s + binVolumeDm3(b, rack), 0)) : 0;
                const occupancyPct = total > 0 ? (used / total) * 100 : 0;
                const rackIdLabel = rack ? getRackDisplayId(rack) : "";
                return (
                  <>
                    <div className="shrink-0 flex items-center gap-3 p-3 border-b border-slate-100 bg-slate-50/50">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRackIdForSideView(null);
                          setSelectedLocationForProducts(null);
                          setProductSearchQuery("");
                          setShowAllProductsInSidebar(false);
                        }}
                        className="flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-700 hover:underline"
                      >
                        <span aria-hidden>←</span> Powrót do mapy
                      </button>
                      {rack && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span className="text-xs font-bold text-slate-600 uppercase shrink-0">REGAŁ {rackIdLabel} – ZAJĘTOŚĆ</span>
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-sm font-mono text-[#1E293B] shrink-0">{formatVolume(used)} / {formatVolume(total)} dm³</span>
                            <div className="flex-1 min-w-0 h-2.5 rounded-full bg-slate-200 overflow-hidden max-w-xs">
                              <div
                                className={`h-full rounded-full transition-all ${occupancyPct <= 50 ? "bg-emerald-500" : occupancyPct <= 80 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${Math.min(100, occupancyPct)}%` }}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    {rack && (
                      <div className="flex-1 min-h-0 overflow-hidden flex flex-col shrink-0" style={{ minHeight: 0 }}>
                        <RackSideViewGrid
                          rack={displayRack ?? rack}
                          onBinClick={(level_index, segment_index) => setSelectedLocationForProducts({ level_index, segment_index })}
                          selectedLocation={selectedLocationForProducts}
                          binItemCounts={binItemCounts}
                          binUniqueProductCounts={binUniqueProductCounts}
                        />
                      </div>
                    )}
                  </>
                );
                    })()}
                  </div>
                  <WarehouseLegend
                    viewMode={selectedRackIdForSideView == null ? "fullMap" : "rackDetail"}
                    stats={{ rackCount: layout.racks.length, usedDm3: totalUsed, totalDm3: totalCapacity }}
                  />
                </>
              )}
            </div>
            {mainView === "magazyn" && selectedRackIdForSideView != null && layout.racks.some((r) => String(r.id ?? r.rack_index) === String(selectedRackIdForSideView)) && (
              <aside className="w-[300px] shrink-0 self-start flex-none flex flex-col h-fit max-h-[calc(100vh-200px)] overflow-y-auto bg-slate-800 border-l border-slate-700 rounded-r-xl overflow-x-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-600 shrink-0">
                  <h2 className="text-xs font-black uppercase text-slate-300">PRODUKTY W REGALE</h2>
                  {/* Read-only in Magazyn: no Add/Edit – only in Projektant Layoutu */}
                </div>
                <div className="p-3 flex flex-col gap-2 flex-none">
                  <input
                    type="text"
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    placeholder="Szukaj (nazwa, SKU)..."
                    className="w-full rounded-lg border border-slate-600 bg-slate-700/50 text-slate-100 placeholder-slate-500 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                  {selectedLocationForProducts != null && selectedRackForMagazyn && (
                    <label className="flex items-center gap-2 text-slate-400 text-xs">
                      <input
                        type="checkbox"
                        checked={showAllProductsInSidebar}
                        onChange={(e) => setShowAllProductsInSidebar(e.target.checked)}
                        className="rounded border-slate-500"
                      />
                      Pokaż wszystkie produkty
                    </label>
                  )}
                  {(() => {
                    const selectedBin = selectedLocationForProducts != null && selectedRackForMagazyn
                      ? selectedRackForMagazyn.bins.find((b) => b.level_index === selectedLocationForProducts.level_index && b.segment_index === selectedLocationForProducts.segment_index)
                      : null;
                    const selectedBinLabel = selectedBin ? (selectedBin.label ?? selectedBin.location_id ?? "").trim() || null : null;
                    const selectedBinUUID = selectedBin?.locationUUID ?? null;
                    const filterToSingleBin = selectedBinLabel != null && !showAllProductsInSidebar;
                    const baseList = selectedRackForMagazyn
                      ? products.filter((p) => {
                          if (filterToSingleBin) {
                            if (p.assignedLocations?.length && selectedBinUUID) {
                              return p.assignedLocations.some((a) => a.locationUUID === selectedBinUUID);
                            }
                            return p.location_id === selectedBinLabel;
                          }
                          if (p.assignedLocations?.length) {
                            return p.assignedLocations.some((a) => selectedRackBinUUIDs.has(a.locationUUID));
                          }
                          return p.location_id != null && selectedRackBinLabels.has(p.location_id);
                        })
                      : [];
                    const q = productSearchQuery.trim().toLowerCase();
                    const list = q
                      ? baseList.filter((p) =>
                          (p.name ?? "").toLowerCase().includes(q) ||
                          (p.sku ?? "").toLowerCase().includes(q) ||
                          (p.ean ?? "").toLowerCase().includes(q)
                        )
                      : baseList;
                    const isReserveLocation = selectedBin?.storage_type === "reserve";
                    return (
                      <div className="space-y-3 flex-none min-h-0">
                        {filterToSingleBin && isReserveLocation && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-[#FFCC99] border border-amber-300 px-2 py-1.5 text-amber-900 text-xs">
                            <span title="Lokalizacja zapasowa (Rezerwa)" aria-label="Lokalizacja zapasowa (Rezerwa)">🔒</span>
                            <span>Lokalizacja zapasowa (Rezerwa)</span>
                          </div>
                        )}
                        {list.length === 0 ? (
                          <p className="text-slate-400 text-sm text-center py-6">
                            {selectedRackForMagazyn ? "Brak produktów w tym regale" : "Brak produktów"}
                          </p>
                        ) : (
                          list.map((p) => {
                            const quantityAtLocation = filterToSingleBin && selectedBinUUID && p.assignedLocations?.length
                              ? safeQuantity(p.assignedLocations.find((a) => a.locationUUID === selectedBinUUID)?.quantity ?? p.quantity)
                              : safeQuantity(p.quantity);
                            const volumeAtLocation = quantityAtLocation * safeVolumeDm3(p.volume_dm3);
                            const imageUrl = getProductImageUrl(p);
                            return (
                            <div
                              key={p.id}
                              className={`rounded-xl border p-3 shadow flex items-start gap-3 ${
                                isReserveLocation ? "border-amber-400 bg-slate-700/80 ring-1 ring-amber-400/50" : "border-slate-600 bg-slate-700/80"
                              }`}
                            >
                              <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-slate-600 border border-slate-500">
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                                {imageUrl && (
                                  <img
                                    src={imageUrl}
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-cover z-10"
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                  />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-slate-100 break-words line-clamp-2">{p.name}</div>
                                <div className="text-xs text-slate-400 mt-1 truncate">SKU: {p.sku ?? "—"} · EAN: {p.ean ?? "—"}</div>
                                <div className="text-xs text-slate-300 mt-1">Sztuki: <span className="font-mono font-semibold text-slate-100">{quantityAtLocation}</span></div>
                                <div className="text-xs text-slate-300 mt-0.5">Objętość: <span className="font-mono font-semibold text-cyan-300">{formatVolume(volumeAtLocation)} dm³</span>{selectedBinLabel ? ` · ${selectedBinLabel}` : p.location_id ? ` · ${p.location_id}` : ""}</div>
                              </div>
                              {/* Magazyn view is read-only: no Edit / Remove from location buttons */}
                            </div>
                          ); })
                        )}
                      </div>
                    );
                  })()}
                </div>
                {/* EditProductModal only openable from Layout (Widok z boku); not rendered in Magazyn */}
              </aside>
            )}
          </>
        ) : mainView === "layout" ? (
          <WarehouseMainView
            layout={layout}
            selectedWarehouseId={selectedWarehouseId}
            loading={loading}
            zoom={zoom}
            setZoom={setZoom}
            pan={pan}
            setPan={setPan}
            placementMode={placementMode}
            ghostPosition={ghostPosition}
            ghostW={ghostW}
            ghostH={ghostH}
            ghostCollision={ghostCollision ?? false}
            draggingFromCatalog={draggingFromCatalog}
            catalogGhostPosition={catalogGhostPosition}
            setCatalogGhostPosition={setCatalogGhostPosition}
            stampRackFromCatalogItem={stampRackFromCatalogItem}
            stampRackIntoSlot={stampRackIntoSlot}
            getCatalogDropCell={getCatalogDropCell}
            setCatalogHoveredSlotFromCell={setCatalogHoveredSlotFromCell}
            setCatalogHoveredSlot={setCatalogHoveredSlot}
            catalogHoveredSlot={catalogHoveredSlot}
            getCellFromEvent={getCellFromEvent}
            minEmptySlotWidthCells={rowToolTemplate ? cmToCells(getCatalogItemSpec(rowToolTemplate).width_cm) : undefined}
            minEmptySlotDepthCells={rowToolTemplate ? cmToCells(getCatalogItemSpec(rowToolTemplate).depth_cm) : undefined}
            snapPosition={snapPosition}
            rectsOverlap={rectsOverlap}
            cellPx={cellPx}
            width={width}
            height={height}
            svgRef={svgRef}
            canvasContainerRef={canvasContainerRef}
            onMouseMove={handleCanvasMouseMove}
            onMouseDown={handleCanvasMouseDown}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
            panMode={panMode}
            isPanning={isPanning}
            selectedRackIds={selectedRackIds}
            collisionRackId={collisionRackId}
            collisionRackIds={collisionRackIds}
            selectedRack={selectedRack}
            isMultiSelect={isMultiSelect}
            setInternalLayoutRackId={setInternalLayoutRackId}
            setShowElevationForRackId={setShowElevationForRackId}
            setLayout={setLayout}
            setSelectedRackId={setSelectedRackId}
            setSelectedRackIds={setSelectedRackIds}
            marqueeStart={marqueeStart}
            marqueeEnd={marqueeEnd}
            cursorCm={cursorCm}
            draggingRackId={draggingRackId}
            rackDragPreviewPosition={rackDragPreviewPosition}
            rackDragPreviewPositions={rackDragPreviewPositions}
            dragSlotHighlights={dragSlotHighlights}
            defaultRowSlotW={DEFAULT_ROW_SLOT_W}
            defaultRowSlotH={DEFAULT_ROW_SLOT_H}
            selectedRowContainerId={selectedRowContainerId}
            selectedRowContainerIds={selectedRowContainerIds}
            onSelectRowContainer={onSelectRowContainer}
            fillSelectedRowWithTemplate={fillSelectedRowWithTemplate}
            deleteSelectedRow={deleteSelectedRow}
            trimSelectedRowEnd={trimSelectedRowEnd}
            rotateSelectedRow={rotateSelectedRow}
            draggingRowId={draggingRowId}
            rowDragPreviewStart={rowDragPreviewStart}
            onStartRowDrag={onStartRowDrag}
            aisleToolActive={aisleToolActive}
            setAisleToolActive={setAisleToolActive}
            rowToolActive={rowToolActive}
            setRowToolActive={setRowToolActive}
            setRowToolTemplate={setRowToolTemplate}
            rowToolTemplate={rowToolTemplate}
            rowDrawStart={rowDrawStart}
            rowDrawEnd={rowDrawEnd}
            rowPreviewCursor={rowPreviewCursor}
            rowGapCm={rowGapCm}
            setRowGapCm={setRowGapCm}
            aisleWidthCm={aisleWidthCm}
            setAisleWidthCm={setAisleWidthCm}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            showDimensions={showDimensions}
            setShowDimensions={setShowDimensions}
            dimensionLines={dimensionData.dimensionLines}
            aisleHighlights={dimensionData.aisleHighlights}
            snapToGrid={snapToGrid}
            setSnapToGrid={setSnapToGrid}
            showRackLabels={showRackLabels}
            setShowRackLabels={setShowRackLabels}
            selectedAisleIndex={selectedAisleIndex}
            draggingVisualType={draggingVisualType}
            setDraggingVisualType={setDraggingVisualType}
            visualGhostPosition={visualGhostPosition}
            setVisualGhostPosition={setVisualGhostPosition}
            addVisualElement={addVisualElement}
            getDefaultVisualSize={getDefaultVisualSize}
            selectedVisualId={selectedVisualId}
            showPickingPath={showPickingPath}
            setShowPickingPath={setShowPickingPath}
            pickingPathPoints={pickingPathPoints}
            pathToolActive={pathToolActive}
            setPathToolActive={setPathToolActive}
            setLayoutMode={setLayoutMode}
            specialLocations={specialLocations}
            layoutModeLabel={layoutModeDisplay.modeLabel}
            layoutModeColor={layoutModeDisplay.modeColor}
            layoutMode={layoutMode}
            manualPathPoints={manualPathPoints}
            pathDistanceM={pathDistanceM}
            onMagicWand={handleMagicWand}
            selectedVisualIds={selectedVisualIds}
            isLiveView={isLiveView}
            setSelectedVisualId={setSelectedVisualId}
            setSelectedVisualIds={setSelectedVisualIds}
            setSelectedAisleIndex={setSelectedAisleIndex}
            selectedRacks={selectedRacks}
            setClipboard={setClipboard}
            clipboard={clipboard}
          />
        ) : null}
      </div>

    </PageLayout>
  );
}
