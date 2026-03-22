import { useCallback, useRef } from "react";
import type { EmptyRowSlot, LayoutState, RackState, RowContainer } from "../../../types/warehouse";
import { isCellInsideRack } from "../utils/designerMouseUtils";

export interface RackInteractionHelpers {
  findSnapToRowPosition: (racks: RackState[], x: number, y: number, w: number, h: number, excludeId?: number | string) => { x: number; y: number } | null;
  snapPosition: (desired: { x: number; y: number }, w: number, h: number, racks: RackState[], gridCols: number, gridRows: number, aisleWidthCm: number) => { x: number; y: number };
  canPlaceGroup: (layout: LayoutState, groupIds: Set<number | string>, positions: Map<number | string, { x: number; y: number }>) => boolean;
  getRowStart: (row: RowContainer) => { x: number; y: number };
  computeRowSlotPositions: (slots: EmptyRowSlot[], startX: number, startY: number, orientation?: "horizontal" | "vertical") => EmptyRowSlot[];
  filterEmptyRowContainers: (rows: RowContainer[] | undefined) => RowContainer[];
  findRowAndSlotForRack: (rowContainers: LayoutState["row_containers"], rackId: number | string) => { rowContainer: RowContainer; slotIndex: number } | null;
  findEmptySlotAt: (rowContainers: LayoutState["row_containers"], cell: { x: number; y: number }) => { rowContainer: RowContainer; slot: EmptyRowSlot; slotIndex: number } | null;
  reindexGeometricRow: (racks: RackState[], refRackId: number | string) => RackState[];
}

export interface UseRackInteractionParams {
  layout: LayoutState;
  draggingRackId: number | string | null;
  dragOffset: { dx: number; dy: number } | null;
  selectedRackIds: Array<number | string>;
  rackDragPreviewPosition: { x: number; y: number } | null;
  /** Magazyn live map only — never run side-view / product-sidebar side effects on the layout designer canvas. */
  magazynMapInteractions: boolean;
  /** For dev logging only (Projektant vs Magazyn tab). */
  mainView: "magazyn" | "layout";
  aisleWidthCm: number;
  routeMode?: boolean;
  addRackToRoute?: (rackId: number | string) => void;
  refs: {
    moveRackWithinRowRef: React.MutableRefObject<((rowId: string, rackId: number | string, fromSlotIndex: number, toSlotIndex: number) => void) | null>;
  };
  helpers: RackInteractionHelpers;
  setSelectedRackId: React.Dispatch<React.SetStateAction<number | string | null>>;
  setSelectedRackIds: React.Dispatch<React.SetStateAction<Array<number | string>>>;
  setDraggingRackId: React.Dispatch<React.SetStateAction<number | string | null>>;
  setDragOffset: React.Dispatch<React.SetStateAction<{ dx: number; dy: number } | null>>;
  setRackDragPreviewPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  setSelectedRackIdForSideView: React.Dispatch<React.SetStateAction<number | string | null>>;
  setSelectedLocationForProducts: React.Dispatch<React.SetStateAction<{ level_index: number; segment_index: number } | null>>;
  setProductSearchQuery: (v: string) => void;
  setShowAllProductsInSidebar: (v: boolean) => void;
}

export function useRackInteraction(params: UseRackInteractionParams) {
  const {
    layout,
    draggingRackId,
    dragOffset,
    selectedRackIds,
    rackDragPreviewPosition,
    magazynMapInteractions,
    mainView,
    aisleWidthCm,
    routeMode = false,
    addRackToRoute,
    refs,
    helpers,
    setSelectedRackId,
    setSelectedRackIds,
    setDraggingRackId,
    setDragOffset,
    setRackDragPreviewPosition,
    setLayout,
    setSelectedRackIdForSideView,
    setSelectedLocationForProducts,
    setProductSearchQuery,
    setShowAllProductsInSidebar,
  } = params;
  const { findSnapToRowPosition: findSnap, snapPosition: snapPos, canPlaceGroup, getRowStart, computeRowSlotPositions, filterEmptyRowContainers, findRowAndSlotForRack, findEmptySlotAt, reindexGeometricRow } = helpers;
  const { moveRackWithinRowRef } = refs;
  // Sticky snapping: keep last snapped position until user moves clearly away.
  const lastSnapRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      const hit = layout.racks.find((r) => isCellInsideRack(cell, r));
      if (!hit) return false;
      const rid = hit.id ?? hit.rack_index;
      if (routeMode) {
        addRackToRoute?.(rid);
        return true;
      }
      if (e.ctrlKey || e.metaKey) {
        setSelectedRackIds((prev) => (prev.includes(rid) ? prev.filter((id) => id !== rid) : [...prev, rid]));
        setSelectedRackId(rid);
      } else {
        setSelectedRackId(rid);
        setSelectedRackIds((prev) => (prev.includes(rid) ? prev : [rid]));
        setDraggingRackId(rid);
        setDragOffset({ dx: cell.x - hit.x, dy: cell.y - hit.y });
        setRackDragPreviewPosition({ x: hit.x, y: hit.y });
        /* Magazyn live map only: mousedown selects rack + side context; cancel rack drag (map is not for moving racks). */
        if (magazynMapInteractions) {
          if (import.meta.env.DEV) {
            console.log("RACK CLICK", { selectedRackId: rid, mainView, magazynMapInteractions: true });
          }
          setSelectedRackIdForSideView(rid);
          setSelectedLocationForProducts(null);
          setProductSearchQuery("");
          setShowAllProductsInSidebar(false);
          setDraggingRackId(null);
        } else if (import.meta.env.DEV) {
          console.log("RACK CLICK", { selectedRackId: rid, mainView, magazynMapInteractions: false });
        }
      }
      return true;
    },
    [
      layout.racks,
      routeMode,
      addRackToRoute,
      magazynMapInteractions,
      mainView,
      setSelectedRackId,
      setSelectedRackIds,
      setDraggingRackId,
      setDragOffset,
      setRackDragPreviewPosition,
      setSelectedRackIdForSideView,
      setSelectedLocationForProducts,
      setProductSearchQuery,
      setShowAllProductsInSidebar,
    ]
  );

  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>, cell: { x: number; y: number } | null) => {
      if (draggingRackId == null || dragOffset == null || !cell) return;
      const desired = { x: cell.x - dragOffset.dx, y: cell.y - dragOffset.dy };
      const anchorRack = layout.racks.find((r) => (r.id ?? r.rack_index) === draggingRackId);
      const w = anchorRack?.width ?? 1;
      const h = anchorRack?.height ?? 1;
      if (selectedRackIds.length > 1 && anchorRack) {
        const excludeIds = selectedRackIds.length > 1 ? selectedRackIds : [draggingRackId];
        const snappedAnchor = snapPos(
          desired,
          w,
          h,
          layout.racks.filter((r) => !excludeIds.includes(r.id ?? r.rack_index)),
          layout.grid_cols,
          layout.grid_rows,
          aisleWidthCm
        );
        setRackDragPreviewPosition(snappedAnchor);
      } else {
        const excludeIds = selectedRackIds.length > 1 ? selectedRackIds : [draggingRackId];
        const rowSnap = findSnap(layout.racks, desired.x, desired.y, w, h, draggingRackId);
        const freeSnap = snapPos(
          desired,
          w,
          h,
          layout.racks.filter((r) => !excludeIds.includes(r.id ?? r.rack_index)),
          layout.grid_cols,
          layout.grid_rows,
          aisleWidthCm
        );
        const SNAP_THRESHOLD = 3.5;
        const RELEASE_BUFFER = 1.0;
        const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        let pos: { x: number; y: number };
        const last = lastSnapRef.current;
        if (last && dist(desired, last) <= (SNAP_THRESHOLD + RELEASE_BUFFER) * (SNAP_THRESHOLD + RELEASE_BUFFER)) {
          pos = last;
          setRackDragPreviewPosition(pos);
          return;
        }
        if (rowSnap && dist(desired, rowSnap) <= SNAP_THRESHOLD * SNAP_THRESHOLD) {
          pos = { x: rowSnap.x, y: rowSnap.y };
        } else if (dist(desired, freeSnap) <= SNAP_THRESHOLD * SNAP_THRESHOLD) {
          pos = freeSnap;
        } else {
          pos = freeSnap;
        }
        // Lock snap if we are within threshold (prevents micro-jitter and micro-gaps).
        if (dist(desired, pos) <= SNAP_THRESHOLD * SNAP_THRESHOLD) lastSnapRef.current = pos;
        else lastSnapRef.current = null;
        setRackDragPreviewPosition(pos);
      }
    },
    [draggingRackId, dragOffset, layout.racks, layout.grid_cols, layout.grid_rows, selectedRackIds, aisleWidthCm, findSnap, snapPos, setRackDragPreviewPosition]
  );

  const handleMouseUp = useCallback(() => {
    if (draggingRackId == null) return;
    const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === draggingRackId);
    const finalPos = rackDragPreviewPosition ?? (rack ? { x: rack.x, y: rack.y } : { x: 0, y: 0 });
    if (selectedRackIds.length > 1 && rack) {
      const groupIds = new Set(selectedRackIds);
      const groupIdStrings = new Set<string>();
      for (const id of selectedRackIds) {
        groupIdStrings.add(String(id));
        const r = layout.racks.find((ra) => String(ra.id ?? ra.rack_index) === String(id));
        if (r) groupIdStrings.add(String(r.rack_index));
      }
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
          const clearedRowSlots: RowContainer[] = (prev.row_containers ?? []).map((rc) => ({
            ...rc,
            slots: rc.slots.map((s: EmptyRowSlot) =>
              s.rackId != null && groupIdStrings.has(String(s.rackId)) ? { ...s, rackId: undefined } : s
            ),
          }));
          const newSlotsByRow: RowContainer[] = clearedRowSlots.map((rc) => {
            const { x: startX, y: startY } = getRowStart(rc);
            return { ...rc, slots: computeRowSlotPositions(rc.slots, startX, startY, rc.orientation ?? "horizontal") };
          });
          const updatedRacks = prev.racks.map((r) => {
            const pos = positions.get(r.id ?? r.rack_index);
            if (pos) return { ...r, x: pos.x, y: pos.y };
            const slotForRack = newSlotsByRow.flatMap((rc) => rc.slots).find((s: { rackId?: number | string }) => s.rackId != null && String(s.rackId) === String(r.id ?? r.rack_index));
            if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
            return r;
          });
          return {
            ...prev,
            racks: updatedRacks,
            row_containers: filterEmptyRowContainers(newSlotsByRow),
          } as LayoutState;
        });
      }
      setRackDragPreviewPosition(null);
    } else {
      // Validate single-rack placement before committing any position changes.
      const groupIds = new Set<number | string>([draggingRackId]);
      const positions = new Map<number | string, { x: number; y: number }>([[draggingRackId, finalPos]]);
      if (!canPlaceGroup(layout, groupIds, positions)) {
        setRackDragPreviewPosition(null);
        setDraggingRackId(null);
        setDragOffset(null);
        return;
      }
      const rowSlot = findRowAndSlotForRack(layout.row_containers, draggingRackId);
      const emptyAtDrop = findEmptySlotAt(layout.row_containers, finalPos);
      const moveRackWithinRow = moveRackWithinRowRef.current;
      const sameRowDrop = rowSlot && emptyAtDrop && emptyAtDrop.rowContainer.id === rowSlot.rowContainer.id
        && (emptyAtDrop.slot.w >= (rack?.width ?? 0)) && rowSlot.slotIndex !== emptyAtDrop.slotIndex;
      if (sameRowDrop && moveRackWithinRow) {
        moveRackWithinRow(rowSlot!.rowContainer.id, draggingRackId, rowSlot!.slotIndex, emptyAtDrop!.slotIndex);
      } else if (rowSlot) {
        const currentSlot = rowSlot.rowContainer.slots[rowSlot.slotIndex] as { x: number; y: number; w: number; h: number };
        const stayedInSlot = currentSlot && finalPos.x >= currentSlot.x && finalPos.x < currentSlot.x + currentSlot.w
          && finalPos.y >= currentSlot.y && finalPos.y < currentSlot.y + currentSlot.h;
        if (!stayedInSlot) {
          setLayout((prev) => {
            const rc = prev.row_containers ?? [];
            const row = rc.find((r) => r.id === rowSlot.rowContainer.id);
            if (!row) return prev;
            const { x: startX, y: startY } = getRowStart(row);
            const cleared = row.slots.map((s: { x: number; y: number; w: number; h: number }, i: number) =>
              i === rowSlot.slotIndex ? { x: 0, y: startY, w: s.w, h: s.h } : s
            );
            const newSlots = computeRowSlotPositions(cleared, startX, startY, row.orientation ?? "horizontal");
            const updatedRacks = prev.racks.map((r) => {
              if ((r.id ?? r.rack_index) === draggingRackId) return { ...r, x: finalPos.x, y: finalPos.y };
              const slotForRack = newSlots.find((s: { rackId?: number | string }) => s.rackId != null && String(s.rackId) === String(r.id ?? r.rack_index));
              if (slotForRack) return { ...r, x: slotForRack.x, y: slotForRack.y };
              return r;
            });
            return {
              ...prev,
              racks: reindexGeometricRow(updatedRacks, draggingRackId),
              row_containers: rc.map((r) => (r.id === rowSlot.rowContainer.id ? { ...r, slots: newSlots } : r)),
            } as LayoutState;
          });
        }
      } else {
        setLayout((prev) => {
          const withPosition = { ...prev, racks: prev.racks.map((r) => (r.id ?? r.rack_index) === draggingRackId ? { ...r, x: finalPos.x, y: finalPos.y } : r) };
          return { ...withPosition, racks: reindexGeometricRow(withPosition.racks, draggingRackId) } as LayoutState;
        });
      }
      setRackDragPreviewPosition(null);
    }
    setDraggingRackId(null);
    setDragOffset(null);
    lastSnapRef.current = null;
  }, [draggingRackId, rackDragPreviewPosition, layout, selectedRackIds, helpers, refs, setLayout, setDraggingRackId, setDragOffset, setRackDragPreviewPosition]);

  return { handleMouseDown, handleMouseMove, handleMouseUp };
}
