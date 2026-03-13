import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import type { RackState, BinState, InternalStructure, LayoutState, RackTemplate, CustomRackTemplate, CatalogItem, VisualElementType, VisualElementState, ColumnShape, DoorStyle, ZoneType, WarehouseProduct, RowContainer, EmptyRowSlot } from "../types/warehouse";
import { GRID_UNIT_CM } from "../types/warehouse";
import { formatVolume, createBinsForRack, binsToLevels, volumePerBin, volumePerBinFromTotal, cmToCells, getCatalogItemSpec, getLevelConfig, getTotalLocations, getNextIndexInRow, ROW_LABEL_ADDRESS_PATTERN, reindexRowByPrefix, reindexGeometricRow, findSnapToRowPosition, getDragSlotHighlights, binUsedVolumeDm3, binVolumeDm3, getRackDisplayId, getAllPositionsFromRacks } from "../components/warehouse/warehouseUtils";
import { RackSidebar } from "../components/warehouse/RackSidebar";
import { RackSideViewGrid } from "../components/warehouse/RackSideViewGrid";
import { WarehouseModals } from "../components/warehouse/WarehouseModals";
import { WarehouseFullMap } from "../components/warehouse/WarehouseFullMap";
import { WarehouseLegend } from "../components/warehouse/WarehouseLegend";
import { MagazynDashboardPanel } from "../components/warehouse/magazyn/MagazynDashboardPanel";
import { MagazynRackDetailHeader } from "../components/warehouse/magazyn/MagazynRackDetailHeader";
import { MagazynProductsSidebar } from "../components/warehouse/magazyn/MagazynProductsSidebar";
import { UI_STRINGS } from "../constants/uiStrings";
import PageLayout from "../components/layout/PageLayout";
import { LayoutMode } from "../warehouse-layout";
import { useLayoutModeShortcuts, useLayoutModeDisplay } from "../warehouse-layout";
import {
  CELLS_PER_METER,
  BASE_PX_PER_CELL,
  GRID_COLS,
  GRID_ROWS,
  TENANT_ID,
  SPECIAL_LOCATION_CELL_CM,
  DEFAULT_ROW_SLOT_W,
  DEFAULT_ROW_SLOT_H,
  getRowStart,
  computeRowSlotPositions,
  getRowBounds,
  snapRowPreviewToDistance,
  filterEmptyRowContainers,
  findEmptySlotAt,
  findRowAndSlotForRack,
  rectsOverlap,
  canPlaceGroup,
  safeVolumeDm3,
  safeQuantity,
  getProductImageUrl,
  snapPosition,
} from "./WarehouseDesigner/DesignerRackPlacement";
import { exportPdf, exportCsv, exportLocationsMapCsv, exportJson } from "./WarehouseDesigner/DesignerExport";
import { useDesignerKeyboard } from "./WarehouseDesigner/DesignerKeyboard";
import { DesignerToolbar } from "./WarehouseDesigner/DesignerToolbar";
import { DesignerGrid } from "./WarehouseDesigner/DesignerGrid";
import { useDesignerMouseHandlers } from "./WarehouseDesigner/useDesignerMouseHandlers";
import { useDesignerRowOperations } from "./WarehouseDesigner/useDesignerRowOperations";
import { useDesignerRackPlacement } from "./WarehouseDesigner/useDesignerRackPlacement";
import { useDesignerPath } from "./WarehouseDesigner/useDesignerPath";
import { useDesignerCanvas } from "./WarehouseDesigner/useDesignerCanvas";
import { useDesignerDimensions } from "./WarehouseDesigner/useDesignerDimensions";
import { useDesignerProductModal } from "./WarehouseDesigner/useDesignerProductModal";
import { useDesignerMagazynState } from "./WarehouseDesigner/useDesignerMagazynState";
import { useDesignerTemplateSummary } from "./WarehouseDesigner/useDesignerTemplateSummary";
import { useDesignerRowState } from "./WarehouseDesigner/useDesignerRowState";

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
  const {
    zoom,
    setZoom,
    pan,
    setPan,
    cursorCm,
    setCursorCm,
    isPanning,
    setIsPanning,
  } = useDesignerCanvas();
  const [internalLayoutRackId, setInternalLayoutRackId] = useState<number | string | null>(null);
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
  const {
    aisleDrawStart,
    setAisleDrawStart,
    rowToolTemplate,
    setRowToolTemplate,
    rowDrawStart,
    setRowDrawStart,
    rowDrawEnd,
    setRowDrawEnd,
    rowPreviewCursor,
    setRowPreviewCursor,
    rowGapCm,
    setRowGapCm,
    selectedRowContainerId,
    setSelectedRowContainerId,
    selectedRowContainerIds,
    setSelectedRowContainerIds,
    draggingRowId,
    setDraggingRowId,
    rowDragPreviewStart,
    setRowDragPreviewStart,
    catalogHoveredSlot,
    setCatalogHoveredSlot,
    currentRowPrefix,
    setCurrentRowPrefix,
    aisleWidthCm,
    setAisleWidthCm,
  } = useDesignerRowState();
  /** Offset from pointer (cell) to row start when drag started, so we can compute preview from current cell. */
  const rowDragPointerOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  /** Latest preview position for row drag (so window mouseup can read it). */
  const rowDragPreviewStartRef = useRef<{ x: number; y: number } | null>(null);
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
  const [searchParams] = useSearchParams();
  /** Single view mode: Magazyn (live) | Projektant Layoutu */
  const [mainView, setMainView] = useState<"magazyn" | "layout">(() =>
    searchParams.get("view") === "layout" ? "layout" : "layout"
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const isLiveView = mainView === "magazyn";
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const lastMouseRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const rafIdRef = useRef<number>(0);
  const rowDrawTemplateRef = useRef<CatalogItem | null>(null);
  const rowDrawEndPendingRef = useRef<{ x: number; y: number } | null>(null);
  const rowDrawEndRafRef = useRef<number | null>(null);
  const cursorPendingRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const placeRowWithTemplateRef = useRef<((start: { x: number; y: number }, end: { x: number; y: number }, item: CatalogItem) => void) | null>(null);
  const placeEmptyRowRef = useRef<((start: { x: number; y: number }, end: { x: number; y: number }) => void) | null>(null);
  const canMoveRowToRef = useRef<((rowId: string, newStart: { x: number; y: number }) => boolean) | null>(null);
  const moveRowToPositionRef = useRef<((rowId: string, newStartX: number, newStartY: number) => void) | null>(null);
  const moveRackWithinRowRef = useRef<((rowId: string, rackId: number | string, fromSlotIndex: number, toSlotIndex: number) => void) | null>(null);

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

  const {
    selectedRackForMagazyn,
    selectedRackBinLabels,
    selectedRackBinUUIDs,
    displayRack,
    binItemCounts,
    binUniqueProductCounts,
    usedVolumeAtBin,
  } = useDesignerMagazynState({
    layout,
    products,
    selectedRackIdForSideView,
  });

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

  const {
    ghostW,
    ghostH,
    stampRackAt,
    stampRackIntoSlot,
    stampRackFromCatalogItem,
    getCatalogDropCell,
  } = useDesignerRackPlacement({
    layout,
    template,
    rackRotation,
    currentRowPrefix,
    aisleWidthCm,
    setLayout,
    setDraggingFromCatalog,
    setCatalogGhostPosition,
    setCatalogHoveredSlot,
  });

  const {
    getCellFromEvent,
    handleCanvasMouseMove,
    handleCanvasMouseDown,
    handleCanvasMouseUp,
    handleCanvasMouseLeave,
  } = useDesignerMouseHandlers({
    layout,
    refs: {
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
      placeRowWithTemplateRef,
      placeEmptyRowRef,
      canMoveRowToRef,
      moveRowToPositionRef,
      moveRackWithinRowRef,
    },
    state: {
      layout,
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
    },
    setters: {
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
    },
    callbacks: {
      stampRackAt,
      addSpecialLocation,
    },
    helpers: {
      findSnapToRowPosition,
      snapPosition,
      snapRowPreviewToDistance,
      findEmptySlotAt,
      findRowAndSlotForRack,
      canPlaceGroup,
      getRowStart,
      computeRowSlotPositions,
      filterEmptyRowContainers,
      reindexGeometricRow,
    },
    options: {
      ghostW,
      ghostH,
      panMode,
      aisleToolActive,
    },
  });

  const {
    deleteSelectedRow,
    rotateSelectedRow,
    trimSelectedRowEnd,
    canMoveRowTo,
    moveRowToPosition,
    onSelectRowContainer,
    onStartRowDrag,
    moveRackWithinRow,
    setCatalogHoveredSlotFromCell,
    fillSelectedRowWithTemplate,
    placeEmptyRow,
    placeRowWithTemplate,
  } = useDesignerRowOperations({
    layout,
    selectedRowContainerId,
    currentRowPrefix,
    rowGapCm,
    setLayout,
    setSelectedRowContainerId,
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedAisleIndex,
    setSelectedVisualId,
    setSelectedVisualIds,
    setSelectedPathPointIndex,
    setSelectedPathLine,
    setDraggingRowId,
    setRowDragPreviewStart,
    setCatalogHoveredSlot,
    setRowDrawStart,
    setRowDrawEnd,
    rowDragPointerOffsetRef,
    rowDragPreviewStartRef,
    getCellFromEvent,
    setCustomTemplates,
  });
  canMoveRowToRef.current = canMoveRowTo;
  moveRowToPositionRef.current = moveRowToPosition;
  moveRackWithinRowRef.current = moveRackWithinRow;
  placeEmptyRowRef.current = placeEmptyRow;
  placeRowWithTemplateRef.current = placeRowWithTemplate;

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

  const handleExportPdf = useCallback(() => {
    exportPdf({
      canvasEl: canvasContainerRef.current,
      layout,
      gridUnitCm: GRID_UNIT_CM,
      pdfFailedMessage: "Failed to export PDF",
    });
  }, [layout]);

  const handleExportCsv = useCallback(() => {
    exportCsv(layout);
  }, [layout]);

  const handleExportLocationsMapCsv = useCallback(() => {
    exportLocationsMapCsv(layout);
  }, [layout]);

  const handleExportJson = useCallback(() => {
    exportJson(layout);
  }, [layout]);

  useDesignerKeyboard({
    placementMode,
    setRackRotation,
    setPlacementMode,
    setLayoutMode,
    setGhostPosition,
    setRowToolTemplate,
    setRowDrawStart,
    setRowDrawEnd,
    setSelectedRowContainerId,
    setSelectedRowContainerIds,
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedVisualId,
    setSelectedVisualIds,
    setSelectedPathPointIndex,
    setSelectedPathLine,
    setMarqueeStart,
    setMarqueeEnd,
    setAisleDrawStart,
    setClipboard,
    setLayout,
    setSnackbar,
    mainView,
    selectedRowContainerId,
    deleteSelectedRow,
    selectedObjectId,
    deleteObject,
    clipboard,
    cursorCm,
    layout,
    selectedRackIds,
    selectedVisualIds,
  });

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

  const { dimensionData } = useDesignerDimensions({
    showDimensions,
    layout,
    selectedRowContainerId,
    selectedRowContainerIds,
    selectedRackIds,
    draggingRowId,
    rowDragPreviewStart,
    rackDragPreviewPositions,
    draggingRackId,
  });

  const {
    pickingPathPoints,
    pathDistanceM,
    handleMagicWand,
  } = useDesignerPath({
    manualPathPoints,
    setManualPathPoints,
    setShowPickingPath,
    setSnackbar,
  });

  const selectedRack = layout.racks.find((r) => (r.id != null && r.id === selectedRackId) || r.rack_index === selectedRackId);
  const selectedRacks = layout.racks.filter((r) => selectedRackIds.includes(r.id ?? r.rack_index));
  const isMultiSelect = selectedRackIds.length > 1;

  const { summaryByTemplate } = useDesignerTemplateSummary({
    layout,
    customTemplates,
  });

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

  const { editProductModalProps } = useDesignerProductModal({
    mainView,
    editingProductId,
    showElevationForRackId,
    layout,
    products,
    setProducts,
    setEditingProductId,
    safeQuantity,
    safeVolumeDm3,
    binVolumeDm3,
    binsToLevels,
    getAllPositionsFromRacks,
  });

  return (
    <PageLayout
      fillHeight
      title={UI_STRINGS.warehouse.title}
      actions={
        <DesignerToolbar
          mainView={mainView}
          setMainView={setMainView}
          setEditingProductId={setEditingProductId}
          warehouses={warehouses}
          selectedWarehouseId={selectedWarehouseId}
          setSelectedWarehouseId={setSelectedWarehouseId}
          warehouseName={layout.warehouse_name}
          lastSavedAt={lastSavedAt}
        />
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
            <MagazynDashboardPanel
              layout={layout}
              summaryByTemplate={summaryByTemplate}
              productsAssignedVolumeDm3={productsAssignedVolumeDm3}
              totalCapacity={totalCapacity}
              utilizationPct={utilizationPct}
              formatVolume={formatVolume}
            />
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
            onReindexRow={(rackId: number | string | null, prefix: string) => setLayout((prev) => ({ ...prev, racks: rackId != null ? reindexGeometricRow(prev.racks, rackId) : reindexRowByPrefix(prev.racks, prefix) }))}
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
            onReindexRow={(rackId: number | string | null, prefix: string) => setLayout((prev) => ({ ...prev, racks: rackId != null ? reindexGeometricRow(prev.racks, rackId) : reindexRowByPrefix(prev.racks, prefix) }))}
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
                return (
                  <>
                    <MagazynRackDetailHeader
                      rack={rack}
                      onBackToMap={() => {
                        setSelectedRackIdForSideView(null);
                        setSelectedLocationForProducts(null);
                        setProductSearchQuery("");
                        setShowAllProductsInSidebar(false);
                      }}
                      formatVolume={formatVolume}
                      binUsedVolumeDm3={binUsedVolumeDm3}
                      binVolumeDm3={binVolumeDm3}
                      getRackDisplayId={getRackDisplayId}
                    />
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
              <MagazynProductsSidebar
                products={products}
                productSearchQuery={productSearchQuery}
                setProductSearchQuery={setProductSearchQuery}
                selectedLocationForProducts={selectedLocationForProducts}
                showAllProductsInSidebar={showAllProductsInSidebar}
                setShowAllProductsInSidebar={setShowAllProductsInSidebar}
                selectedRackForMagazyn={selectedRackForMagazyn}
                selectedRackBinUUIDs={selectedRackBinUUIDs}
                selectedRackBinLabels={selectedRackBinLabels}
                safeQuantity={safeQuantity}
                safeVolumeDm3={safeVolumeDm3}
                getProductImageUrl={getProductImageUrl}
                formatVolume={formatVolume}
              />
            )}
          </>
        ) : mainView === "layout" ? (
          <DesignerGrid
            mainViewProps={{
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
              ghostCollision: ghostCollision ?? false,
              draggingFromCatalog,
              catalogGhostPosition,
              setCatalogGhostPosition,
              stampRackFromCatalogItem,
              stampRackIntoSlot,
              getCatalogDropCell,
              setCatalogHoveredSlotFromCell,
              setCatalogHoveredSlot,
              catalogHoveredSlot,
              getCellFromEvent,
              minEmptySlotWidthCells: rowToolTemplate ? cmToCells(getCatalogItemSpec(rowToolTemplate).width_cm) : undefined,
              minEmptySlotDepthCells: rowToolTemplate ? cmToCells(getCatalogItemSpec(rowToolTemplate).depth_cm) : undefined,
              snapPosition,
              rectsOverlap,
              cellPx,
              width,
              height,
              svgRef,
              canvasContainerRef,
              onMouseMove: handleCanvasMouseMove,
              onMouseDown: handleCanvasMouseDown,
              onMouseUp: handleCanvasMouseUp,
              onMouseLeave: handleCanvasMouseLeave,
              panMode,
              isPanning,
              selectedRackIds,
              collisionRackId,
              collisionRackIds,
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
              rackDragPreviewPositions,
              dragSlotHighlights,
              defaultRowSlotW: DEFAULT_ROW_SLOT_W,
              defaultRowSlotH: DEFAULT_ROW_SLOT_H,
              selectedRowContainerId,
              selectedRowContainerIds,
              onSelectRowContainer,
              fillSelectedRowWithTemplate,
              deleteSelectedRow,
              trimSelectedRowEnd,
              rotateSelectedRow,
              draggingRowId,
              rowDragPreviewStart,
              onStartRowDrag,
              aisleToolActive,
              setAisleToolActive,
              rowToolActive,
              setRowToolActive,
              setRowToolTemplate,
              rowToolTemplate,
              rowDrawStart,
              rowDrawEnd,
              rowPreviewCursor,
              rowGapCm,
              setRowGapCm,
              aisleWidthCm,
              setAisleWidthCm,
              showGrid,
              setShowGrid,
              showDimensions,
              setShowDimensions,
              dimensionLines: dimensionData.dimensionLines,
              aisleHighlights: dimensionData.aisleHighlights,
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
              showPickingPath,
              setShowPickingPath,
              pickingPathPoints,
              pathToolActive,
              setPathToolActive,
              setLayoutMode,
              specialLocations,
              layoutModeLabel: layoutModeDisplay.modeLabel,
              layoutModeColor: layoutModeDisplay.modeColor,
              layoutMode,
              manualPathPoints,
              pathDistanceM,
              onMagicWand: handleMagicWand,
              selectedVisualIds,
              isLiveView,
              setSelectedVisualId,
              setSelectedVisualIds,
              setSelectedAisleIndex,
              selectedRacks,
              setClipboard,
              clipboard,
            }}
          />
        ) : null}
      </div>

    </PageLayout>
  );
}
