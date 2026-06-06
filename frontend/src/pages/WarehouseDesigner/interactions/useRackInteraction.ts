import { useCallback, useRef } from "react";
import type { EmptyRowSlot, LayoutState, RackState, RowContainer } from "../../../types/warehouse";
import { rackMatchesSlotRackId, rackPrimaryId } from "../../../components/warehouse/warehouseUtils";
import { pickRackAtCell } from "../utils/designerMouseUtils";

const DRAG_THRESHOLD_PX = 5;
const DOUBLE_CLICK_MS = 400;

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
  magazynMapInteractions: boolean;
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
  setPreviewRackId: React.Dispatch<React.SetStateAction<number | string | null>>;
  setRackPanelDismissed: React.Dispatch<React.SetStateAction<boolean>>;
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
    setPreviewRackId,
    setRackPanelDismissed,
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
  const lastSnapRef = useRef<{ x: number; y: number } | null>(null);
  const pointerDownRef = useRef<{
    rackId: number | string;
    clientX: number;
    clientY: number;
    cell: { x: number; y: number };
    hit: RackState;
  } | null>(null);
  const dragActiveRef = useRef(false);
  const lastClickRef = useRef<{ rackId: number | string; at: number } | null>(null);

  const activateDrag = useCallback(
    (rackId: number | string, hit: RackState, cell: { x: number; y: number }) => {
      dragActiveRef.current = true;
      setDraggingRackId(rackId);
      setDragOffset({ dx: cell.x - hit.x, dy: cell.y - hit.y });
      setRackDragPreviewPosition({ x: hit.x, y: hit.y });
    },
    [setDraggingRackId, setDragOffset, setRackDragPreviewPosition],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      const hit = pickRackAtCell(layout.racks, cell);
      if (!hit) return false;
      const rid = rackPrimaryId(hit);
      if (import.meta.env.DEV && mainView === "layout") {
        console.debug("[designer-rack-click]", { cell, rackId: rid, hitUuid: hit.uuid, hitLabel: (hit.name ?? "").trim() || hit.rack_index });
      }
      if (routeMode) {
        addRackToRoute?.(rid);
        return true;
      }
      pointerDownRef.current = { rackId: rid, clientX: e.clientX, clientY: e.clientY, cell, hit };
      dragActiveRef.current = false;

      if (e.ctrlKey || e.metaKey) {
        setSelectedRackIds((prev) => (prev.includes(rid) ? prev.filter((id) => id !== rid) : [...prev, rid]));
        setSelectedRackId(rid);
        pointerDownRef.current = null;
        return true;
      }

      setSelectedRackId(rid);
      setSelectedRackIds((prev) => (prev.includes(rid) ? prev : [rid]));

      if (magazynMapInteractions) {
        setSelectedRackIdForSideView(rid);
        setSelectedLocationForProducts(null);
        setProductSearchQuery("");
        setShowAllProductsInSidebar(false);
        pointerDownRef.current = null;
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
      setSelectedRackIdForSideView,
      setSelectedLocationForProducts,
      setProductSearchQuery,
      setShowAllProductsInSidebar,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, cell: { x: number; y: number } | null) => {
      if (!cell) return;
      const pending = pointerDownRef.current;
      if (pending && !dragActiveRef.current && draggingRackId == null) {
        const dx = e.clientX - pending.clientX;
        const dy = e.clientY - pending.clientY;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          activateDrag(pending.rackId, pending.hit, pending.cell);
        }
      }
      const activeDragId = draggingRackId ?? (dragActiveRef.current ? pointerDownRef.current?.rackId : null);
      if (activeDragId == null || dragOffset == null) return;

      const desired = { x: cell.x - dragOffset.dx, y: cell.y - dragOffset.dy };
      const anchorRack = layout.racks.find((r) => rackMatchesSlotRackId(r, activeDragId));
      const w = anchorRack?.width ?? 1;
      const h = anchorRack?.height ?? 1;
      if (selectedRackIds.length > 1 && anchorRack) {
        const excludeIds = selectedRackIds;
        const snappedAnchor = snapPos(
          desired,
          w,
          h,
          layout.racks.filter((r) => !selectedRackIds.some((id) => rackMatchesSlotRackId(r, id))),
          layout.grid_cols,
          layout.grid_rows,
          aisleWidthCm,
        );
        setRackDragPreviewPosition(snappedAnchor);
      } else {
        const excludeIds = selectedRackIds.length > 1 ? selectedRackIds : [activeDragId];
        const rowSnap = findSnap(layout.racks, desired.x, desired.y, w, h, activeDragId);
        const freeSnap = snapPos(
          desired,
          w,
          h,
          layout.racks.filter((r) => !excludeIds.some((id) => rackMatchesSlotRackId(r, id))),
          layout.grid_cols,
          layout.grid_rows,
          aisleWidthCm,
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
        if (dist(desired, pos) <= SNAP_THRESHOLD * SNAP_THRESHOLD) lastSnapRef.current = pos;
        else lastSnapRef.current = null;
        setRackDragPreviewPosition(pos);
      }
    },
    [
      draggingRackId,
      dragOffset,
      layout.racks,
      layout.grid_cols,
      layout.grid_rows,
      selectedRackIds,
      aisleWidthCm,
      findSnap,
      snapPos,
      activateDrag,
      setRackDragPreviewPosition,
    ],
  );

  const handleMouseUp = useCallback(() => {
    const wasDrag = dragActiveRef.current || draggingRackId != null;
    const pending = pointerDownRef.current;

    if (!wasDrag && pending && !magazynMapInteractions && !routeMode) {
      const now = Date.now();
      const rid = pending.rackId;
      if (lastClickRef.current && lastClickRef.current.rackId === rid && now - lastClickRef.current.at <= DOUBLE_CLICK_MS) {
        setPreviewRackId(rid);
        setRackPanelDismissed(false);
        lastClickRef.current = null;
      } else {
        lastClickRef.current = { rackId: rid, at: now };
      }
      pointerDownRef.current = null;
      return;
    }

    if (draggingRackId == null) {
      pointerDownRef.current = null;
      dragActiveRef.current = false;
      return;
    }

    const rack = layout.racks.find((r) => rackMatchesSlotRackId(r, draggingRackId));
    const finalPos = rackDragPreviewPosition ?? (rack ? { x: rack.x, y: rack.y } : { x: 0, y: 0 });

    if (selectedRackIds.length > 1 && rack) {
      const groupIds = new Set(selectedRackIds);
      const groupIdStrings = new Set<string>();
      for (const id of selectedRackIds) {
        groupIdStrings.add(String(id));
        const r = layout.racks.find((ra) => rackMatchesSlotRackId(ra, id));
        if (r) {
          groupIdStrings.add(String(r.rack_index));
          if (r.uuid) groupIdStrings.add(String(r.uuid));
        }
      }
      const positions = new Map<number | string, { x: number; y: number }>();
      for (const id of selectedRackIds) {
        const r = layout.racks.find((ra) => rackMatchesSlotRackId(ra, id));
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
              s.rackId != null && groupIdStrings.has(String(s.rackId)) ? { ...s, rackId: undefined } : s,
            ),
          }));
          const newSlotsByRow: RowContainer[] = clearedRowSlots.map((rc) => {
            const { x: startX, y: startY } = getRowStart(rc);
            return { ...rc, slots: computeRowSlotPositions(rc.slots, startX, startY, rc.orientation ?? "horizontal") };
          });
          const updatedRacks = prev.racks.map((r) => {
            let pos = positions.get(rackPrimaryId(r));
            if (pos == null) {
              for (const id of selectedRackIds) {
                if (rackMatchesSlotRackId(r, id)) {
                  pos = positions.get(id);
                  break;
                }
              }
            }
            if (pos) return { ...r, x: pos.x, y: pos.y };
            const slotForRack = newSlotsByRow
              .flatMap((rc) => rc.slots)
              .find((s: { rackId?: number | string }) => s.rackId != null && rackMatchesSlotRackId(r, s.rackId));
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
      const groupIds = new Set<number | string>([draggingRackId]);
      const positions = new Map<number | string, { x: number; y: number }>([[draggingRackId, finalPos]]);
      if (!canPlaceGroup(layout, groupIds, positions)) {
        setRackDragPreviewPosition(null);
        setDraggingRackId(null);
        setDragOffset(null);
        pointerDownRef.current = null;
        dragActiveRef.current = false;
        lastSnapRef.current = null;
        return;
      }
      const rowSlot = findRowAndSlotForRack(layout.row_containers, draggingRackId);
      const emptyAtDrop = findEmptySlotAt(layout.row_containers, finalPos);
      const moveRackWithinRow = moveRackWithinRowRef.current;
      const sameRowDrop =
        rowSlot &&
        emptyAtDrop &&
        emptyAtDrop.rowContainer.id === rowSlot.rowContainer.id &&
        emptyAtDrop.slot.w >= (rack?.width ?? 0) &&
        rowSlot.slotIndex !== emptyAtDrop.slotIndex;
      if (sameRowDrop && moveRackWithinRow) {
        moveRackWithinRow(rowSlot!.rowContainer.id, draggingRackId, rowSlot!.slotIndex, emptyAtDrop!.slotIndex);
      } else if (rowSlot) {
        const currentSlot = rowSlot.rowContainer.slots[rowSlot.slotIndex] as { x: number; y: number; w: number; h: number };
        const stayedInSlot =
          currentSlot &&
          finalPos.x >= currentSlot.x &&
          finalPos.x < currentSlot.x + currentSlot.w &&
          finalPos.y >= currentSlot.y &&
          finalPos.y < currentSlot.y + currentSlot.h;
        if (!stayedInSlot) {
          setLayout((prev) => {
            const rc = prev.row_containers ?? [];
            const row = rc.find((r) => r.id === rowSlot.rowContainer.id);
            if (!row) return prev;
            const { x: startX, y: startY } = getRowStart(row);
            const cleared = row.slots.map((s: { x: number; y: number; w: number; h: number }, i: number) =>
              i === rowSlot.slotIndex ? { x: 0, y: startY, w: s.w, h: s.h } : s,
            );
            const newSlots = computeRowSlotPositions(cleared, startX, startY, row.orientation ?? "horizontal");
            const updatedRacks = prev.racks.map((r) => {
              if (rackMatchesSlotRackId(r, draggingRackId)) return { ...r, x: finalPos.x, y: finalPos.y };
              const slotForRack = newSlots.find(
                (s: { rackId?: number | string }) => s.rackId != null && rackMatchesSlotRackId(r, s.rackId),
              );
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
          const withPosition = {
            ...prev,
            racks: prev.racks.map((r) =>
              rackMatchesSlotRackId(r, draggingRackId) ? { ...r, x: finalPos.x, y: finalPos.y } : r,
            ),
          };
          return { ...withPosition, racks: reindexGeometricRow(withPosition.racks, draggingRackId) } as LayoutState;
        });
      }
      setRackDragPreviewPosition(null);
    }
    setDraggingRackId(null);
    setDragOffset(null);
    pointerDownRef.current = null;
    dragActiveRef.current = false;
    lastSnapRef.current = null;
  }, [
    draggingRackId,
    rackDragPreviewPosition,
    layout,
    selectedRackIds,
    magazynMapInteractions,
    routeMode,
    helpers,
    refs,
    setLayout,
    setDraggingRackId,
    setDragOffset,
    setRackDragPreviewPosition,
    setPreviewRackId,
    setRackPanelDismissed,
  ]);

  return { handleMouseDown, handleMouseMove, handleMouseUp };
}
