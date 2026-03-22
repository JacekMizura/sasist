import { useCallback } from "react";
import { LayoutMode } from "../../../warehouse-layout";
import { isCellInsideRack } from "../utils/designerMouseUtils";

import type { RackState } from "../../../types/warehouse";

export interface UsePlacementInteractionParams {
  layout: { grid_cols: number; grid_rows: number; racks: Array<{ x: number; y: number; width: number; height: number; id?: number | string; rack_index?: number }>; aisles: Array<{ x: number; y: number; width: number; height: number }> };
  placementMode: boolean;
  ghostW: number;
  ghostH: number;
  selectedWarehouseId: number | null;
  layoutMode: string;
  /** True only for the Magazyn live map canvas (not Projektant Layoutu). Uses URL + mainView so a stale mainView cannot run map click semantics on the layout canvas. */
  magazynMapInteractions: boolean;
  refs: {
    lastMouseRef: React.MutableRefObject<{ clientX: number; clientY: number } | null>;
    svgRef: React.RefObject<SVGSVGElement | null>;
    rafIdRef: React.MutableRefObject<number>;
  };
  getCellFromEvent: (e: { clientX: number; clientY: number }) => { x: number; y: number } | null;
  setGhostPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setSelectedRackId: React.Dispatch<React.SetStateAction<number | string | null>>;
  setSelectedRackIds: React.Dispatch<React.SetStateAction<Array<number | string>>>;
  setSelectedVisualId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedVisualIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedAisleIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setShowElevationForRackId: React.Dispatch<React.SetStateAction<number | string | null>>;
  stampRackAt: (cell: { x: number; y: number }) => void;
  addSpecialLocation: (cell: { x: number; y: number }, type: "PICK_START" | "PACKING" | "DOCK") => void;
  copyPlacementMode?: boolean;
  copiedRack?: RackState | null;
  placeCopiedRack?: (cell: { x: number; y: number }) => void;
}

export function usePlacementInteraction(params: UsePlacementInteractionParams) {
  const {
    layout,
    placementMode,
    ghostW,
    ghostH,
    selectedWarehouseId,
    layoutMode,
    magazynMapInteractions,
    refs,
    getCellFromEvent,
    setGhostPosition,
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedVisualId,
    setSelectedVisualIds,
    setSelectedAisleIndex,
    setShowElevationForRackId,
    stampRackAt,
    addSpecialLocation,
    copyPlacementMode = false,
    copiedRack = null,
    placeCopiedRack,
  } = params;
  const { lastMouseRef, svgRef, rafIdRef } = refs;
  const copyGhostW = copiedRack?.width ?? ghostW;
  const copyGhostH = copiedRack?.height ?? ghostH;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      if (e.button === 0 && copyPlacementMode && placeCopiedRack) {
        placeCopiedRack(cell);
        return true;
      }
      if (e.button === 0 && selectedWarehouseId != null && (layoutMode === LayoutMode.ADD_START || layoutMode === LayoutMode.ADD_PACK)) {
        const type = layoutMode === LayoutMode.ADD_START ? "PICK_START" : "PACKING";
        addSpecialLocation(cell, type);
        return true;
      }
      if (magazynMapInteractions && e.button === 0) {
        const hit = layout.racks.find((r) => isCellInsideRack(cell, r));
        if (hit) {
          const rid = hit.id ?? hit.rack_index;
          if (rid != null) {
            setSelectedRackId(rid);
            setSelectedRackIds([rid]);
            setShowElevationForRackId(rid);
          }
          setSelectedVisualId(null);
          setSelectedVisualIds([]);
          setSelectedAisleIndex(null);
        } else {
          const aisleIndex = layout.aisles.findIndex((a) => isCellInsideRack(cell, a));
          if (aisleIndex >= 0) {
            setSelectedAisleIndex(aisleIndex);
            setSelectedRackId(null);
            setSelectedRackIds([]);
            setShowElevationForRackId(null);
          } else {
            setSelectedRackId(null);
            setSelectedRackIds([]);
            setSelectedAisleIndex(null);
            setShowElevationForRackId(null);
          }
        }
        return true;
      }
      if (placementMode) {
        stampRackAt(cell);
        return true;
      }
      return false;
    },
    [
      selectedWarehouseId,
      layoutMode,
      magazynMapInteractions,
      layout.racks,
      layout.aisles,
      placementMode,
      copyPlacementMode,
      placeCopiedRack,
      setSelectedRackId,
      setSelectedRackIds,
      setShowElevationForRackId,
      setSelectedVisualId,
      setSelectedVisualIds,
      setSelectedAisleIndex,
      addSpecialLocation,
      stampRackAt,
    ]
  );

  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>, cell: { x: number; y: number } | null) => {
      const inPlacement = placementMode || copyPlacementMode;
      if (!inPlacement || !cell) return;
      const w = copyPlacementMode ? copyGhostW : ghostW;
      const h = copyPlacementMode ? copyGhostH : ghostH;
      if (rafIdRef.current === 0) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = 0;
          const last = lastMouseRef.current;
          if (last && svgRef.current) {
            const c = getCellFromEvent(last);
            if (c) {
              const x = Math.max(0, Math.min(layout.grid_cols - w, c.x));
              const y = Math.max(0, Math.min(layout.grid_rows - h, c.y));
              setGhostPosition((p) => (p?.x === x && p?.y === y ? p : { x, y }));
            }
          }
        });
      }
    },
    [placementMode, copyPlacementMode, layout.grid_cols, layout.grid_rows, ghostW, ghostH, copyGhostW, copyGhostH, refs, getCellFromEvent, setGhostPosition]
  );

  return { handleMouseDown, handleMouseMove };
}
