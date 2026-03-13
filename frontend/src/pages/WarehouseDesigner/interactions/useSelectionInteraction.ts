import { useCallback } from "react";
import type { CatalogItem, LayoutState } from "../../../types/warehouse";
import { computeMarqueeBox, getCellFromClientPosition, isCellInsideRack } from "../utils/designerMouseUtils";

export interface UseSelectionInteractionParams {
  layout: LayoutState;
  marqueeStart: { x: number; y: number } | null;
  marqueeEnd: { x: number; y: number } | null;
  aisleDrawStart: { x: number; y: number } | null;
  aisleToolActive: boolean;
  draggingRackId: number | string | null;
  draggingRowId: string | null;
  rowToolActive: boolean;
  placementMode: boolean;
  refs: {
    lastMouseRef: React.MutableRefObject<{ clientX: number; clientY: number } | null>;
    svgRef: React.RefObject<SVGSVGElement | null>;
  };
  findEmptySlotAt: (rowContainers: LayoutState["row_containers"], cell: { x: number; y: number }) => { rowContainer: { id: string }; slot: unknown; slotIndex: number } | null;
  setMarqueeStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setMarqueeEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setAisleDrawStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setSelectedRackIds: React.Dispatch<React.SetStateAction<Array<number | string>>>;
  setSelectedRackId: React.Dispatch<React.SetStateAction<number | string | null>>;
  setSelectedRowContainerIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedRowContainerId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedAisleIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  setRowToolTemplate: React.Dispatch<React.SetStateAction<CatalogItem | null>>;
  clearAllSelections: () => void;
}

export function useSelectionInteraction(params: UseSelectionInteractionParams) {
  const {
    layout,
    marqueeStart,
    marqueeEnd,
    aisleDrawStart,
    aisleToolActive,
    draggingRackId,
    draggingRowId,
    rowToolActive,
    placementMode,
    refs,
    findEmptySlotAt,
    setMarqueeStart,
    setMarqueeEnd,
    setAisleDrawStart,
    setSelectedRackIds,
    setSelectedRackId,
    setSelectedRowContainerIds,
    setSelectedRowContainerId,
    setSelectedAisleIndex,
    setLayout,
    setRowToolTemplate,
    clearAllSelections,
  } = params;
  const { lastMouseRef, svgRef } = refs;

  /** Call before visual/rack: aisle tool draw start and aisle cell selection. */
  const handleAislePart = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      if (aisleToolActive && e.button === 0) {
        setAisleDrawStart(cell);
        return true;
      }
      const aisleIndex = layout.aisles.findIndex((a) => isCellInsideRack(cell, a));
      if (aisleIndex >= 0 && e.button === 0) {
        clearAllSelections();
        setSelectedAisleIndex(aisleIndex);
        return true;
      }
      return false;
    },
    [aisleToolActive, layout.aisles, setAisleDrawStart, setSelectedAisleIndex, clearAllSelections]
  );

  /** Call after visual/rack: empty slot selection and marquee start. */
  const handleMarqueePart = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      const emptySlotHit = findEmptySlotAt(layout.row_containers, cell);
      if (emptySlotHit && e.button === 0 && !(e.ctrlKey || e.metaKey)) {
        setSelectedRowContainerId(emptySlotHit.rowContainer.id);
        setSelectedRowContainerIds([emptySlotHit.rowContainer.id]);
        clearAllSelections();
        setSelectedRowContainerId(emptySlotHit.rowContainer.id);
        setSelectedRowContainerIds([emptySlotHit.rowContainer.id]);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) {
        clearAllSelections();
        setSelectedRowContainerId(null);
        setSelectedRowContainerIds([]);
        if (e.button === 0) setRowToolTemplate(null);
      }
      setMarqueeStart(cell);
      setMarqueeEnd(cell);
    },
    [
      layout.row_containers,
      findEmptySlotAt,
      setMarqueeStart,
      setMarqueeEnd,
      setSelectedRowContainerId,
      setSelectedRowContainerIds,
      setRowToolTemplate,
      clearAllSelections,
    ]
  );

  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>, cell: { x: number; y: number } | null) => {
      if (marqueeStart == null || !cell || draggingRackId != null || draggingRowId != null || rowToolActive || aisleDrawStart || placementMode) return;
      setMarqueeEnd((prev) => (prev?.x === cell.x && prev?.y === cell.y ? prev : cell));
    },
    [marqueeStart, draggingRackId, draggingRowId, rowToolActive, aisleDrawStart, placementMode, setMarqueeEnd]
  );

  const handleMouseUp = useCallback(() => {
    if (marqueeStart && marqueeEnd) {
      const { x0, y0, x1, y1, hasExtent } = computeMarqueeBox(marqueeStart, marqueeEnd);
      if (hasExtent) {
        const inBoxRacks = layout.racks.filter((r) => r.x < x1 + r.width && r.x + r.width > x0 && r.y < y1 + r.height && r.y + r.height > y0);
        const rowIdsInBox = new Set<string>();
        for (const rc of layout.row_containers ?? []) {
          const intersects = rc.slots.some((s: { x: number; y: number; w: number; h: number }) => !(s.x + s.w <= x0 || x1 <= s.x || s.y + s.h <= y0 || y1 <= s.y));
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
        end = getCellFromClientPosition(
          lastMouseRef.current.clientX,
          lastMouseRef.current.clientY,
          rect,
          layout.grid_cols,
          layout.grid_rows
        );
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
  }, [
    marqueeStart,
    marqueeEnd,
    aisleDrawStart,
    layout.racks,
    layout.row_containers,
    layout.grid_cols,
    layout.grid_rows,
    refs,
    setMarqueeStart,
    setMarqueeEnd,
    setAisleDrawStart,
    setSelectedRackIds,
    setSelectedRackId,
    setSelectedRowContainerIds,
    setSelectedRowContainerId,
    setLayout,
  ]);

  return { handleAislePart, handleMarqueePart, handleMouseMove, handleMouseUp };
}
