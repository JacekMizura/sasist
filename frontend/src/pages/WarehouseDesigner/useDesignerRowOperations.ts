import { useCallback } from "react";
import type { RackState, LayoutState, CatalogItem, EmptyRowSlot, RowContainer, StorageType, RackType } from "../../types/warehouse";
import {
  getRowStart,
  computeRowSlotPositions,
  filterEmptyRowContainers,
  findEmptySlotAt,
  rectsOverlap,
  DEFAULT_ROW_SLOT_W,
  DEFAULT_ROW_SLOT_H,
} from "./DesignerRackPlacement";
import {
  getCatalogItemSpec,
  getLevelConfig,
  getTotalLocations,
  volumePerBin,
  volumePerBinFromTotal,
  cellsToCm,
  createBinsForRack,
  binsToLevels,
  ROW_LABEL_ADDRESS_PATTERN,
  reindexGeometricRow,
  getNextRackIndex,
  getNextIndexInRow,
  generateRackUuid,
  nextUniqueRackName,
  normalizeRowPrefixLetters,
  rackMatchesSlotRackId,
  pairedAisleOffsetCells,
  rowContainerTemplateIdFromCatalogItem,
  shiftRowDrawForPairedRow,
  rowDrawSegmentExtents,
  rowDrawRackPositionsAlongCursor,
} from "../../components/warehouse/warehouseUtils";
import { layoutCmToCellsX, layoutCmToCellsY } from "../../utils/warehouseGridMetrics";
import type { Dispatch, SetStateAction } from "react";

/** Horizontal template row: same cursor+step model as preview / empty row / catalog stamp (not span/greedy). */
function appendHorizontalRowWithTemplateFromCursor(
  prev: LayoutState,
  start: { x: number; y: number },
  end: { x: number; y: number },
  item: CatalogItem,
  rowPrefix: string,
  rack_direction: "LTR" | "RTL",
  bin_direction: "LTR" | "RTL",
  defaultRackType: RackType,
  idSuffix: string,
  rowGapCm: number
): LayoutState | null {
  const spec = getCatalogItemSpec(item);
  const cellW = layoutCmToCellsX(prev, spec.width_cm);
  const cellH = layoutCmToCellsY(prev, spec.depth_cm);
  const gapCells = Math.max(0, layoutCmToCellsX(prev, rowGapCm));
  const stepW = cellW + gapCells;
  let along = rowDrawRackPositionsAlongCursor(start.x, end.x, stepW);
  along = along.filter((c) => c >= 0 && c + cellW <= prev.grid_cols);
  if (along.length === 0) return null;
  const yAnchor = Math.max(0, Math.min(prev.grid_rows - cellH, start.y));
  for (const cx of along) {
    const x = Math.max(0, Math.min(prev.grid_cols - cellW, cx));
    const rect = { x, y: yAnchor, width: cellW, height: cellH };
    if (prev.racks.some((r) => rectsOverlap(rect, r))) return null;
    if (prev.row_containers?.some((rc) =>
      rc.slots.some((s) => rectsOverlap(rect, { x: s.x, y: s.y, width: s.w, height: s.h }))
    )) return null;
  }
  const id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${idSuffix}`;
  const prefix = normalizeRowPrefixLetters(rowPrefix);
  const orientation: "horizontal" = "horizontal";
  const lc = getLevelConfig(spec);
  const totalBins = getTotalLocations(lc);
  const volPerBin =
    totalBins > 0
      ? volumePerBinFromTotal(spec.width_cm, spec.depth_cm, spec.height_cm, totalBins)
      : volumePerBin(spec.width_cm, spec.depth_cm, spec.height_cm, spec.levels, spec.bins_per_level);
  const templateColor = item.type === "custom" ? item.template.color : spec.color;
  const rackColor = typeof templateColor === "string" && templateColor.trim() !== "" ? templateColor.trim() : "#3b82f6";
  const resolvedRackType: RackType = item.type === "custom" ? (item.template.rack_type ?? "warehouse") : defaultRackType;
  const newSlots: EmptyRowSlot[] = [];
  const newRacks: RackState[] = [];
  let nextRackIndex = getNextRackIndex(prev.racks);
  let indexInRow = 1;
  for (const cx of along) {
    const x = Math.max(0, Math.min(prev.grid_cols - cellW, cx));
    const rackUuid = generateRackUuid();
    newSlots.push({ x, y: yAnchor, w: cellW, h: cellH, rackId: rackUuid });
    const partialLayout: LayoutState = { ...prev, racks: [...prev.racks, ...newRacks] };
    const rackLabel = nextUniqueRackName(`${prefix}${indexInRow}`, partialLayout);
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
    newRacks.push({
      uuid: rackUuid,
      rack_type: resolvedRackType,
      x,
      y: yAnchor,
      width: cellW,
      height: cellH,
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
      rowPrefix: prefix,
      indexInRow,
      ...(spec.addressPattern != null ? { addressPattern: spec.addressPattern } : {}),
      ...(spec.sectionStartIndex != null ? { sectionStartIndex: spec.sectionStartIndex } : {}),
      ...(spec.binNamingType != null ? { binNamingType: spec.binNamingType } : {}),
      ...(item.type === "custom" ? { templateId: item.template.id } : {}),
      ...(spec.level_max_load_kg != null ? { level_max_load_kg: spec.level_max_load_kg } : {}),
    } as RackState);
    nextRackIndex += 1;
    indexInRow += 1;
  }
  const nextRacks = reindexGeometricRow([...prev.racks, ...newRacks], newRacks[0]?.uuid ?? newRacks[0]?.rack_index ?? getNextRackIndex(prev.racks));
  return {
    ...prev,
    row_containers: [
      ...(prev.row_containers ?? []),
      {
        id,
        rowPrefix: prefix,
        orientation,
        rack_direction,
        bin_direction,
        templateId: rowContainerTemplateIdFromCatalogItem(item),
        slots: newSlots,
      },
    ],
    racks: nextRacks,
  };
}

/** Pure append for one template-filled row; used for single draw and paired (second pass sees first row). */
function appendRowWithTemplateToLayoutState(
  prev: LayoutState,
  start: { x: number; y: number },
  end: { x: number; y: number },
  item: CatalogItem,
  rowPrefix: string,
  rack_direction: "LTR" | "RTL",
  bin_direction: "LTR" | "RTL",
  defaultRackType: RackType,
  idSuffix: string,
  rowGapCm: number
): LayoutState | null {
  const { minY, extentY, isHorizontal } = rowDrawSegmentExtents(start, end);
  if (isHorizontal) {
    return appendHorizontalRowWithTemplateFromCursor(
      prev,
      start,
      end,
      item,
      rowPrefix,
      rack_direction,
      bin_direction,
      defaultRackType,
      idSuffix,
      rowGapCm
    );
  }
  const x0 = start.x;
  const y0 = minY;
  const extentAlong = Math.max(1, extentY);
  const clampedX = Math.max(0, Math.min(prev.grid_cols - 1, x0));
  const clampedY = Math.max(0, Math.min(prev.grid_rows - extentAlong, y0));
  const w = DEFAULT_ROW_SLOT_H;
  const h = Math.min(extentAlong, prev.grid_rows - clampedY);
  const rect = { x: clampedX, y: clampedY, width: w, height: h };
  const overlapsExisting = prev.racks.some((r) => rectsOverlap(rect, r));
  const overlapsOther = prev.row_containers?.some((rc) =>
    rc.slots.some((s) => rectsOverlap(rect, { x: s.x, y: s.y, width: s.w, height: s.h }))
  );
  if (overlapsExisting || overlapsOther) return null;
  const id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${idSuffix}`;
  const prefix = normalizeRowPrefixLetters(rowPrefix);
  const orientation: "vertical" = "vertical";
  const spec = getCatalogItemSpec(item);
  const lc = getLevelConfig(spec);
  const totalBins = getTotalLocations(lc);
  const volPerBin =
    totalBins > 0
      ? volumePerBinFromTotal(spec.width_cm, spec.depth_cm, spec.height_cm, totalBins)
      : volumePerBin(spec.width_cm, spec.depth_cm, spec.height_cm, spec.levels, spec.bins_per_level);
  const cellW = layoutCmToCellsX(prev, spec.width_cm);
  const cellH = layoutCmToCellsY(prev, spec.depth_cm);
  const templateColor = item.type === "custom" ? item.template.color : spec.color;
  const rackColor = typeof templateColor === "string" && templateColor.trim() !== "" ? templateColor.trim() : "#3b82f6";
  const resolvedRackType: RackType = item.type === "custom" ? (item.template.rack_type ?? "warehouse") : defaultRackType;
  const startX = clampedX;
  const startY = clampedY;
  const slotFits = (s: EmptyRowSlot) => s.w >= cellH && s.h >= cellW;
  const remainderSlot = (s: EmptyRowSlot): EmptyRowSlot =>
    ({ x: 0, y: startY, w: s.w, h: s.h - cellW });
  const initialSlots: EmptyRowSlot[] = [{ x: clampedX, y: clampedY, w, h }];
  const newSlotsRaw: EmptyRowSlot[] = [];
  const newRacks: RackState[] = [];
  let nextRackIndex = getNextRackIndex(prev.racks);
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
    const rackUuid = generateRackUuid();
    newSlotsRaw.push({ x: 0, y: startY, w: cellH, h: cellW, rackId: rackUuid });
    const partialLayout: LayoutState = { ...prev, racks: [...prev.racks, ...newRacks] };
    const rackLabel = nextUniqueRackName(`${prefix}${indexInRow}`, partialLayout);
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
    newRacks.push({
      uuid: rackUuid,
      rack_type: resolvedRackType,
      x: 0,
      y: startY,
      width: cellH,
      height: cellW,
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
      rowPrefix: prefix,
      indexInRow,
      ...(spec.addressPattern != null ? { addressPattern: spec.addressPattern } : {}),
      ...(spec.sectionStartIndex != null ? { sectionStartIndex: spec.sectionStartIndex } : {}),
      ...(spec.binNamingType != null ? { binNamingType: spec.binNamingType } : {}),
      rotationDegrees: 90 as const,
      ...(item.type === "custom" ? { templateId: item.template.id } : {}),
      ...(spec.level_max_load_kg != null ? { level_max_load_kg: spec.level_max_load_kg } : {}),
    } as RackState);
    nextRackIndex += 1;
    indexInRow += 1;
    if (s.h > cellW) toProcess.unshift(remainderSlot(s));
  }
  const minSlotAlongRow = cellW;
  while (
    newSlotsRaw.length > 0 &&
    newSlotsRaw[newSlotsRaw.length - 1]?.rackId == null &&
    (newSlotsRaw[newSlotsRaw.length - 1]?.h ?? 0) < minSlotAlongRow
  ) {
    newSlotsRaw.pop();
  }
  const newSlots = computeRowSlotPositions(newSlotsRaw, startX, startY, orientation);
  const updatedRacks = prev.racks.map((r) => {
    const slotForRack = newSlots.find((sl) => sl.rackId != null && rackMatchesSlotRackId(r, sl.rackId));
    if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
    return r;
  });
  const newRacksWithPos = newRacks.map((rack) => {
    const slotForRack = newSlots.find((sl) => sl.rackId != null && rackMatchesSlotRackId(rack, sl.rackId));
    return { ...rack, x: slotForRack?.x ?? 0, y: slotForRack?.y ?? startY };
  });
  const nextRacks = reindexGeometricRow(
    [...updatedRacks, ...newRacksWithPos],
    newRacksWithPos[0]?.uuid ?? newRacksWithPos[0]?.rack_index ?? getNextRackIndex(prev.racks)
  );
  return {
    ...prev,
    row_containers: [
      ...(prev.row_containers ?? []),
      {
        id,
        rowPrefix: prefix,
        orientation,
        rack_direction,
        bin_direction,
        templateId: rowContainerTemplateIdFromCatalogItem(item),
        slots: newSlots,
      },
    ],
    racks: nextRacks,
  };
}

function appendEmptyRowToLayoutState(
  prev: LayoutState,
  start: { x: number; y: number },
  end: { x: number; y: number },
  rowPrefix: string,
  rack_direction: "LTR" | "RTL",
  bin_direction: "LTR" | "RTL",
  rowGapCm: number,
  idSuffix: string,
  templateId?: string
): LayoutState | null {
  const { isHorizontal } = rowDrawSegmentExtents(start, end);
  const gapCells = Math.max(0, isHorizontal ? layoutCmToCellsX(prev, rowGapCm) : layoutCmToCellsY(prev, rowGapCm));
  const slotW = isHorizontal ? DEFAULT_ROW_SLOT_W : DEFAULT_ROW_SLOT_H;
  const slotH = isHorizontal ? DEFAULT_ROW_SLOT_H : DEFAULT_ROW_SLOT_W;
  const step = (isHorizontal ? slotW : slotH) + gapCells;
  const startX = Math.max(0, Math.min(prev.grid_cols - slotW, start.x));
  const startY = Math.max(0, Math.min(prev.grid_rows - slotH, start.y));
  let along = rowDrawRackPositionsAlongCursor(
    isHorizontal ? start.x : start.y,
    isHorizontal ? end.x : end.y,
    step
  );
  along = along.filter((c) =>
    isHorizontal ? c >= 0 && c + slotW <= prev.grid_cols : c >= 0 && c + slotH <= prev.grid_rows
  );
  if (along.length <= 0) return null;
  const slots: EmptyRowSlot[] = along.map((c) => {
    const x = isHorizontal ? Math.max(0, Math.min(prev.grid_cols - slotW, c)) : startX;
    const y = isHorizontal ? startY : Math.max(0, Math.min(prev.grid_rows - slotH, c));
    return { x, y, w: slotW, h: slotH };
  });
  const overlapsExisting = slots.some((s) =>
    prev.racks.some((r) => rectsOverlap({ x: s.x, y: s.y, width: s.w, height: s.h }, r))
  );
  const overlapsOther = slots.some((s) =>
    (prev.row_containers ?? []).some((rc) =>
      rc.slots.some((o) => rectsOverlap({ x: s.x, y: s.y, width: s.w, height: s.h }, { x: o.x, y: o.y, width: o.w, height: o.h }))
    )
  );
  if (overlapsExisting || overlapsOther) return null;
  const id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${idSuffix}`;
  const prefix = normalizeRowPrefixLetters(rowPrefix);
  const orientation: "horizontal" | "vertical" = isHorizontal ? "horizontal" : "vertical";
  const newRow: RowContainer = {
    id,
    rowPrefix: prefix,
    orientation,
    rack_direction,
    bin_direction,
    ...(templateId ? { templateId } : {}),
    slots,
  };
  return { ...prev, row_containers: [...(prev.row_containers ?? []), newRow] };
}

/** One side of a paired draw: fill racks now, or empty slots with optional templateId for later fill. */
export type PairedRowPlacementSpec = {
  prefix: string;
  rack_direction: "LTR" | "RTL";
  bin_direction: "LTR" | "RTL";
  item: CatalogItem | null;
  autoFill: boolean;
};

export interface UseDesignerRowOperationsParams {
  layout: LayoutState;
  selectedRowContainerId: string | null;
  rowGapCm: number;
  /** Fallback rack type for presets or templates without rack_type (default: warehouse). */
  defaultRackType: RackType;
  setLayout: Dispatch<SetStateAction<LayoutState>>;
  setSelectedRowContainerId: Dispatch<SetStateAction<string | null>>;
  setSelectedRackId: Dispatch<SetStateAction<number | string | null>>;
  setSelectedRackIds: Dispatch<SetStateAction<Array<number | string>>>;
  setSelectedAisleIndex: Dispatch<SetStateAction<number | null>>;
  setSelectedVisualId: Dispatch<SetStateAction<string | null>>;
  setSelectedVisualIds: Dispatch<SetStateAction<string[]>>;
  setDraggingRowId: Dispatch<SetStateAction<string | null>>;
  setRowDragPreviewStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setCatalogHoveredSlot: Dispatch<SetStateAction<{ rowId: string; slotIndex: number } | null>>;
  setRowDrawStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setRowDrawEnd: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  rowDragPointerOffsetRef: React.MutableRefObject<{ dx: number; dy: number } | null>;
  rowDragPreviewStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
  getCellFromEvent: (e: { clientX: number; clientY: number }) => { x: number; y: number } | null;
  setCustomTemplates: Dispatch<SetStateAction<import("../../types/warehouse").CustomRackTemplate[]>>;
}

export function useDesignerRowOperations(params: UseDesignerRowOperationsParams) {
  const {
    layout,
    selectedRowContainerId,
    rowGapCm,
    defaultRackType,
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
  } = params;

  /** Remove the selected empty row (and any racks placed in its slots) from the layout. */
  const deleteSelectedRow = useCallback(() => {
    if (!selectedRowContainerId) return;
    const row = (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId);
    if (!row) return;
    setLayout((prev) => ({
      ...prev,
      row_containers: (prev.row_containers ?? []).filter((rc) => rc.id !== selectedRowContainerId),
      racks: prev.racks.filter(
        (r) => !row.slots.some((s) => s.rackId != null && rackMatchesSlotRackId(r, s.rackId))
      ),
    }));
    setSelectedRowContainerId(null);
  }, [selectedRowContainerId, layout.row_containers, setLayout, setSelectedRowContainerId]);

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
  }, [selectedRowContainerId, layout.row_containers, setLayout]);

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
  }, [selectedRowContainerId, layout.row_containers, setLayout]);

  /** Check if moving the row to (newStartX, newStartY) is valid: no overlap with other rows/racks, within grid. */
  const canMoveRowTo = useCallback(
    (rowId: string, newStart: { x: number; y: number }) => {
      const row = (layout.row_containers ?? []).find((rc) => rc.id === rowId);
      if (!row?.slots.length) return false;
      const newSlots = computeRowSlotPositions(row.slots, newStart.x, newStart.y, row.orientation ?? "horizontal");
      const otherRows = (layout.row_containers ?? []).filter((rc) => rc.id !== rowId);
      const otherRacks = layout.racks.filter(
        (r) => !row.slots.some((s) => s.rackId != null && rackMatchesSlotRackId(r, s.rackId))
      );
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
        const rack = layout.racks.find((r) => rackMatchesSlotRackId(r, slot.rackId));
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
          const slotForRack = newSlots.find((s) => s.rackId != null && rackMatchesSlotRackId(r, s.rackId));
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
    [layout.row_containers, layout.racks, setLayout]
  );

  /** Select a row container (e.g. when clicking an empty slot overlay). Clears rack/aisle/visual selection. */
  const onSelectRowContainer = useCallback((rowId: string) => {
    setSelectedRowContainerId(rowId);
    setSelectedRackId(null);
    setSelectedRackIds([]);
    setSelectedAisleIndex(null);
    setSelectedVisualId(null);
    setSelectedVisualIds([]);
  }, [setSelectedRowContainerId, setSelectedRackId, setSelectedRackIds, setSelectedAisleIndex, setSelectedVisualId, setSelectedVisualIds]);

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
    [selectedRowContainerId, layout.row_containers, getCellFromEvent, setDraggingRowId, setRowDragPreviewStart, rowDragPointerOffsetRef, rowDragPreviewStartRef]
  );

  /** Move an already-placed rack within the same row from one slot index to another. Frees the source slot and inserts into the target (splits if needed). */
  const moveRackWithinRow = useCallback(
    (rowId: string, rackId: number | string, fromSlotIndex: number, toSlotIndex: number) => {
      const row = (layout.row_containers ?? []).find((rc) => rc.id === rowId);
      if (!row || fromSlotIndex < 0 || fromSlotIndex >= row.slots.length || toSlotIndex < 0 || toSlotIndex >= row.slots.length) return;
      const rack = layout.racks.find((r) => rackMatchesSlotRackId(r, rackId));
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
          const slotForRack = newSlots.find((s) => s.rackId != null && rackMatchesSlotRackId(r, s.rackId));
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
    [layout.row_containers, layout.racks, setLayout]
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
    [layout.row_containers, setCatalogHoveredSlot]
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
      const w = layoutCmToCellsX(layout, spec.width_cm);
      const h = layoutCmToCellsY(layout, spec.depth_cm);
      const prefix = normalizeRowPrefixLetters(row.rowPrefix || "A");
      const templateColor = item.type === "custom" ? item.template.color : spec.color;
      const rackColor = (typeof templateColor === "string" && templateColor.trim() !== "") ? templateColor.trim() : "#3b82f6";
      const resolvedRackType: RackType = item.type === "custom" ? (item.template.rack_type ?? "warehouse") : defaultRackType;
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
        let nextRackIndex = getNextRackIndex(prev.racks);
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
          const rackUuid = generateRackUuid();
          newSlotsRaw.push({ x: 0, y: startY, w: isVertical ? h : w, h: isVertical ? w : h, rackId: rackUuid });
          const partialLayout: LayoutState = { ...prev, racks: [...prev.racks, ...newRacks] };
          const rackLabel = nextUniqueRackName(`${prefix}${indexInRow}`, partialLayout);
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
          newRacks.push({
            uuid: rackUuid,
            rack_type: resolvedRackType,
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
            ...(spec.addressPattern != null ? { addressPattern: spec.addressPattern } : {}),
            ...(spec.sectionStartIndex != null ? { sectionStartIndex: spec.sectionStartIndex } : {}),
            ...(spec.binNamingType != null ? { binNamingType: spec.binNamingType } : {}),
            ...(isVertical ? { rotationDegrees: 90 as const } : {}),
            ...(item.type === "custom" ? { templateId: item.template.id } : {}),
            ...(spec.level_max_load_kg != null ? { level_max_load_kg: spec.level_max_load_kg } : {}),
          } as RackState);
          nextRackIndex += 1;
          indexInRow += 1;
          if (isVertical ? (s.h > w) : s.w > w) newSlotsRaw.push(remainderSlot(s));
        }
        const newSlots = computeRowSlotPositions(newSlotsRaw, startX, startY, rc.orientation ?? "horizontal");
        const updatedRacks = prev.racks.map((r) => {
          const slotForRack = newSlots.find((sl) => sl.rackId != null && rackMatchesSlotRackId(r, sl.rackId));
          if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
          return r;
        });
        const newRacksWithPos = newRacks.map((rack) => {
          const slotForRack = newSlots.find((sl) => sl.rackId != null && rackMatchesSlotRackId(rack, sl.rackId));
          return { ...rack, x: slotForRack?.x ?? 0, y: slotForRack?.y ?? startY };
        });
        let nextRacks = reindexGeometricRow(
          [...updatedRacks, ...newRacksWithPos],
          newRacksWithPos[0]?.uuid ?? newRacksWithPos[0]?.rack_index ?? getNextRackIndex(prev.racks)
        );
        return {
          ...prev,
          racks: nextRacks,
          row_containers: (prev.row_containers ?? []).map((r) => (r.id === selectedRowContainerId ? { ...r, slots: newSlots } : r)),
        };
      });
    },
    [selectedRowContainerId, layout, layout.row_containers, defaultRackType, setLayout]
  );

  /** Place a row of racks from cell A to cell B. Template properties (color, reserve bins, dimensions, rowId) are strictly inherited from the selected template. Section numbering is per-template (no global counter). */
  const _placeRowFromCatalogItem = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }, item: CatalogItem) => {
      const spec = getCatalogItemSpec(item);
      const resolvedRackType: RackType = item.type === "custom" ? (item.template.rack_type ?? "warehouse") : defaultRackType;
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
        bin_type_map?: Record<string, StorageType>;
        namingStrategy?: "pattern" | "rack-index" | "custom" | "manual";
        namingOrientation?: "column-first" | "row-first";
        namingPattern?: string;
        manualLabels?: Record<string, string>;
        overrides?: Record<string, string>;
        indexPadding?: number;
        startIndex?: number;
        level_max_load_kg?: number;
      } = item.type === "custom"
        ? (JSON.parse(JSON.stringify({
          color: item.template.color ?? spec.color ?? "#3b82f6",
          rowId: item.template.rowId ?? item.template.aisle_letter,
          aisle_letter: item.template.aisle_letter,
          sectionStartIndex: item.template.sectionStartIndex ?? 1,
          nextSectionIndex: item.template.nextSectionIndex ?? item.template.sectionStartIndex ?? 1,
          templateId: item.template.id,
          level_max_load_kg: item.template.level_max_load_kg,
          levels: item.template.levels,
          bins_per_level: item.template.bins_per_level,
          levelConfig: item.template.levelConfig,
          length_cm: item.template.depth_cm,
          width_cm: item.template.width_cm,
          height_cm: item.template.height_cm,
          naming_pattern: item.template.naming_pattern,
          addressPattern: item.template.addressPattern,
          binNamingType: item.template.binNamingType ?? "numeric",
          bin_type_map: item.template.bin_type_map ? { ...item.template.bin_type_map } : undefined,
          namingStrategy: item.template.namingStrategy,
          namingOrientation: item.template.namingOrientation,
          namingPattern: item.template.namingPattern ?? item.template.addressPattern,
          manualLabels: item.template.manualLabels,
          overrides: item.template.overrides,
          indexPadding: item.template.indexPadding,
          startIndex: item.template.startIndex,
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
          bin_type_map: spec.bin_type_map ? { ...spec.bin_type_map } : undefined,
          namingStrategy: spec.namingStrategy,
          namingOrientation: spec.namingOrientation,
          namingPattern: spec.namingPattern ?? spec.addressPattern,
          manualLabels: spec.manualLabels,
          overrides: spec.overrides,
          indexPadding: spec.indexPadding,
          startIndex: spec.startIndex,
        };

      const startSection = templateToApply.nextSectionIndex ?? templateToApply.sectionStartIndex;

      const pw = layoutCmToCellsX(layout, templateToApply.width_cm);
      const ph = layoutCmToCellsY(layout, templateToApply.length_cm);
      const gapCellsX = layoutCmToCellsX(layout, rowGapCm);
      const gapCellsY = layoutCmToCellsY(layout, rowGapCm);
      const stepW = pw + gapCellsX;
      const stepH = ph + gapCellsY;
      const { isHorizontal } = rowDrawSegmentExtents(start, end);
      let positions: { x: number; y: number }[];
      if (isHorizontal) {
        const along = rowDrawRackPositionsAlongCursor(start.x, end.x, stepW);
        positions = along.map((x) => ({ x, y: start.y }));
      } else {
        const along = rowDrawRackPositionsAlongCursor(start.y, end.y, stepH);
        positions = along.map((y) => ({ x: start.x, y }));
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
        const row = (layout.row_containers ?? []).find((rc) => rc.id === selectedRowContainerId);
        const prefix = normalizeRowPrefixLetters(row?.rowPrefix || "A");
        setLayout((prev) => {
          const nextRackIndexBase = getNextRackIndex(prev.racks);
          const startIndexInRow = getNextIndexInRow(prev.racks, prefix);
          const newRacks: RackState[] = [];
          for (let i = 0; i < rackStubs.length; i++) {
            const pos = rackStubs[i]!;
            const partialLayout: LayoutState = { ...prev, racks: [...prev.racks, ...newRacks] };
            const rackIndex = nextRackIndexBase + i;
            const indexInRow = startIndexInRow + i;
            const rackLabel = nextUniqueRackName(`${prefix}${indexInRow}`, partialLayout);
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
              templateToApply.bin_type_map,
              templateToApply.addressPattern ?? ROW_LABEL_ADDRESS_PATTERN,
              rackLabel,
              templateToApply.sectionStartIndex ?? 1,
              templateToApply.binNamingType ?? "numeric",
              lcRow,
              templateToApply.namingStrategy,
              templateToApply.namingOrientation,
              templateToApply.namingPattern ?? templateToApply.addressPattern,
              templateToApply.manualLabels,
              templateToApply.overrides,
              templateToApply.indexPadding,
              templateToApply.startIndex
            );
            newRacks.push({
              uuid: generateRackUuid(),
              rack_type: resolvedRackType,
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
              ...(templateToApply.addressPattern != null ? { addressPattern: templateToApply.addressPattern } : {}),
              ...(templateToApply.sectionStartIndex != null ? { sectionStartIndex: templateToApply.sectionStartIndex } : {}),
              ...(templateToApply.binNamingType != null ? { binNamingType: templateToApply.binNamingType } : {}),
              ...(templateToApply.templateId != null ? { templateId: templateToApply.templateId } : {}),
              ...(templateToApply.level_max_load_kg != null ? { level_max_load_kg: templateToApply.level_max_load_kg } : {}),
            } as RackState);
          }
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
    [layout.racks, layout.grid_cols, layout.grid_rows, layout.row_containers, selectedRowContainerId, rowGapCm, defaultRackType, setLayout, setCustomTemplates, setRowDrawStart, setRowDrawEnd]
  );
  void _placeRowFromCatalogItem;

  /** Create an empty row as one container of available space (one big slot). Racks placed later will split it and push slots right. */
  const placeEmptyRow = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      rowPrefix: string,
      rack_direction: "LTR" | "RTL" = "LTR",
      bin_direction: "LTR" | "RTL" = "LTR",
      templateId?: string
    ) => {
      setLayout((prev) => {
        const next = appendEmptyRowToLayoutState(
          prev,
          start,
          end,
          rowPrefix,
          rack_direction,
          bin_direction,
          rowGapCm,
          "",
          templateId
        );
        return next ?? prev;
      });
      setRowDrawStart(null);
      setRowDrawEnd(null);
    },
    [rowGapCm, setLayout, setRowDrawStart, setRowDrawEnd]
  );

  /** Aisle offset for the second row: use template depth when a template is chosen, else default empty strip depth. */
  function pairedOffsetDepthCm(spec: PairedRowPlacementSpec): number {
    if (spec.item) return getCatalogItemSpec(spec.item).depth_cm;
    return cellsToCm(DEFAULT_ROW_SLOT_H);
  }

  /** Two facing rows in one draw: each side can fill from template, or empty row with optional templateId for later fill. */
  const placePairedRowPair = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      spec1: PairedRowPlacementSpec,
      spec2: PairedRowPlacementSpec
    ) => {
      const { isHorizontal } = rowDrawSegmentExtents(start, end);
      const offsetCells = pairedAisleOffsetCells(pairedOffsetDepthCm(spec1), rowGapCm, layout, isHorizontal ? "y" : "x");
      const s2 = shiftRowDrawForPairedRow(start, end, offsetCells, isHorizontal);
      setLayout((prev) => {
        const applyOne = (
          state: LayoutState,
          s: { x: number; y: number },
          e: { x: number; y: number },
          spec: PairedRowPlacementSpec,
          idSuffix: string
        ): LayoutState | null => {
          const p = normalizeRowPrefixLetters(spec.prefix);
          const { rack_direction: rd, bin_direction: bd } = spec;
          if (spec.item && spec.autoFill) {
            return appendRowWithTemplateToLayoutState(state, s, e, spec.item, p, rd, bd, defaultRackType, idSuffix, rowGapCm);
          }
          const tid =
            spec.item && !spec.autoFill ? rowContainerTemplateIdFromCatalogItem(spec.item) : undefined;
          return appendEmptyRowToLayoutState(state, s, e, p, rd, bd, rowGapCm, idSuffix, tid);
        };
        const n1 = applyOne(prev, start, end, spec1, "");
        if (!n1) return prev;
        const n2 = applyOne(n1, s2.start, s2.end, spec2, "-p2");
        return n2 ?? prev;
      });
      setRowDrawStart(null);
      setRowDrawEnd(null);
    },
    [rowGapCm, defaultRackType, layout, setLayout, setRowDrawStart, setRowDrawEnd]
  );

  /** Two facing empty rows in one action (aisle between), no templates. */
  const placePairedEmptyRows = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      row1: { prefix: string; rack_direction: "LTR" | "RTL"; bin_direction: "LTR" | "RTL" },
      row2: { prefix: string; rack_direction: "LTR" | "RTL"; bin_direction: "LTR" | "RTL" }
    ) => {
      placePairedRowPair(start, end, { ...row1, item: null, autoFill: false }, { ...row2, item: null, autoFill: false });
    },
    [placePairedRowPair]
  );

  /** Create a row with orientation from drag and immediately fill it with the given template (vertical → swapped dims + rotation). */
  const placeRowWithTemplate = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      item: CatalogItem,
      rowPrefix: string,
      rack_direction: "LTR" | "RTL" = "LTR",
      bin_direction: "LTR" | "RTL" = "LTR"
    ) => {
      setLayout((prev) => {
        const next = appendRowWithTemplateToLayoutState(
          prev,
          start,
          end,
          item,
          rowPrefix,
          rack_direction,
          bin_direction,
          defaultRackType,
          "",
          rowGapCm
        );
        return next ?? prev;
      });
      setRowDrawStart(null);
      setRowDrawEnd(null);
    },
    [defaultRackType, rowGapCm, setLayout, setRowDrawStart, setRowDrawEnd]
  );

  /** Two facing template-filled rows in one action. */
  const placePairedRowsWithTemplate = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      item1: CatalogItem,
      row1: { prefix: string; rack_direction: "LTR" | "RTL"; bin_direction: "LTR" | "RTL" },
      item2: CatalogItem,
      row2: { prefix: string; rack_direction: "LTR" | "RTL"; bin_direction: "LTR" | "RTL" }
    ) => {
      const spec1 = getCatalogItemSpec(item1);
      const { isHorizontal } = rowDrawSegmentExtents(start, end);
      const offsetCells = pairedAisleOffsetCells(spec1.depth_cm, rowGapCm, layout);
      const s2 = shiftRowDrawForPairedRow(start, end, offsetCells, isHorizontal);
      setLayout((prev) => {
        const n1 = appendRowWithTemplateToLayoutState(
          prev,
          start,
          end,
          item1,
          row1.prefix,
          row1.rack_direction,
          row1.bin_direction,
          defaultRackType,
          "",
          rowGapCm
        );
        if (!n1) return prev;
        const n2 = appendRowWithTemplateToLayoutState(
          n1,
          s2.start,
          s2.end,
          item2,
          row2.prefix,
          row2.rack_direction,
          row2.bin_direction,
          defaultRackType,
          "-p2",
          rowGapCm
        );
        return n2 ?? prev;
      });
      setRowDrawStart(null);
      setRowDrawEnd(null);
    },
    [rowGapCm, defaultRackType, layout, setLayout, setRowDrawStart, setRowDrawEnd]
  );

  return {
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
    placePairedEmptyRows,
    placeRowWithTemplate,
    placePairedRowsWithTemplate,
  };
}
