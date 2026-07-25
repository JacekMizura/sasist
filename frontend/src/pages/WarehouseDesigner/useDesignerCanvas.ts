import { useCallback, useEffect, useRef, useState } from "react";

import {
  MAP_CAMERA_ZOOM_DEFAULT,
  clampMapZoom,
  emptyMapCamera,
  readWarehouseMapCamera,
  writeWarehouseMapCamera,
  type WarehouseMapCamera,
} from "./warehouseMapCamera";

export type { WarehouseMapCamera };

/**
 * Canvas pan/zoom for Magazyn / Designer.
 * Camera (zoom + pan + scroll) is persisted per `warehouseId`.
 */
export function useDesignerCanvas(
  warehouseId: number | null,
  legacyLayoutId: number | null = null
) {
  const [zoom, setZoomRaw] = useState<number>(MAP_CAMERA_ZOOM_DEFAULT);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  /** True when a stored camera existed for this warehouse (skip auto-fit). */
  const [hasStoredCamera, setHasStoredCamera] = useState(false);
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const skipPersistRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<WarehouseMapCamera>(emptyMapCamera());

  useEffect(() => {
    skipPersistRef.current = true;
    const saved = readWarehouseMapCamera(warehouseId, legacyLayoutId);
    if (saved) {
      setHasStoredCamera(true);
      setZoomRaw(saved.zoom);
      setPan({ x: saved.panX, y: saved.panY });
      setScroll({ left: saved.scrollLeft, top: saved.scrollTop });
      latestRef.current = saved;
    } else {
      setHasStoredCamera(false);
      setZoomRaw(MAP_CAMERA_ZOOM_DEFAULT);
      setPan({ x: 0, y: 0 });
      setScroll({ left: 0, top: 0 });
      latestRef.current = emptyMapCamera();
    }
    setCameraEpoch((e) => e + 1);
  }, [warehouseId, legacyLayoutId]);

  const flushPersist = useCallback(() => {
    if (warehouseId == null) return;
    writeWarehouseMapCamera(warehouseId, latestRef.current);
  }, [warehouseId]);

  const schedulePersist = useCallback(() => {
    if (warehouseId == null) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    if (persistTimerRef.current != null) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      flushPersist();
      setHasStoredCamera(true);
    }, 200);
  }, [warehouseId, flushPersist]);

  useEffect(() => () => {
    if (persistTimerRef.current != null) clearTimeout(persistTimerRef.current);
    flushPersist();
  }, [flushPersist]);

  useEffect(() => {
    latestRef.current = {
      zoom: clampMapZoom(zoom),
      panX: pan.x,
      panY: pan.y,
      scrollLeft: scroll.left,
      scrollTop: scroll.top,
    };
    schedulePersist();
  }, [zoom, pan.x, pan.y, scroll.left, scroll.top, schedulePersist]);

  const setZoom = useCallback((fn: (z: number) => number) => {
    setZoomRaw((prev) => clampMapZoom(fn(prev)));
  }, []);

  const setScrollPosition = useCallback((next: { left: number; top: number }) => {
    setScroll((prev) =>
      prev.left === next.left && prev.top === next.top ? prev : { left: next.left, top: next.top }
    );
  }, []);

  /** Persist immediately after an explicit fit-to-screen. */
  const commitCameraNow = useCallback(
    (camera: WarehouseMapCamera) => {
      const next = {
        zoom: clampMapZoom(camera.zoom),
        panX: camera.panX,
        panY: camera.panY,
        scrollLeft: camera.scrollLeft,
        scrollTop: camera.scrollTop,
      };
      skipPersistRef.current = true;
      setZoomRaw(next.zoom);
      setPan({ x: next.panX, y: next.panY });
      setScroll({ left: next.scrollLeft, top: next.scrollTop });
      latestRef.current = next;
      if (warehouseId != null) {
        writeWarehouseMapCamera(warehouseId, next);
        setHasStoredCamera(true);
      }
    },
    [warehouseId]
  );

  const [cursorCm, setCursorCm] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  return {
    zoom,
    setZoom,
    pan,
    setPan,
    scroll,
    setScrollPosition,
    hasStoredCamera,
    cameraEpoch,
    commitCameraNow,
    cursorCm,
    setCursorCm,
    isPanning,
    setIsPanning,
  };
}
