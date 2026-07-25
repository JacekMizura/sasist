/**
 * Per-warehouse Magazyn / Designer map camera persistence (zoom + pan).
 * Keyed by warehouseId — independent of layout_id.
 */

export const MAP_CAMERA_ZOOM_MIN = 0.2;
export const MAP_CAMERA_ZOOM_MAX = 4;
export const MAP_CAMERA_ZOOM_DEFAULT = 1;

const CAMERA_STORAGE_PREFIX = "warehouse_map_camera_v1_";
/** Legacy zoom-only keys (layout_id). */
const LEGACY_ZOOM_PREFIX = "warehouse_zoom_";

export type WarehouseMapCamera = {
  zoom: number;
  panX: number;
  panY: number;
  scrollLeft: number;
  scrollTop: number;
};

export function emptyMapCamera(zoom = MAP_CAMERA_ZOOM_DEFAULT): WarehouseMapCamera {
  return { zoom, panX: 0, panY: 0, scrollLeft: 0, scrollTop: 0 };
}

export function clampMapZoom(z: number): number {
  if (!Number.isFinite(z)) return MAP_CAMERA_ZOOM_DEFAULT;
  return Math.min(MAP_CAMERA_ZOOM_MAX, Math.max(MAP_CAMERA_ZOOM_MIN, z));
}

function cameraStorageKey(warehouseId: number): string {
  return `${CAMERA_STORAGE_PREFIX}${warehouseId}`;
}

function legacyZoomKey(layoutId: number): string {
  return `${LEGACY_ZOOM_PREFIX}${layoutId}`;
}

function parseCamera(raw: string | null): WarehouseMapCamera | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WarehouseMapCamera>;
    if (typeof parsed.zoom !== "number") return null;
    return {
      zoom: clampMapZoom(parsed.zoom),
      panX: Number.isFinite(parsed.panX) ? Number(parsed.panX) : 0,
      panY: Number.isFinite(parsed.panY) ? Number(parsed.panY) : 0,
      scrollLeft: Number.isFinite(parsed.scrollLeft) ? Number(parsed.scrollLeft) : 0,
      scrollTop: Number.isFinite(parsed.scrollTop) ? Number(parsed.scrollTop) : 0,
    };
  } catch {
    return null;
  }
}

/** Returns saved camera, or null if this warehouse was never opened (auto-fit eligible). */
export function readWarehouseMapCamera(
  warehouseId: number | null,
  legacyLayoutId?: number | null
): WarehouseMapCamera | null {
  if (warehouseId == null || typeof window === "undefined") return null;
  try {
    const fromV1 = parseCamera(localStorage.getItem(cameraStorageKey(warehouseId)));
    if (fromV1) return fromV1;
    if (legacyLayoutId != null) {
      const legacy = localStorage.getItem(legacyZoomKey(legacyLayoutId));
      if (legacy != null) {
        const z = clampMapZoom(parseFloat(legacy));
        return emptyMapCamera(z);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeWarehouseMapCamera(warehouseId: number, camera: WarehouseMapCamera): void {
  if (typeof window === "undefined") return;
  try {
    const payload: WarehouseMapCamera = {
      zoom: clampMapZoom(camera.zoom),
      panX: camera.panX,
      panY: camera.panY,
      scrollLeft: camera.scrollLeft,
      scrollTop: camera.scrollTop,
    };
    localStorage.setItem(cameraStorageKey(warehouseId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearWarehouseMapCamera(warehouseId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(cameraStorageKey(warehouseId));
  } catch {
    /* ignore */
  }
}
