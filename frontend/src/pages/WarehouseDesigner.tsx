import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import type { RackState, BinState, InternalStructure, LayoutState, RackTemplate, CustomRackTemplate, CatalogItem, VisualElementType, VisualElementState, ColumnShape, DoorStyle, ZoneType, WarehouseProduct, RowContainer, EmptyRowSlot, WallElement, WallSide } from "../types/warehouse";
import { GRID_UNIT_CM } from "../types/warehouse";
import { formatVolume, createBinsForRack, binsToLevels, volumePerBin, volumePerBinFromTotal, cmToCells, cellsToCm, getCatalogItemSpec, getLevelConfig, getTotalLocations, getNextIndexInRow, ROW_LABEL_ADDRESS_PATTERN, reindexGeometricRow, findSnapToRowPosition, getDragSlotHighlights, binUsedVolumeDm3, binVolumeDm3, getRackDisplayId, getAllPositionsFromRacks, clampGridToBuilding, metersToCells, duplicateRacksAtPosition } from "../components/warehouse/warehouseUtils";
import { RackSidebar } from "../components/warehouse/RackSidebar";
import { RackSideViewGrid } from "../components/warehouse/RackSideViewGrid";
import { WarehouseModals } from "../components/warehouse/WarehouseModals";
import { WarehouseLayoutRenderer } from "../components/warehouse/WarehouseLayoutRenderer";
import { WarehouseLegend } from "../components/warehouse/WarehouseLegend";
import { MagazynDashboardPanel } from "../components/warehouse/magazyn/MagazynDashboardPanel";
import { MagazynRackDetailHeader } from "../components/warehouse/magazyn/MagazynRackDetailHeader";
import { RackLabelDownloadModal } from "../components/labels/RackLabelDownloadModal";
import { MagazynProductsSidebar } from "../components/warehouse/magazyn/MagazynProductsSidebar";
import { ProductLocatorSidebar } from "../components/warehouse/magazyn/ProductLocatorSidebar";
import { TopProductsSidebar } from "../components/warehouse/magazyn/TopProductsSidebar";
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
import { useDesignerCanvas } from "./WarehouseDesigner/useDesignerCanvas";
import { useDesignerProductModal } from "./WarehouseDesigner/useDesignerProductModal";
import { useDesignerMagazynState } from "./WarehouseDesigner/useDesignerMagazynState";
import { useDesignerTemplateSummary } from "./WarehouseDesigner/useDesignerTemplateSummary";
import { useDesignerRowState } from "./WarehouseDesigner/useDesignerRowState";
import { RowPrefixModal } from "../components/warehouse/RowPrefixModal";
import { getWallFromClientPosition, getPositionCmAlongWall } from "./WarehouseDesigner/utils/designerMouseUtils";
import { normalizeProductDims } from "../utils/productNormalizer";

type PendingRowCreation =
  | { type: "emptyRow"; start: { x: number; y: number }; end: { x: number; y: number } }
  | { type: "rowWithTemplate"; start: { x: number; y: number }; end: { x: number; y: number }; item: CatalogItem }
  | { type: "stampRack"; cell: { x: number; y: number }; item: CatalogItem }
  | null;

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
    wall_elements: [],
  });
  const [selectedRackId, setSelectedRackId] = useState<number | string | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [ghostPosition, setGhostPosition] = useState<{ x: number; y: number } | null>(null);
  const [copyPlacementMode, setCopyPlacementMode] = useState(false);
  const [copiedRack, setCopiedRack] = useState<RackState | null>(null);
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
  const lastCursorCmRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (cursorCm != null) lastCursorCmRef.current = cursorCm;
  }, [cursorCm]);
  const getPastePosition = useCallback(() => {
    const viewportCenterCm = {
      x: (layout.grid_cols * GRID_UNIT_CM) / 2,
      y: (layout.grid_rows * GRID_UNIT_CM) / 2,
    };
    return cursorCm ?? lastCursorCmRef.current ?? viewportCenterCm;
  }, [cursorCm, layout.grid_cols, layout.grid_rows]);
  const [internalLayoutRackId, setInternalLayoutRackId] = useState<number | string | null>(null);
  const [panMode, _setPanMode] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const [showCreateWarehouse, setShowCreateWarehouse] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("Magazyn Główny");
  const [showElevationForRackId, setShowElevationForRackId] = useState<number | string | null>(null);
  const [selectedBinForFilter, setSelectedBinForFilter] = useState<{ level_index: number; segment_index: number } | null>(null);
  /** In Magazyn tab: which rack to show in the side-view panel. */
  const [selectedRackIdForSideView, setSelectedRackIdForSideView] = useState<number | string | null>(null);
  /** Magazyn tab: rack selected on full map (single click); sidebar shows products, double-click opens side view. */
  const [selectedRackIdOnMap, setSelectedRackIdOnMap] = useState<string | null>(null);
  /** Magazyn tab: product selected from global search on map; highlights racks and shows ProductLocatorSidebar. */
  const [selectedProductIdOnMap, setSelectedProductIdOnMap] = useState<string | null>(null);
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
  const setRowToolActive = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLayoutMode((prev) => (typeof v === "function" ? v(prev === LayoutMode.DRAW_ROW) : v) ? LayoutMode.DRAW_ROW : LayoutMode.SELECT);
  }, []);
  const setAisleToolActive = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLayoutMode((prev) => (typeof v === "function" ? v(prev === LayoutMode.DRAW_AISLE) : v) ? LayoutMode.DRAW_AISLE : LayoutMode.SELECT);
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
    aisleWidthCm,
    setAisleWidthCm,
  } = useDesignerRowState();

  const [rowPrefixModalOpen, setRowPrefixModalOpen] = useState(false);
  const [pendingRowCreation, setPendingRowCreation] = useState<PendingRowCreation>(null);
  /** Offset from pointer (cell) to row start when drag started, so we can compute preview from current cell. */
  const rowDragPointerOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  /** Latest preview position for row drag (so window mouseup can read it). */
  const rowDragPreviewStartRef = useRef<{ x: number; y: number } | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showRackLabels, setShowRackLabels] = useState(true);
  const [selectedAisleIndex, setSelectedAisleIndex] = useState<number | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [draggingVisualType, setDraggingVisualType] = useState<VisualElementType | null>(null);
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null);
  const [draggingVisualId, setDraggingVisualId] = useState<string | null>(null);
  const [dragOffsetVisual, setDragOffsetVisual] = useState<{ dx: number; dy: number } | null>(null);
  const [visualGhostPosition, setVisualGhostPosition] = useState<{ x: number; y: number } | null>(null);
  const [clipboard, setClipboard] = useState<RackState[]>([]);
  const [catalogGhostPosition, setCatalogGhostPosition] = useState<{ x: number; y: number } | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; undo?: () => void; undoLabel?: string } | null>(null);
  const [showEditBuilding, setShowEditBuilding] = useState(false);
  const [showGenerateLayoutModal, setShowGenerateLayoutModal] = useState(false);
  const [selectedVisualIds, setSelectedVisualIds] = useState<string[]>([]);
  const deletedForUndoRef = useRef<{ racks?: RackState[]; visuals?: VisualElementState[]; row_containers?: LayoutState["row_containers"] } | null>(null);
  const [draggingWallEnd, setDraggingWallEnd] = useState<{ visualId: string; end: 0 | 1 } | null>(null);
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
  const wallElementDragPosRef = useRef<number | null>(null);
  const [showRackLabelDownload, setShowRackLabelDownload] = useState(false);
  const [wallElementTool, setWallElementTool] = useState<"door" | "gate" | null>(null);
  const [selectedWallElementId, setSelectedWallElementId] = useState<string | null>(null);
  const [draggingWallElementId, setDraggingWallElementId] = useState<string | null>(null);
  const [dragPreviewPositionCm, setDragPreviewPositionCm] = useState<number | null>(null);
  const [showGateTypeModal, setShowGateTypeModal] = useState(false);
  const [pendingGatePlacement, setPendingGatePlacement] = useState<{ wall: WallSide; position_cm: number } | null>(null);

  useEffect(() => {
    if (selectedRackIdForSideView == null) {
      setShowRackLabelDownload(false);
    }
  }, [selectedRackIdForSideView]);

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
    if (selectedRackIds.length > 0) return `rack:${selectedRackIds[0]}`;
    if (selectedVisualIds.length > 0) return `visual:${selectedVisualIds[0]}`;
    return null;
  }, [selectedRackIds, selectedVisualIds]);

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
    binLoadKg,
    levelLoadKg,
    binMaxCapacityPieces,
    binCapacityDetails,
    binPackingPreview,
    usedVolumeAtBin,
  } = useDesignerMagazynState({
    layout,
    products,
    selectedRackIdForSideView,
  });

  /** Map locationUUID → bin (for storage_type and primary/reserve split). Declared before mapRackState and occupancy useMemos. */
  const uuidToBin = useMemo(() => {
    const map = new Map<string, BinState>();
    layout.racks.forEach((rack) => {
      (rack.bins ?? []).forEach((bin) => {
        if (bin.locationUUID) {
          map.set(bin.locationUUID, bin);
        }
      });
    });
    return map;
  }, [layout.racks]);

  /** Map locationUUID → rack id (string) for product locator: which rack contains a location. */
  const uuidToRackId = useMemo(() => {
    const map = new Map<string, string>();
    layout.racks.forEach((rack) => {
      const rackId = String(rack.id ?? rack.rack_index);
      (rack.bins ?? []).forEach((bin) => {
        if (bin.locationUUID) {
          map.set(bin.locationUUID, rackId);
        }
      });
    });
    return map;
  }, [layout.racks]);

  /** Map product id → Set of rack ids that contain that product (from assignedLocations). */
  const productToRackIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    products.forEach((p) => {
      const racks = new Set<string>();
      p.assignedLocations?.forEach((a) => {
        const rackId = uuidToRackId.get(a.locationUUID);
        if (rackId) racks.add(rackId);
      });
      map.set(p.id, racks);
    });
    return map;
  }, [products, uuidToRackId]);

  /** Rack ids to highlight when a product is selected on the map (global locator). */
  const rackIdsContainingSelectedProduct =
    selectedProductIdOnMap != null ? productToRackIds.get(selectedProductIdOnMap) ?? null : null;

  /** Quantity breakdown for the globally selected product (for ProductLocatorSidebar). */
  const selectedProductQuantityBreakdown = useMemo(() => {
    if (selectedProductIdOnMap == null) return null;
    const p = products.find((x) => x.id === selectedProductIdOnMap);
    if (!p) return null;
    let totalQuantity = 0;
    let primaryQuantity = 0;
    let reserveQuantity = 0;
    if (p.assignedLocations?.length) {
      for (const a of p.assignedLocations) {
        const type = a.storageType ?? uuidToBin.get(a.locationUUID)?.storage_type ?? "primary";
        const q = safeQuantity(a.quantity);
        totalQuantity += q;
        if (type === "reserve") reserveQuantity += q;
        else primaryQuantity += q;
      }
    } else {
      totalQuantity = safeQuantity(p.quantity);
      primaryQuantity = totalQuantity;
    }
    return { product: p, totalQuantity, primaryQuantity, reserveQuantity };
  }, [selectedProductIdOnMap, products, uuidToBin]);

  /** Products sorted by occupied volume in warehouse (for map view sidebar). totalVolume = sum(assignedLocations.quantity * volume_dm3) or quantity * volume_dm3. No fixed limit; sidebar scrolls. */
  const sortedProductsByVolume = useMemo(() => {
    const withVolume = products.map((p) => {
      const vol = safeVolumeDm3(p.volume_dm3);
      let totalQuantity = 0;
      if (p.assignedLocations?.length) {
        for (const a of p.assignedLocations) totalQuantity += safeQuantity(a.quantity);
      } else {
        totalQuantity = safeQuantity(p.quantity);
      }
      const totalVolumeDm3 = totalQuantity * vol;
      return { product: p, totalQuantity, totalVolumeDm3 };
    });
    return withVolume.sort((a, b) => b.totalVolumeDm3 - a.totalVolumeDm3);
  }, [products]);

  /** When a rack is selected on the full map (single click): rack ref and products in that rack (sorted, with quantity breakdown). */
  const mapRackState = useMemo(() => {
    if (selectedRackIdOnMap == null) return { selectedRackForMap: null as RackState | null, mapRackBinUUIDs: new Set<string>(), mapRackBinLabels: new Set<string>(), rackProductsForMap: [] as (WarehouseProduct & { totalQuantity: number; primaryQuantity: number; reserveQuantity: number })[] };
    const selectedRackForMap = layout.racks.find((r) => String(r.id ?? r.rack_index) === selectedRackIdOnMap) ?? null;
    if (!selectedRackForMap) return { selectedRackForMap: null, mapRackBinUUIDs: new Set<string>(), mapRackBinLabels: new Set<string>(), rackProductsForMap: [] as (WarehouseProduct & { totalQuantity: number; primaryQuantity: number; reserveQuantity: number })[] };
    const mapRackBinUUIDs = new Set<string>(selectedRackForMap.bins.map((b) => b.locationUUID).filter((u): u is string => Boolean(u)));
    const mapRackBinLabels = new Set<string>(selectedRackForMap.bins.map((b) => (b.label ?? b.location_id ?? "").trim()).filter(Boolean));
    const belongsToRack = (p: WarehouseProduct) => {
      if (p.assignedLocations?.length) return p.assignedLocations.some((a) => mapRackBinUUIDs.has(a.locationUUID));
      return p.location_id != null && mapRackBinLabels.has(p.location_id);
    };
    const rackProducts = products.filter(belongsToRack);
    const rackProductsForMap = rackProducts.map((p) => {
      let totalQuantity = 0;
      let primaryQuantity = 0;
      let reserveQuantity = 0;
      if (p.assignedLocations?.length) {
        for (const a of p.assignedLocations) {
          const type = a.storageType ?? uuidToBin.get(a.locationUUID)?.storage_type ?? "primary";
          const q = safeQuantity(a.quantity);
          totalQuantity += q;
          if (type === "reserve") reserveQuantity += q;
          else primaryQuantity += q;
        }
      } else {
        totalQuantity = safeQuantity(p.quantity);
        primaryQuantity = totalQuantity;
      }
      return { ...p, totalQuantity, primaryQuantity, reserveQuantity };
    }).sort((a, b) => b.totalQuantity - a.totalQuantity);
    return { selectedRackForMap, mapRackBinUUIDs, mapRackBinLabels, rackProductsForMap };
  }, [selectedRackIdOnMap, products, layout.racks, uuidToBin]);


  const { selectedRackForMap, mapRackBinUUIDs, mapRackBinLabels, rackProductsForMap } = mapRackState;

  const deleteObject = useCallback((objectId: string | null) => {
    if (!objectId) return;
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
      const rawGridCols = (d.grid_cols ?? 24) <= 24 ? (d.grid_cols ?? 24) * CELLS_PER_METER : (d.grid_cols ?? GRID_COLS);
      const rawGridRows = (d.grid_rows ?? 16) <= 16 ? (d.grid_rows ?? 16) * CELLS_PER_METER : (d.grid_rows ?? GRID_ROWS);
      const building_width_m = d.building_width_m != null && Number(d.building_width_m) > 0 ? Number(d.building_width_m) : undefined;
      const building_depth_m = d.building_depth_m != null && Number(d.building_depth_m) > 0 ? Number(d.building_depth_m) : (d.building_height_m != null && Number(d.building_height_m) > 0 ? Number(d.building_height_m) : undefined);
      const building_height_m = d.building_height_m != null && Number(d.building_height_m) >= 0 ? Number(d.building_height_m) : undefined;
      setLayout(clampGridToBuilding({
        layout_id: d.layout_id ?? null,
        warehouse_id: d.warehouse_id ?? warehouseId,
        warehouse_name: d.warehouse_name ?? "",
        name: d.name ?? "Layout 1",
        grid_cols: rawGridCols,
        grid_rows: rawGridRows,
        building_width_m,
        building_depth_m,
        building_height_m,
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
          level_max_load_kg: typeof (r as { level_max_load_kg?: number }).level_max_load_kg === "number" ? (r as { level_max_load_kg: number }).level_max_load_kg : undefined,
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
        wall_elements: Array.isArray(d.wall_elements)
          ? (d.wall_elements as Array<Record<string, unknown>>).map((we) => ({
              id: String(we.id ?? `we-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
              type: we.type === "gate" ? "gate" as const : "door" as const,
              wall: (["north", "south", "east", "west"] as const).includes(String(we.wall) as "north" | "south" | "east" | "west") ? String(we.wall) as "north" | "south" | "east" | "west" : "north",
              position_cm: Number(we.position_cm ?? 0),
              width_cm: Number(we.width_cm ?? 120),
              gateType: we.gateType === "courier" || we.gateType === "supplier" || we.gateType === "both" ? we.gateType : undefined,
            }))
          : [],
      }));
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
          const weightKg = typeof p.weight_kg === "number" ? p.weight_kg : typeof p.weight === "number" ? p.weight : undefined;
          const dims = normalizeProductDims(p);
          return {
            id,
            name: String(p.name ?? ""),
            sku: String(p.symbol ?? p.sku ?? ""),
            ean: String(p.ean ?? ""),
            quantity: totalQty || safeQuantity(p.quantity),
            volume_dm3: vol,
            location_id: location_id ?? null,
            assignedLocations: assigned.length > 0 ? assigned : undefined,
            weight_kg: weightKg,
            image_url: typeof p.image_url === "string" ? p.image_url : undefined,
            // Always set dimensions from normalizer (API: length/width/height or *_cm). Enables 3D slot capacity.
            width_cm: dims.width_cm || undefined,
            depth_cm: dims.depth_cm || undefined,
            height_cm: dims.height_cm || undefined,
            orientation_type: ["any", "upright", "no_stack"].includes(String((p as { orientation_type?: string }).orientation_type)) ? (p as { orientation_type: "any" | "upright" | "no_stack" }).orientation_type : "any",
            shape_type: ["box", "cylinder"].includes(String((p as { shape_type?: string }).shape_type)) ? (p as { shape_type: "box" | "cylinder" }).shape_type : "box",
            stack_compressible: (p as { stack_compressible?: boolean }).stack_compressible ?? false,
            compressed_height_cm: (p as { compressed_height_cm?: number | null }).compressed_height_cm ?? null,
            max_stack_weight: (p as { max_stack_weight?: number | null }).max_stack_weight ?? null,
            stack_behavior: ["stackable", "no_stack"].includes(String((p as { stack_behavior?: string }).stack_behavior)) ? (p as { stack_behavior: "stackable" | "no_stack" }).stack_behavior : "stackable",
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
        const dims = normalizeProductDims(p);
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
          // Always set dimensions from normalizer (API: length/width/height or *_cm). Enables 3D slot capacity in Magazyn.
          width_cm: dims.width_cm || undefined,
          depth_cm: dims.depth_cm || undefined,
          height_cm: dims.height_cm || undefined,
          orientation_type: ["any", "upright", "no_stack"].includes(String((p as { orientation_type?: string }).orientation_type)) ? (p as { orientation_type: "any" | "upright" | "no_stack" }).orientation_type : "any",
          shape_type: ["box", "cylinder"].includes(String((p as { shape_type?: string }).shape_type)) ? (p as { shape_type: "box" | "cylinder" }).shape_type : "box",
          stack_compressible: (p as { stack_compressible?: boolean }).stack_compressible ?? false,
          compressed_height_cm: (p as { compressed_height_cm?: number | null }).compressed_height_cm ?? null,
          max_stack_weight: (p as { max_stack_weight?: number | null }).max_stack_weight ?? null,
          stack_behavior: ["stackable", "no_stack"].includes(String((p as { stack_behavior?: string }).stack_behavior)) ? (p as { stack_behavior: "stackable" | "no_stack" }).stack_behavior : "stackable",
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
      const x_cm = cellsToCm(cell.x);
      const y_cm = cellsToCm(cell.y);
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

  const onCopyRack = useCallback((rack: RackState) => {
    setClipboard([rack]);
    setCopiedRack(rack);
    setCopyPlacementMode(true);
  }, []);

  const placeCopiedRack = useCallback((cell: { x: number; y: number }) => {
    if (!copiedRack) return;
    setLayout((prev) => ({
      ...prev,
      racks: [...prev.racks, ...duplicateRacksAtPosition([copiedRack], cell, prev.racks.length + 1)],
    }));
    setCopyPlacementMode(false);
    setCopiedRack(null);
    setGhostPosition(null);
  }, [copiedRack]);

  const updateSpecialLocation = useCallback(
    async (locationId: number, cell: { x: number; y: number }) => {
      if (selectedWarehouseId == null) return;
      const x_cm = cellsToCm(cell.x);
      const y_cm = cellsToCm(cell.y);
      try {
        await api.patch(`/warehouse/special-location/${locationId}`, { x: x_cm, y: y_cm });
        const { data } = await api.get<SpecialLocationsState>(`/warehouse/${selectedWarehouseId}/special-locations`);
        setSpecialLocations(data ?? { pick_start: null, packing: null, dock: null });
      } catch (err) {
        console.error("Update special location:", err);
      }
    },
    [selectedWarehouseId]
  );

  const deleteSpecialLocation = useCallback(
    async (locationId: number) => {
      if (selectedWarehouseId == null) return;
      try {
        await api.delete(`/warehouse/special-location/${locationId}`);
        const { data } = await api.get<SpecialLocationsState>(`/warehouse/${selectedWarehouseId}/special-locations`);
        setSpecialLocations(data ?? { pick_start: null, packing: null, dock: null });
      } catch (err) {
        console.error("Delete special location:", err);
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
        ...(layout.building_width_m != null && (layout.building_depth_m != null || layout.building_height_m != null)
          ? {
              building_width_m: layout.building_width_m,
              building_depth_m: layout.building_depth_m ?? layout.building_height_m,
              ...(layout.building_height_m != null ? { building_height_m: layout.building_height_m } : {}),
            }
          : {}),
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
          level_max_load_kg: r.level_max_load_kg ?? undefined,
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
        picking_path: layout.picking_path ?? undefined,
        row_containers: layout.row_containers ?? [],
        wall_elements: layout.wall_elements ?? [],
      };
      console.log("Saving payload (rack colors):", payload.racks.map((r, i) => ({ index: i, color: r.color })));
      console.log("Saving building", {
        width: (payload as { building_width_m?: number }).building_width_m,
        depth: (payload as { building_depth_m?: number }).building_depth_m,
        height: (payload as { building_height_m?: number }).building_height_m,
      });
      await api.put(`/warehouse/${whId}/layout`, payload, { params: { tenant_id: TENANT_ID } });
      setLastSavedAt(Date.now());
      if (selectedWarehouseId) await loadLayout(selectedWarehouseId);
    } catch (e) {
      console.error("Save layout:", e);
    } finally {
      setSaving(false);
    }
  }, [layout, selectedWarehouseId, loadLayout]);

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
    aisleWidthCm,
    setLayout,
    setDraggingFromCatalog,
    setCatalogGhostPosition,
    setCatalogHoveredSlot,
  });

  const wallLengthCm = useCallback((wall: WallSide) => {
    switch (wall) {
      case "north":
      case "south":
        return layout.grid_cols * GRID_UNIT_CM;
      case "east":
      case "west":
        return layout.grid_rows * GRID_UNIT_CM;
      default:
        return 0;
    }
  }, [layout.grid_cols, layout.grid_rows]);

  const addWallElement = useCallback((wall: WallSide, position_cm: number, type: "door" | "gate", gateType?: "courier" | "supplier" | "both") => {
    const len = wallLengthCm(wall);
    const width_cm = type === "door" ? 100 : 350;
    const pos = Math.max(0, Math.min(len - width_cm, position_cm));
    const el: WallElement = {
      id: `we-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      wall,
      position_cm: pos,
      width_cm,
      ...(type === "gate" && gateType ? { gateType } : {}),
    };
    setLayout((prev) => ({
      ...prev,
      wall_elements: [...(prev.wall_elements ?? []), el],
    }));
    setSelectedWallElementId(el.id);
    setWallElementTool(null);
  }, [wallLengthCm]);

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
      layoutMode,
      selectedWarehouseId,
      selectedRackIds,
      selectedVisualIds,
      snapToGrid,
      aisleWidthCm,
      ghostW,
      ghostH,
      copyPlacementMode,
      copiedRack,
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
    },
    callbacks: {
      stampRackAt,
      addSpecialLocation,
      placeCopiedRack,
      onAddWallElement: addWallElement,
      onRequestGatePlacement: (wall: WallSide, position_cm: number) => {
        setPendingGatePlacement({ wall, position_cm });
        setShowGateTypeModal(true);
      },
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
      canvasWidthPx: layout.grid_cols * BASE_PX_PER_CELL,
      canvasHeightPx: layout.grid_rows * BASE_PX_PER_CELL,
      gridUnitCm: GRID_UNIT_CM,
      wallElementTool,
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
    rowGapCm,
    setLayout,
    setSelectedRowContainerId,
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedAisleIndex,
    setSelectedVisualId,
    setSelectedVisualIds,
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

  const openRowPrefixModalForEmptyRow = useCallback((start: { x: number; y: number }, end: { x: number; y: number }) => {
    setPendingRowCreation({ type: "emptyRow", start, end });
    setRowPrefixModalOpen(true);
  }, []);
  const openRowPrefixModalForRowWithTemplate = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }, item: CatalogItem) => {
      setPendingRowCreation({ type: "rowWithTemplate", start, end, item });
      setRowPrefixModalOpen(true);
    },
    []
  );
  placeEmptyRowRef.current = openRowPrefixModalForEmptyRow;
  placeRowWithTemplateRef.current = openRowPrefixModalForRowWithTemplate;

  const handleRowPrefixConfirm = useCallback(
    (prefix: string) => {
      if (!pendingRowCreation) return;
      if (pendingRowCreation.type === "emptyRow") {
        placeEmptyRow(pendingRowCreation.start, pendingRowCreation.end, prefix);
      } else if (pendingRowCreation.type === "rowWithTemplate") {
        placeRowWithTemplate(pendingRowCreation.start, pendingRowCreation.end, pendingRowCreation.item, prefix);
      } else if (pendingRowCreation.type === "stampRack") {
        stampRackFromCatalogItem(pendingRowCreation.cell, pendingRowCreation.item, prefix);
      }
      setPendingRowCreation(null);
      setRowPrefixModalOpen(false);
    },
    [pendingRowCreation, placeEmptyRow, placeRowWithTemplate, stampRackFromCatalogItem]
  );

  const handleCatalogDrop = useCallback(
    (cell: { x: number; y: number }, item: CatalogItem) => {
      const emptySlot = findEmptySlotAt(layout.row_containers, cell);
      if (emptySlot) {
        stampRackFromCatalogItem(cell, item);
        return;
      }
      const spec = getCatalogItemSpec(item);
      const w = cmToCells(spec.width_cm);
      const h = cmToCells(spec.depth_cm);
      const snap = findSnapToRowPosition(layout.racks, cell.x, cell.y, w, h);
      if (snap) {
        stampRackFromCatalogItem(cell, item);
        return;
      }
      setPendingRowCreation({ type: "stampRack", cell, item });
      setRowPrefixModalOpen(true);
    },
    [layout.row_containers, layout.racks, stampRackFromCatalogItem]
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
        width_cm: cellsToCm(w),
        depth_cm: 100,
        height_cm: cellsToCm(h),
        total_volume_dm3: (cellsToCm(w) * 100 * cellsToCm(h)) / 1000,
        current_occupancy_dm3: 0,
      } : {}),
    };
    setLayout((prev) => ({ ...prev, visual_elements: [...(prev.visual_elements ?? []), newEl] }));
    setSelectedVisualId(newEl.id);
    setDraggingVisualType(null);
  }, [layout.visual_elements, layout.grid_cols, layout.grid_rows, getDefaultVisualSize]);

  const updateWallElementPosition = useCallback((id: string, position_cm: number) => {
    setLayout((prev) => {
      const list = prev.wall_elements ?? [];
      const el = list.find((e) => e.id === id);
      if (!el) return prev;
      const len = el.wall === "north" || el.wall === "south" ? prev.grid_cols * GRID_UNIT_CM : prev.grid_rows * GRID_UNIT_CM;
      const pos = Math.max(0, Math.min(len - el.width_cm, position_cm));
      return {
        ...prev,
        wall_elements: list.map((e) => (e.id === id ? { ...e, position_cm: pos } : e)),
      };
    });
  }, []);

  const deleteSelectedWallElement = useCallback(() => {
    if (!selectedWallElementId) return;
    setLayout((prev) => ({
      ...prev,
      wall_elements: (prev.wall_elements ?? []).filter((e) => e.id !== selectedWallElementId),
    }));
    setSelectedWallElementId(null);
  }, [selectedWallElementId]);

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
          const bins = createBinsForRack(template.aisle_letter, r.rack_index, template.levels, template.bins_per_level, volPerBin, "M1", template.naming_pattern, template.width_cm, template.depth_cm, template.height_cm, template.reserve_bin_keys, template.addressPattern, template.rowId, template.sectionStartIndex, template.binNamingType, lcEdit, template.namingStrategy, template.namingOrientation, template.namingPattern ?? template.addressPattern, template.manualLabels, template.overrides, template.indexPadding, template.startIndex);
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
    getPastePosition,
    layout,
    selectedRackIds,
    selectedVisualIds,
    copyPlacementMode,
    setCopyPlacementMode,
    setCopiedRack,
    selectedWallElementId,
    deleteSelectedWallElement,
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

  /** Primary vs reserve occupancy (dm³) using storageType ?? bin.storage_type ?? "primary". */
  const { primaryUsedDm3, reserveUsedDm3 } = useMemo(() => {
    let primary = 0;
    let reserve = 0;
    for (const p of products) {
      const vol = safeVolumeDm3(p.volume_dm3);
      if (p.assignedLocations?.length) {
        for (const a of p.assignedLocations) {
          const type = a.storageType ?? uuidToBin.get(a.locationUUID)?.storage_type ?? "primary";
          const qty = safeQuantity(a.quantity) * vol;
          if (type === "reserve") reserve += qty;
          else primary += qty;
        }
      } else if (p.location_id != null && p.location_id.trim() !== "") {
        primary += safeQuantity(p.quantity) * vol;
      }
    }
    return { primaryUsedDm3: primary, reserveUsedDm3: reserve };
  }, [products, uuidToBin]);

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

  useEffect(() => {
    if (!draggingWallElementId || !svgRef.current) return;
    const el = layout.wall_elements?.find((e) => e.id === draggingWallElementId);
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const pos = getPositionCmAlongWall(e.clientX, e.clientY, el.wall, rect, width, height, layout.grid_cols, layout.grid_rows, GRID_UNIT_CM);
      wallElementDragPosRef.current = pos;
      setDragPreviewPositionCm(pos);
    };
    const onUp = () => {
      const pos = wallElementDragPosRef.current;
      if (pos != null) updateWallElementPosition(draggingWallElementId, pos);
      setDraggingWallElementId(null);
      setDragPreviewPositionCm(null);
      wallElementDragPosRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingWallElementId, layout.wall_elements, layout.grid_cols, layout.grid_rows, width, height, updateWallElementPosition]);

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

  const selectedRack = layout.racks.find((r) => (r.id != null && r.id === selectedRackId) || r.rack_index === selectedRackId);
  const selectedRacks = layout.racks.filter((r) => selectedRackIds.includes(r.id ?? r.rack_index));
  const isMultiSelect = selectedRackIds.length > 1;

  const buildingDepthM = layout.building_depth_m ?? layout.building_height_m;
  const outsideRackIds = useMemo(() => {
    const bw = layout.building_width_m;
    const depth = buildingDepthM;
    if (bw == null || depth == null || bw <= 0 || depth <= 0) return [];
    const maxCols = metersToCells(bw);
    const maxRows = metersToCells(depth);
    return layout.racks
      .filter((r) => r.x + r.width > maxCols || r.y + r.height > maxRows)
      .map((r) => r.id ?? r.rack_index);
  }, [layout.racks, layout.building_width_m, buildingDepthM]);

  useEffect(() => {
    if (outsideRackIds.length > 0) {
      setSnackbar({
        message:
          outsideRackIds.length === 1
            ? "1 regał znajduje się poza granicą budynku."
            : `${outsideRackIds.length} regałów znajduje się poza granicą budynku.`,
      });
    }
  }, [outsideRackIds.length]);

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
          layout={layout}
          setLayout={setLayout}
          warehouseUsagePct={(() => {
            const bw = layout.building_width_m;
            const depth = layout.building_depth_m ?? layout.building_height_m;
            if (bw == null || depth == null || bw <= 0 || depth <= 0) return null;
            const buildingAreaM2 = bw * depth;
            const totalRackCells = layout.racks.reduce((s, r) => s + r.width * r.height, 0);
            const rackAreaM2 = totalRackCells * 0.01;
            return buildingAreaM2 > 0 ? (rackAreaM2 / buildingAreaM2) * 100 : null;
          })()}
          showEditBuilding={showEditBuilding}
          setShowEditBuilding={setShowEditBuilding}
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

      <RowPrefixModal
        open={rowPrefixModalOpen}
        onClose={() => {
          setRowPrefixModalOpen(false);
          setPendingRowCreation(null);
        }}
        onConfirm={handleRowPrefixConfirm}
        defaultPrefix="A"
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
            showOnlyCatalog
            onOpenEditBuilding={() => setShowEditBuilding(true)}
            showGenerateLayoutModal={showGenerateLayoutModal}
            setShowGenerateLayoutModal={setShowGenerateLayoutModal}
            wallElementTool={wallElementTool}
            setWallElementTool={setWallElementTool}
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
            onOpenEditBuilding={() => setShowEditBuilding(true)}
            showGenerateLayoutModal={showGenerateLayoutModal}
            setShowGenerateLayoutModal={setShowGenerateLayoutModal}
            wallElementTool={wallElementTool}
            setWallElementTool={setWallElementTool}
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
                      <div className="flex flex-1 min-w-0 min-h-0">
                        <div className="flex-1 min-w-0 min-h-0 flex flex-col shrink-0 overflow-hidden">
                          <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2">
                            <label className="text-xs font-medium text-slate-600">Szukaj produktu (mapa)</label>
                            <input
                              type="text"
                              value={productSearchQuery}
                              onChange={(e) => setProductSearchQuery(e.target.value)}
                              placeholder="Nazwa, SKU lub EAN..."
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            />
                            {productSearchQuery.trim() && (() => {
                              const q = productSearchQuery.trim().toLowerCase();
                              const filtered = products.filter(
                                (p) =>
                                  (p.name ?? "").toLowerCase().includes(q) ||
                                  (p.sku ?? "").toLowerCase().includes(q) ||
                                  (p.ean ?? "").toLowerCase().includes(q)
                              );
                              return filtered.length > 0 ? (
                                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                                  {filtered.slice(0, 15).map((p) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => setSelectedProductIdOnMap(p.id)}
                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0 ${selectedProductIdOnMap === p.id ? "bg-cyan-50 text-cyan-800" : "text-slate-700"}`}
                                    >
                                      {p.name} <span className="text-slate-400 text-xs">({p.sku})</span>
                                    </button>
                                  ))}
                                  {filtered.length > 15 && <div className="px-3 py-1 text-xs text-slate-400">+ {filtered.length - 15} więcej</div>}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">Brak produktów</p>
                              );
                            })()}
                            {selectedProductIdOnMap != null && (
                              <button
                                type="button"
                                onClick={() => setSelectedProductIdOnMap(null)}
                                className="self-start text-xs text-slate-500 hover:text-slate-700 underline"
                              >
                                Wyczyść wybór produktu
                              </button>
                            )}
                          </div>
                          <WarehouseLayoutRenderer
                            mode="read"
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
                            stampRackFromCatalogItem={handleCatalogDrop}
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
                            getPastePosition={getPastePosition}
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
                            setLayoutMode={setLayoutMode}
                            specialLocations={specialLocations}
                            onUpdateSpecialLocation={updateSpecialLocation}
                            onDeleteSpecialLocation={deleteSpecialLocation}
                            layoutModeLabel={layoutModeDisplay.modeLabel}
                            layoutModeColor={layoutModeDisplay.modeColor}
                            layoutMode={layoutMode}
                            selectedVisualIds={selectedVisualIds}
                            outsideRackIds={outsideRackIds}
                            isLiveView={isLiveView}
                            setSelectedVisualId={setSelectedVisualId}
                            setSelectedVisualIds={setSelectedVisualIds}
                            setSelectedAisleIndex={setSelectedAisleIndex}
                            selectedRacks={selectedRacks}
                            onCopyRack={onCopyRack}
                            copyPlacementMode={copyPlacementMode}
                            copiedRack={copiedRack}
                            wallElements={layout.wall_elements ?? []}
                            selectedWallElementId={selectedWallElementId}
                            setSelectedWallElementId={setSelectedWallElementId}
                            draggingWallElementId={draggingWallElementId}
                            dragPreviewPositionCm={dragPreviewPositionCm}
                            onStartWallElementDrag={(el) => setDraggingWallElementId(el.id)}
                            highlightedRackIds={rackIdsContainingSelectedProduct}
                            onRackClick={(id) => {
                              setSelectedRackIdOnMap(String(id));
                              setSelectedRackId(id);
                              setSelectedRackIds([id]);
                            }}
                            onRackDoubleClick={(id) => {
                              setSelectedRackIdOnMap(null);
                              setSelectedProductIdOnMap(null);
                              setSelectedRackIdForSideView(id);
                              setSelectedLocationForProducts(null);
                              setProductSearchQuery("");
                              setShowAllProductsInSidebar(false);
                            }}
                          />
                        </div>
                        {selectedRackIdOnMap != null && selectedRackForMap != null ? (
                          <MagazynProductsSidebar
                            layout={layout}
                            products={rackProductsForMap}
                            productSearchQuery={productSearchQuery}
                            setProductSearchQuery={setProductSearchQuery}
                            selectedLocationForProducts={null}
                            showAllProductsInSidebar={true}
                            setShowAllProductsInSidebar={() => {}}
                            selectedRackForMagazyn={selectedRackForMap}
                            selectedRackBinUUIDs={mapRackBinUUIDs}
                            selectedRackBinLabels={mapRackBinLabels}
                            safeQuantity={safeQuantity}
                            safeVolumeDm3={safeVolumeDm3}
                            getProductImageUrl={getProductImageUrl}
                            formatVolume={formatVolume}
                            rackProductMode
                          />
                        ) : selectedProductIdOnMap != null && selectedProductQuantityBreakdown != null ? (
                          <ProductLocatorSidebar
                            product={selectedProductQuantityBreakdown.product}
                            totalQuantity={selectedProductQuantityBreakdown.totalQuantity}
                            primaryQuantity={selectedProductQuantityBreakdown.primaryQuantity}
                            reserveQuantity={selectedProductQuantityBreakdown.reserveQuantity}
                            layout={layout}
                            getProductImageUrl={getProductImageUrl}
                            onSelectLocation={(locationUUID) => {
                              const rackId = uuidToRackId.get(locationUUID);
                              setSelectedRackIdOnMap(rackId ?? null);
                            }}
                          />
                        ) : (
                          <TopProductsSidebar
                            topProducts={sortedProductsByVolume}
                            getProductImageUrl={getProductImageUrl}
                            formatVolume={formatVolume}
                          />
                        )}
                      </div>
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
                      onShowLabelDownload={() => setShowRackLabelDownload(true)}
                    />
                    {rack && (
                      <div className="flex-1 min-h-0 overflow-hidden flex flex-col shrink-0" style={{ minHeight: 0 }}>
                        <RackSideViewGrid
                          rack={displayRack ?? rack}
                          onBinClick={(level_index, segment_index) => setSelectedLocationForProducts({ level_index, segment_index })}
                          selectedLocation={selectedLocationForProducts}
                          binItemCounts={binItemCounts}
                          binUniqueProductCounts={binUniqueProductCounts}
                          binMaxCapacityPieces={binMaxCapacityPieces}
                          binCapacityDetails={binCapacityDetails}
                          binPackingPreview={binPackingPreview}
                          showPhysicalCapacity={mainView === "magazyn"}
                          levelLoadKg={levelLoadKg}
                          levelMaxLoadKg={(() => {
                            const r = displayRack ?? rack;
                            const fromRack = r?.level_max_load_kg;
                            const fromTemplate = r?.templateId ? customTemplates.find((tpl) => tpl.id === r.templateId)?.level_max_load_kg : null;
                            return fromRack ?? fromTemplate ?? 500;
                          })()}
                        />
                      </div>
                    )}
                  </>
                );
                    })()}
                  </div>
                  <WarehouseLegend
                    viewMode={selectedRackIdForSideView == null ? "fullMap" : "rackDetail"}
                    stats={{ rackCount: layout.racks.length, usedDm3: totalUsed, totalDm3: totalCapacity, primaryUsedDm3, reserveUsedDm3 }}
                  />
                </>
              )}
            </div>
            {mainView === "magazyn" && selectedRackIdForSideView != null && layout.racks.some((r) => String(r.id ?? r.rack_index) === String(selectedRackIdForSideView)) && (
              <MagazynProductsSidebar
                layout={layout}
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
              stampRackFromCatalogItem: handleCatalogDrop,
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
              getPastePosition,
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
              setLayoutMode,
              specialLocations,
              onUpdateSpecialLocation: updateSpecialLocation,
              onDeleteSpecialLocation: deleteSpecialLocation,
              layoutModeLabel: layoutModeDisplay.modeLabel,
              layoutModeColor: layoutModeDisplay.modeColor,
              layoutMode,
              selectedVisualIds,
              outsideRackIds,
              isLiveView,
              setSelectedVisualId,
              setSelectedVisualIds,
              setSelectedAisleIndex,
              selectedRacks,
              onCopyRack,
              copyPlacementMode,
              copiedRack,
              wallElements: layout.wall_elements ?? [],
              selectedWallElementId,
              setSelectedWallElementId,
              draggingWallElementId,
              dragPreviewPositionCm,
              onStartWallElementDrag: (el) => setDraggingWallElementId(el.id),
            }}
          />
        ) : null}
      </div>

      {showGateTypeModal && pendingGatePlacement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="gate-type-title">
          <div className="bg-white rounded-xl shadow-xl p-4 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
            <h3 id="gate-type-title" className="text-sm font-semibold text-slate-800 mb-3">Typ bramy</h3>
            <div className="flex flex-col gap-2">
              {(["courier", "supplier", "both"] as const).map((gt) => (
                <button
                  key={gt}
                  type="button"
                  onClick={() => {
                    addWallElement(pendingGatePlacement.wall, pendingGatePlacement.position_cm, "gate", gt);
                    setShowGateTypeModal(false);
                    setPendingGatePlacement(null);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-left text-sm"
                >
                  {gt === "courier" ? "Kurier" : gt === "supplier" ? "Dostawca" : "Oba"}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setShowGateTypeModal(false); setPendingGatePlacement(null); setWallElementTool(null); }} className="mt-3 text-xs text-slate-500 hover:underline">Anuluj</button>
          </div>
        </div>
      )}

      {showRackLabelDownload && mainView === "magazyn" && selectedRackIdForSideView != null && (
        (() => {
          const rack = displayRack ?? selectedRackForMagazyn;
          if (!rack) return null;
          return (
            <RackLabelDownloadModal
              rack={rack}
              locations={[]}
              onClose={() => setShowRackLabelDownload(false)}
            />
          );
        })()
      )}

    </PageLayout>
  );
}
