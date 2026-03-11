import { useCallback } from "react";
import type { RackState, LayoutState, CatalogItem, EmptyRowSlot, RowContainer } from "../../types/warehouse";
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
  cmToCells,
  createBinsForRack,
  binsToLevels,
  ROW_LABEL_ADDRESS_PATTERN,
  reindexGeometricRow,
  getNextIndexInRow,
} from "../../components/warehouse/warehouseUtils";
import type { Dispatch, SetStateAction } from "react";

export interface UseDesignerRowOperationsParams {
  layout: LayoutState;
  selectedRowContainerId: string | null;
  currentRowPrefix: string;
  rowGapCm: number;
  setLayout: Dispatch<SetStateAction<LayoutState>>;
  setSelectedRowContainerId: Dispatch<SetStateAction<string | null>>;
  setSelectedRackId: Dispatch<SetStateAction<number | string | null>>;
  setSelectedRackIds: Dispatch<SetStateAction<Array<number | string>>>;
  setSelectedAisleIndex: Dispatch<SetStateAction<number | null>>;
  setSelectedVisualId: Dispatch<SetStateAction<string | null>>;
  setSelectedVisualIds: Dispatch<SetStateAction<string[]>>;
  setSelectedPathPointIndex: Dispatch<SetStateAction<number | null>>;
  setSelectedPathLine: (v: boolean) => void;
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
  } = params;

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
    setSelectedPathPointIndex(null);
    setSelectedPathLine(false);
  }, [setSelectedRowContainerId, setSelectedRackId, setSelectedRackIds, setSelectedAisleIndex, setSelectedVisualId, setSelectedVisualIds, setSelectedPathPointIndex, setSelectedPathLine]);

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
    [selectedRowContainerId, layout.row_containers, currentRowPrefix, setLayout]
  );

  /** Place a row of racks from cell A to cell B. Template properties (color, reserve bins, dimensions, rowId) are strictly inherited from the selected template. Section numbering is per-template (no global counter). */
  const _placeRowFromCatalogItem = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }, item: CatalogItem) => {
      const spec = getCatalogItemSpec(item);
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
    [layout.racks, layout.grid_cols, layout.grid_rows, rowGapCm, currentRowPrefix, setLayout, setCustomTemplates, setRowDrawStart, setRowDrawEnd]
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
    [layout.racks, layout.grid_cols, layout.grid_rows, layout.row_containers, rowGapCm, currentRowPrefix, setLayout, setRowDrawStart, setRowDrawEnd]
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
    [layout.racks, layout.grid_cols, layout.grid_rows, layout.row_containers, currentRowPrefix, setLayout, setRowDrawStart, setRowDrawEnd]
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
    placeRowWithTemplate,
  };
}
