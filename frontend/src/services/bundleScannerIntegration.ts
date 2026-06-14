import {
  getComplaintsBundleScan,
  getReturnsBundleScan,
  postPackingBundleScan,
  postPickingBundleScan,
  postBulkStockBundleScan,
  resolveBundleBarcode,
  type BundleScanOut,
} from "../api/bundlesLogisticsApi";
import {
  buildPickingBundleDisplay,
  isBundleBarcodeResolve,
  packingBundleVerifiedMessage,
} from "../utils/bundleScanFlow";

export type PickingBundleScanParams = {
  tenantId: number;
  barcode: string;
  cartId: number;
  sourceStatusId: number;
  orderType: "single" | "multi" | "all";
  locationId?: number | null;
};

export async function tryPickingBundleScan(
  params: PickingBundleScanParams,
): Promise<{ handled: boolean; scan?: BundleScanOut; toast?: string; refresh?: boolean }> {
  const resolved = await resolveBundleBarcode(params.tenantId, params.barcode);
  if (!isBundleBarcodeResolve(resolved)) return { handled: false };

  const scan = await postPickingBundleScan(params.tenantId, {
    barcode: params.barcode,
    cart_id: params.cartId,
    source_status_id: params.sourceStatusId,
    order_type: params.orderType,
    location_id: params.locationId ?? undefined,
  });

  if (!scan.found) {
    return { handled: true, toast: scan.message ?? "Nie rozpoznano kodu bundle." };
  }

  if (scan.action === "pick_stock_line" && scan.order_item_id) {
    return {
      handled: true,
      scan,
      toast: scan.message ?? "Bundle SKU — zebrano.",
      refresh: true,
    };
  }

  if (scan.action === "show_missing_components") {
    const display = buildPickingBundleDisplay(scan);
    const title = display?.title ?? "Pakiet";
    return {
      handled: true,
      scan,
      toast: `${title} — brakujące składniki (bez auto-zaliczania).`,
    };
  }

  return { handled: true, scan, toast: scan.message ?? undefined };
}

export async function tryPackingBundleScan(
  tenantId: number,
  orderId: number,
  barcode: string,
): Promise<{ handled: boolean; scan?: BundleScanOut; toast?: string; packLine?: { orderItemId: number; qty: number } }> {
  const resolved = await resolveBundleBarcode(tenantId, barcode);
  if (!isBundleBarcodeResolve(resolved)) return { handled: false };

  const scan = await postPackingBundleScan(tenantId, orderId, barcode);
  if (!scan.found) return { handled: true, toast: scan.message ?? "Nie rozpoznano bundle." };

  const msg = packingBundleVerifiedMessage(scan);
  if (scan.action === "pack_stock_line" && scan.order_item_id) {
    return {
      handled: true,
      scan,
      toast: msg ?? "Spakowano bundle SKU.",
      packLine: { orderItemId: scan.order_item_id, qty: Math.max(1, Math.floor(scan.quantity)) },
    };
  }

  return { handled: true, scan, toast: msg ?? scan.message ?? undefined };
}

export async function tryReturnsBundleScan(
  tenantId: number,
  barcode: string,
): Promise<{ handled: boolean; scan?: BundleScanOut }> {
  const resolved = await resolveBundleBarcode(tenantId, barcode);
  if (!isBundleBarcodeResolve(resolved)) return { handled: false };
  const scan = await getReturnsBundleScan(tenantId, barcode);
  return { handled: scan.found, scan: scan.found ? scan : undefined };
}

export async function tryComplaintsBundleScan(
  tenantId: number,
  barcode: string,
): Promise<{ handled: boolean; scan?: BundleScanOut }> {
  const resolved = await resolveBundleBarcode(tenantId, barcode);
  if (!isBundleBarcodeResolve(resolved)) return { handled: false };
  const scan = await getComplaintsBundleScan(tenantId, barcode);
  return { handled: scan.found, scan: scan.found ? scan : undefined };
}

export async function executeBulkStockBundleScan(
  tenantId: number,
  barcode: string,
  scanCount: number,
): Promise<{ ok: boolean; message: string; linesComplete: number }> {
  try {
    const out = await postBulkStockBundleScan(tenantId, { barcode, scan_count: scanCount });
    return { ok: true, message: `Zaliczono ${out.lines_complete} linii STOCK.`, linesComplete: out.lines_complete };
  } catch {
    return { ok: false, message: "Kod nie rozpoznany jako STOCK bundle.", linesComplete: 0 };
  }
}
