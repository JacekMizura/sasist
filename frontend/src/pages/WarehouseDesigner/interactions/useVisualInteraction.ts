import { useCallback } from "react";
import type { LayoutState } from "../../../types/warehouse";
import { isCellInsideRack } from "../utils/designerMouseUtils";

export interface UseVisualInteractionParams {
  layout: LayoutState;
  selectedVisualIds: string[];
  draggingVisualId: string | null;
  dragOffsetVisual: { dx: number; dy: number } | null;
  draggingWallEnd: { visualId: string; end: 0 | 1 } | null;
  setSelectedVisualIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedVisualId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedRackId: React.Dispatch<React.SetStateAction<number | string | null>>;
  setSelectedRackIds: React.Dispatch<React.SetStateAction<Array<number | string>>>;
  setSelectedAisleIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setDraggingVisualId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOffsetVisual: React.Dispatch<React.SetStateAction<{ dx: number; dy: number } | null>>;
  setDraggingWallEnd: React.Dispatch<React.SetStateAction<{ visualId: string; end: 0 | 1 } | null>>;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
}

export function useVisualInteraction(params: UseVisualInteractionParams) {
  const {
    layout,
    selectedVisualIds,
    draggingVisualId,
    dragOffsetVisual,
    draggingWallEnd,
    setSelectedVisualIds,
    setSelectedVisualId,
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedAisleIndex,
    setDraggingVisualId,
    setDragOffsetVisual,
    setDraggingWallEnd,
    setLayout,
  } = params;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      if (e.button === 0 && selectedVisualIds.length > 0) {
        const veList = layout.visual_elements ?? [];
        for (const vid of selectedVisualIds) {
          const ve = veList.find((v) => v.id === vid);
          if (ve?.type !== "wall") continue;
          const len = ve.length ?? ve.width;
          const th = ve.thickness ?? ve.height;
          const leftEnd = { x: ve.x, y: ve.y + th / 2 };
          const rightEnd = { x: ve.x + len, y: ve.y + th / 2 };
          if (Math.abs(cell.x - leftEnd.x) <= 1.5 && Math.abs(cell.y - leftEnd.y) <= 1.5) {
            setDraggingWallEnd({ visualId: ve.id, end: 0 });
            return true;
          }
          if (Math.abs(cell.x - rightEnd.x) <= 1.5 && Math.abs(cell.y - rightEnd.y) <= 1.5) {
            setDraggingWallEnd({ visualId: ve.id, end: 1 });
            return true;
          }
        }
      }
      const visuals = [...(layout.visual_elements ?? [])].sort((a, b) => b.zIndex - a.zIndex);
      const hitVisual = visuals.find((ve) => isCellInsideRack(cell, ve));
      if (hitVisual && e.button === 0) {
        if (e.shiftKey) {
          setSelectedVisualIds((prev) =>
            prev.includes(hitVisual.id) ? prev.filter((id) => id !== hitVisual.id) : [...prev, hitVisual.id]
          );
          setSelectedVisualId(hitVisual.id);
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedAisleIndex(null);
          setDraggingVisualId(hitVisual.id);
          setDragOffsetVisual({ dx: cell.x - hitVisual.x, dy: cell.y - hitVisual.y });
        } else {
          setSelectedVisualIds([hitVisual.id]);
          setSelectedVisualId(hitVisual.id);
          setSelectedRackId(null);
          setSelectedRackIds([]);
          setSelectedAisleIndex(null);
          setDraggingVisualId(hitVisual.id);
          setDragOffsetVisual({ dx: cell.x - hitVisual.x, dy: cell.y - hitVisual.y });
        }
        return true;
      }
      return false;
    },
    [
      layout.visual_elements,
      selectedVisualIds,
      setSelectedVisualIds,
      setSelectedVisualId,
      setSelectedRackId,
      setSelectedRackIds,
      setSelectedAisleIndex,
      setDraggingVisualId,
      setDragOffsetVisual,
      setDraggingWallEnd,
    ]
  );

  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>, cell: { x: number; y: number } | null) => {
      if (draggingVisualId != null && dragOffsetVisual != null && cell) {
        const ve = layout.visual_elements?.find((v) => v.id === draggingVisualId);
        if (ve) {
          const desired = { x: cell.x - dragOffsetVisual.dx, y: cell.y - dragOffsetVisual.dy };
          const w = ve.width;
          const h = ve.height;
          const pos = {
            x: Math.max(0, Math.min(layout.grid_cols - w, Math.round(desired.x))),
            y: Math.max(0, Math.min(layout.grid_rows - h, Math.round(desired.y))),
          };
          setLayout((prev) => ({
            ...prev,
            visual_elements: (prev.visual_elements ?? []).map((el) => (el.id === draggingVisualId ? { ...el, x: pos.x, y: pos.y } : el)),
          }));
        }
      }
      if (draggingWallEnd != null && cell) {
        const ve = (layout.visual_elements ?? []).find((v) => v.id === draggingWallEnd.visualId);
        if (ve && ve.type === "wall") {
          const len = ve.length ?? ve.width;
          if (draggingWallEnd.end === 0) {
            const newX = Math.max(0, Math.min(ve.x + len - 1, Math.round(cell.x)));
            const newLen = ve.x + len - newX;
            setLayout((prev) => ({
              ...prev,
              visual_elements: (prev.visual_elements ?? []).map((el) => (el.id === ve.id ? { ...el, x: newX, width: Math.max(1, newLen), length: Math.max(1, newLen) } : el)),
            }));
          } else {
            const newLen = Math.max(1, Math.round(cell.x - ve.x));
            setLayout((prev) => ({
              ...prev,
              visual_elements: (prev.visual_elements ?? []).map((el) => (el.id === ve.id ? { ...el, width: newLen, length: newLen } : el)),
            }));
          }
        }
      }
    },
    [draggingVisualId, dragOffsetVisual, draggingWallEnd, layout.visual_elements, layout.grid_cols, layout.grid_rows, setLayout]
  );

  const handleMouseUpCleanup = useCallback(() => {
    setDraggingVisualId(null);
    setDragOffsetVisual(null);
    setDraggingWallEnd(null);
  }, [setDraggingVisualId, setDragOffsetVisual, setDraggingWallEnd]);

  return { handleMouseDown, handleMouseMove, handleMouseUpCleanup };
}
