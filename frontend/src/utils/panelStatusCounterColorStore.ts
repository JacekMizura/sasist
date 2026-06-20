import { isValidPanelStatusHex } from "./panelStatusColor";

/** Moduł panelu statusów — warstwa UX bez zmian API. */
export type PanelStatusCounterColorModule = "orders" | "returns" | "complaints";

const STORAGE_PREFIX = "panelUiStatusCounterColor.v1";

function storageKey(module: PanelStatusCounterColorModule, tenantId: number, warehouseId: number): string {
  return `${STORAGE_PREFIX}:${module}:${tenantId}:${warehouseId}`;
}

function readMap(
  module: PanelStatusCounterColorModule,
  tenantId: number,
  warehouseId: number,
): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(module, tenantId, warehouseId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(
  module: PanelStatusCounterColorModule,
  tenantId: number,
  warehouseId: number,
  map: Record<string, string>,
): void {
  localStorage.setItem(storageKey(module, tenantId, warehouseId), JSON.stringify(map));
}

export function getPanelStatusCounterColor(
  module: PanelStatusCounterColorModule,
  tenantId: number,
  warehouseId: number,
  statusId: number,
): string | null {
  const hex = readMap(module, tenantId, warehouseId)[String(statusId)];
  if (hex && isValidPanelStatusHex(hex)) return hex;
  return null;
}

export function setPanelStatusCounterColor(
  module: PanelStatusCounterColorModule,
  tenantId: number,
  warehouseId: number,
  statusId: number,
  hex: string | null,
): void {
  const map = readMap(module, tenantId, warehouseId);
  const key = String(statusId);
  if (hex && isValidPanelStatusHex(hex)) {
    map[key] = hex.trim().toLowerCase();
  } else {
    delete map[key];
  }
  writeMap(module, tenantId, warehouseId, map);
}
