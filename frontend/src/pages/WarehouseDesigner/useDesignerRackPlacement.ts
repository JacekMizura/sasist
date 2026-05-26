import { useCallback, useMemo } from "react";
import type { RackState, LayoutState, CatalogItem, EmptyRowSlot, RackType } from "../../types/warehouse";
import type { RackTemplate } from "../../types/warehouse";
import {
  snapPosition,
  getRowStart,
  computeRowSlotPositions,
  findEmptySlotAt,
} from "./DesignerRackPlacement";
import {
  createBinsForRack,
  volumePerBin,
  volumePerBinFromTotal,
  getCatalogItemSpec,
  getLevelConfig,
  getTotalLocations,
  getNextIndexInRow,
  findSnapToRowPosition,
  reindexGeometricRow,
  binsToLevels,
  generateRackUuid,
  ROW_LABEL_ADDRESS_PATTERN,
  nextUniqueRackName,
  normalizeRowPrefixLetters,
  rackMatchesSlotRackId,
} from "../../components/warehouse/warehouseUtils";
import type { LevelConfigItem, StorageType } from "../../types/warehouse";
import type { Dispatch, SetStateAction } from "react";
import { layoutCmToCellsX, layoutCmToCellsY } from "../../utils/warehouseGridMetrics";

export interface UseDesignerRackPlacementParams {
  layout: LayoutState;
  template: RackTemplate;
  rackRotation: "vertical" | "horizontal";
  aisleWidthCm: number;
  /** Manual default rack type used for placements that don't come from a custom template. */
  rackType: RackType;
  setLayout: Dispatch<SetStateAction<LayoutState>>;
  setDraggingFromCatalog: Dispatch<SetStateAction<CatalogItem | null>>;
  setCatalogGhostPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setCatalogHoveredSlot: Dispatch<SetStateAction<{ rowId: string; slotIndex: number } | null>>;
}

export function useDesignerRackPlacement(params: UseDesignerRackPlacementParams) {
  const {
    layout,
    template,
    rackRotation,
    aisleWidthCm,
    rackType,
    setLayout,
    setDraggingFromCatalog,
    setCatalogGhostPosition,
    setCatalogHoveredSlot,
  } = params;

  const ghostW = useMemo(
    () =>
      rackRotation === "horizontal"
        ? layoutCmToCellsY(layout, template.depth_cm)
        : layoutCmToCellsX(layout, template.width_cm),
    [layout, rackRotation, template.depth_cm, template.width_cm]
  );
  const ghostH = useMemo(
    () =>
      rackRotation === "horizontal"
        ? layoutCmToCellsX(layout, template.width_cm)
        : layoutCmToCellsY(layout, template.depth_cm),
    [layout, rackRotation, template.depth_cm, template.width_cm]
  );

  const stampRackAt = useCallback((cell: { x: number; y: number }) => {
    const w = ghostW;
    const h = ghostH;
    const desired = { x: cell.x, y: cell.y };
    const snapped = snapPosition(desired, w, h, layout.racks, layout.grid_cols, layout.grid_rows, aisleWidthCm);
    const x = snapped.x;
    const y = snapped.y;
    const volPerBin = volumePerBin(template.width_cm, template.depth_cm, template.height_cm, template.levels, template.bins_per_level);
    const prefix = (template.aisle_letter || "A").trim() || "A";
    setLayout((prev) => {
      const rackIndex = prev.racks.length + 1;
      const indexInRow = getNextIndexInRow(prev.racks, prefix);
      const rackLabel = nextUniqueRackName(`${prefix}${indexInRow}`, prev);
      const t = template as { addressPattern?: string; rowId?: string; sectionStartIndex?: number; binNamingType?: "numeric" | "alpha"; levelConfig?: LevelConfigItem[]; namingStrategy?: "pattern" | "rack-index" | "custom" | "manual"; namingOrientation?: "column-first" | "row-first"; namingPattern?: string; manualLabels?: Record<string, string>; overrides?: Record<string, string>; indexPadding?: number; startIndex?: number; naming_pattern?: string; bin_type_map?: Record<string, StorageType>; templateId?: string };
      const bins = createBinsForRack(
        template.aisle_letter,
        rackIndex,
        template.levels,
        template.bins_per_level,
        volPerBin,
        "M1",
        t.naming_pattern,
        template.width_cm,
        template.depth_cm,
        template.height_cm,
        t.bin_type_map,
        t.addressPattern ?? ROW_LABEL_ADDRESS_PATTERN,
        t.rowId ?? rackLabel,
        t.sectionStartIndex ?? 1,
        t.binNamingType ?? "numeric",
        getLevelConfig(template),
        t.namingStrategy,
        t.namingOrientation,
        t.namingPattern ?? t.addressPattern,
        t.manualLabels,
        t.overrides,
        t.indexPadding,
        t.startIndex
      );
      return {
        ...prev,
        racks: [
          ...prev.racks,
          {
            uuid: generateRackUuid(),
            rack_type: rackType,
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
            ...(t.addressPattern != null ? { addressPattern: t.addressPattern } : {}),
            ...(t.sectionStartIndex != null ? { sectionStartIndex: t.sectionStartIndex } : {}),
            ...(t.binNamingType != null ? { binNamingType: t.binNamingType } : {}),
            ...(typeof t.templateId === "string" && t.templateId.trim() !== "" ? { templateId: t.templateId } : {}),
          } as RackState,
        ],
      };
    });
  }, [template, rackRotation, layout, ghostW, ghostH, aisleWidthCm, rackType, setLayout]);

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
      const isVertical = (row.orientation ?? "horizontal") === "vertical";
      const reqW = isVertical ? layoutCmToCellsY(layout, spec.width_cm) : layoutCmToCellsX(layout, spec.width_cm);
      const reqD = isVertical ? layoutCmToCellsX(layout, spec.depth_cm) : layoutCmToCellsY(layout, spec.depth_cm);

      let consumedEnd = slotIndex;
      let consumedSpan = 0;
      if (isVertical) {
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
      const prefix = (row.rowPrefix || "A").trim() || "A";
      const indexInRow = 1 + row.slots.filter((s) => s.rackId != null).length;
      const rackIndex = layout.racks.length + 1;
      const rackLabel = nextUniqueRackName(`${prefix}${indexInRow}`, layout);
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
        spec.bin_type_map,
        spec.addressPattern ?? ROW_LABEL_ADDRESS_PATTERN,
        rackLabel,
        spec.sectionStartIndex ?? 1,
        spec.binNamingType ?? "numeric",
        lc,
        spec.namingStrategy,
        spec.namingOrientation,
        spec.namingPattern ?? spec.addressPattern,
        spec.manualLabels,
        spec.overrides,
        spec.indexPadding,
        spec.startIndex
      );
      const templateColor = item.type === "custom" ? item.template.color : spec.color;
      const rackColor = (typeof templateColor === "string" && templateColor.trim() !== "") ? templateColor.trim() : "#3b82f6";
      const resolvedRackType: RackType = item.type === "custom" ? (item.template.rack_type ?? "warehouse") : rackType;
      const { x: startX, y: startY } = getRowStart(row);
      const rackUuid = generateRackUuid();

      const thickness = isVertical ? slot0.w : slot0.h;
      const filledSlot: EmptyRowSlot = isVertical
        ? { x: 0, y: startY, w: thickness, h: reqW, rackId: rackUuid }
        : { x: 0, y: startY, w: reqW, h: thickness, rackId: rackUuid };
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
      const filledSlotWithPos = newSlots.find((s) => s.rackId === rackUuid);
      const rackWidthCells = isVertical ? reqD : reqW;
      const rackHeightCells = isVertical ? reqW : reqD;
      const newRack: RackState = {
        uuid: rackUuid,
        rack_type: resolvedRackType,
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
        ...(spec.addressPattern != null ? { addressPattern: spec.addressPattern } : {}),
        ...(spec.sectionStartIndex != null ? { sectionStartIndex: spec.sectionStartIndex } : {}),
        ...(spec.binNamingType != null ? { binNamingType: spec.binNamingType } : {}),
        ...(isVertical ? { rotationDegrees: 90 as const } : {}),
        ...(item.type === "custom" ? { templateId: item.template.id } : {}),
        ...(spec.level_max_load_kg != null ? { level_max_load_kg: spec.level_max_load_kg } : {}),
      };
      setLayout((prev) => {
        const updatedRacks = prev.racks.map((r) => {
          const slotForRack = newSlots.find((s) => s.rackId != null && rackMatchesSlotRackId(r, s.rackId));
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
    [layout, rackType, setLayout, setDraggingFromCatalog, setCatalogGhostPosition, setCatalogHoveredSlot]
  );

  const stampRackFromCatalogItem = useCallback((cell: { x: number; y: number }, item: CatalogItem, rowPrefix?: string) => {
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
    const w = layoutCmToCellsX(layout, spec.width_cm);
    const h = layoutCmToCellsY(layout, spec.depth_cm);
    const snap = findSnapToRowPosition(layout.racks, cell.x, cell.y, w, h);
    const x = snap ? Math.max(0, Math.min(layout.grid_cols - w, snap.x)) : Math.max(0, Math.min(layout.grid_cols - w, cell.x));
    const y = snap ? Math.max(0, Math.min(layout.grid_rows - h, snap.y)) : Math.max(0, Math.min(layout.grid_rows - h, cell.y));
    const prefix = snap ? normalizeRowPrefixLetters(snap.rowPrefix) : normalizeRowPrefixLetters(rowPrefix ?? "A");
    const indexInRow = snap ? snap.indexInRow : getNextIndexInRow(layout.racks, prefix);
    const rackIndex = layout.racks.length + 1;
    const rackLabel = nextUniqueRackName(`${prefix}${indexInRow}`, layout);
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
      spec.bin_type_map,
      spec.addressPattern ?? ROW_LABEL_ADDRESS_PATTERN,
      rackLabel,
      spec.sectionStartIndex ?? 1,
      spec.binNamingType ?? "numeric",
      lc,
      spec.namingStrategy,
      spec.namingOrientation,
      spec.namingPattern ?? spec.addressPattern,
      spec.manualLabels,
      spec.overrides,
      spec.indexPadding,
      spec.startIndex
    );
    const templateColor = item.type === "custom" ? item.template.color : spec.color;
    const rackColor = (typeof templateColor === "string" && templateColor.trim() !== "") ? templateColor.trim() : "#3b82f6";
    const resolvedRackType: RackType = item.type === "custom" ? (item.template.rack_type ?? "warehouse") : rackType;
    const newRack: RackState = {
      uuid: generateRackUuid(),
      rack_type: resolvedRackType,
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
      ...(spec.addressPattern != null ? { addressPattern: spec.addressPattern } : {}),
      ...(spec.sectionStartIndex != null ? { sectionStartIndex: spec.sectionStartIndex } : {}),
      ...(spec.binNamingType != null ? { binNamingType: spec.binNamingType } : {}),
      ...(item.type === "custom" ? { templateId: item.template.id } : {}),
      ...(spec.level_max_load_kg != null ? { level_max_load_kg: spec.level_max_load_kg } : {}),
    };
    setLayout((prev) => ({ ...prev, racks: reindexGeometricRow([...prev.racks, newRack], newRack.rack_index) }));
    setDraggingFromCatalog(null);
    setCatalogGhostPosition(null);
    setCatalogHoveredSlot(null);
  }, [layout, stampRackIntoSlot, rackType, setLayout, setDraggingFromCatalog, setCatalogGhostPosition, setCatalogHoveredSlot]);

  const getCatalogDropCell = useCallback(
    (cell: { x: number; y: number }, item: CatalogItem) => {
      const empty = findEmptySlotAt(layout.row_containers, cell);
      if (empty) {
        const spec = getCatalogItemSpec(item);
        const isVert = (empty.rowContainer.orientation ?? "horizontal") === "vertical";
        const reqW = isVert ? layoutCmToCellsY(layout, spec.width_cm) : layoutCmToCellsX(layout, spec.width_cm);
        const reqD = isVert ? layoutCmToCellsX(layout, spec.depth_cm) : layoutCmToCellsY(layout, spec.depth_cm);
        if (isVert) {
          if (empty.slot.w >= reqD && empty.slot.h >= Math.min(reqW, empty.slot.h)) return { x: empty.slot.x, y: empty.slot.y };
        } else {
          if (empty.slot.h >= reqD && empty.slot.w >= Math.min(reqW, empty.slot.w)) return { x: empty.slot.x, y: empty.slot.y };
        }
      }
      const spec = getCatalogItemSpec(item);
      const w = layoutCmToCellsX(layout, spec.width_cm);
      const h = layoutCmToCellsY(layout, spec.depth_cm);
      const snap = findSnapToRowPosition(layout.racks, cell.x, cell.y, w, h);
      if (snap) return { x: Math.max(0, Math.min(layout.grid_cols - w, snap.x)), y: Math.max(0, Math.min(layout.grid_rows - h, snap.y)) };
      return snapPosition(cell, w, h, layout.racks, layout.grid_cols, layout.grid_rows, aisleWidthCm);
    },
    [layout, aisleWidthCm]
  );

  return {
    ghostW,
    ghostH,
    stampRackAt,
    stampRackIntoSlot,
    stampRackFromCatalogItem,
    getCatalogDropCell,
  };
}
