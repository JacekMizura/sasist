import { useCallback } from "react";
import { LayoutMode } from "../../../warehouse-layout";
import { isCellInsideRack } from "../utils/designerMouseUtils";

export interface UsePlacementInteractionParams {
  layout: { grid_cols: number; grid_rows: number; racks: Array<{ x: number; y: number; width: number; height: number; id?: number | string; rack_index?: number }>; aisles: Array<{ x: number; y: number; width: number; height: number }> };
  placementMode: boolean;
  ghostW: number;
  ghostH: number;
  selectedWarehouseId: number | null;
  layoutMode: string;
  isLiveView: boolean;
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
}

export function usePlacementInteraction(params: UsePlacementInteractionParams) {
  const {
    layout,
    placementMode,
    ghostW,
    ghostH,
    selectedWarehouseId,
    layoutMode,
    isLiveView,
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
  } = params;
  const { lastMouseRef, svgRef, rafIdRef } = refs;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      if (e.button === 0 && selectedWarehouseId != null && (layoutMode === LayoutMode.ADD_START || layoutMode === LayoutMode.ADD_PACK || layoutMode === LayoutMode.ADD_DOCK)) {
        const type = layoutMode === LayoutMode.ADD_START ? "PICK_START" : layoutMode === LayoutMode.ADD_PACK ? "PACKING" : "DOCK";
        addSpecialLocation(cell, type);
        return true;
      }
      if (isLiveView && e.button === 0) {
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
      isLiveView,
      layout.racks,
      layout.aisles,
      placementMode,
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
      if (!placementMode || !cell) return;
      if (rafIdRef.current === 0) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = 0;
          const last = lastMouseRef.current;
          if (last && svgRef.current) {
            const c = getCellFromEvent(last);
            if (c) {
              const x = Math.max(0, Math.min(layout.grid_cols - ghostW, c.x));
              const y = Math.max(0, Math.min(layout.grid_rows - ghostH, c.y));
              setGhostPosition((p) => (p?.x === x && p?.y === y ? p : { x, y }));
            }
          }
        });
      }
    },
    [placementMode, layout.grid_cols, layout.grid_rows, ghostW, ghostH, refs, getCellFromEvent, setGhostPosition]
  );

  return { handleMouseDown, handleMouseMove };
}
