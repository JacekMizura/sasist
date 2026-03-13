import { useCallback, useEffect } from "react";
import { computePanDelta } from "../utils/designerMouseUtils";

export interface UsePanInteractionParams {
  panStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
  isPanning: boolean;
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  setIsPanning: (v: boolean) => void;
  panMode: boolean;
}

export function usePanInteraction({
  panStartRef,
  isPanning,
  setPan,
  setIsPanning,
  panMode,
}: UsePanInteractionParams) {
  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        panStartRef.current = { x: e.clientX, y: e.clientY };
        setIsPanning(true);
        return true;
      }
      if (panMode && e.button === 0) {
        panStartRef.current = { x: e.clientX, y: e.clientY };
        setIsPanning(true);
        return true;
      }
      return false;
    },
    [panMode, panStartRef, setIsPanning]
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, _cell: { x: number; y: number } | null) => {
      if (!isPanning) return;
      const { movX, movY } = computePanDelta(e.nativeEvent as MouseEvent, panStartRef.current);
      setPan((p) => ({ x: p.x + movX, y: p.y + movY }));
      panStartRef.current = { x: e.clientX, y: e.clientY };
    },
    [isPanning, setPan, panStartRef]
  );

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, [setIsPanning, panStartRef]);

  useEffect(() => {
    const onWindowMouseUp = () => {
      setIsPanning(false);
      panStartRef.current = null;
    };
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, [setIsPanning, panStartRef]);

  useEffect(() => {
    if (!isPanning) return;
    const onWindowMouseMove = (e: MouseEvent) => {
      const { movX, movY } = computePanDelta(e, panStartRef.current);
      setPan((p) => ({ x: p.x + movX, y: p.y + movY }));
      panStartRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onWindowMouseMove);
    return () => window.removeEventListener("mousemove", onWindowMouseMove);
  }, [isPanning, setPan, panStartRef]);

  return { handlePanStart, handlePanMove, handlePanEnd };
}
