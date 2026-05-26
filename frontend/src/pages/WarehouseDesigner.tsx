import { useState, useCallback, useEffect, useRef, useMemo, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { warn } from "../utils/logger";
import type { RackState, BinState, InternalStructure, LayoutState, RackTemplate, CustomRackTemplate, LevelConfigItem, CatalogItem, VisualElementType, VisualElementState, ColumnShape, DoorStyle, ZoneType, WarehouseProduct, RowContainer, EmptyRowSlot, WallElement, WallSide, RackType, StorageType } from "../types/warehouse";
import { GRID_UNIT_CM } from "../types/warehouse";
import { activeBinsForRack, formatVolume, createBinsForRack, binsToLevels, volumePerBin, volumePerBinFromTotal, cmToCells, cellsToCm, getCatalogItemSpec, getLevelConfig, getTotalLocations, getNextIndexInRow, ROW_LABEL_ADDRESS_PATTERN, reindexGeometricRow, findSnapToRowPosition, getDragSlotHighlights, binUsedVolumeDm3, binVolumeDm3, getRackDisplayId, getAllPositionsFromRacks, clampGridToBuilding, metersToCells, duplicateRacksAtPosition, generateRackUuid, assignUniqueRackNamesToNewRacks, validateAllRackNamesInLayout, getProposedFirstRackLabelForStampFromCatalog, normalizeRowPrefixLetters, generateRackNames, validateGeneratedRackNames, countPlaceRowWithTemplateRacks, countEmptyRowSlotsInDraw, catalogItemTemplateKey, catalogItemFromTemplateKey, rowContainerTemplateIdFromCatalogItem, rackMatchesSlotRackId } from "../components/warehouse/warehouseUtils";
import {
  aisleHalfWidthCellsFromCm,
  collectPackingCentersCells,
  getRackPickPointCell,
  pickNearestPackingCell,
} from "../components/warehouse/rackAccessPoint";
import { computePickingRouteOrder } from "../components/warehouse/aisleRouteOrder";
import {
  buildAisleGraphRoutePath,
  buildAisleGraphRoutePathPickStartToRack,
  buildAisleGraphRoutePathSegment,
  computeManhattanPathLengthCells,
  getRackRouteWaypoint,
} from "../components/warehouse/aisleGraphRoute";
import { buildWalkabilityGrid, nearestWalkableCell } from "../components/warehouse/gridRoutePathfinding";
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
import PageLayout from "../components/layout/PageLayout";
import { TabsContainer } from "../components/layout/TabsContainer";
import { tabsNavItemClassName } from "../components/layout/TabsNav";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { LayoutMode } from "../warehouse-layout";
import { useLayoutModeShortcuts, useLayoutModeDisplay } from "../warehouse-layout";
import { normalizeBinTypeMap, normalizeStorageType } from "../utils/storageTypes";
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
import { DesignerToolbar } from "./WarehouseDesigner/DesignerToolbar";
import { DesignerGrid } from "./WarehouseDesigner/DesignerGrid";
import { useDesignerMouseHandlers } from "./WarehouseDesigner/useDesignerMouseHandlers";
import { useDesignerRowOperations } from "./WarehouseDesigner/useDesignerRowOperations";
import { useDesignerRackPlacement } from "./WarehouseDesigner/useDesignerRackPlacement";
import { useDesignerCanvas } from "./WarehouseDesigner/useDesignerCanvas";
import { useDesignerProductModal } from "./WarehouseDesigner/useDesignerProductModal";
import { useDesignerMagazynState } from "./WarehouseDesigner/useDesignerMagazynState";
import { useDesignerRowState } from "./WarehouseDesigner/useDesignerRowState";
import { RowPrefixModal, type RowPrefixModalResult, type RowPrefixRowConfig } from "../components/warehouse/RowPrefixModal";
import { getPositionCmAlongWall, getSvgLayoutSizePx } from "./WarehouseDesigner/utils/designerMouseUtils";
import { normalizeProductDims } from "../utils/productNormalizer";
import { validateAndSanitizeLayoutPayload } from "../utils/layoutSavePayload";
import { buildPathAvoidingRacks, buildPickingRoutePolyline, simplifyPath, type PathStop } from "./WarehouseDesigner/pathVisualizationUtils";
import { fetchWarehouseOccupancyMetrics, type WarehouseOccupancyMetrics } from "../api/warehouseOccupancyApi";
import { fetchRoutePath } from "../api/routeApi";
import { generateWarehouseGraph } from "../api/warehouseGraphApi";
import { buildInventoryMaps, normalizeInventoryLocationUuid, type InventoryRow, type InventoryMaps } from "./WarehouseDesigner/inventoryMaps";
import type { DamageCandidate } from "../types/damageReport";
import { useWarehouse } from "../context/WarehouseContext";

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

/**
 * Total pieces of product `p` in this layout: one sum per storage location (UUID), never multiplied by rack/bin joins.
 * Per UUID: Stock (inventory) wins; else assigned_locations quantity.
 */
function quantityAssignedInLayoutBins(
  p: WarehouseProduct,
  validLayoutLocationUUIDs: Set<string>,
  inventoryMaps: InventoryMaps | null,
  hasInventoryRows: boolean,
  layoutRacks: RackState[]
): number {
  let total = 0;
  const seenUuid = new Set<string>();
  for (const rack of layoutRacks) {
    for (const bin of activeBinsForRack(rack)) {
      const uuid = normalizeInventoryLocationUuid(binLocationUuidFromBin(bin));
      if (uuid) {
        if (!validLayoutLocationUUIDs.has(uuid)) continue;
        if (seenUuid.has(uuid)) continue;
        seenUuid.add(uuid);

        let invQty = 0;
        if (hasInventoryRows && inventoryMaps) {
          for (const inv of inventoryMaps.byLocationUuid.get(uuid) ?? []) {
            if (String(inv.product_id) !== p.id) continue;
            invQty += safeQuantity(inv.quantity);
          }
        }
        if (invQty > 0) {
          total += invQty;
          continue;
        }
        if (p.assignedLocations?.length) {
          const ent = p.assignedLocations.find((x) => assignedLocationEntryUuid(x) === uuid);
          if (ent) total += safeQuantity(ent.quantity);
        }
        continue;
      }
    }
  }
  return total;
}

function productHasAssignmentOrInventoryInLayout(
  p: WarehouseProduct,
  validLayoutLocationUUIDs: Set<string>,
  inventoryMaps: InventoryMaps | null,
  hasInventoryRows: boolean,
  layoutRacks: RackState[]
): boolean {
  return quantityAssignedInLayoutBins(p, validLayoutLocationUUIDs, inventoryMaps, hasInventoryRows, layoutRacks) > 0;
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

function structureDiffersFromTemplate(template: CustomRackTemplate, internalStructure: InternalStructure): boolean {
  const variantCfg = levelConfigFromInternalStructure(internalStructure);
  const baseCfg = Array.isArray(template.levelConfig) && template.levelConfig.length > 0
    ? template.levelConfig
    : Array.from({ length: Math.max(1, template.levels) }, (_, i) => ({ level: i + 1, locations: Math.max(1, template.bins_per_level) }));
  if (variantCfg.length !== baseCfg.length) return true;
  for (let i = 0; i < variantCfg.length; i++) {
    if ((variantCfg[i]?.locations ?? 1) !== (baseCfg[i]?.locations ?? 1)) return true;
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
  const { warehouse: activeWarehouse, warehouses, setWarehouse, refreshWarehouses } = useWarehouse();
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
  const [pathPoints, setPathPoints] = useState<{ x: number; y: number }[] | null>(null);
  const [pathSegments, setPathSegments] = useState<{ x: number; y: number }[][] | null>(null);
  const [pathMarkers, setPathMarkers] = useState<{ x: number; y: number; label: string }[] | null>(null);
  const [highlightedStopIndex, setHighlightedStopIndex] = useState<number | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState<number | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [graphGenerating, setGraphGenerating] = useState(false);
  const [retryPathKey, setRetryPathKey] = useState(0);
  type SpecialLocationsState = { pick_start: { id: number; x: number; y: number } | null; packing: { id: number; x: number; y: number } | null; dock: { id: number; x: number; y: number } | null };
  const [specialLocations, setSpecialLocations] = useState<SpecialLocationsState>({ pick_start: null, packing: null, dock: null });
  type RouteStop = { rackId: string; position: { x: number; y: number } }; // position in cells (float)
  const [routeRackIds, setRouteRackIds] = useState<string[]>([]);
  const [isRouteActive, setIsRouteActive] = useState(false);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  /** Server-side Σ(qty × product.volume) from inventory rows; overrides bin-based dashboard when loaded. */
  const [occupancyMetrics, setOccupancyMetrics] = useState<WarehouseOccupancyMetrics | null>(null);

  useEffect(() => {
    if (highlightedStopIndex != null && (highlightedStopIndex < 0 || highlightedStopIndex >= routeRackIds.length)) {
      setHighlightedStopIndex(null);
    }
  }, [routeRackIds.length, highlightedStopIndex]);


  const isPointInsideRect = useCallback(
    (point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) => {
      return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
      );
    },
    []
  );

  const computeApproachPointCells = useCallback(
    (params: {
      fromCm: { x: number; y: number };
      rack: { x: number; y: number; width: number; height: number };
      layout: { grid_cols?: number; grid_rows?: number; racks?: Array<{ x: number; y: number; width: number; height: number }>; visual_elements?: Array<{ x: number; y: number; width: number; height: number; type: string }>; aisles?: Array<{ x: number; y: number; width: number; height: number }> };
    }): { x: number; y: number } => {
      const { fromCm, rack, layout } = params;
      const rx = rack.x;
      const ry = rack.y;
      const rw = rack.width;
      const rh = rack.height;
      const gridCols = layout.grid_cols ?? 24;
      const gridRows = layout.grid_rows ?? 16;
      const racks = layout.racks ?? [];
      const visuals = layout.visual_elements ?? [];
      const aisles = layout.aisles ?? [];
      const blockingVisualTypes = new Set<string>(["wall", "door", "column", "mezzanine"]);

      const candidates = [
        { x: rx - 0.5, y: ry + rh / 2 },
        { x: rx + rw + 0.5, y: ry + rh / 2 },
        { x: rx + rw / 2, y: ry - 0.5 },
        { x: rx + rw / 2, y: ry + rh + 0.5 },
      ];

      const isValid = (c: { x: number; y: number }): boolean => {
        if (c.x < 0 || c.x > gridCols || c.y < 0 || c.y > gridRows) return false;
        for (const r of racks) {
          if (isPointInsideRect(c, r)) return false;
        }
        for (const ve of visuals) {
          if (blockingVisualTypes.has(ve.type) && isPointInsideRect(c, ve)) return false;
        }
        return true;
      };

      let validCandidates = candidates.filter(isValid);
      if (validCandidates.length === 0) {
        validCandidates = candidates;
        warn("No valid approach point; using nearest candidate (may be inside rack or obstacle).");
      }

      const isInAisle = (c: { x: number; y: number }): boolean =>
        aisles.length > 0 && aisles.some((a) => isPointInsideRect(c, a));

      const aisleCandidates = validCandidates.filter(isInAisle);
      const pool = aisleCandidates.length > 0 ? aisleCandidates : validCandidates;

      let best = pool[0];
      let bestD2 = Infinity;
      for (const c of pool) {
        const cx = cellsToCm(c.x);
        const cy = cellsToCm(c.y);
        const d2 = (fromCm.x - cx) ** 2 + (fromCm.y - cy) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = c;
        }
      }
      return best;
    },
    [isPointInsideRect]
  );

  const addRackToRoute = useCallback((rackId: number | string) => {
    if (!isRouteActive) return;
    const rid = String(rackId);
    setRouteRackIds((prev) => (prev.includes(rid) ? prev.filter((id) => id !== rid) : [...prev, rid]));
  }, [isRouteActive]);

  const pickStartCell = useMemo(
    () =>
      specialLocations.pick_start
        ? { x: specialLocations.pick_start.x / GRID_UNIT_CM, y: specialLocations.pick_start.y / GRID_UNIT_CM }
        : null,
    [specialLocations.pick_start]
  );

  /** Visit order: row bands + serpentine (not click order, not TSP). */
  const orderedRouteRackIds = useMemo(
    () => computePickingRouteOrder(routeRackIds, layout.racks, pickStartCell),
    [routeRackIds, layout.racks, pickStartCell]
  );

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

  const aisleHalfCells = useMemo(() => aisleHalfWidthCellsFromCm(aisleWidthCm), [aisleWidthCm]);
  const aisleRouteOpts = useMemo(() => ({ aisleHalfWidthCells: aisleHalfCells }), [aisleHalfCells]);

  const [routeStepIndex, setRouteStepIndex] = useState(0);

  useEffect(() => {
    setRouteStepIndex(0);
  }, [orderedRouteRackIds.join(",")]);

  /**
   * One stop per ordered rack id. Position: nearest walkable cell to rack pick point (grid routing).
   */
  const routeStops = useMemo<RouteStop[]>(() => {
    const half = aisleHalfCells;
    return orderedRouteRackIds
      .map((rid) => {
        const rack = layout.racks.find((r) => String(r.id ?? r.rack_index) === rid);
        if (!rack) return null;
        const pos = getRackRouteWaypoint(rack, layout, half) ?? getRackPickPointCell(rack, half);
        return { rackId: rid, position: pos };
      })
      .filter((x): x is RouteStop => x != null);
  }, [orderedRouteRackIds, layout, aisleHalfCells]);

  /** Nearest packing (DB or visual packing_station) to last rack access — snapped to walkable grid cell. */
  const routePackingCell = useMemo(() => {
    if (routeStops.length === 0) return null;
    const last = routeStops[routeStops.length - 1].position;
    const candidates = collectPackingCentersCells(layout, specialLocations.packing ?? undefined);
    const nearest = pickNearestPackingCell(last, candidates);
    if (!nearest) return null;
    const walkable = buildWalkabilityGrid(layout);
    const cell = nearestWalkableCell(nearest.x, nearest.y, walkable);
    if (!cell) return nearest;
    return { x: cell.ix + 0.5, y: cell.iy + 0.5 };
  }, [routeStops, layout, specialLocations.packing]);

  /** Full route polyline (total distance). */
  const routePathFull = useMemo(() => {
    if (routeRackIds.length <= 1 || !pickStartCell || routeStops.length === 0) return null;
    return buildAisleGraphRoutePath(layout, pickStartCell, routeStops, routePackingCell, layout.racks, aisleRouteOpts);
  }, [routeRackIds.length, orderedRouteRackIds, routeStops, pickStartCell, routePackingCell, layout, aisleRouteOpts]);

  /** Single leg for canvas: current rack → next rack (or START → first rack when only one stop). */
  const routeSegmentPath = useMemo(() => {
    const ids = orderedRouteRackIds;
    if (!pickStartCell || ids.length === 0) return null;
    if (ids.length === 1) {
      return buildAisleGraphRoutePathPickStartToRack(layout, pickStartCell, ids[0], layout.racks, aisleRouteOpts);
    }
    const i = Math.min(routeStepIndex, ids.length - 1);
    if (i < ids.length - 1) {
      return buildAisleGraphRoutePathSegment(layout, ids[i], ids[i + 1], layout.racks, aisleRouteOpts);
    }
    return null;
  }, [orderedRouteRackIds, routeStepIndex, layout, pickStartCell, aisleRouteOpts]);

  /** Stops for PathLayer / RouteStopLayer: only the current leg (avoids full-route fallback when polyline is null). */
  const routeStopsForCanvas = useMemo(() => {
    const ids = orderedRouteRackIds;
    if (ids.length < 2) return routeStops;
    const i = Math.min(routeStepIndex, ids.length - 1);
    if (i < ids.length - 1) {
      const a = ids[i];
      const b = ids[i + 1];
      return routeStops.filter((s) => s.rackId === a || s.rackId === b);
    }
    return [];
  }, [routeStops, orderedRouteRackIds, routeStepIndex]);

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
    cursorCm,
    setCursorCm,
    isPanning,
    setIsPanning,
  } = useDesignerCanvas(layout.layout_id ?? null);
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
  /** Magazyn tab: selected template for type-based rack highlighting. */
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
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
  /** Single view mode: Magazyn (live) | Projektant Layoutu (kept in sync with `?view=`). */
  const [mainView, setMainView] = useState<"magazyn" | "layout">(() =>
    searchParams.get("view") === "layout" ? "layout" : "magazyn"
  );

  const selectDesignerView = useCallback(
    (view: "magazyn" | "layout") => {
      if (view === "magazyn") {
        setMainView("magazyn");
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
    [searchParams, setSearchParams],
  );
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
  const isLiveView = mainView === "magazyn";
  const layoutOccupancyRefreshKey = useMemo(
    () =>
      `${layout.layout_id ?? "na"}:${layout.racks.length}:${layout.racks.reduce((n, r) => n + activeBinsForRack(r).length, 0)}`,
    [layout.layout_id, layout.racks],
  );
  useEffect(() => {
    if (mainView !== "magazyn") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mainView]);
  useEffect(() => {
    if (mainView !== "magazyn" || selectedWarehouseId == null) {
      setOccupancyMetrics(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchWarehouseOccupancyMetrics(TENANT_ID, selectedWarehouseId);
        if (!cancelled) setOccupancyMetrics(data);
      } catch {
        if (!cancelled) setOccupancyMetrics(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mainView, selectedWarehouseId, layoutOccupancyRefreshKey, inventoryRows.length]);
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
    if (inventoryRows.length === 0) return null;
    return buildInventoryMaps(inventoryRows, layout);
  }, [inventoryRows, layout]);

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
            locationLabel: bin.label || locUuid,
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
  } = useDesignerMagazynState({
    layout,
    products,
    selectedRackIdForSideView,
    inventoryRows,
    inventoryMaps,
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
  /** Fallback: occupied bins from layout (usedVolumeAtBin) when API metrics unavailable. */
  const binOccupancyLocationStats = useMemo(() => {
    let primary = 0;
    let reserve = 0;
    let damaged = 0;
    const seen = new Set<string>();
    for (const rack of layout.racks) {
      const rid = String(rack.id ?? rack.rack_index);
      for (const bin of activeBinsForRack(rack)) {
        if (usedVolumeAtBin(bin) <= 0) continue;
        const uuid = binLocationUuidFromBin(bin);
        const key = uuid || `${rid}-${bin.level_index}-${bin.segment_index}`;
        if (seen.has(key)) continue;
        seen.add(key);
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
  }, [layout.racks, usedVolumeAtBin]);

  const globalLocationStatsForLegend = useMemo(() => {
    if (occupancyMetrics) {
      const p = occupancyMetrics.primary_location_count;
      const r = occupancyMetrics.reserve_location_count;
      const d = occupancyMetrics.damaged_location_count;
      return { primary: p, reserve: r, damaged: d, total: p + r + d };
    }
    return binOccupancyLocationStats;
  }, [occupancyMetrics, binOccupancyLocationStats]);

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

  /** Map product id → Set of rack ids that contain that product. Merges Stock (inventoryMaps) and assigned_locations (uuidToRackId). */
  const productToRackIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    products.forEach((p) => {
      map.set(p.id, new Set<string>());
    });
    if (inventoryMaps && inventoryRows.length > 0) {
      for (const [rackId, rows] of inventoryMaps.byRackId.entries()) {
        for (const inv of rows) {
          const qty = safeQuantity(inv.quantity);
          if (qty <= 0) continue;
          const pid = String(inv.product_id);
          if (!map.has(pid)) map.set(pid, new Set<string>());
          map.get(pid)!.add(rackId);
        }
      }
    }
    products.forEach((p) => {
      const racks = map.get(p.id);
      if (!racks) return;
      p.assignedLocations?.forEach((a) => {
        const locUuid = assignedLocationEntryUuid(a);
        if (!locUuid) return;
        const rackId = uuidToRackId.get(locUuid);
        if (rackId) racks.add(rackId);
      });
    });
    return map;
  }, [inventoryMaps, inventoryRows.length, products, uuidToRackId]);

  /** Rack ids to highlight when a product is selected on the map (global locator). */
  const activeProductIdOnMap = hoveredProductIdOnMap ?? selectedProductIdOnMap;
  const rackIdsContainingSelectedProduct =
    activeProductIdOnMap != null ? productToRackIds.get(activeProductIdOnMap) ?? null : null;
  const productRackQuantities = useMemo(() => {
    if (activeProductIdOnMap == null) return null;
    const product = products.find((x) => x.id === activeProductIdOnMap);
    const quantities = new Map<string, number>();
    /** Avoid double-count when Stock row already covers the same bin UUID as an assigned entry on that rack. */
    const invRackUuidKeys = new Set<string>();

    if (inventoryMaps && inventoryRows.length > 0) {
      const invRows = inventoryMaps.byProduct.get(activeProductIdOnMap) ?? [];
      for (const inv of invRows) {
        const locUuid = normalizeInventoryLocationUuid(inv.location_uuid);
        if (!locUuid) continue;
        const rackId = uuidToRackId.get(locUuid);
        if (!rackId) continue;
        const quantity = safeQuantity(inv.quantity);
        if (quantity <= 0) continue;
        quantities.set(rackId, (quantities.get(rackId) ?? 0) + quantity);
        invRackUuidKeys.add(`${rackId}|${locUuid}`);
      }
    }

    if (product?.assignedLocations?.length) {
      for (const assigned of product.assignedLocations) {
        const locUuid = assignedLocationEntryUuid(assigned);
        if (!locUuid) continue;
        const rackId = uuidToRackId.get(locUuid);
        if (!rackId) continue;
        const quantity = safeQuantity(assigned.quantity);
        if (quantity <= 0) continue;
        if (invRackUuidKeys.has(`${rackId}|${locUuid}`)) continue;
        quantities.set(rackId, (quantities.get(rackId) ?? 0) + quantity);
      }
    }

    return quantities.size > 0 ? quantities : null;
  }, [activeProductIdOnMap, products, uuidToRackId, uuidToBin, inventoryMaps, inventoryRows.length]);

  /** Rack ids to highlight when a template is selected in Magazyn dashboard. */
  const rackIdsForSelectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return new Set<string>();
    return new Set(
      layout.racks
        .filter((r) => r.templateId === selectedTemplateId)
        .map((r) => String(r.id ?? r.rack_index))
    );
  }, [layout.racks, selectedTemplateId]);

  /** Bin UUIDs to draw on map when a product is selected in Magazyn sidebar (inventory + assigned_locations). */
  const highlightedBinUUIDsForSidebarProduct = useMemo(() => {
    if (selectedProductId == null) return null;
    const product = products.find((p) => p.id === selectedProductId);
    const set = new Set<string>();
    if (inventoryMaps && inventoryRows.length > 0) {
      const rows = inventoryMaps.byProduct.get(selectedProductId) ?? [];
      for (const inv of rows) {
        if (safeQuantity(inv.quantity) <= 0) continue;
        const u = normalizeInventoryLocationUuid(inv.location_uuid);
        if (u && validLayoutLocationUUIDs.has(u)) set.add(u);
      }
    }
    if (product?.assignedLocations?.length) {
      for (const a of product.assignedLocations) {
        const u = assignedLocationEntryUuid(a);
        if (!u) continue;
        if (safeQuantity(a.quantity) <= 0) continue;
        if (validLayoutLocationUUIDs.has(u)) set.add(u);
      }
    }
    return set.size > 0 ? set : null;
  }, [selectedProductId, products, inventoryMaps, inventoryRows.length, validLayoutLocationUUIDs]);

  const toggleProductMapHighlight = useCallback((productId: string) => {
    setSelectedProductId((prev) => (prev === productId ? null : productId));
  }, []);

  /** For canvas: merge product/template highlights with full route selection + focused stops. */
  const canvasHighlightedRackIds = useMemo(() => {
    const base =
      selectedProductId != null
        ? new Set<string>()
        : rackIdsContainingSelectedProduct ?? new Set<string>();
    const out = new Set(base);
    for (const rid of rackIdsForSelectedTemplate) out.add(rid);
    if (routeStops.length > 0) {
      for (const stop of routeStops) out.add(stop.rackId);
      if (highlightedStopIndex != null && routeStops[highlightedStopIndex]) {
        out.add(routeStops[highlightedStopIndex].rackId);
      }
      if (currentStopIndex != null && routeStops[currentStopIndex]) {
        out.add(routeStops[currentStopIndex].rackId);
      }
    }
    return out;
  }, [
    selectedProductId,
    rackIdsContainingSelectedProduct,
    rackIdsForSelectedTemplate,
    routeStops,
    highlightedStopIndex,
    currentStopIndex,
  ]);

  const routeStepBadges = useMemo(() => {
    const ids = orderedRouteRackIds;
    if (ids.length === 0) return null;
    const idx = Math.min(routeStepIndex, ids.length - 1);
    const cur = ids[idx];
    if (ids.length === 1) {
      return {
        currentRackId: cur,
        nextRackId: null as string | null,
        currentOrder: 1,
        nextOrder: null as number | null,
      };
    }
    const next = idx < ids.length - 1 ? ids[idx + 1] : null;
    return {
      currentRackId: cur,
      nextRackId: next,
      currentOrder: idx + 1,
      nextOrder: next != null ? idx + 2 : null,
    };
  }, [orderedRouteRackIds, routeStepIndex]);

  const routeStopsForCanvasMode = routeStops;
  const routeGraphPolylineForCanvas = routePathFull && routePathFull.length >= 2 ? routePathFull : routeSegmentPath;
  const routeStepBadgesForCanvas = routeRackIds.length >= 1 ? routeStepBadges : null;
  const highlightedStopIndexForCanvas = highlightedStopIndex;
  const currentStopIndexForCanvas = currentStopIndex;
  const showRouteEndpointMarkersForCanvas = routeRackIds.length === 0;

  /** Total walking distance (full route, or single-leg when only one rack). */
  const routeLengthMeters = useMemo(() => {
    if (routeRackIds.length < 1) return 0;
    if (routePathFull && routePathFull.length >= 2) {
      return (computeManhattanPathLengthCells(routePathFull) * GRID_UNIT_CM) / 100;
    }
    if (routeRackIds.length === 1 && routeSegmentPath && routeSegmentPath.length >= 2) {
      return (computeManhattanPathLengthCells(routeSegmentPath) * GRID_UNIT_CM) / 100;
    }
    return 0;
  }, [routeRackIds.length, routePathFull, routeSegmentPath]);

  /** Current leg distance (step view). */
  const routeLegMeters = useMemo(() => {
    if (!routeSegmentPath || routeSegmentPath.length < 2) return 0;
    return (computeManhattanPathLengthCells(routeSegmentPath) * GRID_UNIT_CM) / 100;
  }, [routeSegmentPath]);

  const handleRouteStepNext = useCallback(() => {
    setRouteStepIndex((i) => Math.min(i + 1, Math.max(0, orderedRouteRackIds.length - 1)));
  }, [orderedRouteRackIds.length]);

  /** Quantity breakdown for the globally selected product (for ProductLocatorSidebar). */
  const selectedProductQuantityBreakdown = useMemo(() => {
    if (selectedProductIdOnMap == null) return null;
    const p = products.find((x) => x.id === selectedProductIdOnMap);
    if (!p) return null;

    let totalQuantity = 0;
    let primaryQuantity = 0;
    let reserveQuantity = 0;

    if (inventoryMaps && inventoryRows.length > 0) {
      const invRows = inventoryMaps.byProduct.get(selectedProductIdOnMap) ?? [];
      for (const inv of invRows) {
        const locUuid = normalizeInventoryLocationUuid(inv.location_uuid);
        if (!locUuid) continue;
        const type = uuidToBin.get(locUuid)?.storage_type ?? "primary";
        const q = safeQuantity(inv.quantity);
        if (q <= 0) continue;
        totalQuantity += q;
        if (type === "reserve") reserveQuantity += q;
        else primaryQuantity += q;
      }
    } else if (p.assignedLocations?.length) {
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
  }, [selectedProductIdOnMap, products, uuidToBin, inventoryMaps, inventoryRows.length]);

  /** Map sidebar: products with stock or assignments on this layout only; qty/volume from locations (not global product.quantity). */
  const sortedProductsByVolume = useMemo(() => {
    const hasInv = inventoryMaps != null && inventoryRows.length > 0;
    const out: { product: WarehouseProduct; quantityAssigned: number; volumeAssignedDm3: number }[] = [];
    for (const p of products) {
      if (!productHasAssignmentOrInventoryInLayout(p, validLayoutLocationUUIDs, inventoryMaps, hasInv, layout.racks)) continue;
      const quantityAssigned = quantityAssignedInLayoutBins(p, validLayoutLocationUUIDs, inventoryMaps, hasInv, layout.racks);
      if (quantityAssigned <= 0) continue;
      const vol = safeVolumeDm3(p.volume_dm3);
      out.push({ product: p, quantityAssigned, volumeAssignedDm3: quantityAssigned * vol });
    }
    return out.sort((a, b) => b.volumeAssignedDm3 - a.volumeAssignedDm3);
  }, [products, inventoryMaps, inventoryRows.length, validLayoutLocationUUIDs, layout.racks]);

  /** When a rack is selected on the full map (single click): rack ref and products in that rack (sorted, with quantity breakdown). */
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
    const mapRackBinUUIDs = new Set<string>(selectedRackForMap.bins.map((b) => b.locationUUID).filter((u): u is string => Boolean(u)));
    const rackKey = String(selectedRackForMap.id ?? selectedRackForMap.rack_index);
    const productsById = new Map(products.map((p) => [p.id, p] as const));
    const totals = new Map<string, { product: WarehouseProduct; totalQuantity: number; primaryQuantity: number; reserveQuantity: number }>();
    const stockProductInventoryKeys = new Set<string>();

    if (inventoryMaps && inventoryRows.length > 0) {
      const rackInvRows = inventoryMaps.byRackId.get(rackKey) ?? [];
      for (const inv of rackInvRows) {
        const qty = safeQuantity(inv.quantity);
        if (qty <= 0) continue;
        const pid = String(inv.product_id);
        const product = productsById.get(pid);
        if (!product) continue;
        const locUuid = normalizeInventoryLocationUuid(inv.location_uuid);
        if (locUuid) stockProductInventoryKeys.add(`${pid}|${locUuid}`);
        const type = locUuid ? uuidToBin.get(locUuid)?.storage_type ?? "primary" : "primary";
        const existing = totals.get(pid);
        if (existing) {
          existing.totalQuantity += qty;
          if (type === "reserve") existing.reserveQuantity += qty;
          else existing.primaryQuantity += qty;
        } else {
          totals.set(pid, {
            product,
            totalQuantity: qty,
            primaryQuantity: type === "reserve" ? 0 : qty,
            reserveQuantity: type === "reserve" ? qty : 0,
          });
        }
      }
    }

    const mergeAssignedQtyIntoTotals = (p: WarehouseProduct, q: number, locUuid: string, storageType?: StorageType) => {
      if (q <= 0) return;
      const type = storageType ?? uuidToBin.get(locUuid)?.storage_type ?? "primary";
      if (inventoryMaps && inventoryRows.length > 0 && stockProductInventoryKeys.has(`${p.id}|${locUuid}`)) {
        return;
      }
      const existing = totals.get(p.id);
      if (existing) {
        existing.totalQuantity += q;
        if (type === "reserve") existing.reserveQuantity += q;
        else existing.primaryQuantity += q;
      } else {
        totals.set(p.id, {
          product: p,
          totalQuantity: q,
          primaryQuantity: type === "reserve" ? 0 : q,
          reserveQuantity: type === "reserve" ? q : 0,
        });
      }
    };

    for (const p of products) {
      if (!p.assignedLocations?.length) continue;
      for (const a of p.assignedLocations) {
        const locUuid = assignedLocationEntryUuid(a);
        if (!locUuid || !mapRackBinUUIDs.has(locUuid)) continue;
        mergeAssignedQtyIntoTotals(p, safeQuantity(a.quantity), locUuid, a.storageType);
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
  }, [selectedRackIdOnMap, products, layout.racks, uuidToBin, inventoryMaps, inventoryRows.length]);


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

  const loadLayout = useCallback(async (warehouseId: number) => {
    setLoading(true);
    setInventoryRows([]);
    try {
      const res = await api.get("/warehouse/layout", {
        params: { tenant_id: TENANT_ID, warehouse_id: warehouseId },
      });
      const payload = res.data as { layout?: Record<string, unknown>; special_locations?: SpecialLocationsState } | undefined;
      const d = (payload?.layout ?? payload ?? {}) as Record<string, unknown>;
      setSpecialLocations(payload?.special_locations ?? { pick_start: null, packing: null, dock: null });
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
          for (const b of activeBinsForRack(r)) {
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
          const firstLocUuid = firstLoc ? assignedLocationEntryUuid(firstLoc as { locationUUID?: string; location_uuid?: string }) : undefined;
          const location_id = firstLocUuid ? resolveLabel(firstLocUuid) : null;
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
            purchase_price:
              typeof p.purchase_price === "number" && Number.isFinite(p.purchase_price) ? p.purchase_price : undefined,
          };
        });
        setProducts(list);
      } catch {
        // Keep existing products state on error (e.g. no products API)
      }
    } catch {
      setSpecialLocations({ pick_start: null, packing: null, dock: null });
      setLayout((prev) => ({ ...prev, warehouse_id: warehouseId, warehouse_name: "", racks: [], aisles: [], visual_elements: prev.visual_elements ?? [] }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedWarehouseId != null) loadLayout(selectedWarehouseId);
    else setSpecialLocations({ pick_start: null, packing: null, dock: null });
  }, [selectedWarehouseId, loadLayout]);

  useEffect(() => {
    if (isLiveView && selectedWarehouseId != null) loadLayout(selectedWarehouseId);
  }, [isLiveView, selectedWarehouseId, loadLayout]);

  /** When switching to Magazyn view, refresh products from API so assignments from Products tab are visible. */
  const fetchProductsForMap = useCallback(async () => {
    if (selectedWarehouseId == null) return;
    try {
      const [layoutRes, prodRes, inventoryRes] = await Promise.all([
        api.get("/warehouse/layout", { params: { tenant_id: TENANT_ID, warehouse_id: selectedWarehouseId } }),
        api.get("/products/", { params: { tenant_id: TENANT_ID, limit: 5000 } }),
        api.get<InventoryRow[]>("/inventory/", {
          params: { tenant_id: TENANT_ID, warehouse_id: selectedWarehouseId, hide_technical_locations: false },
        }),
      ]);
      const d = ((layoutRes.data as { layout?: Record<string, unknown> } | undefined)?.layout ?? layoutRes.data) as Record<string, unknown>;
      const racksFromRes = (d?.racks || []) as Array<{ bins?: Array<{ locationUUID?: string; location_uuid?: string; label?: string; location_id?: string }> }>;
      const resolveLabel = (locationUUID: string): string | null => {
        for (const r of racksFromRes) {
          for (const b of activeBinsForRack(r)) {
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
        const firstLocUuid = firstLoc ? assignedLocationEntryUuid(firstLoc as { locationUUID?: string; location_uuid?: string }) : undefined;
        const location_id = firstLocUuid ? resolveLabel(firstLocUuid) : null;
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
          purchase_price:
            typeof p.purchase_price === "number" && Number.isFinite(p.purchase_price) ? p.purchase_price : undefined,
        };
      });
      setProducts(list);
      setInventoryRows(Array.isArray(inventoryRes.data) ? inventoryRes.data : []);
    } catch {
      // Keep existing products
      setInventoryRows([]);
    }
  }, [selectedWarehouseId]);

  /** After WMS putaway (or similar), refetch layout + products + inventory so Magazyn badges match GET /inventory/. */
  useEffect(() => {
    const onInventoryUpdated = (ev: Event) => {
      const ce = ev as CustomEvent<{ tenantId?: number; warehouseId?: number | null }>;
      const d = ce.detail;
      if (!d || d.tenantId !== TENANT_ID) return;
      if (d.warehouseId == null || selectedWarehouseId == null) return;
      if (d.warehouseId !== selectedWarehouseId) return;
      void fetchProductsForMap();
    };
    window.addEventListener("wms:inventory-updated", onInventoryUpdated);
    return () => window.removeEventListener("wms:inventory-updated", onInventoryUpdated);
  }, [selectedWarehouseId, fetchProductsForMap]);

  /** Drop one assigned_locations slot without syncing Inventory (backend skip_inventory_sync). */
  const removeProductAssignmentAtLocation = useCallback(
    async (productId: string, locationUUID: string) => {
      const pid = Number(productId);
      if (!Number.isInteger(pid) || pid < 1) return;
      const locUuid = locationUUID.trim();
      const p = products.find((x) => x.id === productId);
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

      await api.patch(`/products/${pid}/`, {
        assigned_locations: enriched,
        skip_inventory_sync: true,
      }, { params: { tenant_id: TENANT_ID } });

      await fetchProductsForMap();
    },
    [products, layout, fetchProductsForMap]
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
    if (clearRackTargetKey == null) return;
    const rack = layout.racks.find((r) => String(r.id ?? r.rack_index) === clearRackTargetKey);
    if (!rack) return;
    const binUuids = new Set(
      activeBinsForRack(rack).map((b) => (b.locationUUID ?? "").trim()).filter(Boolean)
    );
    if (binUuids.size === 0) return;

    const positions = getAllPositionsFromRacks(layout.racks, layout);
    const posByUuid = new Map(positions.map((pos) => [pos.locationUUID, pos]));

    const patches: Promise<unknown>[] = [];
    for (const p of products) {
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
        api.patch(`/products/${pid}/`, {
          assigned_locations: enriched,
          skip_inventory_sync: true,
        }, { params: { tenant_id: TENANT_ID } })
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
      await fetchProductsForMap();
      setClearRackConfirmOpen(false);
    } catch (e) {
      console.error(e);
      alert("Nie udało się opróżnić regału. Spróbuj ponownie.");
    } finally {
      setClearRackBusy(false);
    }
  }, [clearRackTargetKey, layout, products, fetchProductsForMap]);

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
        ...assignUniqueRackNamesToNewRacks(duplicateRacksAtPosition([copiedRack], cell, prev.racks.length + 1), prev),
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
            rack_type: (t.rack_type ?? "warehouse") === "store" ? "store" : "warehouse",
            bin_type_map: normalizeBinTypeMap(t.bin_type_map, t.reserve_bin_keys),
            color: (typeof t.color === "string" && t.color.trim() !== "") ? t.color.trim() : "#3b82f6",
          })));
        }
      } catch {
        if (!cancelled) setCustomTemplates([]);
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

  const saveLayout = useCallback(async () => {
    const whId = selectedWarehouseId ?? layout.warehouse_id;
    if (whId == null) return;
    const { valid: layoutNamesValid, errors: layoutNameErrors } = validateAllRackNamesInLayout(layout);
    if (!layoutNamesValid) {
      const msg =
        layoutNameErrors.length === 1
          ? `Nie można zapisać układu — ${layoutNameErrors[0]}`
          : `Nie można zapisać układu — ${layoutNameErrors.join(" · ")}`;
      setSnackbar({ message: msg });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(layout.layout_id != null ? { layout_id: layout.layout_id } : {}),
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
          uuid: r.uuid ?? generateRackUuid(),
          rack_type: r.rack_type ?? "warehouse",
          name: r.name ?? getRackDisplayIdWithLayout(r),
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

      const validated = validateAndSanitizeLayoutPayload(payload);
      if (!validated.ok) {
        const msg = `Nie można zapisać — nieprawidłowy układ: ${validated.errors.join(" · ")}`;
        console.error("[saveLayout] validation failed:", validated.errors);
        setSnackbar({ message: msg });
        return;
      }

      await api.put(`/warehouse/${whId}/layout`, validated.payload, { params: { tenant_id: TENANT_ID } });
      setLastSavedAt(Date.now());
      if (selectedWarehouseId) await loadLayout(selectedWarehouseId);
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
      if (status === 400) {
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
      routeMode: isRouteActive,
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
      addRackToRoute,
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
          const bins = createBinsForRack(template.aisle_letter, r.rack_index, template.levels, template.bins_per_level, volPerBin, "M1", template.naming_pattern, template.width_cm, template.depth_cm, template.height_cm, template.bin_type_map, template.addressPattern, template.rowId, template.sectionStartIndex, template.binNamingType, lcEdit, template.namingStrategy, template.namingOrientation, template.namingPattern ?? template.addressPattern, template.manualLabels, template.overrides, template.indexPadding, template.startIndex);
          return {
            ...r,
            rack_type: template.rack_type ?? "warehouse",
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
  }, [layout.racks, usedVolumeAtBin]);

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
  const selectedRacks = layout.racks.filter((r) => selectedRackIds.some((id) => rackMatchesSlotRackId(r, id)));
  const isMultiSelect = selectedRackIds.length > 1;

  const fetchPathToRack = useCallback(async () => {
    if (!specialLocations.pick_start || !selectedRack) return;
    const warehouseId = selectedWarehouseId ?? layout.warehouse_id ?? null;
    if (warehouseId == null) {
      setPathError("Wybierz magazyn.");
      return;
    }
    setPathLoading(true);
    setPathError(null);
    const from = { x: specialLocations.pick_start.x, y: specialLocations.pick_start.y };
    const approach = computeApproachPointCells({ fromCm: from, rack: selectedRack, layout });
    const to = { x: cellsToCm(approach.x), y: cellsToCm(approach.y) };
    const payload = { warehouseId: String(warehouseId), from, to };
    try {
      const res = await fetchRoutePath(payload);
      if (res.points && res.points.length >= 2) {
        const points = res.points.map((p) => ({ x: p.x / GRID_UNIT_CM, y: p.y / GRID_UNIT_CM }));
        setPathPoints(simplifyPath(points));
        setPathSegments(null);
        setCurrentStopIndex(null);
        setPathMarkers(null);
      } else {
        setPathPoints(null);
        setPathSegments(null);
        setCurrentStopIndex(null);
        if (res.message) setPathError(res.message);
      }
    } catch (e: unknown) {
      setPathPoints(null);
      setPathSegments(null);
      setCurrentStopIndex(null);
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setPathError(err?.response?.data?.detail ?? err?.message ?? "Nie udało się pobrać trasy.");
    } finally {
      setPathLoading(false);
    }
  }, [specialLocations, selectedRack, selectedWarehouseId, layout, computeApproachPointCells]);

  useEffect(() => {
    if (mainView !== "layout" || routeRackIds.length > 0 || isRouteActive || !selectedRack || !specialLocations.pick_start) return;
    const warehouseId = selectedWarehouseId ?? layout.warehouse_id;
    if (warehouseId == null) return;
    fetchPathToRack();
  }, [mainView, routeRackIds.length, isRouteActive, selectedRack, specialLocations, selectedWarehouseId, layout.warehouse_id, fetchPathToRack]);

  const handleGenerateGraph = useCallback(async () => {
    const warehouseId = selectedWarehouseId ?? layout.warehouse_id ?? null;
    if (warehouseId == null) return;
    setGraphGenerating(true);
    setPathError(null);
    try {
      await generateWarehouseGraph(warehouseId);
      setSnackbar({ message: "Graf magazynu wygenerowany." });
      setPathError(null);
      setRetryPathKey((k) => k + 1);
      await fetchPathToRack();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setSnackbar({ message: err?.response?.data?.detail ?? err?.message ?? "Nie udało się wygenerować grafu." });
    } finally {
      setGraphGenerating(false);
    }
  }, [selectedWarehouseId, layout.warehouse_id, fetchPathToRack]);

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

  // v1: visual path / picking route in layout view. Single-rack path from backend API; route mode builds segments via POST /route/path.
  useEffect(() => {
    if (!specialLocations?.pick_start) {
      setPathPoints(null);
      setPathSegments(null);
      setCurrentStopIndex(null);
      setPathMarkers(null);
      setPathError(null);
      return;
    }
    if (mainView !== "layout") {
      setPathPoints(null);
      setPathSegments(null);
      setCurrentStopIndex(null);
      setPathMarkers(null);
      setPathError(null);
      return;
    }

    const start = {
      x: specialLocations.pick_start.x / GRID_UNIT_CM,
      y: specialLocations.pick_start.y / GRID_UNIT_CM,
    };
    const gridCols = layout.grid_cols ?? 24;
    const gridRows = layout.grid_rows ?? 16;

    if (routeRackIds.length > 0) {
      let cancelled = false;
      (async () => {
        setPathLoading(true);
        setPathError(null);
        const warehouseId = selectedWarehouseId ?? layout.warehouse_id ?? null;
        if (warehouseId == null) {
          setPathLoading(false);
          setPathError("Wybierz magazyn.");
          return;
        }

        const finalStops = routeStops;

        const segmentsCount = finalStops.length;
        const full: Array<{ x: number; y: number }> = [];
        const segmentsArray: Array<{ x: number; y: number }[]> = [];

        const cmFromCells = (p: { x: number; y: number }) => ({ x: cellsToCm(p.x), y: cellsToCm(p.y) });
        const cellsFromCm = (p: { x: number; y: number }) => ({ x: p.x / GRID_UNIT_CM, y: p.y / GRID_UNIT_CM });
        const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) =>
          Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

        for (let i = 0; i < finalStops.length; i++) {
          const fromCm = i === 0
            ? { x: specialLocations.pick_start!.x, y: specialLocations.pick_start!.y }
            : cmFromCells(finalStops[i - 1].position);
          const toCm = cmFromCells(finalStops[i].position);

          const payload = { warehouseId: String(warehouseId), from: fromCm, to: toCm };
          const res = await fetchRoutePath(payload);
          if (cancelled) return;
          const segCells = (res.points ?? []).map(cellsFromCm);
          if (segCells.length < 2) {
            setPathError(res.message ?? "Brak ścieżki dla segmentu trasy.");
            break;
          }

          segmentsArray.push(simplifyPath(segCells));
          if (full.length === 0) {
            full.push(...segCells);
          } else {
            const startIdx = samePoint(full[full.length - 1], segCells[0]) ? 1 : 0;
            full.push(...segCells.slice(startIdx));
          }
        }

        const packingCell =
          finalStops.length > 0
            ? pickNearestPackingCell(
                finalStops[finalStops.length - 1].position,
                collectPackingCentersCells(layout, specialLocations.packing ?? undefined)
              )
            : null;
        if (packingCell && !cancelled && finalStops.length > 0) {
          const fromCm = cmFromCells(finalStops[finalStops.length - 1].position);
          const toCm = cmFromCells(packingCell);
          const payload = { warehouseId: String(warehouseId), from: fromCm, to: toCm };
          const res = await fetchRoutePath(payload);
          if (cancelled) return;
          const segCells = (res.points ?? []).map(cellsFromCm);
          if (segCells.length >= 2) {
            segmentsArray.push(simplifyPath(segCells));
            const startIdx = full.length > 0 && samePoint(full[full.length - 1], segCells[0]) ? 1 : 0;
            full.push(...segCells.slice(startIdx));
          }
        }

        if (!cancelled) {
          setPathPoints(full.length >= 2 ? simplifyPath(full) : null);
          setPathSegments(segmentsArray.length > 0 ? segmentsArray : null);
          setPathMarkers(null);
          setCurrentStopIndex(null);
          setPathLoading(false);
        }
      })().catch((e: unknown) => {
        const err = e as { response?: { data?: { detail?: string } }; message?: string };
        setPathLoading(false);
        setPathError(err?.response?.data?.detail ?? err?.message ?? "Nie udało się pobrać trasy.");
      });

      return () => { cancelled = true; };
    }

    if (selectedRack == null) {
      setPathPoints(null);
      setPathSegments(null);
      setCurrentStopIndex(null);
      setPathMarkers(null);
      return;
    }

    const rawStops = (layout.picking_path ?? []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
    if (routeRackIds.length === 0 && rawStops.length >= 2) {
      const stops: PathStop[] = rawStops.map((p) => ({ x: p.x, y: p.y }));
      const route = buildPickingRoutePolyline(start, stops, layout.racks, gridRows);
      setPathPoints(simplifyPath(route.polylinePoints));
      setPathSegments(null);
      setCurrentStopIndex(null);
      setPathMarkers(route.orderedStops.map((s, i) => ({ x: s.x, y: s.y, label: String(i + 1) })));
      return;
    }

    // Single target (selected rack): path comes from backend API (fetchPathToRack), do not overwrite here.
    if (routeRackIds.length === 0) return;
  }, [mainView, selectedRack, specialLocations, layout, routeStops, routeRackIds.length, selectedWarehouseId, retryPathKey]);

  const applyInternalLayoutSave = useCallback(
    (rackId: number | string, internal_structure: InternalStructure, bins: BinState[] | undefined, variant?: CustomRackTemplate | null) => {
      setLayout((prev) => {
        const next = {
          ...prev,
          racks: prev.racks.map((r) => {
            if ((r.id ?? r.rack_index) !== rackId) return r;
            const levelConfig = levelConfigFromInternalStructure(internal_structure);
            return {
              ...r,
              templateId: variant?.id ?? r.templateId,
              levels: Math.max(1, levelConfig.length),
              bins_per_level: levelConfig[0]?.locations ?? r.bins_per_level,
              levelConfig,
              internal_structure,
              layoutVariant: { levels: levelConfig, internal_structure },
              ...(bins ? { bins } : {}),
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
    (internal_structure: InternalStructure, bins: BinState[] | undefined) => {
      const rackId = internalLayoutRackId;
      if (rackId == null) return;
      const currentRack = layout.racks.find((r) => (r.id ?? r.rack_index) === rackId) ?? null;
      const baseTemplate = currentRack?.templateId ? customTemplates.find((t) => t.id === currentRack.templateId) ?? null : null;
      if (baseTemplate && structureDiffersFromTemplate(baseTemplate, internal_structure)) {
        setPendingVariantSave({ rackId, baseTemplate, internalStructure: internal_structure, bins });
        setVariantNameInput(`${baseTemplate.name} [Wariant]`);
        return;
      }
      applyInternalLayoutSave(rackId, internal_structure, bins, null);
    },
    [internalLayoutRackId, layout.racks, customTemplates, applyInternalLayoutSave]
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
  });

  return (
    <PageLayout
      fillHeight
      fullBleed
      cardClassName="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden !space-y-0"
    >
      <div className="flex shrink-0 flex-col gap-0">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2.5">
          <h1 className="m-0 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{UI_STRINGS.warehouse.title}</h1>
          <DesignerToolbar
            mainView={mainView}
            lastSavedAt={lastSavedAt}
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
            isRouteActive={isRouteActive}
            onToggleRoutePlanning={() => {
              setIsRouteActive((prev) => {
                const next = !prev;
                if (next) {
                  setRouteRackIds([]);
                  setRouteStepIndex(0);
                }
                return next;
              });
            }}
          />
        </div>
        <TabsContainer className="w-full [-webkit-overflow-scrolling:touch]">
          <nav
            className="flex w-full flex-nowrap gap-6 overflow-x-auto border-b border-slate-200 sm:justify-start"
            aria-label="Widok projektanta magazynu"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              id="warehouse-designer-tab-magazyn"
              aria-selected={mainView === "magazyn"}
              aria-controls="warehouse-designer-panel"
              tabIndex={mainView === "magazyn" ? 0 : -1}
              onClick={() => selectDesignerView("magazyn")}
              className={`shrink-0 whitespace-nowrap ${tabsNavItemClassName(mainView === "magazyn")}`}
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
              className={`shrink-0 whitespace-nowrap ${tabsNavItemClassName(mainView === "layout")}`}
            >
              {UI_STRINGS.warehouse.designerSubTabs.layoutDesigner}
            </button>
          </nav>
        </TabsContainer>
      </div>
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
      {pendingVariantSave != null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-5">
            <h3 className="text-base font-bold text-slate-800">Save as new variant</h3>
            <p className="mt-2 text-sm text-slate-600">Układ różni się od szablonu bazowego. Zapisz jako nowy wariant?</p>
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
              <button
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
                    variant
                  );
                  setPendingVariantSave(null);
                }}
                className="px-3 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500"
              >
                Potwierdź
              </button>
            </div>
          </div>
        </div>
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

      <div
        id="warehouse-designer-panel"
        role="tabpanel"
        aria-labelledby={mainView === "magazyn" ? "warehouse-designer-tab-magazyn" : "warehouse-designer-tab-layout"}
        className="flex min-h-0 min-w-0 flex-1 basis-0 flex-row gap-3 overflow-hidden"
        style={mainView === "magazyn" ? { overscrollBehavior: "contain" } : undefined}
      >
        {mainView === "magazyn" ? (
          <div className="flex h-full min-h-0 w-[300px] shrink-0 flex-none flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-y-contain border-r border-slate-200/70 pr-3">
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
        ) : null}

        {mainView === "magazyn" ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200/80">
              {layout.racks.length === 0 ? (
                <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col items-center justify-center p-8 text-slate-500">
                  <p className="text-sm">Brak regałów. Przejdź do Projektu Layoutu, aby dodać regały i zobaczyć widok z boku.</p>
                </div>
              ) : (
                <>
                  <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col overflow-hidden">
                    {selectedRackIdForSideView == null ? (
                      <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-row items-stretch overflow-hidden">
                        <div className="flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col overflow-hidden">
                          <div
                            ref={magazynMapScrollRef}
                            className="flex min-h-0 min-w-0 max-w-full w-full flex-1 flex-col overflow-auto overscroll-y-contain"
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
                            pathPoints={pathPoints}
                            pathSegments={pathSegments}
                            pathMarkers={pathMarkers}
                            routeStops={routeStopsForCanvasMode}
                            showRoute={routeRackIds.length >= 1 && routeStops.length > 0}
                            routeStepBadges={routeStepBadgesForCanvas}
                            routeEndCell={routePackingCell}
                            routeGraphPolyline={routeGraphPolylineForCanvas}
                            showRouteEndpointMarkers={showRouteEndpointMarkersForCanvas}
                            // Magazyn map is navigation-only: no quantity badges, only rack highlighting + labels.
                            rackQuantities={mainView === "magazyn" ? undefined : productRackQuantities ?? undefined}
                            getRackDisplayId={getRackDisplayIdWithLayout}
                            highlightedStopIndex={highlightedStopIndexForCanvas}
                            currentStopIndex={currentStopIndexForCanvas}
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
                            highlightedRackIds={canvasHighlightedRackIds}
                            highlightedBinUUIDs={highlightedBinUUIDsForSidebarProduct ?? undefined}
                            hoveredLocationUUID={hoveredLocationUUID}
                            onRackClick={(id) => {
                              setSelectedProductId(null);
                              setHoveredProductIdOnMap(null);
                              setSelectedProductIdOnMap(null);
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
                            inventoryMaps={inventoryMaps}
                            getProductImageUrl={getProductImageUrl}
                            onSelectLocation={(locationUUID) => {
                              const rackId = uuidToRackId.get(locationUUID);
                              setSelectedRackIdOnMap(rackId ?? null);
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
              onRackClickPassthrough: undefined,
              isRoutePlanningMode: isRouteActive,
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
              pathPoints,
              pathSegments,
              routeStops: routeStopsForCanvasMode,
              showRoute: routeRackIds.length >= 1 && routeStops.length > 0,
              highlightedStopIndex: highlightedStopIndexForCanvas,
              currentStopIndex: currentStopIndexForCanvas,
              getRackDisplayId: getRackDisplayIdWithLayout,
              routeStepBadges: routeStepBadgesForCanvas,
              routeEndCell: routePackingCell,
              routeGraphPolyline: routeGraphPolylineForCanvas,
              showRouteEndpointMarkers: showRouteEndpointMarkersForCanvas,
              pathMarkers,
              routeRackIds: orderedRouteRackIds,
              routeRackLabels: routeStops.map((s) => {
                const stopRack = layout.racks.find((r) => String(r.id ?? r.rack_index) === s.rackId);
                return stopRack ? getRackDisplayIdWithLayout(stopRack) : `Regał ${s.rackId}`;
              }),
              routeLengthMeters,
              routeLegMeters,
              routeStepIndex,
              routeStepCount: orderedRouteRackIds.length,
              onRouteStepNext: handleRouteStepNext,
              isRouteActive,
              clearRoute: () => {
                setRouteRackIds([]);
                setRouteStepIndex(0);
              },
              optimizeRoute: () => {
                setRouteRackIds((prev) => computePickingRouteOrder(prev, layout.racks, pickStartCell));
                setSnackbar({ message: "Kolejność dopasowana (tryb wąż)." });
              },
              finishRoute: () => setIsRouteActive(false),
              routePanelVisible: isRouteActive || routeRackIds.length > 0,
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
    </PageLayout>
  );
}
