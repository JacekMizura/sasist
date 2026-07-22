/**
 * Inventory count scan routing — step context + global classifyWmsScanCode.
 * Progress/lifecycle of counting is separate; this only decides how a raw scan
 * is interpreted on location vs product steps.
 */

import { classifyWmsScanCode, type WmsScanKind } from "@/utils/wmsScanClassify";
import { normalizeScanEan } from "@/utils/wmsScanNormalize";
import { SCAN_CONSUMED, type WmsScanHandlerResult } from "@/utils/wmsScanDispatch";

export const INVENTORY_SCAN_NEED_LOCATION = "Najpierw zeskanuj lokalizację";

export type InventoryScanStep = "location" | "product";

export function isWmsInventoryCountPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/wms/inventory-count" || p.startsWith("/wms/inventory-count/");
}

/** Document entry (Krok 1) or terminal before location confirmed. */
export function isWmsInventoryLocationStepPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (/^\/wms\/inventory-count\/d\/\d+$/.test(p)) return true;
  return false;
}

export function isWmsInventoryTerminalPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return /^\/wms\/inventory-count\/d\/\d+\/count\/\d+$/.test(p);
}

/** Emulator footer label when inventory owns the scan handler. */
export function inventoryScanReceiverLabel(hasScanHandler: boolean): string {
  return hasScanHandler ? "Inwentaryzacja" : "Brak aktywnego odbiorcy";
}

/** Product-like codes must not activate a location on the location step. */
export function isProductLikeCodeOnLocationStep(raw: string): boolean {
  const kind = classifyWmsScanCode(raw);
  return kind === "ean_gtin";
}

/**
 * On product step: try location switch first when code looks like a location.
 * Ambiguous alphanumeric SKUs are location_like — caller falls back to product
 * resolve when location API does not find a match.
 */
export function shouldAttemptLocationSwitchOnProductStep(raw: string): boolean {
  const kind = classifyWmsScanCode(raw);
  return kind === "location_like";
}

export function inventoryScanKind(raw: string): WmsScanKind {
  return classifyWmsScanCode(raw);
}

export function normalizeInventoryScanCode(raw: string): string {
  return normalizeScanEan(raw);
}

export function inventoryScanConsumed(): WmsScanHandlerResult {
  return SCAN_CONSUMED;
}
