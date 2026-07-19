/**
 * Single choke-point for navigate → `/wms/picking/products/:id`.
 * Physical scan MUST prove PRODUCT_SCAN (quick-pick) before navigate.
 * Click must stay distinct (no pending inventing).
 */

import type { WmsPickingProductsNavState, WmsPickingSessionState } from "../pages/wms/wmsPickingFlowTypes";
import { multiScanTrace } from "./multiPickingScanRoute";

export type PickingDetailNavSource = "physical_scan" | "click" | "pending_resume" | "other";

export type BasketPutPendingSeed = NonNullable<WmsPickingProductsNavState["basketPutPendingSeed"]>;

export type PickingDetailNavigateRequest = {
  productId: number;
  source: PickingDetailNavSource;
  caller: string;
  rawCode?: string | null;
  quickPickCalled: boolean;
  quickPickResponse?: string | null;
  pendingCreated: boolean;
  listProductScanToken?: string | null;
  basketPutPendingSeed?: BasketPutPendingSeed | null;
};

/** HARD CONTRACT (DEFAULT QUANTITY MODE): physical_scan may open detail without pending.
 * Pending is optional (legacy unit-scan). Pick happens only after quantity confirm.
 */
export function assertPhysicalScanNavigateAllowed(req: PickingDetailNavigateRequest): boolean {
  if (req.source !== "physical_scan") return true;
  // If caller claims pending was created, seed must match product.
  if (req.pendingCreated) {
    return (
      req.basketPutPendingSeed != null &&
      Number(req.basketPutPendingSeed.product_id) === Number(req.productId)
    );
  }
  return true;
}

export function buildPickingProductDetailNavState(
  pickingSession: WmsPickingSessionState,
  req: PickingDetailNavigateRequest,
): WmsPickingProductsNavState {
  return {
    pickingSession,
    navigationSource: req.source,
    ...(req.listProductScanToken
      ? { listProductScanToken: req.listProductScanToken }
      : {}),
    ...(req.basketPutPendingSeed
      ? { basketPutPendingSeed: req.basketPutPendingSeed }
      : {}),
  };
}

export function traceNavigateDetail(req: PickingDetailNavigateRequest): void {
  multiScanTrace("NAVIGATE_DETAIL", {
    source: req.source,
    raw_code: req.rawCode ?? null,
    product_id: req.productId,
    quick_pick_called: req.quickPickCalled,
    quick_pick_response: req.quickPickResponse ?? null,
    pending_created: req.pendingCreated,
    caller: req.caller,
    has_seed: Boolean(req.basketPutPendingSeed),
    has_token: Boolean(req.listProductScanToken),
  });
}

/**
 * Returns nav state to pass to navigate(), or null when physical_scan contract fails
 * (caller MUST NOT navigate).
 */
export function preparePickingProductDetailNavigation(
  pickingSession: WmsPickingSessionState,
  req: PickingDetailNavigateRequest,
): WmsPickingProductsNavState | null {
  if (!assertPhysicalScanNavigateAllowed(req)) {
    multiScanTrace("NAVIGATE_DETAIL_BLOCKED", {
      source: req.source,
      raw_code: req.rawCode ?? null,
      product_id: req.productId,
      quick_pick_called: req.quickPickCalled,
      quick_pick_response: req.quickPickResponse ?? null,
      pending_created: req.pendingCreated,
      caller: req.caller,
      reason: "physical_scan_requires_quick_pick_pending",
    });
    return null;
  }
  traceNavigateDetail(req);
  return buildPickingProductDetailNavState(pickingSession, req);
}
