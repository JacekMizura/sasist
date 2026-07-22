/**
 * Pure inventory scan step routing for tests + documentation.
 * Mirrors useWmsInventoryCountTerminal.handleScan decision tree without React.
 */

import {
  INVENTORY_SCAN_NEED_LOCATION,
  isProductLikeCodeOnLocationStep,
  shouldAttemptLocationSwitchOnProductStep,
  type InventoryScanStep,
} from "./inventoryScanRouting";
import { isCarrierBarcode } from "./wmsInventoryExecutionContext";

export type InventoryScanRouteAction =
  | { action: "reject_need_location"; message: string }
  | { action: "confirm_location" }
  | { action: "attach_carrier" }
  | { action: "try_location_switch" }
  | { action: "count_product" }
  | { action: "noop" };

export function routeInventoryScan(opts: {
  step: InventoryScanStep;
  code: string;
  carrierScanMode?: boolean;
  hasTask?: boolean;
}): InventoryScanRouteAction {
  const code = opts.code.trim();
  if (!code || opts.hasTask === false) return { action: "noop" };

  if (opts.step === "location") {
    if (isProductLikeCodeOnLocationStep(code)) {
      return { action: "reject_need_location", message: INVENTORY_SCAN_NEED_LOCATION };
    }
    return { action: "confirm_location" };
  }

  if (opts.carrierScanMode || isCarrierBarcode(code)) {
    return { action: "attach_carrier" };
  }
  if (shouldAttemptLocationSwitchOnProductStep(code)) {
    return { action: "try_location_switch" };
  }
  return { action: "count_product" };
}
