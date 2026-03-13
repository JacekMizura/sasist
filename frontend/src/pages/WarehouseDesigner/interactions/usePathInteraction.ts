import { useCallback } from "react";
import type { LayoutState } from "../../../types/warehouse";
import { isCellInsideRack } from "../utils/designerMouseUtils";

export interface UsePathInteractionParams {
  layout: LayoutState;
  showPickingPath: boolean;
  pathToolActive: boolean;
  manualPathPoints: { x: number; y: number }[];
  draggingPathPointIndex: number | null;
  setManualPathPoints: React.Dispatch<React.SetStateAction<{ x: number; y: number }[]>>;
  setShowPickingPath: (v: boolean) => void;
  setSelectedPathPointIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setSelectedPathLine: (v: boolean) => void;
  setDraggingPathPointIndex: React.Dispatch<React.SetStateAction<number | null>>;
  clearAllSelections: () => void;
}

export function usePathInteraction(params: UsePathInteractionParams) {
  const {
    layout,
    showPickingPath,
    pathToolActive,
    manualPathPoints,
    draggingPathPointIndex,
    setManualPathPoints,
    setShowPickingPath,
    setSelectedPathPointIndex,
    setSelectedPathLine,
    setDraggingPathPointIndex,
    clearAllSelections,
  } = params;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      if (e.button === 0 && showPickingPath && manualPathPoints.length > 0) {
        const pathPoints = manualPathPoints.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
        const pathPointIndex = manualPathPoints.length > 0 ? manualPathPoints.findIndex((p) => Math.abs(p.x + 0.5 - (cell.x + 0.5)) <= 1 && Math.abs(p.y + 0.5 - (cell.y + 0.5)) <= 1) : -1;
        if (pathPointIndex >= 0) {
          setSelectedPathPointIndex(pathPointIndex);
          clearAllSelections();
          setSelectedPathPointIndex(pathPointIndex);
          if (pathToolActive) setDraggingPathPointIndex(pathPointIndex);
          return true;
        }
        const cx = cell.x + 0.5;
        const cy = cell.y + 0.5;
        let lineHitSegmentIndex = -1;
        let insertAt: { x: number; y: number } | null = null;
        if (manualPathPoints.length >= 2) {
          for (let i = 0; i < manualPathPoints.length - 1; i++) {
            const ax = pathPoints[i].x;
            const ay = pathPoints[i].y;
            const bx = pathPoints[i + 1].x;
            const by = pathPoints[i + 1].y;
            const t = Math.max(0, Math.min(1, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
            const px = ax + t * (bx - ax);
            const py = ay + t * (by - ay);
            if (Math.hypot(cx - px, cy - py) <= 1.5) {
              lineHitSegmentIndex = i;
              insertAt = { x: Math.round(px - 0.5), y: Math.round(py - 0.5) };
              break;
            }
          }
        }
        if (pathToolActive && lineHitSegmentIndex >= 0 && insertAt) {
          setManualPathPoints((prev) => {
            const next = [...prev.slice(0, lineHitSegmentIndex + 1), insertAt!, ...prev.slice(lineHitSegmentIndex + 1)];
            return next;
          });
          setSelectedPathPointIndex(lineHitSegmentIndex + 1);
          clearAllSelections();
          setSelectedPathPointIndex(lineHitSegmentIndex + 1);
          setDraggingPathPointIndex(lineHitSegmentIndex + 1);
          return true;
        }
        if (lineHitSegmentIndex >= 0) {
          setSelectedPathLine(true);
          clearAllSelections();
          setSelectedPathLine(true);
          return true;
        }
      }
      setSelectedPathPointIndex(null);
      setSelectedPathLine(false);
      if (pathToolActive && e.button === 0) {
        const pathPointIndex = manualPathPoints.findIndex((p) => Math.abs(p.x - cell.x) <= 1 && Math.abs(p.y - cell.y) <= 1);
        if (pathPointIndex >= 0) {
          setDraggingPathPointIndex(pathPointIndex);
          return true;
        }
        const aisleIdx = layout.aisles.findIndex((a) => isCellInsideRack(cell, a));
        const hitRack = layout.racks.find((r) => isCellInsideRack(cell, r));
        const vs = [...(layout.visual_elements ?? [])].sort((a, b) => b.zIndex - a.zIndex);
        const hitV = vs.find((ve) => isCellInsideRack(cell, ve));
        if (aisleIdx < 0 && !hitRack && !hitV) {
          setManualPathPoints((prev) => [...prev, { x: cell.x, y: cell.y }]);
          setShowPickingPath(true);
          return true;
        }
      }
      return false;
    },
    [
      showPickingPath,
      manualPathPoints,
      pathToolActive,
      layout.aisles,
      layout.racks,
      layout.visual_elements,
      setManualPathPoints,
      setShowPickingPath,
      setSelectedPathPointIndex,
      setSelectedPathLine,
      setDraggingPathPointIndex,
      clearAllSelections,
    ]
  );

  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>, cell: { x: number; y: number } | null) => {
      if (draggingPathPointIndex === null || !cell) return;
      setManualPathPoints((prev) =>
        prev.map((p, i) =>
          i === draggingPathPointIndex
            ? { x: Math.max(0, Math.min(layout.grid_cols - 1, cell.x)), y: Math.max(0, Math.min(layout.grid_rows - 1, cell.y)) }
            : p
        )
      );
    },
    [draggingPathPointIndex, layout.grid_cols, layout.grid_rows, setManualPathPoints]
  );

  const handleMouseUpCleanup = useCallback(() => {
    setDraggingPathPointIndex(null);
  }, [setDraggingPathPointIndex]);

  return { handleMouseDown, handleMouseMove, handleMouseUpCleanup };
}
