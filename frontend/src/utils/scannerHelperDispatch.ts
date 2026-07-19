/**
 * Testable mirror of Scanner Helper → global workflow dispatch entry.
 * DevScannerPanel.performScan / Enter / SKANUJ all call handleScan(raw);
 * handleScan awaits the registered page handler and honors {consumed}.
 *
 * Tests MUST start here — never call the list handler in isolation as the
 * "physical scan" entry point.
 */

import {
  normalizeScanHandlerResult,
  type WmsScanHandler,
  type WmsScanHandlerResult,
} from "./wmsScanDispatch";
import { multiScanTrace } from "./multiPickingScanRoute";

export type ScannerHelperDispatchResult = {
  consumed: boolean;
  /** True when a workflow handler was present. */
  hadHandler: boolean;
  /** True when generic catalog lookup would be allowed (consumed=false path). */
  allowGenericCatalog: boolean;
};

/**
 * Same sequence as WmsScannerContext.handleScan (workflow branch) after
 * Scanner Helper performScan(code):
 * GLOBAL_SCAN_RECEIVED → await handler → consumed gate.
 */
export async function dispatchScannerHelperWorkflowScan(opts: {
  rawCode: string;
  pathname: string;
  handler: WmsScanHandler | null;
  pickingProductsPath?: boolean;
  /** When caller already emitted GLOBAL_SCAN_RECEIVED (e.g. WmsScannerContext). */
  skipReceivedTrace?: boolean;
}): Promise<ScannerHelperDispatchResult> {
  const ean = opts.rawCode.trim();
  if (!ean) {
    return { consumed: true, hadHandler: false, allowGenericCatalog: false };
  }

  if (!opts.skipReceivedTrace) {
    multiScanTrace("GLOBAL_SCAN_RECEIVED", {
      raw_code: ean,
      path: opts.pathname,
      has_handler: Boolean(opts.handler),
      picking_products_path: Boolean(opts.pickingProductsPath),
      via: "scanner_helper_dispatch",
    });
  }

  if (!opts.handler) {
    multiScanTrace("GLOBAL_SCAN_NO_HANDLER", {
      raw_code: ean,
      path: opts.pathname,
      via: "scanner_helper_dispatch",
    });
    return { consumed: false, hadHandler: false, allowGenericCatalog: true };
  }

  const result = await Promise.resolve(opts.handler(ean));
  const consumed = normalizeScanHandlerResult(result as WmsScanHandlerResult | void | boolean);
  multiScanTrace("GLOBAL_SCAN_DISPATCHED", {
    raw_code: ean,
    consumed,
    path: opts.pathname,
    via: "scanner_helper_dispatch",
  });

  return {
    consumed,
    hadHandler: true,
    /** Catalog products/search + returns lookup MUST NOT run when consumed. */
    allowGenericCatalog: !consumed,
  };
}

/**
 * Scanner Helper performScan: history append is caller's concern;
 * this is the submit/Enter/SKANUJ → dispatch entry used by tests.
 */
export async function performScannerHelperScan(opts: {
  rawCode: string;
  pathname: string;
  handler: WmsScanHandler | null;
  pickingProductsPath?: boolean;
  /** Simulated catalog side-channel (products/search). Must stay at 0 when consumed. */
  onGenericCatalogLookup?: (code: string) => void;
}): Promise<ScannerHelperDispatchResult> {
  const dispatched = await dispatchScannerHelperWorkflowScan({
    rawCode: opts.rawCode,
    pathname: opts.pathname,
    handler: opts.handler,
    pickingProductsPath: opts.pickingProductsPath,
  });
  if (dispatched.allowGenericCatalog) {
    opts.onGenericCatalogLookup?.(opts.rawCode.trim());
  }
  return dispatched;
}
