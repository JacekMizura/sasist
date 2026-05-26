import { useCallback, useEffect, useRef, useState } from "react";

/** Must stay aligned with `WarehouseCanvas` MIN/MAX zoom. */
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2;
const ZOOM_DEFAULT = 1;

const ZOOM_STORAGE_PREFIX = "warehouse_zoom_";

function zoomStorageKey(layoutId: number): string {
  return `${ZOOM_STORAGE_PREFIX}${layoutId}`;
}

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function readStoredZoom(layoutId: number | null): number {
  if (layoutId == null || typeof window === "undefined") return ZOOM_DEFAULT;
  try {
    const raw = localStorage.getItem(zoomStorageKey(layoutId));
    if (raw == null) return ZOOM_DEFAULT;
    return clampZoom(parseFloat(raw));
  } catch {
    return ZOOM_DEFAULT;
  }
}

/**
 * Canvas pan/zoom for the warehouse designer. Zoom is persisted per `layout_id` in localStorage.
 */
export function useDesignerCanvas(layoutId: number | null) {
  const [zoom, setZoomRaw] = useState<number>(ZOOM_DEFAULT);
  const skipPersistAfterHydrateRef = useRef(false);

  useEffect(() => {
    skipPersistAfterHydrateRef.current = true;
    setZoomRaw(readStoredZoom(layoutId));
  }, [layoutId]);

  useEffect(() => {
    if (layoutId == null || typeof window === "undefined") return;
    if (skipPersistAfterHydrateRef.current) {
      skipPersistAfterHydrateRef.current = false;
      return;
    }
    try {
      localStorage.setItem(zoomStorageKey(layoutId), String(clampZoom(zoom)));
    } catch {
      /* quota / private mode */
    }
  }, [zoom, layoutId]);

  const setZoom = useCallback((fn: (z: number) => number) => {
    setZoomRaw((prev) => clampZoom(fn(prev)));
  }, []);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cursorCm, setCursorCm] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  return {
    zoom,
    setZoom,
    pan,
    setPan,
    cursorCm,
    setCursorCm,
    isPanning,
    setIsPanning,
  };
}
