import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo, type MouseEvent } from "react";
import { useSearchParams, useBlocker } from "react-router-dom";
import api from "../api/axios";
import { putProductWarehouseSlotting } from "../api/productSlottingApi";
import { warn } from "../utils/logger";
import type { RackState, BinState, InternalStructure, LayoutState, RackTemplate, CustomRackTemplate, LevelConfigItem, CatalogItem, VisualElementType, VisualElementState, ColumnShape, DoorStyle, ZoneType, WarehouseProduct, RowContainer, EmptyRowSlot, WallElement, WallSide, RackType, StorageType } from "../types/warehouse";
import { GRID_UNIT_CM, normalizePassageSource } from "../types/warehouse";
import {
  type StructureRemovalImpact,
  countPassageVoidLevelsForRack,
  storageLevelConfigAfterVoid,
  getPassageVoidHeightCm,
  countPassageVoidLevels,
} from "../components/warehouse/passageStorage";
import {
  analyzeLayoutStructureRebuild,
  analyzeTemplateInstanceRebuild,
  recordStructureRebuild,
} from "../components/warehouse/structureRebuildOrchestrator";
import { StructureRebuildConfirmDialog } from "../components/warehouse/StructureRebuildConfirmDialog";
import { layoutService } from "../services/layoutService";
import { SelectionQuickToolbar } from "./WarehouseDesigner/SelectionQuickToolbar";
import type { DesignerSelection } from "./WarehouseDesigner/designerSelection";
import { createCommandBus } from "./WarehouseDesigner/commands";
import { deleteSelectedNode } from "./WarehouseDesigner/routing/routingNodeActions";
import { activeBinsForRack, formatVolume, createBinsForRack, binsToLevels, volumePerBin, volumePerBinFromTotal, cmToCells, cellsToCm, getCatalogItemSpec, getLevelConfig, getTotalLocations, getNextIndexInRow, getNextRackIndex, ROW_LABEL_ADDRESS_PATTERN, reindexGeometricRow, findSnapToRowPosition, getDragSlotHighlights, binUsedVolumeDm3, binVolumeDm3, getRackDisplayId, getAllPositionsFromRacks, clampGridToBuilding, metersToCells, duplicateRacksAtPosition, generateRackUuid, assignUniqueRackNamesToNewRacks, validateAllRackNamesInLayout, validateLayoutEntityIntegrity, getProposedFirstRackLabelForStampFromCatalog, normalizeRowPrefixLetters, generateRackNames, validateGeneratedRackNames, countPlaceRowWithTemplateRacks, countEmptyRowSlotsInDraw, catalogItemTemplateKey, catalogItemFromTemplateKey, rowContainerTemplateIdFromCatalogItem, rackMatchesSlotRackId } from "../components/warehouse/warehouseUtils";
import {
  logLayoutRackHydrate,
  logLayoutRackPersist,
  logLayoutSaveDuration,
  logLayoutSavePayload,
  logLayoutSaveStart,
} from "../components/warehouse/layoutRackLog";
import { logRackRename } from "../components/warehouse/rackRenameLog";
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
import { WarehouseReportsPanel } from "../components/warehouse/magazyn/WarehouseReportsPanel";
import { DamageReportsPanel, type DamagePrefill } from "../components/warehouse/magazyn/DamageReportsPanel";
import { UI_STRINGS } from "../constants/uiStrings";
import { AppSplitView } from "../components/layout/app";
import { tabsNavItemClassName } from "../components/layout/TabsNav";
import { brandTabsNavRowClassName } from "../design-system/brandUi";
import { PrimaryButton } from "../design-system/PrimaryButton";
import { AppButton } from "../components/app-shell/AppButton";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { WarehouseShell } from "../components/warehouse/WarehouseShell";
import {
  WarehouseModeProvider,
  mainViewToWarehouseMode,
} from "../components/warehouse/WarehouseModeContext";
import { warehouseMapHallClassName } from "../components/warehouse/warehouseMapHall";
import { featuresForMode } from "../components/warehouse/features/registry";
import { LayoutMode } from "../warehouse-layout";
import { useLayoutModeShortcuts, useLayoutModeDisplay } from "../warehouse-layout";
import { normalizeBinTypeMap, normalizeStorageType } from "../utils/storageTypes";
import {
  resolveLocationLabelByUuid,
  resolveWarehouseLocation,
  syncLayoutDisplayFields,
  syncRackBinsDisplayFields,
} from "../utils/resolvedWarehouseLocation";
import { getLayoutMetersPerCell } from "../utils/warehouseGridMetrics";
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
import { exportCsv, exportLocationsMapCsv, exportJson } from "./WarehouseDesigner/DesignerExport";
import type { WarehouseReportVariant } from "../components/warehouse/reports/shared/types";
import { buildPdfReportData } from "../pdf/utils/pdfDataBuilder";
import { downloadProductLocationReportPdf, downloadStructureReportPdf } from "../api/structureReportPdfApi";
import { generateWarehousePDF } from "../pdf/generateWarehousePDF";
import { buildWarehouseExecutiveReportData } from "../pdf/utils/executiveReportDataBuilder";
import { generateWarehouseExecutivePDF } from "../pdf/generateWarehouseExecutivePDF";
import { generateWarehouseValueReportPDF } from "../pdf/generateWarehouseValueReportPDF";
import { generateTopVolumeReportPDF } from "../pdf/generateTopVolumeReportPDF";
import { useDesignerKeyboard } from "./WarehouseDesigner/DesignerKeyboard";
import { DesignerToolbar, DesignerSaveStatusText } from "./WarehouseDesigner/DesignerToolbar";
import { DesignerWarehouseSelect } from "./WarehouseDesigner/DesignerWarehouseSelect";
import { RoutingGraphLayer } from "./WarehouseDesigner/routing/RoutingGraphLayer";
import { RoutingRoutesPanel } from "./WarehouseDesigner/routing/RoutingRoutesPanel";
import { buildAccessProblemItems, type AccessProblemItem } from "./WarehouseDesigner/routing/locationAccessProblems";
import { useRoutingGraph } from "./WarehouseDesigner/routing/useRoutingGraph";
import { normalizeRotation, normalizeServiceFaceOrigin } from "./WarehouseDesigner/rackServiceFace";
import { preferOrthogonalCm } from "./WarehouseDesigner/routing/routingCanvasInteraction";
import type { RoutingTool } from "./WarehouseDesigner/routing/routingLabels";
import { confirmDeleteNodeMessage } from "./WarehouseDesigner/routing/routingDisplay";
import { DesignerGrid } from "./WarehouseDesigner/DesignerGrid";
import { focusWarehouseCanvasScroll } from "../components/warehouse/WarehouseMainView";
import { useDesignerMouseHandlers } from "./WarehouseDesigner/useDesignerMouseHandlers";
import { useDesignerRowOperations } from "./WarehouseDesigner/useDesignerRowOperations";
import { useDesignerRackPlacement } from "./WarehouseDesigner/useDesignerRackPlacement";
import { useDesignerCanvas } from "./WarehouseDesigner/useDesignerCanvas";
import { useMapVisualizationMode } from "../components/warehouse/magazyn/mapVisualization";
import { useDesignerProductModal } from "./WarehouseDesigner/useDesignerProductModal";
import { useDesignerMagazynState } from "./WarehouseDesigner/useDesignerMagazynState";
import {
  buildProductLocationIndex,
  buildRackOccupancyStats,
  locationUuidsForProduct,
  productHasAnyLocation,
  productQuantityInLayout,
  quantityByRackForProduct,
  rackIdsForProduct,
} from "./WarehouseDesigner/productLocationIndex";
import { useDesignerRowState } from "./WarehouseDesigner/useDesignerRowState";
import { RowPrefixModal, type RowPrefixModalResult, type RowPrefixRowConfig } from "../components/warehouse/RowPrefixModal";
import { getPositionCmAlongWall, getSvgLayoutSizePx } from "./WarehouseDesigner/utils/designerMouseUtils";
import { normalizeProductDims } from "../utils/productNormalizer";
import { validateAndSanitizeLayoutPayload } from "../utils/layoutSavePayload";
import type { WarehouseOccupancyMetrics } from "../api/warehouseOccupancyApi";
import { getWarehouseLocations } from "../api/warehouseGraphApi";
import { buildInventoryMaps, normalizeInventoryLocationUuid, type InventoryRow, type InventoryMaps } from "./WarehouseDesigner/inventoryMaps";
import type { DamageCandidate } from "../types/damageReport";
import { useWarehouse, type Warehouse } from "../context/WarehouseContext";
import {
  getDesignerLoadPerf,
  isDesignerPerfEnabled,
  logDesignerPerfHint,
  measureDesignerMemo,
  resetDesignerLoadPerf,
} from "./WarehouseDesigner/designerLoadPerf";
import { useDesignerDataLoading } from "./WarehouseDesigner/useDesignerDataLoading";
import { AppOverlayPortal } from "../components/overlay";

/** Resolve slot UUID from an assigned_locations entry (API JSON may use location_uuid). */
function assignedLocationEntryUuid(a: {
  locationUUID?: string;
  location_uuid?: string;
}): string | undefined {
  if (typeof a.locationUUID === "string" && a.locationUUID.trim() !== "") return a.locationUUID.trim();
  if (typeof a.location_uuid === "string" && a.location_uuid.trim() !== "") return a.location_uuid.trim();
  return undefined;
}

/** Bin slot id from layout (API may send `location_uuid` or `locationUUID`). */
function binLocationUuidFromBin(bin: { locationUUID?: string; location_uuid?: string }): string {
  const u = bin.locationUUID ?? bin.location_uuid;
  return typeof u === "string" ? u.trim() : "";
}

type PendingRowCreation =
  | { type: "emptyRow"; start: { x: number; y: number }; end: { x: number; y: number } }
  | { type: "rowWithTemplate"; start: { x: number; y: number }; end: { x: number; y: number }; item: CatalogItem }
  | { type: "stampRack"; cell: { x: number; y: number }; item: CatalogItem }
  | null;

function resolveRowCatalogItemForRowModal(
  row: RowPrefixRowConfig,
  pending: Exclude<PendingRowCreation, null>,
  rowIndex: 1 | 2,
  customTemplates: CustomRackTemplate[]
): CatalogItem | null {
  if (pending.type !== "emptyRow" && pending.type !== "rowWithTemplate") return null;
  if (row.templateKey) {
    return catalogItemFromTemplateKey(row.templateKey, customTemplates);
  }
  if (pending.type === "rowWithTemplate" && rowIndex === 1) {
    return pending.item;
  }
  return null;
}

/** Empty-row mode: only fill when user explicitly enables auto-fill. Row-from-template: default to fill unless unchecked. */
function effectiveRowAutoFill(row: RowPrefixRowConfig, pending: Exclude<PendingRowCreation, null>): boolean {
  if (pending.type === "rowWithTemplate") return row.autoFill !== false;
  return row.autoFill === true;
}

type PendingVariantSave = {
  rackId: number | string;
  baseTemplate: CustomRackTemplate;
  internalStructure: InternalStructure;
  bins?: BinState[];
  clearPassages?: boolean;
};

function templateSlotDimensions(template: CustomRackTemplate, levelIndex: number): { width_cm: number; depth_cm: number; height_cm: number } {
  const levelCfg = Array.isArray(template.levelConfig) && template.levelConfig.length > 0
    ? template.levelConfig
    : Array.from({ length: Math.max(1, template.levels) }, (_, i) => ({ level: i + 1, locations: Math.max(1, template.bins_per_level) }));
  const locs = Math.max(1, levelCfg[levelIndex]?.locations ?? template.bins_per_level ?? 1);
  const totalLevels = Math.max(1, levelCfg.length || template.levels || 1);
  // Use direct template/rack data only (no external helper dependency).
  const levelHeight = template.height_cm / totalLevels;
  return {
    width_cm: Number((template.width_cm / locs).toFixed(2)),
    depth_cm: Number(template.depth_cm.toFixed(2)),
    height_cm: Number(levelHeight.toFixed(2)),
  };
}

function levelConfigFromInternalStructure(internalStructure: InternalStructure): LevelConfigItem[] {
  return (internalStructure.levels ?? []).map((level, idx) => ({
    level: idx + 1,
    locations: Math.max(1, level.locations?.length ?? 1),
  }));
}

/** Compare storage levels only when template/rack has under-rack passage void. */
function structureDiffersFromTemplate(
  template: CustomRackTemplate,
  internalStructure: InternalStructure,
  rack?: Pick<RackState, "height_cm" | "levels" | "levelConfig" | "layoutVariant" | "passages"> | null
): boolean {
  const variantCfg = levelConfigFromInternalStructure(internalStructure);
  const baseCfg =
    Array.isArray(template.levelConfig) && template.levelConfig.length > 0
      ? template.levelConfig
      : Array.from({ length: Math.max(1, template.levels) }, (_, i) => ({
          level: i + 1,
          locations: Math.max(1, template.bins_per_level),
        }));
  const voidN = rack
    ? countPassageVoidLevelsForRack(rack)
    : countPassageVoidLevels(
        Number(template.height_cm ?? 0),
        baseCfg.length,
        getPassageVoidHeightCm(template.default_passages)
      );
  const expectedStorage = voidN > 0 ? storageLevelConfigAfterVoid(baseCfg, voidN) : baseCfg;
  if (variantCfg.length !== expectedStorage.length) return true;
  for (let i = 0; i < variantCfg.length; i++) {
    if ((variantCfg[i]?.locations ?? 1) !== (expectedStorage[i]?.locations ?? 1)) return true;
  }
  return false;
}

function buildVariantTemplate(
  base: CustomRackTemplate,
  internalStructure: InternalStructure,
  bins: BinState[] | undefined,
  variantName?: string
): CustomRackTemplate {
  const levelConfig = levelConfigFromInternalStructure(internalStructure);
  const binTypeMap: Record<string, StorageType> = {};
  (bins ?? []).forEach((b) => {
    binTypeMap[`${b.level_index}-${b.segment_index}`] = normalizeStorageType(b.storage_type);
  });
  const variantId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `variant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const existingVariantSuffix = /\s\[Wariant\s\d+\]$/.test(base.name);
  const baseName = existingVariantSuffix ? base.name.replace(/\s\[Wariant\s\d+\]$/, "") : base.name;
  const resolvedName = variantName?.trim() ? variantName.trim() : `${baseName} [Wariant ${Date.now().toString().slice(-4)}]`;
  return {
    ...base,
    id: variantId,
    templateId: base.id,
    name: resolvedName,
    width_cm: base.width_cm,
    depth_cm: base.depth_cm,
    height_cm: base.height_cm,
    levels: Math.max(1, levelConfig.length),
    bins_per_level: levelConfig[0]?.locations ?? base.bins_per_level,
    levelConfig,
    bin_type_map: Object.keys(binTypeMap).length > 0 ? binTypeMap : base.bin_type_map,
  };
}

export default function WarehouseDesigner() {
  logDesignerPerfHint();
  const { warehouse: activeWarehouse, warehouses, setWarehouse, refreshWarehouses, warehousesLoading } = useWarehouse();
  const designerPerfEnabled = isDesignerPerfEnabled();
  const loadLayoutCallRef = useRef(0);
  const layoutLoadInFlightRef = useRef<number | null>(null);
  const firstRenderMarkedRef = useRef(false);
  const fullReadyPrintedRef = useRef(false);
  const prevWarehousesLoadingRef = useRef<boolean | null>(null);
  const selectedWarehouseId = activeWarehouse?.id ?? null;
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
  const getRackDisplayIdWithLayout = useCallback((r: RackState) => getRackDisplayId(r, layout), [layout]);
  const rackNameDuplicateMessage = useMemo(() => {
    const { valid, errors } = validateAllRackNamesInLayout(layout);
    if (valid) return null;
    return errors.join(" · ");
  }, [layout]);
  const [selectedRackId, setSelectedRackId] = useState<number | string | null>(null);
  /** Details drawer — opened by double-click, independent from selection. */
  const [previewRackId, setPreviewRackId] = useState<number | string | null>(null);
  /** Name field focus in properties drawer — suppresses floating toolbar. */
  const [editingRackId, setEditingRackId] = useState<number | string | null>(null);
  type SpecialLocationsState = { pick_start: { id: number; x: number; y: number } | null; packing: { id: number; x: number; y: number } | null; dock: { id: number; x: number; y: number } | null };
  const [specialLocations, setSpecialLocations] = useState<SpecialLocationsState>({ pick_start: null, packing: null, dock: null });
  const [selectedSpecialLocationKey, setSelectedSpecialLocationKey] = useState<"pick_start" | "packing" | "dock" | null>(null);
  const [layoutExportOpen, setLayoutExportOpen] = useState(false);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  /** Server-side Σ(qty × product.volume) from inventory rows; overrides bin-based dashboard when loaded. */
  const [occupancyMetrics, setOccupancyMetrics] = useState<WarehouseOccupancyMetrics | null>(null);

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
  /** Used by stamp tool when placing racks without a template (default: Warehouse). */
  const [manualRackType, setManualRackType] = useState<RackType>("warehouse");
  const {
    zoom,
    setZoom,
    pan,
    setPan,
    scroll,
    setScrollPosition,
    hasStoredCamera,
    cameraEpoch,
    commitCameraNow,
    cursorCm,
    setCursorCm,
    isPanning,
    setIsPanning,
  } = useDesignerCanvas(selectedWarehouseId, layout.layout_id ?? null);
  const { mode: mapVisualizationMode, setMode: setMapVisualizationMode } =
    useMapVisualizationMode(selectedWarehouseId);
  const restoredScroll = useMemo(
    () => ({ left: scroll.left, top: scroll.top, _epoch: cameraEpoch }),
    [scroll.left, scroll.top, cameraEpoch]
  );
  const handleCameraFitApplied = useCallback(
    (camera: { zoom: number; panX: number; panY: number; scrollLeft: number; scrollTop: number }) => {
      commitCameraNow(camera);
    },
    [commitCameraNow]
  );
  const handleViewportScroll = useCallback(
    (next: { left: number; top: number }) => {
      setScrollPosition(next);
    },
    [setScrollPosition]
  );
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
  /** Magazyn sidebar: product picked to highlight all its bin locations on the map (toggle). */
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [hoveredProductIdOnMap, setHoveredProductIdOnMap] = useState<string | null>(null);
  /** Magazyn: sidebar location row hover → highlight bin on top-down map (location UUID). */
  const [hoveredLocationUUID, setHoveredLocationUUID] = useState<string | null>(null);
  const [focusedBinUUID, setFocusedBinUUID] = useState<string | null>(null);
  /** Magazyn tab: selected template for type-based rack highlighting. */
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  /** Magazyn tab: selected location (level_index, segment_index) for inventory filter and highlight. */
  const [selectedLocationForProducts, setSelectedLocationForProducts] = useState<{ level_index: number; segment_index: number } | null>(null);
  /** Inventory products (Magazyn); drive bin occupancy and quantity display. */
  const [products, setProducts] = useState<WarehouseProduct[]>([]);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showAllProductsInSidebar, setShowAllProductsInSidebar] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [structureRebuildPending, setStructureRebuildPending] = useState<{
    impacts: StructureRemovalImpact[];
    layout: LayoutState;
    source: "layout_save" | "template_instances" | "api";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [rackPanelDismissed, setRackPanelDismissed] = useState(false);
  const layoutScrollRestoreRef = useRef<{ top: number; left: number } | null>(null);
  const [draggingFromCatalog, setDraggingFromCatalog] = useState<CatalogItem | null>(null);
  const [customTemplates, setCustomTemplates] = useState<CustomRackTemplate[]>([]);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(LayoutMode.SELECT);
  const rowToolActive = layoutMode === LayoutMode.DRAW_ROW;
  const passageToolActive = layoutMode === LayoutMode.DRAW_PASSAGE;
  const aisleToolActive = layoutMode === LayoutMode.DRAW_AISLE;
  const setRowToolActive = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLayoutMode((prev) => (typeof v === "function" ? v(prev === LayoutMode.DRAW_ROW) : v) ? LayoutMode.DRAW_ROW : LayoutMode.SELECT);
  }, []);
  const setPassageToolActive = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLayoutMode((prev) => (typeof v === "function" ? v(prev === LayoutMode.DRAW_PASSAGE) : v) ? LayoutMode.DRAW_PASSAGE : LayoutMode.SELECT);
  }, []);
  const setAisleToolActive = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLayoutMode((prev) => (typeof v === "function" ? v(prev === LayoutMode.DRAW_AISLE) : v) ? LayoutMode.DRAW_AISLE : LayoutMode.SELECT);
  }, []);
  useLayoutModeShortcuts(layoutMode, setLayoutMode);
  const layoutModeDisplay = useLayoutModeDisplay(layoutMode);
  useEffect(() => {
    // Rack type switch changes the working template universe, so clear dependent selections.
    setRowToolTemplate(null);
    setSelectedTemplateId(null);
  }, [manualRackType, setRowToolTemplate]);

  const [rowPrefixModalOpen, setRowPrefixModalOpen] = useState(false);
  const [pendingRowCreation, setPendingRowCreation] = useState<PendingRowCreation>(null);
  /** Offset from pointer (cell) to row start when drag started, so we can compute preview from current cell. */
  const rowDragPointerOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  /** Latest preview position for row drag (so window mouseup can read it). */
  const rowDragPreviewStartRef = useRef<{ x: number; y: number } | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedAisleIndex, setSelectedAisleIndex] = useState<number | null>(null);
  const [showGridMagazyn, setShowGridMagazyn] = useState(false);
  const [showGridLayout, setShowGridLayout] = useState(true);
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
  const [searchParams, setSearchParams] = useSearchParams();
  /** Single view mode: Magazyn (live) | Projektowanie magazynu (kept in sync with `?view=`). */
  const [mainView, setMainView] = useState<"magazyn" | "layout">(() =>
    searchParams.get("view") === "layout" ? "layout" : "magazyn"
  );
  /** Within Projektant: physical design vs authored Routing Graph workspace. */
  const [layoutWorkspace, setLayoutWorkspace] = useState<"designing" | "routes">("designing");
  const routesMode = mainView === "layout" && layoutWorkspace === "routes";
  const routing = useRoutingGraph(
    mainView === "layout" ? selectedWarehouseId : null,
    layout.layout_id ?? null
  );
  const [routingTool, setRoutingTool] = useState<RoutingTool>("draw_edge");
  const [routingSelectedNode, setRoutingSelectedNode] = useState<string | null>(null);
  const [routingSelectedEdge, setRoutingSelectedEdge] = useState<string | null>(null);
  const [routingEdgeDraftFrom, setRoutingEdgeDraftFrom] = useState<string | null>(null);
  const [routingDraftCursorCm, setRoutingDraftCursorCm] = useState<{ x: number; y: number } | null>(null);
  const [testStartUuid, setTestStartUuid] = useState<string | null>(null);
  const [testDestUuid, setTestDestUuid] = useState<string | null>(null);
  const [routingLocations, setRoutingLocations] = useState<
    { id: number; name: string; location_type?: string | null }[]
  >([]);
  const [highlightOrphanUuids, setHighlightOrphanUuids] = useState<string[]>([]);
  const [highlightInvalidEdgeUuids, setHighlightInvalidEdgeUuids] = useState<string[]>([]);
  const [routingDraftOrthoGuide, setRoutingDraftOrthoGuide] = useState<"none" | "h" | "v" | null>(null);
  const [selectedAccessLocationId, setSelectedAccessLocationId] = useState<number | null>(null);
  const [showAllAccessProblems, setShowAllAccessProblems] = useState(false);
  const [canvasFocusCm, setCanvasFocusCm] = useState<{
    x: number;
    y: number;
    zoom?: number;
    seq: number;
  } | null>(null);
  const canvasFocusSeqRef = useRef(0);
  const commandBusRef = useRef(createCommandBus());

  const setRoutingToolSafe = useCallback((tool: RoutingTool) => {
    setRoutingTool(tool);
    if (tool !== "draw_edge") {
      setRoutingEdgeDraftFrom(null);
      setRoutingDraftCursorCm(null);
    }
  }, []);

  const accessProblemItems = useMemo(
    () => buildAccessProblemItems(routing.locationAccess, routingLocations, layout.racks),
    [routing.locationAccess, routingLocations, layout.racks]
  );
  const problemRackUuids = useMemo(
    () =>
      [
        ...new Set(
          accessProblemItems
            .map((p) => p.rackUuid)
            .filter((u): u is string => typeof u === "string" && u.length > 0)
        ),
      ],
    [accessProblemItems]
  );

  const handleSelectAccessProblem = useCallback(
    (item: AccessProblemItem) => {
      setSelectedAccessLocationId(item.locationId);
      routing.setShowAccessDiagnostics(true);
      canvasFocusSeqRef.current += 1;
      const seq = canvasFocusSeqRef.current;

      if (item.rackUuid) {
        const rack = layout.racks.find((r) => String(r.uuid || "") === item.rackUuid);
        if (rack) {
          const rid = rack.id ?? rack.uuid ?? rack.rack_index;
          setSelectedRackId(rid);
          setSelectedRackIds([rid]);
          setSelectedRackIdOnMap(String(rid));
          const cx = (Number(rack.x) + Number(rack.width) / 2) * GRID_UNIT_CM;
          const cy = (Number(rack.y) + Number(rack.height) / 2) * GRID_UNIT_CM;
          setCanvasFocusCm({ x: cx, y: cy, zoom: 1.35, seq });
          return;
        }
      }

      const bind = routing.locationAccess.find((a) => a.location_id === item.locationId);
      if (bind?.service_point_x_cm != null && bind?.service_point_y_cm != null) {
        setCanvasFocusCm({
          x: bind.service_point_x_cm,
          y: bind.service_point_y_cm,
          zoom: 1.35,
          seq,
        });
        return;
      }
      if (bind?.entry_x_cm != null && bind?.entry_y_cm != null) {
        setCanvasFocusCm({ x: bind.entry_x_cm, y: bind.entry_y_cm, zoom: 1.35, seq });
      }
    },
    [layout.racks, routing]
  );

  const handleClearAccessProblemSelection = useCallback(() => {
    setSelectedAccessLocationId(null);
    setShowAllAccessProblems(false);
  }, []);

  /** Delete/Backspace removes selected routing node; Enter/Escape finishes drawing stroke. */
  useEffect(() => {
    if (!routesMode) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if ((e.key === "Enter" || e.key === "Escape") && routingTool === "draw_edge") {
        e.preventDefault();
        // End current polyline stroke; stay ready for next branch via „Rysuj trasę” or empty draft.
        setRoutingEdgeDraftFrom(null);
        setRoutingDraftCursorCm(null);
        setRoutingSelectedNode(null);
        setRoutingSelectedEdge(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && (routingTool === "select" || routingTool === "edit") && routingSelectedNode) {
        e.preventDefault();
        const node = routing.nodes.find((n) => n.uuid === routingSelectedNode);
        if (!node) return;
        if (routingTool === "edit") {
          deleteSelectedNode(routing, node, setRoutingSelectedNode, routingLocations);
        } else {
          if (!window.confirm(confirmDeleteNodeMessage(node, routing.edges, routing.accessPoints, routing.nodes, routingLocations))) return;
          routing.removeNode(node.uuid);
          setRoutingSelectedNode(null);
        }
        setHighlightOrphanUuids([]);
        setHighlightInvalidEdgeUuids([]);
        setRoutingDraftOrthoGuide(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && (routingTool === "select" || routingTool === "edit") && routingSelectedEdge && !routingSelectedNode) {
        e.preventDefault();
        if (!window.confirm("Usunąć ten odcinek trasy?")) return;
        routing.removeEdge(routingSelectedEdge);
        setRoutingSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    routesMode,
    routingTool,
    routingSelectedNode,
    routingSelectedEdge,
    routing.nodes,
    routing.edges,
    routing.accessPoints,
    routing.removeNode,
    routing.removeEdge,
    routingLocations,
  ]);

  const confirmLeaveRoutingDirty = useCallback(() => {
    if (!routing.dirty) return true;
    return window.confirm(
      "Masz niezapisane zmiany sieci tras. Kontynuować bez zapisu? Niezapisane zmiany zostaną utracone."
    );
  }, [routing.dirty]);

  useEffect(() => {
    if (!routesMode || selectedWarehouseId == null) return;
    let cancelled = false;
    void getWarehouseLocations(selectedWarehouseId).then((rows) => {
      if (cancelled) return;
      setRoutingLocations(
        (rows ?? []).map((r) => ({
          id: r.id,
          name: r.name || r.code || `#${r.id}`,
          location_type: r.location_type ?? null,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [routesMode, selectedWarehouseId]);

  const selectDesignerView = useCallback(
    (view: "magazyn" | "layout") => {
      if (view === "magazyn") {
        if (routing.dirty && !confirmLeaveRoutingDirty()) return;
        if (routing.dirty) void routing.load();
        setMainView("magazyn");
        setLayoutWorkspace("designing");
        setEditingProductId(null);
        const next = new URLSearchParams(searchParams);
        next.delete("view");
        setSearchParams(next);
      } else {
        setMainView("layout");
        const next = new URLSearchParams(searchParams);
        next.set("view", "layout");
        setSearchParams(next);
      }
    },
    [searchParams, setSearchParams, routing, confirmLeaveRoutingDirty],
  );

  useEffect(() => {
    if (!routing.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [routing.dirty]);

  const routingNavBlocker = useBlocker(routing.dirty);
  useEffect(() => {
    if (routingNavBlocker.state !== "blocked") return;
    if (confirmLeaveRoutingDirty()) {
      void routing.load();
      routingNavBlocker.proceed();
    } else {
      routingNavBlocker.reset();
    }
  }, [routingNavBlocker, confirmLeaveRoutingDirty, routing]);
  const [showWarehouseReportsPanel, setShowWarehouseReportsPanel] = useState(false);
  const [showDamageReportsPanel, setShowDamageReportsPanel] = useState(false);
  const [damagePrefill, setDamagePrefill] = useState<DamagePrefill | null>(null);
  /** Pointer semantics for the shared mouse hook: layout canvas must never run Magazyn map rack/aisle logic (elevation, etc.). */
  const magazynMapInteractions = mainView === "magazyn" && searchParams.get("view") !== "layout";
  const showGrid = mainView === "magazyn" ? showGridMagazyn : showGridLayout;
  const setShowGrid = useCallback((fn: (v: boolean) => boolean) => {
    if (mainView === "magazyn") {
      setShowGridMagazyn(fn);
    } else {
      setShowGridLayout(fn);
    }
  }, [mainView]);
  const svgRef = useRef<SVGSVGElement>(null);
  const warehouseMode = mainViewToWarehouseMode(mainView);
  const isLiveView = warehouseMode === "live";
  const activeWarehouseFeatures = featuresForMode(warehouseMode);

  const { refreshMagazynStock, loadDesignerProducts, resetWarehouseDataRefs } = useDesignerDataLoading({
    selectedWarehouseId,
    mainView,
    layout,
    setInventoryRows,
    setOccupancyMetrics,
    setProducts,
    onWarehouseDataReset: () => {
      setInventoryRows([]);
      setOccupancyMetrics(null);
      setProducts([]);
    },
  });

  const designerPerf = designerPerfEnabled ? getDesignerLoadPerf(true) : null;

  useEffect(() => {
    if (!designerPerfEnabled || mainView !== "magazyn" || selectedWarehouseId == null) return;
    resetDesignerLoadPerf();
    loadLayoutCallRef.current = 0;
    firstRenderMarkedRef.current = false;
    fullReadyPrintedRef.current = false;
    prevWarehousesLoadingRef.current = null;
    getDesignerLoadPerf(true)?.markSessionStart(`Magazyn WH=${selectedWarehouseId}`);
  }, [designerPerfEnabled, mainView, selectedWarehouseId]);

  useEffect(() => {
    if (!designerPerfEnabled) return;
    const perf = getDesignerLoadPerf();
    if (!perf) return;
    if (prevWarehousesLoadingRef.current === null) {
      prevWarehousesLoadingRef.current = warehousesLoading;
      if (warehousesLoading) perf.start("WarehouseContext warehousesLoading");
      return;
    }
    if (prevWarehousesLoadingRef.current && !warehousesLoading) {
      perf.end("WarehouseContext warehousesLoading");
    }
    prevWarehousesLoadingRef.current = warehousesLoading;
  }, [designerPerfEnabled, warehousesLoading]);

  useLayoutEffect(() => {
    if (!designerPerfEnabled || mainView !== "magazyn" || firstRenderMarkedRef.current) return;
    firstRenderMarkedRef.current = true;
    const perf = getDesignerLoadPerf();
    if (!perf) return;
    perf.record("pierwszy render (useLayoutEffect)", perf.elapsedSinceSessionStart());
  }, [designerPerfEnabled, mainView, loading, products.length, layout.racks.length, inventoryRows.length]);

  useEffect(() => {
    if (!designerPerfEnabled || mainView !== "magazyn" || fullReadyPrintedRef.current) return;
    if (loading || warehousesLoading || selectedWarehouseId == null) return;
    const timer = window.setTimeout(() => {
      if (fullReadyPrintedRef.current) return;
      fullReadyPrintedRef.current = true;
      getDesignerLoadPerf()?.printSummary("PEŁNA GOTOWOŚĆ widoku Magazyn");
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    designerPerfEnabled,
    mainView,
    loading,
    warehousesLoading,
    selectedWarehouseId,
    products.length,
    layout.racks.length,
    inventoryRows.length,
    occupancyMetrics,
  ]);

  useEffect(() => {
    if (mainView !== "magazyn") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mainView]);
  /** Magazyn map column (`overflow-y-auto`): block wheel chaining at scroll extremes (non-passive). */
  const magazynMapScrollRef = useRef<HTMLDivElement>(null);
  /** Magazyn rack side view scroll wrapper: same wheel containment. */
  const magazynRackSideScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mainView !== "magazyn" || layout.racks.length === 0 || selectedRackIdForSideView != null) return;
    const el = magazynMapScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const isScrollingUp = e.deltaY < 0;
      const isScrollingDown = e.deltaY > 0;
      const atTop = el.scrollTop === 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
      if ((isScrollingUp && atTop) || (isScrollingDown && atBottom)) {
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mainView, layout.racks.length, selectedRackIdForSideView]);
  useEffect(() => {
    if (mainView !== "magazyn" || layout.racks.length === 0 || selectedRackIdForSideView == null) return;
    const el = magazynRackSideScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const isScrollingUp = e.deltaY < 0;
      const isScrollingDown = e.deltaY > 0;
      const atTop = el.scrollTop === 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
      if ((isScrollingUp && atTop) || (isScrollingDown && atBottom)) {
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mainView, layout.racks.length, selectedRackIdForSideView]);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const lastMouseRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const rafIdRef = useRef<number>(0);
  const rowDrawTemplateRef = useRef<CatalogItem | null>(null);
  const rowDrawEndPendingRef = useRef<{ x: number; y: number } | null>(null);
  const rowDrawEndRafRef = useRef<number | null>(null);
  const passageDrawEndPendingRef = useRef<{ x: number; y: number } | null>(null);
  const passageDrawEndRafRef = useRef<number | null>(null);
  const passageShiftKeyRef = useRef(false);
  const [passageDrawStart, setPassageDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [passageDrawEnd, setPassageDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [passageWidthCm, setPassageWidthCm] = useState(90);
  const [selectedPassage, setSelectedPassage] = useState<{ rackUuid: string; passageUuid: string } | null>(null);

  const designerSelection: DesignerSelection = useMemo(() => {
    if (routesMode) {
      if (routingSelectedNode) return { kind: "node", nodeUuid: routingSelectedNode };
      if (routingSelectedEdge) return { kind: "edge", edgeUuid: routingSelectedEdge };
      return { kind: null };
    }
    if (selectedPassage) {
      return {
        kind: "passage",
        rackUuid: selectedPassage.rackUuid,
        passageUuid: selectedPassage.passageUuid,
      };
    }
    if (selectedRackId != null) return { kind: "rack", rackId: selectedRackId };
    return { kind: null };
  }, [routesMode, routingSelectedNode, routingSelectedEdge, selectedPassage, selectedRackId]);

  const selectionToolbarAnchor = useMemo(() => {
    if (!routesMode) return null;
    const scale = BASE_PX_PER_CELL / GRID_UNIT_CM;
    if (routingSelectedNode) {
      const n = routing.nodes.find((x) => x.uuid === routingSelectedNode);
      if (!n) return null;
      return { left: n.x * scale - 40, top: n.y * scale - 36 };
    }
    if (routingSelectedEdge) {
      const e = routing.edges.find((x) => x.uuid === routingSelectedEdge);
      if (!e) return null;
      const a = routing.nodes.find((x) => x.uuid === e.from_node_uuid);
      const b = routing.nodes.find((x) => x.uuid === e.to_node_uuid);
      if (!a || !b) return null;
      return { left: ((a.x + b.x) / 2) * scale - 40, top: ((a.y + b.y) / 2) * scale - 36 };
    }
    return null;
  }, [routesMode, routingSelectedNode, routingSelectedEdge, routing.nodes, routing.edges]);
  const [draggingPassage, setDraggingPassage] = useState<{
    rackUuid: string;
    passageUuid: string;
    grabOffsetCm: number;
  } | null>(null);
  const [passageShiftKey, setPassageShiftKey] = useState(false);
  const cursorPendingRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const placeRowWithTemplateRef = useRef<((start: { x: number; y: number }, end: { x: number; y: number }, item: CatalogItem) => void) | null>(null);
  const placeEmptyRowRef = useRef<((start: { x: number; y: number }, end: { x: number; y: number }) => void) | null>(null);
  const canMoveRowToRef = useRef<((rowId: string, newStart: { x: number; y: number }) => boolean) | null>(null);
  const moveRowToPositionRef = useRef<((rowId: string, newStartX: number, newStartY: number) => void) | null>(null);
  const moveRackWithinRowRef = useRef<((rowId: string, rackId: number | string, fromSlotIndex: number, toSlotIndex: number) => void) | null>(null);
  const wallElementDragPosRef = useRef<number | null>(null);
  const [showRackLabelDownload, setShowRackLabelDownload] = useState(false);
  const [clearRackConfirmOpen, setClearRackConfirmOpen] = useState(false);
  const [clearRackBusy, setClearRackBusy] = useState(false);
  const [wallElementTool, setWallElementTool] = useState<"door" | "gate" | null>(null);
  const [selectedWallElementId, setSelectedWallElementId] = useState<string | null>(null);
  const [draggingWallElementId, setDraggingWallElementId] = useState<string | null>(null);
  const [dragPreviewPositionCm, setDragPreviewPositionCm] = useState<number | null>(null);
  const [showGateTypeModal, setShowGateTypeModal] = useState(false);
  const [pendingGatePlacement, setPendingGatePlacement] = useState<{ wall: WallSide; position_cm: number } | null>(null);
  const [pendingVariantSave, setPendingVariantSave] = useState<PendingVariantSave | null>(null);
  const [variantNameInput, setVariantNameInput] = useState("");

  useEffect(() => {
    if (pendingVariantSave == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPendingVariantSave(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingVariantSave]);

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
    if (passageToolActive) return;
    setPassageDrawStart(null);
    setPassageDrawEnd(null);
    passageDrawEndPendingRef.current = null;
    if (passageDrawEndRafRef.current != null) {
      cancelAnimationFrame(passageDrawEndRafRef.current);
      passageDrawEndRafRef.current = null;
    }
  }, [passageToolActive]);

  useEffect(() => {
    if (!routesMode) return;
    setSelectedPassage(null);
    setPassageDrawStart(null);
    setPassageDrawEnd(null);
    setDraggingPassage(null);
  }, [routesMode]);

  useEffect(() => {
    const v = searchParams.get("view") === "layout" ? "layout" : "magazyn";
    setMainView(v);
  }, [searchParams]);

  const prevMainViewRef = useRef(mainView);
  useEffect(() => {
    const prev = prevMainViewRef.current;
    prevMainViewRef.current = mainView;
    if (mainView === "layout" && prev === "magazyn") {
      setShowElevationForRackId(null);
      setSelectedRackIdForSideView(null);
    }
  }, [mainView]);

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

  const inventoryMaps = useMemo(() => {
    return measureDesignerMemo(designerPerf, "React: buildInventoryMaps", () => {
      if (inventoryRows.length === 0) return null;
      return buildInventoryMaps(inventoryRows, layout);
    });
  }, [designerPerf, inventoryRows, layout]);

  const damageCandidates = useMemo<DamageCandidate[]>(() => {
    if (!inventoryMaps) return [];
    const productById = new Map<number, WarehouseProduct>();
    for (const p of products) {
      const idNum = Number(p.id);
      if (Number.isFinite(idNum)) productById.set(idNum, p);
    }
    const out: DamageCandidate[] = [];
    for (const rack of layout.racks) {
      for (const bin of activeBinsForRack(rack)) {
        if (normalizeStorageType(bin.storage_type) !== "damaged") continue;
        const locUuid = normalizeInventoryLocationUuid(binLocationUuidFromBin(bin));
        if (!locUuid) continue;
        const invRowsAtLoc = inventoryMaps.byLocationUuid.get(locUuid) ?? [];
        for (const inv of invRowsAtLoc) {
          const p = productById.get(Number(inv.product_id));
          if (!p) continue;
          const available = safeQuantity(inv.available_quantity ?? inv.quantity);
          if (available <= 0) continue;
          out.push({
            productId: Number(inv.product_id),
            productName: p.name ?? "Nieznany produkt",
            sku: p.sku ?? undefined,
            locationUUID: locUuid,
            locationLabel: resolveWarehouseLocation(rack, bin, layout).label || locUuid,
            availableQuantity: available,
            purchasePrice: Number(p.purchase_price ?? 0),
          });
        }
      }
    }
    // Deduplicate by product+location and sum available quantity.
    const merged = new Map<string, DamageCandidate>();
    for (const c of out) {
      const k = `${c.productId}|${c.locationUUID}`;
      const prev = merged.get(k);
      if (!prev) {
        merged.set(k, { ...c });
      } else {
        prev.availableQuantity += c.availableQuantity;
      }
    }
    return [...merged.values()].sort((a, b) => b.availableQuantity - a.availableQuantity);
  }, [inventoryMaps, products, layout.racks]);

  /** Dev visibility: stock rows missing location_uuid (should be empty in normal operation). */
  useEffect(() => {
    if (inventoryRows.length === 0) return;
    const missing = inventoryRows.filter((r) => {
      const u = r.location_uuid;
      return u == null || (typeof u === "string" && u.trim() === "");
    });
    if (missing.length === 0) return;
    const cap = 100;
    const slice = missing.slice(0, cap);
    const details = slice.map((r) => ({
      id: r.id,
      product_id: r.product_id,
      location_id: r.location_id,
      location_name: r.location_name,
    }));
    warn(
      `[WarehouseDesigner] Inventory rows missing location_uuid: ${missing.length} of ${inventoryRows.length} (showing ${slice.length} row(s)${missing.length > cap ? `, +${missing.length - cap} more` : ""})`,
      details
    );
  }, [inventoryRows]);

  /** Magazyn SSOT: inventory qty>0 wins; assigned fills gaps; layout UUIDs only. */
  const productLocationIndex = useMemo(() => {
    return measureDesignerMemo(designerPerf, "React: productLocationIndex", () =>
      buildProductLocationIndex({ layout, products, inventoryRows })
    );
  }, [designerPerf, layout, products, inventoryRows]);

  const productsByIdForOccupancy = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p] as const));
    return map;
  }, [products]);

  const rackOccupancyStats = useMemo(() => {
    return measureDesignerMemo(designerPerf, "React: rackOccupancyStats", () =>
      buildRackOccupancyStats({
        layout,
        index: productLocationIndex,
        productsById: productsByIdForOccupancy,
        binVolumeDm3,
      })
    );
  }, [designerPerf, layout, productLocationIndex, productsByIdForOccupancy]);

  const {
    selectedRackForMagazyn,
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
    isBinOccupiedByQuantity,
  } = useDesignerMagazynState({
    layout,
    products,
    selectedRackIdForSideView,
    inventoryRows,
    inventoryMaps,
    productLocationIndex,
  });
  const usedStorageTypesForLegend = useMemo<StorageType[]>(() => {
    const rackForLegend = displayRack ?? selectedRackForMagazyn;
    if (!rackForLegend) return [];
    const order: StorageType[] = ["primary", "pick", "buffer", "reserve", "damaged"];
    const used = new Set<StorageType>();
    for (const b of rackForLegend.bins ?? []) {
      used.add(normalizeStorageType(b.storage_type));
    }
    return order.filter((t) => used.has(t));
  }, [displayRack, selectedRackForMagazyn]);
  /** Fallback: occupied locations (qty > 0) from Magazyn SSOT — when API metrics unavailable. */
  const binOccupancyLocationStats = useMemo(() => {
    let primary = 0;
    let reserve = 0;
    let damaged = 0;
    const seen = new Set<string>();
    for (const rack of layout.racks) {
      const rid = String(rack.id ?? rack.rack_index);
      for (const bin of activeBinsForRack(rack)) {
        const uuid = normalizeInventoryLocationUuid(binLocationUuidFromBin(bin));
        if (!uuid || !productLocationIndex.byLocation.has(uuid)) continue;
        if (seen.has(uuid)) continue;
        seen.add(uuid);
        const type = normalizeStorageType(bin.storage_type);
        if (type === "reserve") reserve += 1;
        else if (type === "damaged") damaged += 1;
        else primary += 1;
      }
    }
    return {
      primary,
      reserve,
      damaged,
      total: primary + reserve + damaged,
    };
  }, [layout.racks, productLocationIndex]);

  const globalLocationStatsForLegend = useMemo(() => {
    if (occupancyMetrics) {
      const p = occupancyMetrics.primary_location_count;
      const r = occupancyMetrics.reserve_location_count;
      const d = occupancyMetrics.damaged_location_count;
      return { primary: p, reserve: r, damaged: d, total: p + r + d };
    }
    return binOccupancyLocationStats;
  }, [occupancyMetrics, binOccupancyLocationStats]);

  /**
   * Occupied vs free **locations** for Magazyn pulpit (never product/row counts).
   * Total slots: API `*_location_count` (layout bin UUIDs) when available, else walk layout.
   * Occupied: FE distinct locations with qty > 0 (`isBinOccupiedByQuantity`) — aligns with map viz
   * and WMS rule „wolna = brak produktów / qty = 0”. Backend `*_slots_with_stock` is the same
   * unit (location UUIDs) but volume-gated; FE qty-based keeps panel and overlay consistent.
   */
  const locationFillCounts = useMemo(() => {
    let total = 0;
    if (occupancyMetrics) {
      total =
        occupancyMetrics.primary_location_count +
        occupancyMetrics.reserve_location_count +
        occupancyMetrics.damaged_location_count;
    } else {
      const seen = new Set<string>();
      for (const rack of layout.racks) {
        const rid = String(rack.id ?? rack.rack_index);
        for (const bin of activeBinsForRack(rack)) {
          const uuid = binLocationUuidFromBin(bin);
          const key = uuid || `${rid}-${bin.level_index}-${bin.segment_index}`;
          if (seen.has(key)) continue;
          seen.add(key);
          total += 1;
        }
      }
    }
    const occupied = binOccupancyLocationStats.total;
    return { occupied, free: Math.max(0, total - occupied) };
  }, [occupancyMetrics, binOccupancyLocationStats, layout.racks]);

  /** O(1) occupied UUID set for map visualization — SSOT locations with qty > 0. */
  const occupiedLocationUuids = useMemo(() => {
    return new Set(productLocationIndex.byLocation.keys());
  }, [productLocationIndex]);

  /** Map locationUUID → bin (for storage_type and primary/reserve split). Declared before mapRackState and occupancy useMemos. */
  const uuidToBin = useMemo(() => {
    const map = new Map<string, BinState>();
    layout.racks.forEach((rack) => {
      activeBinsForRack(rack).forEach((bin) => {
        const u = normalizeInventoryLocationUuid(binLocationUuidFromBin(bin));
        if (u) map.set(u, bin);
      });
    });
    return map;
  }, [layout.racks]);

  /** Map locationUUID → rack id (string) for product locator: which rack contains a location. */
  const uuidToRackId = useMemo(() => {
    const map = new Map<string, string>();
    layout.racks.forEach((rack) => {
      const rackId = String(rack.id ?? rack.rack_index);
      activeBinsForRack(rack).forEach((bin) => {
        const u = normalizeInventoryLocationUuid(binLocationUuidFromBin(bin));
        if (u) map.set(u, rackId);
      });
    });
    return map;
  }, [layout.racks]);

  /** Layout-scoped location identity: valid UUIDs for current rack bins only. */
  const validLayoutLocationUUIDs = useMemo(() => {
    const out = new Set<string>();
    for (const rack of layout.racks) {
      for (const bin of activeBinsForRack(rack)) {
        const uuid = normalizeInventoryLocationUuid(binLocationUuidFromBin(bin));
        if (uuid) out.add(uuid);
      }
    }
    return out;
  }, [layout.racks]);

  /** Map product id → Set of rack ids (SSOT). */
  const productToRackIds = useMemo(() => {
    return measureDesignerMemo(designerPerf, "React: productToRackIds", () => {
      const map = new Map<string, Set<string>>();
      for (const p of products) {
        map.set(p.id, rackIdsForProduct(productLocationIndex, p.id));
      }
      return map;
    });
  }, [designerPerf, products, productLocationIndex]);

  /** Rack ids to highlight when a product is selected on the map (global locator). */
  const activeProductIdOnMap = hoveredProductIdOnMap ?? selectedProductIdOnMap;
  const rackIdsContainingSelectedProduct =
    activeProductIdOnMap != null ? productToRackIds.get(activeProductIdOnMap) ?? null : null;
  const productRackQuantities = useMemo(() => {
    if (activeProductIdOnMap == null) return null;
    const quantities = quantityByRackForProduct(productLocationIndex, activeProductIdOnMap);
    return quantities.size > 0 ? quantities : null;
  }, [activeProductIdOnMap, productLocationIndex]);

  /** Rack ids to highlight when a template is selected in Magazyn dashboard. */
  const rackIdsForSelectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return new Set<string>();
    return new Set(
      layout.racks
        .filter((r) => r.templateId === selectedTemplateId)
        .map((r) => String(r.id ?? r.rack_index))
    );
  }, [layout.racks, selectedTemplateId]);

  /** Bin UUIDs to draw on map when a product is selected in Magazyn sidebar (SSOT). */
  const highlightedBinUUIDsForSidebarProduct = useMemo(() => {
    if (selectedProductId == null) return null;
    const set = locationUuidsForProduct(productLocationIndex, selectedProductId);
    return set.size > 0 ? set : null;
  }, [selectedProductId, productLocationIndex]);

  const toggleProductMapHighlight = useCallback((productId: string) => {
    setSelectedProductId((prev) => (prev === productId ? null : productId));
  }, []);

  /** For canvas: merge product/template highlights. */
  const canvasHighlightedRackIds = useMemo(() => {
    const base =
      selectedProductId != null
        ? new Set<string>()
        : rackIdsContainingSelectedProduct ?? new Set<string>();
    const out = new Set(base);
    for (const rid of rackIdsForSelectedTemplate) out.add(rid);
    return out;
  }, [
    selectedProductId,
    rackIdsContainingSelectedProduct,
    rackIdsForSelectedTemplate,
  ]);

  /** Quantity breakdown for the globally selected product (for ProductLocatorSidebar). */
  const selectedProductQuantityBreakdown = useMemo(() => {
    if (selectedProductIdOnMap == null) return null;
    const p = products.find((x) => x.id === selectedProductIdOnMap);
    if (!p) return null;

    let totalQuantity = 0;
    let primaryQuantity = 0;
    let reserveQuantity = 0;
    const entries = productLocationIndex.byProduct.get(selectedProductIdOnMap) ?? [];
    if (entries.length > 0) {
      for (const e of entries) {
        const type = uuidToBin.get(e.locationUUID)?.storage_type ?? "primary";
        totalQuantity += e.quantity;
        if (type === "reserve") reserveQuantity += e.quantity;
        else primaryQuantity += e.quantity;
      }
    } else {
      totalQuantity = safeQuantity(p.quantity);
      primaryQuantity = totalQuantity;
    }

    return { product: p, totalQuantity, primaryQuantity, reserveQuantity };
  }, [selectedProductIdOnMap, products, uuidToBin, productLocationIndex]);

  /** Map sidebar: products with stock or assignments on this layout only; qty/volume from SSOT. */
  const sortedProductsByVolume = useMemo(() => {
    return measureDesignerMemo(designerPerf, "React: sortedProductsByVolume", () => {
      const out: { product: WarehouseProduct; quantityAssigned: number; volumeAssignedDm3: number }[] = [];
      for (const p of products) {
        if (!productHasAnyLocation(productLocationIndex, p.id)) continue;
        const quantityAssigned = productQuantityInLayout(productLocationIndex, p.id);
        if (quantityAssigned <= 0) continue;
        const vol = safeVolumeDm3(p.volume_dm3);
        out.push({ product: p, quantityAssigned, volumeAssignedDm3: quantityAssigned * vol });
      }
      return out.sort((a, b) => b.volumeAssignedDm3 - a.volumeAssignedDm3);
    });
  }, [designerPerf, products, productLocationIndex]);

  /** When a rack is selected on the full map (single click): rack ref and products in that rack (SSOT). */
  const mapRackState = useMemo(() => {
    if (selectedRackIdOnMap == null)
      return {
        selectedRackForMap: null as RackState | null,
        mapRackBinUUIDs: new Set<string>(),
        rackProductsForMap: [] as (WarehouseProduct & { totalQuantity: number; primaryQuantity: number; reserveQuantity: number })[],
      };
    const selectedRackForMap = layout.racks.find((r) => String(r.id ?? r.rack_index) === selectedRackIdOnMap) ?? null;
    if (!selectedRackForMap)
      return {
        selectedRackForMap: null,
        mapRackBinUUIDs: new Set<string>(),
        rackProductsForMap: [] as (WarehouseProduct & { totalQuantity: number; primaryQuantity: number; reserveQuantity: number })[],
      };
    const mapRackBinUUIDs = new Set<string>();
    for (const b of selectedRackForMap.bins) {
      const u = normalizeInventoryLocationUuid(binLocationUuidFromBin(b));
      if (u) mapRackBinUUIDs.add(u);
    }
    const rackKey = String(selectedRackForMap.id ?? selectedRackForMap.rack_index);
    const productsById = new Map(products.map((p) => [p.id, p] as const));
    const totals = new Map<string, { product: WarehouseProduct; totalQuantity: number; primaryQuantity: number; reserveQuantity: number }>();

    for (const e of productLocationIndex.byRack.get(rackKey) ?? []) {
      const product = productsById.get(e.productId);
      if (!product) continue;
      const type = uuidToBin.get(e.locationUUID)?.storage_type ?? "primary";
      const existing = totals.get(e.productId);
      if (existing) {
        existing.totalQuantity += e.quantity;
        if (type === "reserve") existing.reserveQuantity += e.quantity;
        else existing.primaryQuantity += e.quantity;
      } else {
        totals.set(e.productId, {
          product,
          totalQuantity: e.quantity,
          primaryQuantity: type === "reserve" ? 0 : e.quantity,
          reserveQuantity: type === "reserve" ? e.quantity : 0,
        });
      }
    }

    const rackProductsForMap = Array.from(totals.values())
      .map((t) => ({
        ...t.product,
        totalQuantity: t.totalQuantity,
        primaryQuantity: t.primaryQuantity,
        reserveQuantity: t.reserveQuantity,
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);
    return { selectedRackForMap, mapRackBinUUIDs, rackProductsForMap };
  }, [selectedRackIdOnMap, products, layout.racks, uuidToBin, productLocationIndex]);

  const { selectedRackForMap, mapRackBinUUIDs, rackProductsForMap } = mapRackState;

  const deleteObject = useCallback((objectId: string | null) => {
    if (!objectId) return;
    if (objectId.startsWith("rack:")) {
      const toDelete = layout.racks.filter((r) => selectedRackIds.includes(r.id ?? r.rack_index));
      deletedForUndoRef.current = { racks: toDelete, row_containers: layout.row_containers };
      // Row slots may reference either rack.id or rack.rack_index. Include both to avoid ghost rackIds in rows.
      const removedIds = new Set<string>();
      for (const sel of selectedRackIds) {
        removedIds.add(String(sel));
        const r = layout.racks.find(
          (rk) => String(rk.id ?? rk.rack_index) === String(sel) || String(rk.uuid ?? "") === String(sel)
        );
        if (r) {
          removedIds.add(String(r.rack_index));
          if (r.uuid) removedIds.add(String(r.uuid));
        }
      }
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

  const loadLayout = useCallback(async (warehouseId: number, options?: { force?: boolean }) => {
    if (layoutLoadInFlightRef.current === warehouseId && !options?.force) return;
    layoutLoadInFlightRef.current = warehouseId;
    const perf = getDesignerLoadPerf(isDesignerPerfEnabled());
    const callN = ++loadLayoutCallRef.current;
    const rootStage = `loadLayout #${callN}`;
    perf?.start(rootStage);
    setLoading(true);
    try {
      perf?.start(`GET /warehouse/layout (loadLayout #${callN})`);
      const layoutT0 = performance.now();
      const res = await api.get("/warehouse/layout", {
        params: { tenant_id: TENANT_ID, warehouse_id: warehouseId },
      });
      perf?.record("GET /warehouse/layout", performance.now() - layoutT0);
      perf?.end(`GET /warehouse/layout (loadLayout #${callN})`);
      const payload = res.data as { layout?: Record<string, unknown>; special_locations?: SpecialLocationsState } | undefined;
      const d = (payload?.layout ?? payload ?? {}) as Record<string, unknown>;
      setSpecialLocations(payload?.special_locations ?? { pick_start: null, packing: null, dock: null });
      perf?.start(`loadLayout.hydrate #${callN}`);
      const rawGridCols = (d.grid_cols ?? 24) <= 24 ? (d.grid_cols ?? 24) * CELLS_PER_METER : (d.grid_cols ?? GRID_COLS);
      const rawGridRows = (d.grid_rows ?? 16) <= 16 ? (d.grid_rows ?? 16) * CELLS_PER_METER : (d.grid_rows ?? GRID_ROWS);
      const building_width_m = d.building_width_m != null && Number(d.building_width_m) > 0 ? Number(d.building_width_m) : undefined;
      const building_depth_m = d.building_depth_m != null && Number(d.building_depth_m) > 0 ? Number(d.building_depth_m) : (d.building_height_m != null && Number(d.building_height_m) > 0 ? Number(d.building_height_m) : undefined);
      const building_height_m = d.building_height_m != null && Number(d.building_height_m) >= 0 ? Number(d.building_height_m) : undefined;
      const nextLayout = clampGridToBuilding({
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
                storage_type: normalizeStorageType((b as { storage_type?: string }).storage_type),
              }; })
            : [];
          return {
          id: r.id,
          uuid: typeof r.uuid === "string" && r.uuid.trim() !== "" ? r.uuid : generateRackUuid(),
          rack_type: (r as { rack_type?: string }).rack_type === "store" ? "store" : "warehouse",
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
          templateId:
            typeof r.templateId === "string"
              ? r.templateId
              : typeof (r as { template_id?: unknown }).template_id === "string"
                ? (r as { template_id: string }).template_id
                : undefined,
          level_max_load_kg: typeof (r as { level_max_load_kg?: number }).level_max_load_kg === "number" ? (r as { level_max_load_kg: number }).level_max_load_kg : undefined,
          show_label: typeof r.show_label === "boolean" ? r.show_label : undefined,
          rowPrefix: typeof (r as { row_prefix?: string }).row_prefix === "string" ? (r as { row_prefix: string }).row_prefix.trim() || undefined : typeof (r as { rowPrefix?: string }).rowPrefix === "string" ? (r as { rowPrefix: string }).rowPrefix.trim() || undefined : undefined,
          indexInRow: typeof (r as { index_in_row?: number }).index_in_row === "number" ? (r as { index_in_row: number }).index_in_row : typeof (r as { indexInRow?: number }).indexInRow === "number" ? (r as { indexInRow: number }).indexInRow : undefined,
          rotationDegrees: normalizeRotation(
            (r as { rotation_degrees?: unknown; rotationDegrees?: unknown }).rotation_degrees
              ?? (r as { rotationDegrees?: unknown }).rotationDegrees
              ?? 0
          ),
          serviceSide: String(
            (r as { service_side?: unknown; serviceSide?: unknown }).service_side
              ?? (r as { serviceSide?: unknown }).serviceSide
              ?? "FRONT"
          ).toUpperCase() === "BACK"
            ? "BACK"
            : "FRONT",
          serviceFaceOrigin: normalizeServiceFaceOrigin(
            (r as { service_face_origin?: unknown; serviceFaceOrigin?: unknown }).service_face_origin
              ?? (r as { serviceFaceOrigin?: unknown }).serviceFaceOrigin
          ),
          passages: Array.isArray((r as { passages?: unknown }).passages)
            ? ((r as { passages: Array<Record<string, unknown>> }).passages)
                .filter((p) => p && typeof p === "object")
                .map((p) => ({
                  id: typeof p.id === "number" ? p.id : undefined,
                  uuid: typeof p.uuid === "string" && p.uuid.trim() ? p.uuid : `passage-${Math.random().toString(16).slice(2)}`,
                  offset_along_cm: Number(p.offset_along_cm ?? 0) || 0,
                  width_cm: Math.max(1, Number(p.width_cm ?? 100) || 100),
                  clearance_height_cm:
                    p.clearance_height_cm == null || p.clearance_height_cm === ""
                      ? null
                      : Number(p.clearance_height_cm),
                  enabled: p.enabled !== false,
                  corridor_uuid:
                    typeof p.corridor_uuid === "string" && p.corridor_uuid.trim()
                      ? p.corridor_uuid.trim()
                      : typeof (p as { corridorUuid?: unknown }).corridorUuid === "string" &&
                          String((p as { corridorUuid?: unknown }).corridorUuid).trim()
                        ? String((p as { corridorUuid?: unknown }).corridorUuid).trim()
                        : null,
                  passage_source: normalizePassageSource(
                    (p as { passage_source?: unknown; passageSource?: unknown }).passage_source
                      ?? (p as { passageSource?: unknown }).passageSource
                  ),
                }))
            : [],
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
      });
      const syncedLayout = syncLayoutDisplayFields(nextLayout);
      logLayoutRackHydrate(syncedLayout.racks);
      setLayout(syncedLayout);
      perf?.end(`loadLayout.hydrate #${callN}`);
    } catch {
      setSpecialLocations({ pick_start: null, packing: null, dock: null });
      setLayout((prev) => ({ ...prev, warehouse_id: warehouseId, warehouse_name: "", racks: [], aisles: [], visual_elements: prev.visual_elements ?? [] }));
    } finally {
      if (layoutLoadInFlightRef.current === warehouseId) layoutLoadInFlightRef.current = null;
      setLoading(false);
      perf?.end(rootStage);
    }
  }, []);

  useEffect(() => {
    if (selectedWarehouseId != null) loadLayout(selectedWarehouseId);
    else setSpecialLocations({ pick_start: null, packing: null, dock: null });
  }, [selectedWarehouseId, loadLayout]);

  const resetDesignerStateForWarehouseSwitch = useCallback(() => {
    resetWarehouseDataRefs();
    setSelectedRackId(null);
    setPreviewRackId(null);
    setEditingRackId(null);
    setEditingProductId(null);
    setSelectedBinForFilter(null);
    setShowElevationForRackId(null);
    setSelectedRackIdForSideView(null);
    setSelectedRackIdOnMap(null);
    setSelectedProductIdOnMap(null);
    setSelectedProductId(null);
    setSelectedLocationForProducts(null);
    setInternalLayoutRackId(null);
    setLastSavedAt(null);
    setClearRackConfirmOpen(false);
    setSelectedRackIds([]);
    setSelectedAisleIndex(null);
    setSelectedVisualId(null);
    setSelectedVisualIds([]);
    setSelectedWallElementId(null);
  }, [resetWarehouseDataRefs]);

  const handleDesignerWarehouseSelect = useCallback(
    (w: Warehouse) => {
      if (w.id === selectedWarehouseId) return;
      const hasLayoutContent =
        layout.racks.length > 0 ||
        (layout.aisles?.length ?? 0) > 0 ||
        (layout.visual_elements?.length ?? 0) > 0;
      const unsaved = lastSavedAt == null && hasLayoutContent;
      if (
        unsaved &&
        !window.confirm("Masz niezapisane zmiany układu magazynu. Przełączyć magazyn bez zapisu?")
      ) {
        return;
      }
      if (routing.dirty && !confirmLeaveRoutingDirty()) return;
      resetDesignerStateForWarehouseSwitch();
      setWarehouse(w);
    },
    [
      selectedWarehouseId,
      lastSavedAt,
      layout,
      resetDesignerStateForWarehouseSwitch,
      setWarehouse,
      routing.dirty,
      confirmLeaveRoutingDirty,
    ],
  );

  useEffect(() => {
    if (mainView !== "magazyn" || selectedWarehouseId == null || loading) return;
    const q = productSearchQuery.trim();
    const needsProductCatalog =
      q.length >= 1 ||
      showAllProductsInSidebar ||
      editingProductId != null ||
      selectedRackIdOnMap != null ||
      selectedRackIdForSideView != null ||
      selectedProductIdOnMap != null;
    if (!needsProductCatalog) return;
    void loadDesignerProducts(selectedWarehouseId, layout);
  }, [
    mainView,
    selectedWarehouseId,
    loading,
    layout,
    productSearchQuery,
    showAllProductsInSidebar,
    editingProductId,
    selectedRackIdOnMap,
    selectedRackIdForSideView,
    selectedProductIdOnMap,
    loadDesignerProducts,
  ]);

  /** After WMS putaway — refresh inventory + occupancy only (no layout/products burst). */
  useEffect(() => {
    const onInventoryUpdated = (ev: Event) => {
      const ce = ev as CustomEvent<{ tenantId?: number; warehouseId?: number | null }>;
      const d = ce.detail;
      if (!d || d.tenantId !== TENANT_ID) return;
      if (d.warehouseId == null || selectedWarehouseId == null) return;
      if (d.warehouseId !== selectedWarehouseId) return;
      void refreshMagazynStock(selectedWarehouseId);
    };
    window.addEventListener("wms:inventory-updated", onInventoryUpdated);
    return () => window.removeEventListener("wms:inventory-updated", onInventoryUpdated);
  }, [selectedWarehouseId, refreshMagazynStock]);

  /** Drop one assigned_locations slot without syncing Inventory (backend skip_inventory_sync). */
  const removeProductAssignmentAtLocation = useCallback(
    async (productId: string, locationUUID: string) => {
      const pid = Number(productId);
      if (!Number.isInteger(pid) || pid < 1 || selectedWarehouseId == null) return;
      const locUuid = locationUUID.trim();
      let p = products.find((x) => x.id === productId);
      if (!p?.assignedLocations?.length) {
        const loaded = await loadDesignerProducts(selectedWarehouseId, layout);
        p = loaded?.find((x) => x.id === productId);
      }
      if (!p?.assignedLocations?.length) return;
      const nextAssigned = p.assignedLocations.filter((a) => assignedLocationEntryUuid(a) !== locUuid);
      if (nextAssigned.length === p.assignedLocations.length) return;

      const positions = getAllPositionsFromRacks(layout.racks, layout);
      const posByUuid = new Map(positions.map((pos) => [pos.locationUUID, pos]));
      const enriched = nextAssigned
        .map((a) => {
          const u = assignedLocationEntryUuid(a);
          if (!u) return null;
          const pos = posByUuid.get(u);
          return {
            locationUUID: u,
            quantity: safeQuantity(a.quantity),
            locationAddress: a.locationAddress ?? pos?.locationAddress ?? u,
            storageType: a.storageType ?? pos?.storageType,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);

      await putProductWarehouseSlotting(pid, selectedWarehouseId, enriched, TENANT_ID);

      await refreshMagazynStock(selectedWarehouseId);
      await loadDesignerProducts(selectedWarehouseId, layout, { force: true });
    },
    [products, layout, refreshMagazynStock, loadDesignerProducts, selectedWarehouseId]
  );

  const selectedRackHasBinUuids = useMemo(() => {
    if (selectedRackIdForSideView == null) return false;
    const rack = layout.racks.find((r) => String(r.id ?? r.rack_index) === String(selectedRackIdForSideView));
    if (!rack) return false;
    return activeBinsForRack(rack).some((b) => (b.locationUUID ?? "").trim() !== "");
  }, [layout.racks, selectedRackIdForSideView]);

  /** Side-view rack id, else map-selected rack (for clear-rack modal + PATCH scope). */
  const clearRackTargetKey = useMemo(() => {
    if (selectedRackIdForSideView != null) return String(selectedRackIdForSideView);
    if (selectedRackIdOnMap != null) return selectedRackIdOnMap;
    return null;
  }, [selectedRackIdForSideView, selectedRackIdOnMap]);

  /** Modal copy only: rack label + count of assignment rows that would be removed (same bins as clear action). */
  const clearRackConfirmPreview = useMemo(() => {
    if (clearRackTargetKey == null) return { rackLabel: "", assignmentCount: 0 };
    const rack = layout.racks.find((r) => String(r.id ?? r.rack_index) === clearRackTargetKey);
    if (!rack) return { rackLabel: "", assignmentCount: 0 };
    const binUuids = new Set(activeBinsForRack(rack).map((b) => (b.locationUUID ?? "").trim()).filter(Boolean));
    let n = 0;
    for (const p of products) {
      if (!p.assignedLocations?.length) continue;
      for (const a of p.assignedLocations) {
        const u = assignedLocationEntryUuid(a);
        if (u && binUuids.has(u)) n += 1;
      }
    }
    return { rackLabel: getRackDisplayIdWithLayout(rack), assignmentCount: n };
  }, [clearRackTargetKey, layout.racks, products]);

  /** Remove all assigned_locations entries pointing at bins of the selected rack (Inventory unchanged via skip_inventory_sync). */
  const clearAssignmentsOnSelectedRack = useCallback(async () => {
    if (clearRackTargetKey == null || selectedWarehouseId == null) return;
    const rack = layout.racks.find((r) => String(r.id ?? r.rack_index) === clearRackTargetKey);
    if (!rack) return;
    const binUuids = new Set(
      activeBinsForRack(rack).map((b) => (b.locationUUID ?? "").trim()).filter(Boolean)
    );
    if (binUuids.size === 0) return;

    const catalog = (await loadDesignerProducts(selectedWarehouseId, layout)) ?? products;

    const positions = getAllPositionsFromRacks(layout.racks, layout);
    const posByUuid = new Map(positions.map((pos) => [pos.locationUUID, pos]));

    const patches: Promise<unknown>[] = [];
    for (const p of catalog) {
      if (!p.assignedLocations?.length) continue;
      const next = p.assignedLocations.filter((a) => {
        const u = assignedLocationEntryUuid(a);
        return !u || !binUuids.has(u);
      });
      if (next.length === p.assignedLocations.length) continue;

      const pid = Number(p.id);
      if (!Number.isInteger(pid) || pid < 1) continue;

      const enriched = next.map((a) => {
        const u = assignedLocationEntryUuid(a)!;
        const pos = posByUuid.get(u);
        return {
          locationUUID: u,
          quantity: safeQuantity(a.quantity),
          locationAddress: a.locationAddress ?? pos?.locationAddress ?? u,
          storageType: a.storageType ?? pos?.storageType,
        };
      });

      patches.push(
        putProductWarehouseSlotting(pid, selectedWarehouseId, enriched, TENANT_ID)
      );
    }

    if (patches.length === 0) {
      setClearRackConfirmOpen(false);
      alert("Brak przypisań produktów do lokalizacji tego regału.");
      return;
    }

    setClearRackBusy(true);
    try {
      await Promise.all(patches);
      await refreshMagazynStock(selectedWarehouseId);
      await loadDesignerProducts(selectedWarehouseId, layout, { force: true });
      setClearRackConfirmOpen(false);
    } catch (e) {
      console.error(e);
      alert("Nie udało się opróżnić regału. Spróbuj ponownie.");
    } finally {
      setClearRackBusy(false);
    }
  }, [clearRackTargetKey, selectedWarehouseId, layout, products, refreshMagazynStock, loadDesignerProducts]);

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
      racks: [
        ...prev.racks,
        ...assignUniqueRackNamesToNewRacks(duplicateRacksAtPosition([copiedRack], cell, getNextRackIndex(prev.racks)), prev),
      ],
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
      // Optimistic clear so the icon disappears even if API is slow/fails.
      setSpecialLocations((prev) => {
        const next = { ...prev };
        (["pick_start", "packing", "dock"] as const).forEach((k) => {
          if (next[k]?.id === locationId) next[k] = null;
        });
        return next;
      });
      setSelectedSpecialLocationKey(null);
      if (selectedWarehouseId == null) return;
      try {
        await api.delete(`/warehouse/special-location/${locationId}`);
        const { data } = await api.get<SpecialLocationsState>(`/warehouse/${selectedWarehouseId}/special-locations`);
        setSpecialLocations(data ?? { pick_start: null, packing: null, dock: null });
      } catch (err) {
        console.error("Delete special location:", err);
        setSnackbar({ message: "Nie udało się usunąć punktu z mapy." });
        try {
          const { data } = await api.get<SpecialLocationsState>(`/warehouse/${selectedWarehouseId}/special-locations`);
          setSpecialLocations(data ?? { pick_start: null, packing: null, dock: null });
        } catch {
          /* keep optimistic clear */
        }
      }
    },
    [selectedWarehouseId]
  );

  const deleteSelectedSpecialLocation = useCallback(() => {
    if (!selectedSpecialLocationKey) return;
    const loc = specialLocations[selectedSpecialLocationKey];
    if (!loc) return;
    void deleteSpecialLocation(loc.id);
  }, [selectedSpecialLocationKey, specialLocations, deleteSpecialLocation]);

  useEffect(() => {
    let cancelled = false;
    const perf = getDesignerLoadPerf(isDesignerPerfEnabled());
    (async () => {
      const t0 = performance.now();
      perf?.start("GET /warehouse/templates/");
      try {
        const { data } = await api.get<CustomRackTemplate[]>("/warehouse/templates/", {
          params: { tenant_id: TENANT_ID },
        });
        if (!cancelled && Array.isArray(data)) {
          setCustomTemplates(data.map((t) => ({
            ...t,
            rack_type: (t.rack_type ?? "warehouse") === "store" ? "store" : "warehouse",
            bin_type_map: normalizeBinTypeMap(t.bin_type_map, t.reserve_bin_keys),
            color: (typeof t.color === "string" && t.color.trim() !== "") ? t.color.trim() : "#3b82f6",
            default_passages: Array.isArray(t.default_passages) ? t.default_passages : undefined,
          })));
        }
      } catch {
        if (!cancelled) setCustomTemplates([]);
      } finally {
        perf?.record("GET /warehouse/templates/", performance.now() - t0);
        perf?.end("GET /warehouse/templates/");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!Array.isArray(customTemplates) || customTemplates.length === 0 || layout.racks.length === 0) return;
    const templateById = new Map(customTemplates.map((t) => [t.id, t]));
    setLayout((prev) => {
      let changed = false;
      const racks = prev.racks.map((rack) => {
        if (!rack.templateId) return rack;
        const template = templateById.get(rack.templateId);
        if (!template) return rack;

        const normalizedInternal = rack.internal_structure?.levels?.length
          ? {
              ...rack.internal_structure,
              levels: rack.internal_structure.levels.map((level, levelIndex) => {
                const expected = templateSlotDimensions(template, levelIndex);
                const locations = level.locations.map((loc) => {
                  if (
                    Number(loc.width_cm) === expected.width_cm &&
                    Number(loc.depth_cm) === expected.depth_cm &&
                    Number(loc.height_cm) === expected.height_cm
                  ) {
                    return loc;
                  }
                  changed = true;
                  return { ...loc, width_cm: expected.width_cm, depth_cm: expected.depth_cm, height_cm: expected.height_cm };
                });
                return locations === level.locations ? level : { ...level, locations };
              }),
            }
          : rack.internal_structure;

        const normalizedBins = rack.bins.map((bin) => {
          const expected = templateSlotDimensions(template, bin.level_index);
          if (
            Number(bin.width_cm ?? 0) === expected.width_cm &&
            Number(bin.depth_cm ?? 0) === expected.depth_cm &&
            Number(bin.height_cm ?? 0) === expected.height_cm
          ) {
            return bin;
          }
          changed = true;
          return { ...bin, width_cm: expected.width_cm, depth_cm: expected.depth_cm, height_cm: expected.height_cm };
        });

        return {
          ...rack,
          width_cm: template.width_cm,
          length_cm: template.depth_cm,
          height_cm: template.height_cm,
          internal_structure: normalizedInternal,
          bins: normalizedBins,
        };
      });
      return changed ? { ...prev, racks } : prev;
    });
  }, [customTemplates, layout.layout_id, layout.racks.length]);

  const saveNewTemplate = useCallback(async (payload: CustomRackTemplate): Promise<CustomRackTemplate | null> => {
    try {
      const { data } = await api.post<CustomRackTemplate>("/warehouse/templates/", payload, {
        params: { tenant_id: TENANT_ID },
      });
      return data ? {
        ...data,
        rack_type: (payload.rack_type ?? data.rack_type ?? "warehouse") === "store" ? "store" : "warehouse",
        bin_type_map: normalizeBinTypeMap(data.bin_type_map, data.reserve_bin_keys),
        default_passages: Array.isArray(data.default_passages)
          ? data.default_passages
          : payload.default_passages,
      } : null;
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
      const res = await api.post<{ id?: number; name?: string }>(`/tenants/${TENANT_ID}/warehouses/`, {
        name: newWarehouseName,
      });
      await refreshWarehouses();
      const created = res.data;
      if (created?.id != null) {
        setWarehouse({ id: created.id, name: (created.name ?? newWarehouseName).trim() || `Magazyn ${created.id}` });
      }
      setShowCreateWarehouse(false);
    } catch (e) {
      console.error("Create warehouse:", e);
    }
  }, [newWarehouseName, refreshWarehouses, setWarehouse]);

  const saveLayout = useCallback(async (overrideLayout?: LayoutState) => {
    const baseLayout = overrideLayout ?? layout;
    const whId = selectedWarehouseId ?? baseLayout.warehouse_id;
    if (whId == null) return;
    const { valid: integrityValid, errors: integrityErrors } = validateLayoutEntityIntegrity(baseLayout);
    if (!integrityValid) {
      const msg =
        integrityErrors.length === 1
          ? `Nie można zapisać układu — ${integrityErrors[0]}`
          : `Nie można zapisać układu — ${integrityErrors.join(" · ")}`;
      setSnackbar({ message: msg });
      return;
    }
    const { valid: layoutNamesValid, errors: layoutNameErrors } = validateAllRackNamesInLayout(baseLayout);
    if (!layoutNamesValid) {
      const msg =
        layoutNameErrors.length === 1
          ? `Nie można zapisać układu — ${layoutNameErrors[0]}`
          : `Nie można zapisać układu — ${layoutNameErrors.join(" · ")}`;
      setSnackbar({ message: msg });
      return;
    }
    setSaving(true);
    const saveStarted = performance.now();
    try {
      let workingLayout = baseLayout;
      if (overrideLayout == null) {
        let stockByUuid: Map<string, number> | undefined;
        let stockDetailsByUuid: import("../components/warehouse/passageStorage").StockDetailByUuid | undefined;
        try {
          // Prefer already-loaded inventory + product catalog for operator-facing stock details.
          if (inventoryRows.length > 0) {
            stockByUuid = new Map();
            stockDetailsByUuid = new Map();
            const productsById = new Map(products.map((p) => [String(p.id), p]));
            for (const row of inventoryRows) {
              const u = String(row.location_uuid ?? "").trim();
              if (!u) continue;
              const qty = Number(row.quantity ?? 0);
              if (!(qty > 0)) continue;
              stockByUuid.set(u, (stockByUuid.get(u) ?? 0) + qty);
              const product = productsById.get(String(row.product_id));
              const productName = String(row.product_name ?? product?.name ?? "").trim() || `Produkt #${row.product_id}`;
              const unitPrice = product?.purchase_price;
              const valuePln =
                unitPrice != null && Number.isFinite(unitPrice) ? Number(unitPrice) * qty : null;
              const list = stockDetailsByUuid.get(u) ?? [];
              list.push({
                productName,
                quantity: qty,
                unit: "szt.",
                valuePln,
              });
              stockDetailsByUuid.set(u, list);
            }
          } else {
            const inventoryRes = await api.get<
              Array<{ location_uuid?: string | null; quantity?: number; product_id?: number; product_name?: string | null }>
            >("/inventory/", {
              params: { tenant_id: TENANT_ID, warehouse_id: whId, hide_empty: false },
            });
            stockByUuid = new Map();
            stockDetailsByUuid = new Map();
            const productsById = new Map(products.map((p) => [String(p.id), p]));
            for (const row of inventoryRes.data ?? []) {
              const u = String(row.location_uuid ?? "").trim();
              if (!u) continue;
              const qty = Number(row.quantity ?? 0);
              if (!(qty > 0)) continue;
              stockByUuid.set(u, (stockByUuid.get(u) ?? 0) + qty);
              const product = row.product_id != null ? productsById.get(String(row.product_id)) : undefined;
              const productName =
                String(row.product_name ?? product?.name ?? "").trim() ||
                (row.product_id != null ? `Produkt #${row.product_id}` : "Nieznany produkt");
              const unitPrice = product?.purchase_price;
              const valuePln =
                unitPrice != null && Number.isFinite(unitPrice) ? Number(unitPrice) * qty : null;
              const list = stockDetailsByUuid.get(u) ?? [];
              list.push({ productName, quantity: qty, unit: "szt.", valuePln });
              stockDetailsByUuid.set(u, list);
            }
          }
        } catch {
          stockByUuid = undefined;
          stockDetailsByUuid = undefined;
        }
        const prepared = analyzeLayoutStructureRebuild(
          baseLayout,
          stockByUuid,
          stockDetailsByUuid,
          "layout_save"
        );
        if (prepared.impacts.length > 0) {
          const removedUuids = prepared.impacts.flatMap((i) =>
            i.removed.map((r) => String(r.locationUUID ?? "").trim()).filter(Boolean)
          );
          let impacts = prepared.impacts;
          if (removedUuids.length > 0) {
            try {
              const pre = await layoutService.rebuildPreflight(
                { tenant_id: TENANT_ID, warehouse_id: whId },
                { location_uuids: removedUuids }
              );
              const ops = pre.data?.active_operations ?? [];
              if (ops.length > 0) {
                impacts = prepared.impacts.map((impact) => {
                  const rackOps = ops.filter((op) =>
                    impact.removed.some((r) => String(r.locationUUID ?? "").trim() === op.location_uuid)
                  );
                  return {
                    ...impact,
                    activeOperations: rackOps.map((op) => ({
                      locationUuid: op.location_uuid,
                      locationLabel: op.location_label,
                      operationType: op.operation_type,
                      documentNumber: op.document_number,
                    })),
                    hasActiveOperations: rackOps.length > 0,
                  };
                });
              }
            } catch {
              // BE save still enforces active-ops; preview may be incomplete.
            }
          }
          setStructureRebuildPending({ impacts, layout: prepared.layout, source: prepared.source });
          return;
        }
        workingLayout = prepared.layout;
        if (prepared.changed) setLayout(prepared.layout);
      }

      const layoutToSave = syncLayoutDisplayFields(workingLayout);
      logLayoutSaveStart({ warehouse_id: whId, rack_count: layoutToSave.racks.length });
      const rackNamesForPersistLog = layoutToSave.racks.map((r) => ({
        rack_id: r.id ?? r.rack_index,
        name: (r.name ?? "").trim() || null,
      }));
      const payload: Record<string, unknown> = {
        ...(baseLayout.layout_id != null ? { layout_id: baseLayout.layout_id } : {}),
        name: baseLayout.name,
        grid_cols: baseLayout.grid_cols,
        grid_rows: baseLayout.grid_rows,
        width_m: baseLayout.grid_cols / CELLS_PER_METER,
        length_m: baseLayout.grid_rows / CELLS_PER_METER,
        ...(baseLayout.building_width_m != null && (baseLayout.building_depth_m != null || baseLayout.building_height_m != null)
          ? {
              building_width_m: baseLayout.building_width_m,
              building_depth_m: baseLayout.building_depth_m ?? baseLayout.building_height_m,
              ...(baseLayout.building_height_m != null ? { building_height_m: baseLayout.building_height_m } : {}),
            }
          : {}),
        racks: layoutToSave.racks.map((r) => ({
          id: r.id,
          uuid: r.uuid ?? generateRackUuid(),
          rack_type: r.rack_type === "store" ? "store" : "warehouse",
          name: (r.name ?? "").trim() || getRackDisplayIdWithLayout(r),
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
          bins: r.bins.map((b) => ({
            id: b.id,
            label: b.label,
            level_index: b.level_index,
            segment_index: b.segment_index,
            volume_dm3: b.volume_dm3,
            current_load_dm3: b.current_load_dm3 ?? b.used_volume_dm3 ?? 0,
            location_uuid: b.locationUUID,
            storage_type: b.storage_type,
          })),
          internal_structure: r.internal_structure ?? undefined,
          color: (typeof r.color === "string" && r.color.trim() !== "") ? r.color.trim() : "#3b82f6",
          templateId: r.templateId ?? undefined,
          level_max_load_kg: r.level_max_load_kg ?? undefined,
          show_label: r.show_label,
          row_prefix: r.rowPrefix,
          index_in_row: r.indexInRow,
          rotation_degrees: r.rotationDegrees ?? 0,
          rotationDegrees: r.rotationDegrees ?? 0,
          service_side: r.serviceSide ?? "FRONT",
          serviceSide: r.serviceSide ?? "FRONT",
          service_face_origin: normalizeServiceFaceOrigin(r.serviceFaceOrigin),
          serviceFaceOrigin: normalizeServiceFaceOrigin(r.serviceFaceOrigin),
          passages: (r.passages ?? []).map((p) => ({
            id: p.id,
            uuid: p.uuid,
            offset_along_cm: p.offset_along_cm,
            width_cm: p.width_cm,
            clearance_height_cm: p.clearance_height_cm ?? null,
            enabled: p.enabled !== false,
            corridor_uuid: p.corridor_uuid ?? null,
            passage_source: normalizePassageSource(p.passage_source),
            passageSource: normalizePassageSource(p.passage_source),
          })),
        })),
        aisles: baseLayout.aisles.map((a) => ({
          id: a.id,
          name: a.name,
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
          two_way: a.two_way,
        })),
        visual_elements: baseLayout.visual_elements ?? [],
        picking_path: baseLayout.picking_path ?? undefined,
        row_containers: baseLayout.row_containers ?? [],
        wall_elements: baseLayout.wall_elements ?? [],
      };

      const validated = validateAndSanitizeLayoutPayload(payload);
      if (!validated.ok) {
        const msg = `Nie można zapisać — nieprawidłowy układ: ${validated.errors.join(" · ")}`;
        console.error("[saveLayout] validation failed:", validated.errors);
        setSnackbar({ message: msg });
        logLayoutSaveDuration({ warehouse_id: whId, duration_ms: Math.round(performance.now() - saveStarted), success: false });
        return;
      }

      const payloadJson = JSON.stringify(validated.payload);
      logLayoutSavePayload({
        warehouse_id: whId,
        rack_count: layoutToSave.racks.length,
        changed_rack_count: layoutToSave.racks.length,
        payload_bytes: payloadJson.length,
      });

      await api.put(`/warehouse/${whId}/layout`, validated.payload, { params: { tenant_id: TENANT_ID } });
      setLastSavedAt(Date.now());
      logLayoutRackPersist(layoutToSave.racks);
      setLayout(layoutToSave);
      logLayoutSaveDuration({ warehouse_id: whId, duration_ms: Math.round(performance.now() - saveStarted), success: true });
      for (const { rack_id, name } of rackNamesForPersistLog) {
        if (name) {
          logRackRename({ rack_id, old_name: name, new_name: name, persisted: true });
        }
      }
      await loadLayout(whId, { force: true });
    } catch (err: unknown) {
      console.error("Save layout:", err);
      const ax = err as { response?: { status?: number; data?: unknown } };
      console.error("ERROR RESPONSE:", ax.response?.data);
      const status = ax.response?.status;
      const data = ax.response?.data as { detail?: unknown } | undefined;
      const detailStr =
        typeof data?.detail === "string"
          ? data.detail
          : data?.detail != null
            ? JSON.stringify(data.detail)
            : null;
      if (status === 409) {
        setSnackbar({
          message: detailStr
            ? detailStr
            : "Zapis zablokowany — lokalizacje do usunięcia mają stan magazynowy.",
        });
      } else if (status === 400) {
        setSnackbar({ message: detailStr ? `Zapis nie powiódł się: ${detailStr}` : "Zapis nie powiódł się — duplikat nazwy regału" });
      } else if (status === 422) {
        setSnackbar({ message: detailStr ? `Walidacja: ${detailStr}` : "Zapis nie powiódł się — błąd walidacji danych." });
      } else if (status === 500) {
        setSnackbar({
          message: detailStr ? `Błąd serwera (500): ${detailStr}` : "Błąd serwera przy zapisie układu (500). Szczegóły w konsoli.",
        });
      } else {
        setSnackbar({ message: detailStr ? `Zapis nie powiódł się: ${detailStr}` : "Zapis nie powiódł się." });
      }
    } finally {
      setSaving(false);
    }
  }, [layout, selectedWarehouseId, loadLayout, getRackDisplayIdWithLayout, inventoryRows, products]);

  const confirmStructureRebuildAndSave = useCallback(() => {
    const pending = structureRebuildPending;
    setStructureRebuildPending(null);
    if (!pending) return;
    recordStructureRebuild({
      source: pending.source,
      warehouseId: selectedWarehouseId,
      removedLocationUuids: pending.impacts.flatMap((i) =>
        i.removed.map((r) => String(r.locationUUID ?? "").trim()).filter(Boolean)
      ),
      createdLocationUuids: pending.impacts.flatMap((i) =>
        i.created.map((r) => String(r.locationUUID ?? "").trim()).filter(Boolean)
      ),
      rackKeys: pending.impacts.map((i) => i.rackKey),
    });
    setLayout(pending.layout);
    void saveLayout(pending.layout);
  }, [structureRebuildPending, saveLayout, selectedWarehouseId]);

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
    rackType: manualRackType,
    aisleWidthCm,
    setLayout,
    setDraggingFromCatalog,
    setCatalogGhostPosition,
    setCatalogHoveredSlot,
  });

  /** Magazyn map (read mode): click empty canvas to reset rack / bin / product focus. */
  const handleMagazynMapBackgroundClick = useCallback((_e: MouseEvent<SVGSVGElement>) => {
    setSelectedRackIdOnMap(null);
    setSelectedRackId(null);
    setSelectedRackIds([]);
    setSelectedLocationForProducts(null);
    setSelectedProductId(null);
    setHoveredProductIdOnMap(null);
    setSelectedProductIdOnMap(null);
    setHoveredLocationUUID(null);
  }, []);

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
      passageDrawEndPendingRef,
      passageDrawEndRafRef,
      passageShiftKeyRef,
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
      passageToolActive,
      passageDrawStart,
      passageDrawEnd,
      passageWidthCm,
      draggingPassage,
      rowDrawStart,
      rowDrawEnd,
      rowToolTemplate,
      aisleDrawStart,
      draggingRowId,
      rowDragPreviewStart,
      rackDragPreviewPosition,
      magazynMapInteractions,
      mainView,
      layoutMode,
      selectedWarehouseId,
      selectedRackIds,
      selectedVisualIds,
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
      setPreviewRackId,
      setRackPanelDismissed,
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
      setSelectedRackIdForSideView,
      setSelectedLocationForProducts,
      setProductSearchQuery,
      setShowAllProductsInSidebar,
      setRowToolTemplate,
      setSelectedWallElementId,
      setPassageDrawStart,
      setPassageDrawEnd,
      setSelectedPassage,
      setDraggingPassage,
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

  const handleCanvasMouseMoveWithPassage = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      passageShiftKeyRef.current = e.shiftKey;
      setPassageShiftKey(e.shiftKey);
      handleCanvasMouseMove(e);
    },
    [handleCanvasMouseMove]
  );

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
    placePairedRowPair,
    placeRowWithTemplate,
  } = useDesignerRowOperations({
    layout,
    selectedRowContainerId,
    rowGapCm,
    defaultRackType: manualRackType,
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

  const rowPrefixModalPreviewCount = useMemo(() => {
    if (!pendingRowCreation) return 0;
    if (pendingRowCreation.type === "rowWithTemplate") {
      return countPlaceRowWithTemplateRacks(
        layout,
        pendingRowCreation.start,
        pendingRowCreation.end,
        pendingRowCreation.item,
        rowGapCm
      );
    }
    if (pendingRowCreation.type === "emptyRow") {
      return countEmptyRowSlotsInDraw(
        layout,
        pendingRowCreation.start,
        pendingRowCreation.end,
        rowGapCm
      );
    }
    return 0;
  }, [pendingRowCreation, layout, rowGapCm]);

  /** Paired-row template pickers: user templates only (API `/warehouse/templates/` is tenant-scoped). */
  const rowModalTemplateOptions = useMemo(
    () =>
      customTemplates.map((t) => ({
        key: catalogItemTemplateKey({ type: "custom", template: t }),
        label: t.name,
        summary: `${t.levels} poz. × ${t.bins_per_level} lok.`,
      })),
    [customTemplates]
  );

  const getTemplatePreviewRackCount = useCallback(
    (templateKey: string) => {
      if (!pendingRowCreation || pendingRowCreation.type === "stampRack") return 0;
      const item = catalogItemFromTemplateKey(templateKey, customTemplates);
      if (!item) return 0;
      return countPlaceRowWithTemplateRacks(
        layout,
        pendingRowCreation.start,
        pendingRowCreation.end,
        item,
        rowGapCm
      );
    },
    [pendingRowCreation, layout, customTemplates, rowGapCm]
  );

  const validateRowPrefixForModal = useCallback(
    (result: RowPrefixModalResult): string | null => {
      const pending = pendingRowCreation;
      if (!pending) return null;
      const r1 = result.row1;

      if (pending.type === "stampRack") {
        const normalized = normalizeRowPrefixLetters(r1.rowPrefix);
        const base = getProposedFirstRackLabelForStampFromCatalog(layout, pending.cell, pending.item, normalized);
        const v = validateGeneratedRackNames([base], layout);
        if (!v.valid) {
          return `Regały już istnieją: ${v.duplicates.join(", ")}`;
        }
        return null;
      }

      if (result.paired && result.row2 && (pending.type === "emptyRow" || pending.type === "rowWithTemplate")) {
        const r2 = result.row2;
        const item1 = resolveRowCatalogItemForRowModal(r1, pending, 1, customTemplates);
        const item2 = resolveRowCatalogItemForRowModal(r2, pending, 2, customTemplates);
        const fill1 = effectiveRowAutoFill(r1, pending);
        const fill2 = effectiveRowAutoFill(r2, pending);
        if (fill1 && !item1) {
          return "Wybierz szablon dla rzędu 1, aby włączyć automatyczne wypełnienie.";
        }
        if (fill2 && !item2) {
          return "Wybierz szablon dla rzędu 2, aby włączyć automatyczne wypełnienie.";
        }
        const names: string[] = [];
        const p1 = normalizeRowPrefixLetters(r1.rowPrefix);
        const p2 = normalizeRowPrefixLetters(r2.rowPrefix);
        if (fill1 && item1) {
          const cnt1 = countPlaceRowWithTemplateRacks(layout, pending.start, pending.end, item1, rowGapCm);
          if (cnt1 > 0) names.push(...generateRackNames(p1, cnt1));
        }
        if (fill2 && item2) {
          const cnt2 = countPlaceRowWithTemplateRacks(layout, pending.start, pending.end, item2, rowGapCm);
          if (cnt2 > 0) names.push(...generateRackNames(p2, cnt2));
        }
        if (names.length === 0) return null;
        const v = validateGeneratedRackNames(names, layout);
        if (!v.valid) {
          return `Regały już istnieją: ${v.duplicates.join(", ")}`;
        }
        return null;
      }

      if (pending.type === "emptyRow") {
        const item1 = resolveRowCatalogItemForRowModal(r1, pending, 1, customTemplates);
        const wantFill = effectiveRowAutoFill(r1, pending);
        if (wantFill && !item1) {
          return "Wybierz szablon, aby włączyć automatyczne wypełnienie.";
        }
        if (wantFill && item1) {
          const cnt = countPlaceRowWithTemplateRacks(layout, pending.start, pending.end, item1, rowGapCm);
          if (cnt <= 0) return null;
          const names = generateRackNames(normalizeRowPrefixLetters(r1.rowPrefix), cnt);
          const v = validateGeneratedRackNames(names, layout);
          if (!v.valid) {
            return `Regały już istnieją: ${v.duplicates.join(", ")}`;
          }
        }
        return null;
      }
      if (pending.type === "rowWithTemplate") {
        const item1 = resolveRowCatalogItemForRowModal(r1, pending, 1, customTemplates);
        if (effectiveRowAutoFill(r1, pending)) {
          const fillItem = item1 ?? pending.item;
          if (!fillItem) return null;
          const cnt = countPlaceRowWithTemplateRacks(layout, pending.start, pending.end, fillItem, rowGapCm);
          if (cnt <= 0) return null;
          const names = generateRackNames(normalizeRowPrefixLetters(r1.rowPrefix), cnt);
          const v = validateGeneratedRackNames(names, layout);
          if (!v.valid) {
            return `Regały już istnieją: ${v.duplicates.join(", ")}`;
          }
        }
        return null;
      }
      return null;
    },
    [layout, pendingRowCreation, customTemplates, rowGapCm]
  );

  const handleRowPrefixConfirm = useCallback(
    (modalResult: RowPrefixModalResult) => {
      if (!pendingRowCreation) return;
      const r1 = modalResult.row1;
      const pending = pendingRowCreation;

      if (
        modalResult.paired &&
        modalResult.row2 &&
        (pending.type === "emptyRow" || pending.type === "rowWithTemplate")
      ) {
        const row2 = modalResult.row2;
        const item1 = resolveRowCatalogItemForRowModal(r1, pending, 1, customTemplates);
        const item2 = resolveRowCatalogItemForRowModal(row2, pending, 2, customTemplates);
        placePairedRowPair(pending.start, pending.end, {
          prefix: normalizeRowPrefixLetters(r1.rowPrefix),
          rack_direction: r1.rack_direction,
          bin_direction: r1.bin_direction,
          item: item1,
          autoFill: effectiveRowAutoFill(r1, pending),
        }, {
          prefix: normalizeRowPrefixLetters(row2.rowPrefix),
          rack_direction: row2.rack_direction,
          bin_direction: row2.bin_direction,
          item: item2,
          autoFill: effectiveRowAutoFill(row2, pending),
        });
      } else {
        const prefix = normalizeRowPrefixLetters(r1.rowPrefix);
        if (pending.type === "emptyRow") {
          const item1 = resolveRowCatalogItemForRowModal(r1, pending, 1, customTemplates);
          const wantFill = effectiveRowAutoFill(r1, pending);
          if (wantFill && item1) {
            placeRowWithTemplate(pending.start, pending.end, item1, prefix, r1.rack_direction, r1.bin_direction);
          } else if (item1 && !wantFill) {
            placeEmptyRow(
              pending.start,
              pending.end,
              prefix,
              r1.rack_direction,
              r1.bin_direction,
              rowContainerTemplateIdFromCatalogItem(item1)
            );
          } else {
            placeEmptyRow(pending.start, pending.end, prefix, r1.rack_direction, r1.bin_direction);
          }
        } else if (pending.type === "rowWithTemplate") {
          const item1 = resolveRowCatalogItemForRowModal(r1, pending, 1, customTemplates);
          if (effectiveRowAutoFill(r1, pending)) {
            const fillItem = item1 ?? pending.item;
            if (fillItem) {
              placeRowWithTemplate(pending.start, pending.end, fillItem, prefix, r1.rack_direction, r1.bin_direction);
            } else {
              placeEmptyRow(pending.start, pending.end, prefix, r1.rack_direction, r1.bin_direction);
            }
          } else if (item1) {
            placeEmptyRow(
              pending.start,
              pending.end,
              prefix,
              r1.rack_direction,
              r1.bin_direction,
              rowContainerTemplateIdFromCatalogItem(item1)
            );
          } else {
            placeEmptyRow(pending.start, pending.end, prefix, r1.rack_direction, r1.bin_direction);
          }
        } else if (pending.type === "stampRack") {
          stampRackFromCatalogItem(pending.cell, pending.item, prefix);
        }
      }
      setPendingRowCreation(null);
      setRowPrefixModalOpen(false);
    },
    [
      pendingRowCreation,
      placeEmptyRow,
      placePairedRowPair,
      placeRowWithTemplate,
      stampRackFromCatalogItem,
      customTemplates,
    ]
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
    async (templateId: string, template: CustomRackTemplate, updateExistingRacks: boolean) => {
      if (!updateExistingRacks) return;
      // Build stock maps (same gate as layout save) before proposing rebuild.
      let stockByUuid: Map<string, number> | undefined;
      let stockDetailsByUuid: import("../components/warehouse/passageStorage").StockDetailByUuid | undefined;
      if (inventoryRows.length > 0) {
        stockByUuid = new Map();
        stockDetailsByUuid = new Map();
        const productsById = new Map(products.map((p) => [String(p.id), p]));
        for (const row of inventoryRows) {
          const u = String(row.location_uuid ?? "").trim();
          if (!u) continue;
          const qty = Number(row.quantity ?? 0);
          if (!(qty > 0)) continue;
          stockByUuid.set(u, (stockByUuid.get(u) ?? 0) + qty);
          const product = productsById.get(String(row.product_id));
          const productName = String(row.product_name ?? product?.name ?? "").trim() || `Produkt #${row.product_id}`;
          const unitPrice = product?.purchase_price;
          const valuePln =
            unitPrice != null && Number.isFinite(unitPrice) ? Number(unitPrice) * qty : null;
          const list = stockDetailsByUuid.get(u) ?? [];
          list.push({ productName, quantity: qty, unit: "szt.", valuePln });
          stockDetailsByUuid.set(u, list);
        }
      }
      let prepared;
      try {
        prepared = analyzeTemplateInstanceRebuild(
          layout,
          templateId,
          template,
          stockByUuid,
          stockDetailsByUuid
        );
      } catch (e) {
        const msg =
          e instanceof Error && e.message
            ? e.message
            : "Regał może posiadać tylko jeden przejazd pod regałem.";
        setSnackbar({ message: msg });
        throw e;
      }
      if (!prepared.changed && prepared.impacts.length === 0) {
        // Still apply passage rematerialize / dim updates from analyzer layout.
        setLayout(prepared.layout);
        return;
      }
      let impacts = prepared.impacts;
      const removedUuids = impacts.flatMap((i) =>
        i.removed.map((r) => String(r.locationUUID ?? "").trim()).filter(Boolean)
      );
      if (removedUuids.length > 0 && selectedWarehouseId != null) {
        try {
          const pre = await layoutService.rebuildPreflight(
            { tenant_id: TENANT_ID, warehouse_id: Number(selectedWarehouseId) },
            { location_uuids: removedUuids }
          );
          const ops = pre.data?.active_operations ?? [];
          if (ops.length > 0) {
            impacts = impacts.map((impact) => {
              const rackOps = ops.filter((op) =>
                impact.removed.some((r) => String(r.locationUUID ?? "").trim() === op.location_uuid)
              );
              return {
                ...impact,
                activeOperations: rackOps.map((op) => ({
                  locationUuid: op.location_uuid,
                  locationLabel: op.location_label,
                  operationType: op.operation_type,
                  documentNumber: op.document_number,
                })),
                hasActiveOperations: rackOps.length > 0,
              };
            });
          }
        } catch {
          // ignore — BE still gates on layout save
        }
      }
      if (impacts.length > 0 || prepared.changed) {
        setStructureRebuildPending({
          impacts: impacts.length > 0 ? impacts : prepared.impacts,
          layout: prepared.layout,
          source: "template_instances",
        });
        return;
      }
      setLayout(prepared.layout);
    },
    [layout, inventoryRows, products, selectedWarehouseId]
  );

  const handleExportCsv = useCallback(() => {
    exportCsv(layout);
  }, [layout]);

  const handleExportLocationsMapCsv = useCallback(() => {
    exportLocationsMapCsv(layout);
  }, [layout]);

  const handleExportJson = useCallback(() => {
    exportJson(layout);
  }, [layout]);

  const deleteSelectedRack = useCallback(() => {
    if (selectedRackId == null) return;
    setLayout((prev) => ({
      ...prev,
      racks: prev.racks.filter((r) => (r.id ?? r.rack_index) !== selectedRackId),
    }));
    setSelectedRackId(null);
  }, [selectedRackId]);
  void deleteSelectedRack;

  /** Layout capacity (dm³): same per-rack rule as rack header / map coloring (total_capacity_dm3 or sum of bin volumes). */
  const totalCapacity = useMemo(
    () =>
      layout.racks.reduce((sum, r) => {
        const rackTotal =
          r.total_capacity_dm3 ?? activeBinsForRack(r).reduce((s, b) => s + binVolumeDm3(b, r), 0);
        return sum + rackTotal;
      }, 0),
    [layout.racks]
  );

  /**
   * Fallback: distinct bin slot load from usedVolumeAtBin when /warehouse/occupancy-metrics is unavailable.
   */
  const binOccupancyVolumes = useMemo(() => {
    return measureDesignerMemo(designerPerf, "React: binOccupancyVolumes", () => {
      let total = 0;
      let primary = 0;
      let reserve = 0;
      let damaged = 0;
      const seen = new Set<string>();
      for (const r of layout.racks) {
        const rid = String(r.id ?? r.rack_index);
        for (const b of activeBinsForRack(r)) {
          const used = usedVolumeAtBin(b);
          if (used <= 0) continue;
          const uuid = binLocationUuidFromBin(b);
          const key = uuid || `${rid}-${b.level_index}-${b.segment_index}`;
          if (seen.has(key)) continue;
          seen.add(key);
          total += used;
          const t = normalizeStorageType(b.storage_type);
          if (t === "reserve") reserve += used;
          else if (t === "damaged") damaged += used;
          else primary += used;
        }
      }
      return {
        productsAssignedVolumeDm3: total,
        primaryUsedDm3: primary,
        reserveUsedDm3: reserve,
        damagedUsedDm3: damaged,
      };
    });
  }, [designerPerf, layout.racks, usedVolumeAtBin]);

  const { productsAssignedVolumeDm3, primaryUsedDm3, reserveUsedDm3, damagedUsedDm3 } = useMemo(() => {
    if (occupancyMetrics) {
      return {
        productsAssignedVolumeDm3: occupancyMetrics.total_volume_dm3,
        primaryUsedDm3: occupancyMetrics.primary_volume_dm3,
        reserveUsedDm3: occupancyMetrics.reserve_volume_dm3,
        damagedUsedDm3: occupancyMetrics.damaged_volume_dm3,
      };
    }
    return binOccupancyVolumes;
  }, [occupancyMetrics, binOccupancyVolumes]);

  const totalUsed = productsAssignedVolumeDm3;
  const capacityDenominatorDm3 = useMemo(() => {
    const apiCap = occupancyMetrics?.layout_capacity_volume_dm3;
    if (typeof apiCap === "number" && Number.isFinite(apiCap) && apiCap > 0) return apiCap;
    return totalCapacity;
  }, [occupancyMetrics?.layout_capacity_volume_dm3, totalCapacity]);
  const utilizationPct =
    capacityDenominatorDm3 > 0 ? Math.min(100, (productsAssignedVolumeDm3 / capacityDenominatorDm3) * 100) : 0;

  const handleExportWarehouseReport = useCallback(
    async (variant: WarehouseReportVariant) => {
      try {
        if (variant === "executive") {
          const execData = buildWarehouseExecutiveReportData({
            layout,
            inventoryRows,
            products,
          });
          await generateWarehouseExecutivePDF(execData);
          return;
        }
        if (variant === "product_locations") {
          if (selectedWarehouseId == null) {
            alert("Wybierz magazyn, aby wygenerować raport lokalizacji produktów.");
            return;
          }
          if (layout.layout_id == null) {
            alert("Brak aktywnego układu magazynu.");
            return;
          }
          await downloadProductLocationReportPdf(selectedWarehouseId, layout.layout_id, TENANT_ID);
          return;
        }
        if (variant === "technical") {
          if (selectedWarehouseId == null) {
            alert("Wybierz magazyn, aby wygenerować raport struktury.");
            return;
          }
          if (layout.layout_id == null) {
            alert("Brak aktywnego układu magazynu.");
            return;
          }
          await downloadStructureReportPdf(selectedWarehouseId, layout.layout_id, TENANT_ID);
          return;
        }
        const data = buildPdfReportData({
          layout,
          customTemplates,
          totalCapacityDm3: totalCapacity,
          usedVolumeDm3: productsAssignedVolumeDm3,
          occupancyPercent: utilizationPct,
          primary: {
            count: globalLocationStatsForLegend.primary,
            volumeDm3: primaryUsedDm3,
          },
          reserve: {
            count: globalLocationStatsForLegend.reserve,
            volumeDm3: reserveUsedDm3,
          },
          damaged: {
            count: globalLocationStatsForLegend.damaged,
            volumeDm3: damagedUsedDm3,
          },
          products,
          inventoryRows,
          layoutLocationUuids: validLayoutLocationUUIDs,
        });
        await generateWarehousePDF(data);
      } catch (e) {
        console.error(e);
        alert("Nie udało się wygenerować raportu PDF");
      }
    },
    [
      products,
      inventoryRows,
      validLayoutLocationUUIDs,
      layout,
      customTemplates,
      totalCapacity,
      productsAssignedVolumeDm3,
      utilizationPct,
      globalLocationStatsForLegend.primary,
      globalLocationStatsForLegend.reserve,
      globalLocationStatsForLegend.damaged,
      primaryUsedDm3,
      reserveUsedDm3,
      damagedUsedDm3,
      selectedWarehouseId,
    ]
  );

  const handleExportWarehouseValueReport = useCallback(async () => {
    await generateWarehouseValueReportPDF({
      products,
      layout,
      tenant_id: TENANT_ID,
      warehouse_id: selectedWarehouseId,
    });
  }, [products, layout, selectedWarehouseId]);

  const handleExportTopVolumeReport = useCallback(async () => {
    await generateTopVolumeReportPDF({
      products,
      layout,
      warehouseId: selectedWarehouseId,
      tenantId: TENANT_ID,
    });
  }, [products, layout, selectedWarehouseId]);

  /** Per-rack occupancy % for full map coloring (green / yellow / red). */
  const rackOccupancyPct = useMemo(() => {
    return measureDesignerMemo(designerPerf, "React: rackOccupancyPct", () => {
      const out: Record<string, number> = {};
      for (const r of layout.racks) {
        let used = 0;
        let total = 0;
        for (const b of activeBinsForRack(r)) {
          used += usedVolumeAtBin(b);
          total += binVolumeDm3(b, r);
        }
        const rid = String(r.id ?? r.rack_index);
        out[rid] = total > 0 ? Math.min(100, (used / total) * 100) : 0;
      }
      return out;
    });
  }, [designerPerf, layout.racks, usedVolumeAtBin]);

  const cellPx = BASE_PX_PER_CELL;
  const width = layout.grid_cols * cellPx;
  const height = layout.grid_rows * cellPx;

  useEffect(() => {
    if (!draggingWallElementId || !svgRef.current) return;
    const el = layout.wall_elements?.find((e) => e.id === draggingWallElementId);
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      if (!svgRef.current) return;
      const svg = svgRef.current;
      const { widthPx, heightPx } = getSvgLayoutSizePx(svg, width, height);
      const pos = getPositionCmAlongWall(
        e.clientX,
        e.clientY,
        el.wall,
        svg,
        widthPx,
        heightPx,
        layout.grid_cols,
        layout.grid_rows,
        GRID_UNIT_CM
      );
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

  const selectedRack =
    selectedRackId == null
      ? undefined
      : layout.racks.find((r) => rackMatchesSlotRackId(r, selectedRackId));
  const previewRack =
    previewRackId == null
      ? undefined
      : layout.racks.find((r) => rackMatchesSlotRackId(r, previewRackId));
  const selectedRacks = layout.racks.filter((r) => selectedRackIds.some((id) => rackMatchesSlotRackId(r, id)));
  const isMultiSelect = selectedRackIds.length > 1;
  const rackPropertiesPanelVisible =
    mainView === "layout" &&
    !rackPanelDismissed &&
    previewRack != null &&
    selectedAisleIndex == null &&
    selectedVisualIds.length === 0;

  const closeRackPanel = useCallback(() => {
    setRackPanelDismissed(true);
    setPreviewRackId(null);
    setEditingRackId(null);
    setSelectedRackId(null);
    setSelectedRackIds([]);
    focusWarehouseCanvasScroll();
  }, []);

  useEffect(() => {
    if (previewRackId == null || selectedRackId == null) return;
    const sameRack = layout.racks.some(
      (r) => rackMatchesSlotRackId(r, previewRackId) && rackMatchesSlotRackId(r, selectedRackId),
    );
    if (!sameRack) {
      setPreviewRackId(null);
      setRackPanelDismissed(true);
    }
  }, [selectedRackId, previewRackId, layout.racks]);

  useEffect(() => {
    if (mainView !== "layout") return;
    const el = document.querySelector<HTMLElement>("[data-warehouse-canvas-scroll]");
    if (internalLayoutRackId != null) {
      if (el) layoutScrollRestoreRef.current = { top: el.scrollTop, left: el.scrollLeft };
    } else if (layoutScrollRestoreRef.current && el) {
      const saved = layoutScrollRestoreRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = saved.top;
        el.scrollLeft = saved.left;
      });
      layoutScrollRestoreRef.current = null;
    }
  }, [internalLayoutRackId, mainView]);

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
    selectedSpecialLocationKey,
    deleteSelectedSpecialLocation,
    internalLayoutRackId,
    onCloseInternalLayout: () => setInternalLayoutRackId(null),
    onCloseRackPanel: closeRackPanel,
    rackPanelOpen: rackPropertiesPanelVisible,
  });

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

  const applyInternalLayoutSave = useCallback(
    (
      rackId: number | string,
      internal_structure: InternalStructure,
      bins: BinState[] | undefined,
      variant?: CustomRackTemplate | null,
      options?: { clearPassages?: boolean }
    ) => {
      setLayout((prev) => {
        const next = {
          ...prev,
          racks: prev.racks.map((r) => {
            if ((r.id ?? r.rack_index) !== rackId) return r;
            const storageLc = levelConfigFromInternalStructure(internal_structure);
            const prevLc = getLevelConfig(r);
            const clearPassages = options?.clearPassages === true;
            const voidN = clearPassages ? 0 : countPassageVoidLevelsForRack(r);
            // Keep full construction levelConfig when passage voids bottom levels;
            // internal_structure from the modal is storage-only (unless passage was cleared).
            const levelConfig =
              !clearPassages && voidN > 0 && prevLc.length > storageLc.length
                ? [
                    ...prevLc.slice(0, voidN).map((row, i) => ({
                      level: i + 1,
                      locations: Math.max(1, row.locations ?? 1),
                    })),
                    ...storageLc.map((row, i) => ({
                      level: voidN + i + 1,
                      locations: Math.max(1, row.locations ?? 1),
                    })),
                  ]
                : storageLc;
            const nextPassages = clearPassages
              ? (r.passages ?? []).map((p) => ({ ...p, enabled: false }))
              : r.passages;
            return {
              ...r,
              templateId: variant?.id ?? r.templateId,
              levels: Math.max(1, levelConfig.length),
              bins_per_level: levelConfig[voidN]?.locations ?? levelConfig[0]?.locations ?? r.bins_per_level,
              levelConfig,
              internal_structure,
              layoutVariant: { levels: levelConfig, internal_structure },
              ...(bins ? { bins } : {}),
              ...(clearPassages ? { passages: nextPassages } : {}),
            };
          }),
        };
        return next;
      });
      if (variant) setCustomTemplates((prev) => [...prev, variant]);
      setInternalLayoutRackId(null);
    },
    []
  );

  const onSaveInternalLayout = useCallback(
    (
      internal_structure: InternalStructure,
      bins: BinState[] | undefined,
      options?: { clearPassages?: boolean }
    ) => {
      const rackId = internalLayoutRackId;
      if (rackId == null) return;
      const currentRack = layout.racks.find((r) => (r.id ?? r.rack_index) === rackId) ?? null;
      const baseTemplate = currentRack?.templateId ? customTemplates.find((t) => t.id === currentRack.templateId) ?? null : null;
      const rackForCompare =
        options?.clearPassages && currentRack
          ? {
              ...currentRack,
              passages: (currentRack.passages ?? []).map((p) => ({ ...p, enabled: false })),
            }
          : currentRack;
      if (baseTemplate && structureDiffersFromTemplate(baseTemplate, internal_structure, rackForCompare)) {
        setPendingVariantSave({
          rackId,
          baseTemplate,
          internalStructure: internal_structure,
          bins,
          clearPassages: options?.clearPassages,
        });
        setVariantNameInput(`${baseTemplate.name} [Wariant]`);
        return;
      }
      applyInternalLayoutSave(rackId, internal_structure, bins, null, options);
    },
    [internalLayoutRackId, layout.racks, customTemplates, applyInternalLayoutSave]
  );

  const { editProductModalProps } = useDesignerProductModal({
    mainView,
    editingProductId,
    showElevationForRackId,
    selectedWarehouseId,
    layout,
    products,
    setProducts,
    setEditingProductId,
    safeQuantity,
    safeVolumeDm3,
    binVolumeDm3,
    binsToLevels,
  });

  return (
    <WarehouseModeProvider mode={warehouseMode}>
    <WarehouseShell
      breadcrumbs={[
        { label: UI_STRINGS.navigation.groups.warehouse },
        { label: UI_STRINGS.warehouse.designerSubTabs.layoutDesigner },
      ]}
      topActions={
          <>
            <DesignerSaveStatusText lastSavedAt={lastSavedAt} />
            <DesignerWarehouseSelect
              warehouseId={selectedWarehouseId}
              warehouses={warehouses}
              loading={warehousesLoading}
              onSelect={handleDesignerWarehouseSelect}
            />
            <DesignerToolbar
              mainView={mainView}
              lastSavedAt={lastSavedAt}
              showSaveStatus={false}
              saveLayout={saveLayout}
              saving={saving}
              saveLayoutBlockedReason={rackNameDuplicateMessage}
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
          </>
      }
      tabsAriaLabel="Widok magazynu"
      tabsSlot={
          <nav
            className={`${brandTabsNavRowClassName} w-full flex-nowrap overflow-x-auto sm:justify-start [-webkit-overflow-scrolling:touch]`}
            aria-label="Widok magazynu"
            role="tablist"
            data-warehouse-features={activeWarehouseFeatures.join(" ")}
          >
            <button
              type="button"
              role="tab"
              id="warehouse-designer-tab-magazyn"
              aria-selected={mainView === "magazyn"}
              aria-controls="warehouse-designer-panel"
              tabIndex={mainView === "magazyn" ? 0 : -1}
              onClick={() => selectDesignerView("magazyn")}
              className={tabsNavItemClassName(mainView === "magazyn")}
            >
              {UI_STRINGS.warehouse.designerSubTabs.magazyn}
            </button>
            <button
              type="button"
              role="tab"
              id="warehouse-designer-tab-layout"
              aria-selected={mainView === "layout"}
              aria-controls="warehouse-designer-panel"
              tabIndex={mainView === "layout" ? 0 : -1}
              onClick={() => selectDesignerView("layout")}
              className={tabsNavItemClassName(mainView === "layout")}
            >
              {UI_STRINGS.warehouse.designerSubTabs.layoutDesigner}
            </button>
          </nav>
      }
    >
      {mainView === "layout" ? (
        <div className="mb-3 flex shrink-0 items-center gap-2" role="tablist" aria-label="Workspace projektanta">
          <button
            type="button"
            role="tab"
            aria-selected={layoutWorkspace === "designing"}
            onClick={() => {
              if (layoutWorkspace === "routes" && !confirmLeaveRoutingDirty()) return;
              if (layoutWorkspace === "routes" && routing.dirty) {
                void routing.load();
              }
              // Selection SSOT: leaving Routing clears node/edge.
              setRoutingSelectedNode(null);
              setRoutingSelectedEdge(null);
              setRoutingEdgeDraftFrom(null);
              setRoutingDraftCursorCm(null);
              setLayoutWorkspace("designing");
            }}
            className={`rounded-md border px-3 py-1 text-[11px] font-semibold ${
              layoutWorkspace === "designing"
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {UI_STRINGS.warehouse.designerSubTabs.designing}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={layoutWorkspace === "routes"}
            onClick={() => {
              // Selection SSOT: entering Routing clears rack/passage.
              setSelectedRackId(null);
              setSelectedRackIds([]);
              setSelectedPassage(null);
              setLayoutWorkspace("routes");
              setRoutingTool("draw_edge");
            }}
            className={`rounded-md border px-3 py-1 text-[11px] font-semibold ${
              layoutWorkspace === "routes"
                ? "border-sky-700 bg-sky-700 text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {UI_STRINGS.warehouse.designerSubTabs.routes}
          </button>
          <div className="relative ml-auto">
            <AppButton
              type="button"
              variant="success"
              className="!h-8 !min-h-0 !gap-1.5 !px-3 !text-[11px]"
              onClick={() => setLayoutExportOpen((v) => !v)}
              aria-expanded={layoutExportOpen}
              aria-haspopup="menu"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {UI_STRINGS.warehouse.export.button}
              <span className="opacity-80">▾</span>
            </AppButton>
            {layoutExportOpen ? (
              <>
                <div className="absolute right-0 z-20 mt-1 min-w-[14rem] overflow-hidden rounded-lg border border-slate-100 bg-white py-1 shadow-lg" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                    onClick={() => {
                      handleExportLocationsMapCsv();
                      setLayoutExportOpen(false);
                    }}
                  >
                    {UI_STRINGS.warehouse.rackSidebar.exportLocationsCsv}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                    onClick={() => {
                      handleExportCsv();
                      setLayoutExportOpen(false);
                    }}
                  >
                    {UI_STRINGS.warehouse.export.csv}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                    onClick={() => {
                      handleExportJson();
                      setLayoutExportOpen(false);
                    }}
                  >
                    {UI_STRINGS.warehouse.export.json}
                  </button>
                </div>
                <div className="fixed inset-0 z-10" onClick={() => setLayoutExportOpen(false)} aria-hidden />
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppSplitView
        className="min-h-0 flex-1"
        left={
          mainView === "magazyn" ? (
          <div className="flex h-full min-h-0 w-[300px] shrink-0 flex-none flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain border-r border-slate-200 px-4 py-4">
            <MagazynDashboardPanel
              layout={layout}
              customTemplates={customTemplates}
              rackTypeFilter={manualRackType}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={(templateId) =>
                setSelectedTemplateId((prev) => (prev === templateId ? null : templateId))
              }
              onClearTemplateSelection={() => setSelectedTemplateId(null)}
              productsAssignedVolumeDm3={productsAssignedVolumeDm3}
              totalCapacity={totalCapacity}
              utilizationPct={utilizationPct}
              primaryUsedDm3={primaryUsedDm3}
              reserveUsedDm3={reserveUsedDm3}
              damagedUsedDm3={damagedUsedDm3}
              locationStats={{
                primary: globalLocationStatsForLegend.primary,
                reserve: globalLocationStatsForLegend.reserve,
                damaged: globalLocationStatsForLegend.damaged,
              }}
              locationFill={locationFillCounts}
              visualizationMode={mapVisualizationMode}
              onVisualizationModeChange={setMapVisualizationMode}
              formatVolume={formatVolume}
              onOpenReports={() => setShowWarehouseReportsPanel(true)}
              onOpenDamageReports={() => {
                setDamagePrefill(null);
                setShowDamageReportsPanel(true);
              }}
            />
          </div>
        ) : mainView === "layout" ? (
            <RackSidebar
            mode="edit"
            layout={layout}
            manualRackType={manualRackType}
            setManualRackType={setManualRackType}
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
            totalUsed={totalUsed}
            totalCapacity={totalCapacity}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            onExportLocationsMapCsv={handleExportLocationsMapCsv}
            onOpenEditBuilding={() => setShowEditBuilding(true)}
            showGenerateLayoutModal={showGenerateLayoutModal}
            setShowGenerateLayoutModal={setShowGenerateLayoutModal}
            wallElementTool={wallElementTool}
            setWallElementTool={setWallElementTool}
            selectedRowContainerId={selectedRowContainerId}
          />
        ) : null
      }
    >
      <div
        id="warehouse-designer-panel"
        role="tabpanel"
        aria-labelledby={mainView === "magazyn" ? "warehouse-designer-tab-magazyn" : "warehouse-designer-tab-layout"}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        {mainView === "magazyn" ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-100/80">
              {layout.racks.length === 0 ? (
                <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col items-center justify-center p-8 text-slate-500">
                  <p className="text-sm">Brak regałów. Przejdź do Projektu Layoutu, aby dodać regały i zobaczyć widok z boku.</p>
                </div>
              ) : (
                <>
                  <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col overflow-hidden">
                    {selectedRackIdForSideView == null ? (
                      <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-row items-stretch overflow-hidden">
                        <div className="relative flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col overflow-hidden">
                          <div
                            ref={magazynMapScrollRef}
                            className={warehouseMapHallClassName}
                            style={{ overscrollBehavior: "contain" }}
                          >
                          <WarehouseLayoutRenderer
                            mode="read"
                            // Magazyn map renders real rack instances from layout state.
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
                            pathPoints={null}
                            pathSegments={null}
                            pathMarkers={null}
                            routeStops={null}
                            showRoute={false}
                            routeStepBadges={null}
                            routeEndCell={null}
                            routeGraphPolyline={null}
                            showRouteEndpointMarkers={true}
                            // Magazyn map is navigation-only: no quantity badges, only rack highlighting + labels.
                            rackQuantities={mainView === "magazyn" ? undefined : productRackQuantities ?? undefined}
                            getRackDisplayId={getRackDisplayIdWithLayout}
                            highlightedStopIndex={null}
                            currentStopIndex={null}
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
                            showLabels={showLabels}
                            setShowLabels={setShowLabels}
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
                            selectedSpecialLocationKey={selectedSpecialLocationKey}
                            onSpecialLocationSelect={(key) => {
                              setSelectedSpecialLocationKey(key);
                              if (key != null) {
                                setSelectedRackId(null);
                                setSelectedRackIds([]);
                                setSelectedVisualId(null);
                                setSelectedVisualIds([]);
                                setSelectedWallElementId(null);
                              }
                            }}
                            layoutModeLabel={layoutModeDisplay.modeLabel}
                            layoutModeColor={layoutModeDisplay.modeColor}
                            layoutMode={layoutMode}
                            selectedVisualIds={selectedVisualIds}
                            outsideRackIds={outsideRackIds}
                            isLiveView={isLiveView}
                            skipInitialLiveFit={hasStoredCamera}
                            restoredScroll={restoredScroll}
                            onViewportScroll={handleViewportScroll}
                            onCameraFitApplied={handleCameraFitApplied}
                            mapVisualizationMode={mapVisualizationMode}
                            occupiedLocationUuids={occupiedLocationUuids}
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
                            highlightedRackIds={canvasHighlightedRackIds}
                            highlightedBinUUIDs={highlightedBinUUIDsForSidebarProduct ?? undefined}
                            focusedBinUUID={focusedBinUUID}
                            rackOccupancyStats={rackOccupancyStats}
                            hoveredLocationUUID={hoveredLocationUUID}
                            onRackClick={(id) => {
                              setSelectedProductId(null);
                              setHoveredProductIdOnMap(null);
                              setSelectedProductIdOnMap(null);
                              setFocusedBinUUID(null);
                              setSelectedRackIdOnMap(String(id));
                              setSelectedRackId(id);
                              setSelectedRackIds([id]);
                              // Magazyn regression fix:
                              // Keep full map visible on single click (so racks never "disappear").
                              // Side view can be opened via double-click.
                              if (mainView === "magazyn") {
                                setSelectedRackIdForSideView(null);
                                setSelectedLocationForProducts(null);
                                setShowAllProductsInSidebar(false);
                              }
                            }}
                            onRackDoubleClick={(id) => {
                              setSelectedProductId(null);
                              setSelectedRackIdOnMap(null);
                              setHoveredProductIdOnMap(null);
                              setSelectedProductIdOnMap(null);
                              setSelectedRackIdForSideView(id);
                              setSelectedLocationForProducts(null);
                              setProductSearchQuery("");
                              setShowAllProductsInSidebar(false);
                            }}
                            onReadModeCanvasBackgroundClick={handleMagazynMapBackgroundClick}
                          />
                          </div>
                        </div>
                        {selectedRackIdOnMap != null && selectedRackForMap != null ? (
                          <MagazynProductsSidebar
                            layout={layout}
                            products={rackProductsForMap}
                            productLocationIndex={productLocationIndex}
                            inventoryMaps={inventoryMaps}
                            productSearchQuery={productSearchQuery}
                            setProductSearchQuery={setProductSearchQuery}
                            selectedLocationForProducts={null}
                            showAllProductsInSidebar={true}
                            setShowAllProductsInSidebar={() => {}}
                            selectedRackForMagazyn={selectedRackForMap}
                            selectedRackBinUUIDs={mapRackBinUUIDs}
                            safeQuantity={safeQuantity}
                            safeVolumeDm3={safeVolumeDm3}
                            getProductImageUrl={getProductImageUrl}
                            formatVolume={formatVolume}
                            rackProductMode
                            onHoverProductIdChange={setHoveredProductIdOnMap}
                            onHoverLocationUUIDChange={setHoveredLocationUUID}
                            onRemoveProductAssignment={removeProductAssignmentAtLocation}
                            onRequestClearRack={() => setClearRackConfirmOpen(true)}
                            clearRackBusy={clearRackBusy}
                            productsForRackAssignmentCheck={products}
                            selectedProductId={selectedProductId}
                            onToggleProductMapHighlight={toggleProductMapHighlight}
                            onCreateDamageReportPrefill={(prefill) => {
                              setDamagePrefill(prefill);
                              setShowDamageReportsPanel(true);
                            }}
                          />
                        ) : selectedProductIdOnMap != null && selectedProductQuantityBreakdown != null ? (
                          <ProductLocatorSidebar
                            product={selectedProductQuantityBreakdown.product}
                            totalQuantity={selectedProductQuantityBreakdown.totalQuantity}
                            primaryQuantity={selectedProductQuantityBreakdown.primaryQuantity}
                            reserveQuantity={selectedProductQuantityBreakdown.reserveQuantity}
                            layout={layout}
                            productLocationIndex={productLocationIndex}
                            getProductImageUrl={getProductImageUrl}
                            onSelectLocation={(locationUUID) => {
                              const rackId = uuidToRackId.get(locationUUID);
                              setSelectedRackIdOnMap(rackId ?? null);
                              setFocusedBinUUID(locationUUID);
                              const bin = uuidToBin.get(locationUUID);
                              if (bin) {
                                setSelectedLocationForProducts({
                                  level_index: bin.level_index,
                                  segment_index: bin.segment_index,
                                });
                              }
                            }}
                          />
                        ) : (
                          <TopProductsSidebar
                            topProducts={sortedProductsByVolume}
                            products={products}
                            productSearchQuery={productSearchQuery}
                            setProductSearchQuery={setProductSearchQuery}
                            selectedProductIdOnMap={selectedProductIdOnMap}
                            setSelectedProductIdOnMap={setSelectedProductIdOnMap}
                            setHoveredProductIdOnMap={setHoveredProductIdOnMap}
                            onClearMapProductSelection={() => {
                              setSelectedProductId(null);
                              setHoveredProductIdOnMap(null);
                              setSelectedProductIdOnMap(null);
                              setFocusedBinUUID(null);
                            }}
                            getProductImageUrl={getProductImageUrl}
                            formatVolume={formatVolume}
                            onHoverProductIdChange={setHoveredProductIdOnMap}
                          />
                        )}
                      </div>
                    ) : (() => {
                const rack = displayRack ?? selectedRackForMagazyn;
                return (
                  <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col overflow-hidden">
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
                      getRackDisplayId={getRackDisplayIdWithLayout}
                      onShowLabelDownload={() => setShowRackLabelDownload(true)}
                      onEmptyRack={() => setClearRackConfirmOpen(true)}
                      emptyRackDisabled={clearRackBusy}
                      hideEmptyRackButton={
                        !selectedRackHasBinUuids || clearRackConfirmPreview.assignmentCount === 0
                      }
                    />
                    {rack && (
                      <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col overflow-hidden">
                        <div
                          ref={magazynRackSideScrollRef}
                          className="flex min-h-0 min-w-0 max-w-full w-full flex-1 flex-col overflow-auto overscroll-y-contain"
                          style={{ overscrollBehavior: "contain" }}
                        >
                        <RackSideViewGrid
                          rack={displayRack ?? rack}
                          layout={layout}
                          showLabels={showLabels}
                          onBinClick={(level_index, segment_index) => setSelectedLocationForProducts({ level_index, segment_index })}
                          selectedLocation={selectedLocationForProducts}
                          hoveredLocationUUID={hoveredLocationUUID}
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
                      </div>
                    )}
                  </div>
                );
                    })()}
                  </div>
                  <WarehouseLegend
                    viewMode={selectedRackIdForSideView == null ? "fullMap" : "rackDetail"}
                    stats={{ rackCount: layout.racks.length, usedDm3: totalUsed, totalDm3: totalCapacity, primaryUsedDm3, reserveUsedDm3, damagedUsedDm3 }}
                    usedStorageTypes={usedStorageTypesForLegend}
                    globalLocationStats={globalLocationStatsForLegend}
                  />
                </>
              )}
            </div>
            {mainView === "magazyn" && selectedRackIdForSideView != null && layout.racks.some((r) => String(r.id ?? r.rack_index) === String(selectedRackIdForSideView)) && (
              <MagazynProductsSidebar
                layout={layout}
                products={products}
                productLocationIndex={productLocationIndex}
                inventoryMaps={inventoryMaps}
                productSearchQuery={productSearchQuery}
                setProductSearchQuery={setProductSearchQuery}
                selectedLocationForProducts={selectedLocationForProducts}
                showAllProductsInSidebar={showAllProductsInSidebar}
                setShowAllProductsInSidebar={setShowAllProductsInSidebar}
                selectedRackForMagazyn={selectedRackForMagazyn}
                selectedRackBinUUIDs={selectedRackBinUUIDs}
                safeQuantity={safeQuantity}
                safeVolumeDm3={safeVolumeDm3}
                getProductImageUrl={getProductImageUrl}
                formatVolume={formatVolume}
                onRemoveProductAssignment={removeProductAssignmentAtLocation}
                onRequestClearRack={() => setClearRackConfirmOpen(true)}
                clearRackBusy={clearRackBusy}
                selectedProductId={selectedProductId}
                onToggleProductMapHighlight={toggleProductMapHighlight}
                onHoverLocationUUIDChange={setHoveredLocationUUID}
                onCreateDamageReportPrefill={(prefill) => {
                  setDamagePrefill(prefill);
                  setShowDamageReportsPanel(true);
                }}
              />
            )}
          </>
        ) : mainView === "layout" ? (
          <div className="flex min-h-0 min-w-0 flex-1">
          <DesignerGrid
            mainViewProps={{
              mode: routesMode ? "read" : "edit",
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
              onMouseMove: handleCanvasMouseMoveWithPassage,
              onMouseDown: handleCanvasMouseDown,
              onMouseUp: handleCanvasMouseUp,
              onMouseLeave: handleCanvasMouseLeave,
              panMode,
              isPanning,
              selectedRackIds,
              collisionRackId,
              collisionRackIds,
              selectedRack,
              propertiesRack: previewRack ?? selectedRack,
              editingRackId,
              setEditingRackId,
              isMultiSelect,
              onRackClickPassthrough: undefined,
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
              passageToolActive,
              setPassageToolActive,
              passageDrawStart,
              passageDrawEnd,
              passageWidthCm,
              setPassageWidthCm,
              passageShiftKey,
              selectedPassage,
              setSelectedPassage,
              onPassageDragStart: (rackUuid, passageUuid, grabOffsetCm) =>
                setDraggingPassage({ rackUuid, passageUuid, grabOffsetCm }),
              onOpenPassageTemplate: () => {
                if (!selectedPassage) return;
                const rack = layout.racks.find(
                  (r) => String(r.uuid || "") === String(selectedPassage.rackUuid)
                );
                const tid = rack?.templateId;
                if (!tid) {
                  window.alert(
                    "Ten regał nie ma powiązanego szablonu. Otwórz szablon z katalogu w panelu bocznym."
                  );
                  return;
                }
                setEditingTemplateId(tid);
              },
              canvasFocusCm,
              routesWorkspace: routesMode,
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
              setLayoutMode,
              specialLocations,
              onUpdateSpecialLocation: updateSpecialLocation,
              onDeleteSpecialLocation: deleteSpecialLocation,
              selectedSpecialLocationKey,
              onSpecialLocationSelect: (key) => {
                setSelectedSpecialLocationKey(key);
                if (key != null) {
                  setSelectedRackId(null);
                  setSelectedRackIds([]);
                  setSelectedVisualId(null);
                  setSelectedVisualIds([]);
                  setSelectedWallElementId(null);
                }
              },
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
              pathPoints: null,
              pathSegments: null,
              routeStops: null,
              showRoute: false,
              highlightedStopIndex: null,
              currentStopIndex: null,
              getRackDisplayId: getRackDisplayIdWithLayout,
              routeStepBadges: null,
              routeEndCell: null,
              routeGraphPolyline: null,
              showRouteEndpointMarkers: true,
              pathMarkers: null,
              rackPanelOpen: routesMode ? false : !rackPanelDismissed,
              onCloseRackPanel: closeRackPanel,
              onSaveLayout: saveLayout,
              saving,
              lastSavedAt,
              warehouseLabel: layout.warehouse_name || activeWarehouse?.name || undefined,
              templateName: (() => {
                const rid = previewRack ?? selectedRack;
                const tid = rid?.templateId?.trim();
                if (!tid) return null;
                return customTemplates.find((t) => t.id === tid)?.name ?? tid;
              })(),
              onOpenRackTemplate: (templateId: string) => {
                setEditingTemplateId(templateId);
              },
              svgOverlay: routesMode ? (
                <RoutingGraphLayer
                  nodes={routing.nodes}
                  edges={routing.edges}
                  accessPoints={routing.accessPoints}
                  locationAccess={routing.locationAccess}
                  showAccessDiagnostics={routing.showAccessDiagnostics}
                  racks={layout.racks}
                  selectedRackUuids={selectedRacks
                    .map((r) => (typeof r.uuid === "string" ? r.uuid : ""))
                    .filter(Boolean)}
                  selectedLocationId={selectedAccessLocationId}
                  showAllAccessProblems={showAllAccessProblems}
                  problemRackUuids={problemRackUuids}
                  cellPx={cellPx}
                  selectedNodeUuid={routingSelectedNode}
                  selectedEdgeUuid={routingSelectedEdge}
                  highlightNodeUuids={
                    highlightOrphanUuids.length
                      ? highlightOrphanUuids
                      : routing.testResult?.ok
                        ? routing.testResult.nodes.map((n) => n.node_uuid)
                        : []
                  }
                  highlightEdgeUuids={
                    highlightInvalidEdgeUuids.length
                      ? highlightInvalidEdgeUuids
                      : routing.testResult?.ok
                        ? routing.testResult.path_segments.map((s) => s.edge_uuid)
                        : []
                  }
                  diagnosticEdgeUuids={
                    routing.validation?.issues.find((i) => i.code === "EDGES_THROUGH_OBSTACLES")
                      ?.ref_uuids ?? []
                  }
                  draftFromUuid={routingEdgeDraftFrom}
                  draftCursorCm={routingDraftCursorCm}
                  draftOrthoGuide={routingDraftOrthoGuide}
                  allowNodeDrag={routingTool === "edit"}
                  allowEndpointDrag={routingTool === "edit"}
                  interactive
                  onNodeDrag={(uuid, x, y) => {
                    routing.updateNode(uuid, { x, y });
                  }}
                  onNodeDragEnd={(uuid, x, y) => {
                    const prev = routing.nodes.find((n) => n.uuid === uuid);
                    const prevX = prev?.x ?? x;
                    const prevY = prev?.y ?? y;
                    commandBusRef.current.execute({
                      id: "dragNode",
                      label: "Przesuń punkt",
                      execute: () => {
                        routing.updateNode(uuid, { x, y });
                        routing.normalizeAfterEdit();
                        return { ok: true };
                      },
                      undo: () => {
                        routing.updateNode(uuid, { x: prevX, y: prevY });
                        routing.normalizeAfterEdit();
                        return { ok: true };
                      },
                    });
                    setRoutingSelectedNode(uuid);
                    setRoutingSelectedEdge(null);
                  }}
                  onEndpointRewireDrop={({ edgeUuid, end, target }) => {
                    const edge = routing.edges.find((e) => e.uuid === edgeUuid);
                    if (!edge) return;
                    const prevEndpoint =
                      end === "from" ? edge.from_node_uuid : edge.to_node_uuid;
                    if (target.kind === "node" && target.uuid === prevEndpoint) return;
                    let createdNodeUuid: string | null = null;
                    commandBusRef.current.execute({
                      id: "endpointRewire",
                      label: "Przepnij koniec odcinka",
                      execute: () => {
                        let nextUuid: string;
                        if (target.kind === "node") {
                          nextUuid = target.uuid;
                        } else {
                          nextUuid = routing.addNodeAtCm(target.x, target.y);
                          createdNodeUuid = nextUuid;
                        }
                        const ok = routing.rewireEdgeEndpoint(edgeUuid, end, nextUuid);
                        if (!ok) {
                          if (createdNodeUuid) {
                            routing.removeNode(createdNodeUuid);
                            createdNodeUuid = null;
                          }
                          window.alert("Nie można przepiąć — pętla lub duplikat odcinka.");
                          return { ok: false };
                        }
                        routing.normalizeAfterEdit();
                        setRoutingSelectedEdge(edgeUuid);
                        setRoutingSelectedNode(null);
                        return { ok: true };
                      },
                      undo: () => {
                        routing.rewireEdgeEndpoint(edgeUuid, end, prevEndpoint);
                        if (createdNodeUuid) {
                          routing.removeNode(createdNodeUuid);
                          createdNodeUuid = null;
                        }
                        routing.normalizeAfterEdit();
                        return { ok: true };
                      },
                    });
                  }}
                  onNodeClick={(uuid) => {
                    if (routingTool === "draw_edge") {
                      const node = routing.nodes.find((n) => n.uuid === uuid);
                      const step = routing.drawAtCm(
                        routingEdgeDraftFrom,
                        node?.x ?? 0,
                        node?.y ?? 0,
                        { preferNodeUuid: uuid }
                      );
                      setRoutingEdgeDraftFrom(step.draftFromUuid);
                      setRoutingSelectedNode(step.draftFromUuid);
                      setRoutingSelectedEdge(null);
                      return;
                    }
                    if (routingTool === "test_route") {
                      if (!testStartUuid) {
                        setTestStartUuid(uuid);
                        setTestDestUuid(null);
                        routing.setTestResult(null);
                      } else if (!testDestUuid) {
                        setTestDestUuid(uuid);
                        void routing.runTestRoute(testStartUuid, uuid);
                      } else {
                        // Start a new test from this click
                        setTestStartUuid(uuid);
                        setTestDestUuid(null);
                        routing.setTestResult(null);
                      }
                      return;
                    }
                    // Wybierz — sticky tool; never switch away here
                    setRoutingSelectedNode(uuid);
                    setRoutingSelectedEdge(null);
                  }}
                  onEdgeClick={(uuid, cm) => {
                    if (routingTool === "draw_edge") {
                      if (!cm) return;
                      const step = routing.drawAtCm(routingEdgeDraftFrom, cm.x, cm.y, {
                        preferEdgeUuid: uuid,
                      });
                      setRoutingEdgeDraftFrom(step.draftFromUuid);
                      setRoutingSelectedNode(step.draftFromUuid);
                      setRoutingSelectedEdge(null);
                      return;
                    }
                    if (routingTool === "test_route") return;
                    // Wybierz — sticky
                    setRoutingSelectedEdge(uuid);
                    setRoutingSelectedNode(null);
                  }}
                  onCanvasMoveCm={(x, y, opts) => {
                    if (routingTool === "draw_edge" && routingEdgeDraftFrom) {
                      const from = routing.nodes.find((n) => n.uuid === routingEdgeDraftFrom);
                      const ortho = preferOrthogonalCm(from, x, y, {
                        freeAngle: Boolean(opts?.freeAngle),
                      });
                      setRoutingDraftCursorCm({ x: ortho.x, y: ortho.y });
                      setRoutingDraftOrthoGuide(ortho.guide);
                    }
                  }}
                  onCanvasClickCm={(x, y, opts) => {
                    if (routingTool === "draw_edge") {
                      const step = routing.drawAtCm(routingEdgeDraftFrom, x, y, {
                        freeAngle: Boolean(opts?.freeAngle),
                      });
                      setRoutingEdgeDraftFrom(step.draftFromUuid);
                      setRoutingSelectedNode(step.draftFromUuid);
                      setRoutingSelectedEdge(null);
                      setRoutingDraftOrthoGuide(step.orthoGuide ?? null);
                      return;
                    }
                    if (routingTool === "select" || routingTool === "edit") {
                      // Click empty map clears selection but keeps tool active
                      setRoutingSelectedNode(null);
                      setRoutingSelectedEdge(null);
                    }
                  }}
                />
              ) : null,
              htmlOverlay: routesMode ? (
                <SelectionQuickToolbar
                  selection={designerSelection}
                  workspace="routes"
                  anchor={selectionToolbarAnchor}
                  onEditRouting={() => setRoutingToolSafe("edit")}
                  onDelete={() => {
                    if (designerSelection.kind === "node") {
                      const node = routing.nodes.find((n) => n.uuid === designerSelection.nodeUuid);
                      if (node) deleteSelectedNode(routing, node, setRoutingSelectedNode, routingLocations);
                    } else if (designerSelection.kind === "edge") {
                      if (!window.confirm("Usunąć ten odcinek trasy?")) return;
                      routing.removeEdge(designerSelection.edgeUuid);
                      setRoutingSelectedEdge(null);
                    }
                  }}
                  onFlipEdgeDirection={() => {
                    if (designerSelection.kind !== "edge") return;
                    const edge = routing.edges.find((e) => e.uuid === designerSelection.edgeUuid);
                    if (!edge) return;
                    routing.updateEdge(edge.uuid, {
                      from_node_uuid: edge.to_node_uuid,
                      to_node_uuid: edge.from_node_uuid,
                    });
                  }}
                />
              ) : null,
            }}
          />
          {routesMode && (
            <RoutingRoutesPanel
              routing={routing}
              tool={routingTool}
              setTool={(t) => {
                setRoutingToolSafe(t);
                if (t === "draw_edge") {
                  // Explicit re-entry starts a new branch
                  setRoutingEdgeDraftFrom(null);
                  setRoutingDraftCursorCm(null);
                  setRoutingSelectedNode(null);
                  setRoutingSelectedEdge(null);
                }
                if (t === "test_route") {
                  setTestStartUuid(null);
                  setTestDestUuid(null);
                  routing.setTestResult(null);
                  setRoutingSelectedNode(null);
                  setRoutingSelectedEdge(null);
                }
                if (t === "select" || t === "edit") {
                  setRoutingEdgeDraftFrom(null);
                  setRoutingDraftCursorCm(null);
                }
              }}
              selectedNodeUuid={routingSelectedNode}
              selectedEdgeUuid={routingSelectedEdge}
              setSelectedNodeUuid={setRoutingSelectedNode}
              setSelectedEdgeUuid={setRoutingSelectedEdge}
              testStartUuid={testStartUuid}
              testDestUuid={testDestUuid}
              setTestStartUuid={setTestStartUuid}
              setTestDestUuid={setTestDestUuid}
              locations={routingLocations}
              racks={layout.racks}
              highlightOrphanUuids={highlightOrphanUuids}
              setHighlightOrphanUuids={setHighlightOrphanUuids}
              highlightInvalidEdgeUuids={highlightInvalidEdgeUuids}
              setHighlightInvalidEdgeUuids={setHighlightInvalidEdgeUuids}
              selectedAccessLocationId={selectedAccessLocationId}
              showAllAccessProblems={showAllAccessProblems}
              onSelectAccessProblem={handleSelectAccessProblem}
              onToggleShowAllAccessProblems={() => setShowAllAccessProblems((v) => !v)}
              onClearAccessProblemSelection={handleClearAccessProblemSelection}
            />
          )}
          </div>
        ) : null}
      </div>
      </AppSplitView>
      </div>
      </WarehouseShell>

      <WarehouseModals
        showCreateWarehouse={showCreateWarehouse}
        onCloseCreateWarehouse={() => setShowCreateWarehouse(false)}
        newWarehouseName={newWarehouseName}
        onNewWarehouseNameChange={setNewWarehouseName}
        onCreateWarehouse={createWarehouse}
        mainView={mainView}
        layout={layout}
        internalLayoutRackId={internalLayoutRackId}
        onSaveInternalLayout={onSaveInternalLayout}
        onCloseInternalLayout={() => setInternalLayoutRackId(null)}
        editProductModalProps={editProductModalProps}
        snackbar={snackbar}
        setSnackbar={setSnackbar}
      />
      {pendingVariantSave != null && (
        <AppOverlayPortal>
        <div
          className="fixed inset-0 z-[280] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingVariantSave(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-bold text-slate-800">Zapisz jako nowy wariant</h3>
              <button
                type="button"
                aria-label="Zamknij"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setPendingVariantSave(null)}
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Układ różni się od szablonu bazowego. Zapisz jako nowy wariant? Nic nie zostanie zapisane bez Twojej decyzji.
            </p>
            <label className="block mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nazwa wariantu</label>
            <input
              type="text"
              value={variantNameInput}
              onChange={(e) => setVariantNameInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              placeholder="Np. Regał A - Wariant 2"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingVariantSave(null)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Anuluj
              </button>
              <PrimaryButton
                type="button"
                onClick={() => {
                  if (!pendingVariantSave) return;
                  const variant = buildVariantTemplate(
                    pendingVariantSave.baseTemplate,
                    pendingVariantSave.internalStructure,
                    pendingVariantSave.bins,
                    variantNameInput
                  );
                  applyInternalLayoutSave(
                    pendingVariantSave.rackId,
                    pendingVariantSave.internalStructure,
                    pendingVariantSave.bins,
                    variant,
                    pendingVariantSave.clearPassages ? { clearPassages: true } : undefined
                  );
                  setPendingVariantSave(null);
                }}
              >
                Potwierdź
              </PrimaryButton>
            </div>
          </div>
        </div>
        </AppOverlayPortal>
      )}

      <RowPrefixModal
        open={rowPrefixModalOpen}
        onClose={() => {
          setRowPrefixModalOpen(false);
          setPendingRowCreation(null);
        }}
        onConfirm={handleRowPrefixConfirm}
        validateBeforeConfirm={validateRowPrefixForModal}
        defaultPrefix="A"
        showDirection={
          pendingRowCreation?.type === "emptyRow" || pendingRowCreation?.type === "rowWithTemplate"
        }
        allowPaired={
          pendingRowCreation?.type === "emptyRow" || pendingRowCreation?.type === "rowWithTemplate"
        }
        previewRackCount={rowPrefixModalPreviewCount}
        templateOptions={
          pendingRowCreation?.type === "emptyRow" || pendingRowCreation?.type === "rowWithTemplate"
            ? rowModalTemplateOptions
            : undefined
        }
        defaultTemplateKey={
          pendingRowCreation?.type === "rowWithTemplate"
            ? catalogItemTemplateKey(pendingRowCreation.item)
            : undefined
        }
        defaultAutoFill={pendingRowCreation?.type === "rowWithTemplate"}
        allowAutoFillWithoutTemplateSelection={pendingRowCreation?.type === "rowWithTemplate"}
        getTemplatePreviewRackCount={getTemplatePreviewRackCount}
      />

      {showGateTypeModal && pendingGatePlacement && (
        <AppOverlayPortal>
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="gate-type-title">
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
        </AppOverlayPortal>
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

      {structureRebuildPending && (
        <StructureRebuildConfirmDialog
          impacts={structureRebuildPending.impacts}
          onCancel={() => setStructureRebuildPending(null)}
          onConfirm={confirmStructureRebuildAndSave}
        />
      )}

      {clearRackConfirmOpen &&
        mainView === "magazyn" &&
        clearRackTargetKey != null &&
        layout.racks.some((r) => String(r.id ?? r.rack_index) === clearRackTargetKey) && (
          <ConfirmModal
            title="Opróżnij regał"
            message={
              <>
                <p>
                  Czy na pewno chcesz opróżnić regał {clearRackConfirmPreview.rackLabel || "—"}?
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {clearRackConfirmPreview.assignmentCount === 1
                    ? "Zostanie usunięte 1 przypisanie produktu."
                    : clearRackConfirmPreview.assignmentCount >= 2 && clearRackConfirmPreview.assignmentCount <= 4
                      ? `Zostaną usunięte ${clearRackConfirmPreview.assignmentCount} przypisania produktów.`
                      : `Zostanie usuniętych ${clearRackConfirmPreview.assignmentCount} przypisań produktów.`}
                </p>
              </>
            }
            onCancel={() => {
              if (!clearRackBusy) setClearRackConfirmOpen(false);
            }}
            pending={clearRackBusy}
            onConfirm={clearAssignmentsOnSelectedRack}
          />
        )}

      <WarehouseReportsPanel
        open={mainView === "magazyn" && showWarehouseReportsPanel}
        onClose={() => setShowWarehouseReportsPanel(false)}
        onDownload={handleExportWarehouseReport}
        onDownloadWarehouseValue={handleExportWarehouseValueReport}
        onDownloadTopVolume={handleExportTopVolumeReport}
      />

      <DamageReportsPanel
        open={mainView === "magazyn" && showDamageReportsPanel}
        onClose={() => {
          setShowDamageReportsPanel(false);
          setDamagePrefill(null);
        }}
        tenantId={TENANT_ID}
        warehouseId={selectedWarehouseId}
        candidates={damageCandidates}
        prefill={damagePrefill}
      />
    </WarehouseModeProvider>
  );
}
