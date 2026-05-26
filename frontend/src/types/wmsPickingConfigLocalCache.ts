import type { WmsPickingConfigReadApi } from "../api/wmsPickingConfigApi";

const key = (warehouseId: number) => `wms-picking-config-rows:v1:${warehouseId}`;

export function loadCachedPickingConfigRows(warehouseId: number): WmsPickingConfigReadApi[] | null {
  try {
    const raw = localStorage.getItem(key(warehouseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as WmsPickingConfigReadApi[];
  } catch {
    return null;
  }
}

export function saveCachedPickingConfigRows(warehouseId: number, rows: WmsPickingConfigReadApi[]): void {
  try {
    localStorage.setItem(key(warehouseId), JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}
