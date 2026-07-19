/**
 * Canonical WMS physical-scan dispatch contract.
 * Active page handler must return consumed=true to block Scanner Helper generic lookups.
 */

export type WmsScanHandlerResult = {
  /** When true, global dispatcher must NOT run products/search, returns lookup, or other fallbacks. */
  consumed: boolean;
};

export type WmsScanHandler = (
  raw: string,
) => WmsScanHandlerResult | void | boolean | Promise<WmsScanHandlerResult | void | boolean>;

export function normalizeScanHandlerResult(
  result: WmsScanHandlerResult | void | boolean | null | undefined,
): boolean {
  if (result === false) return false;
  if (result === true) return true;
  if (result && typeof result === "object" && "consumed" in result) {
    return Boolean(result.consumed);
  }
  // void / undefined from legacy handlers = treated as consumed (page owned the scan).
  return true;
}

export const SCAN_CONSUMED: WmsScanHandlerResult = { consumed: true };
export const SCAN_NOT_CONSUMED: WmsScanHandlerResult = { consumed: false };

/** Paths where Scanner Helper must not use scan-input as catalog query (workflow owns the code). */
export function isWmsPickingProductsScanPath(pathname: string): boolean {
  return /^\/wms\/picking\/products(\/|$)/.test(pathname);
}
