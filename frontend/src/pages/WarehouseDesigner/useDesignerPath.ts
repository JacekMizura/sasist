import { useMemo, useCallback } from "react";
import { pathDistanceMeters } from "../../components/warehouse/warehouseUtils";

const CELLS_PER_METER_FOR_PATH = 10;

/** S-shape (snake) ordering: sort by row (y), then within each row alternate x direction. */
function orderPointsSShape(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 2) return [...points];
  const byY = new Map<number, { x: number; y: number }[]>();
  for (const p of points) {
    const row = byY.get(p.y) ?? [];
    row.push({ x: p.x, y: p.y });
    byY.set(p.y, row);
  }
  const sortedY = Array.from(byY.keys()).sort((a, b) => a - b);
  const out: { x: number; y: number }[] = [];
  sortedY.forEach((y, rowIndex) => {
    const row = byY.get(y)!;
    row.sort((a, b) => a.x - b.x);
    if (rowIndex % 2 === 1) row.reverse();
    out.push(...row);
  });
  return out;
}

export interface UseDesignerPathParams {
  manualPathPoints: { x: number; y: number }[];
  setManualPathPoints: React.Dispatch<React.SetStateAction<{ x: number; y: number }[]>>;
  setShowPickingPath: React.Dispatch<React.SetStateAction<boolean>>;
  setSnackbar: React.Dispatch<React.SetStateAction<{ message: string; undo?: () => void; undoLabel?: string } | null>>;
}

export function useDesignerPath(params: UseDesignerPathParams) {
  const { manualPathPoints, setManualPathPoints, setShowPickingPath, setSnackbar } = params;

  const sShapePathPoints = useMemo(() => orderPointsSShape(manualPathPoints), [manualPathPoints]);

  const effectivePathPoints = manualPathPoints;
  const pickingPathPoints = effectivePathPoints;

  const pathDistanceM = useMemo(
    () => (pickingPathPoints.length < 2 ? 0 : pathDistanceMeters(pickingPathPoints, CELLS_PER_METER_FOR_PATH)),
    [pickingPathPoints]
  );

  const handleMagicWand = useCallback(() => {
    if (sShapePathPoints.length === 0) return;
    setManualPathPoints([...sShapePathPoints]);
    setShowPickingPath(true);
    setSnackbar({ message: "Ścieżka zoptymalizowana (S-Shape)." });
  }, [sShapePathPoints, setManualPathPoints, setShowPickingPath, setSnackbar]);

  return {
    pickingPathPoints,
    pathDistanceM,
    handleMagicWand,
  };
}
