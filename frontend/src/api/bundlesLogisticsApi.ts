import api from "./axios";

export type BundleBarcodeResolveOut = {
  found: boolean;
  match_kind?: string | null;
  barcode: string;
  bundle_id?: number | null;
  bundle_name?: string | null;
  bundle_fulfillment_mode?: string | null;
  product_id?: number | null;
  linked_product_id?: number | null;
  is_stock_logistic_sku?: boolean;
};

export type BundleScanComponentOut = {
  order_item_id: number;
  product_id: number;
  product_name: string;
  quantity_required: number;
  quantity_picked: number;
  quantity_to_pick: number;
  bundle_component_index?: number | null;
  pick_done: boolean;
};

export type BundleScanOut = {
  found: boolean;
  domain: string;
  barcode: string;
  match_kind?: string | null;
  bundle_id?: number | null;
  bundle_name?: string | null;
  bundle_fulfillment_mode?: string | null;
  action?: string | null;
  product_id?: number | null;
  order_id?: number | null;
  order_item_id?: number | null;
  quantity: number;
  missing_components: BundleScanComponentOut[];
  bundle_verified: boolean;
  message?: string | null;
  traceability_links: Record<string, string | null>;
  return_tree_order_ids: number[];
};

export type BundlePickingScanBody = {
  barcode: string;
  cart_id: number;
  source_status_id: number;
  order_type: "single" | "multi" | "all";
  location_id?: number | null;
};

export type ConsolidationRackBundleRowOut = {
  order_id: number;
  order_number: string;
  bundle_id: number;
  bundle_name: string;
  fulfillment_mode: string;
  display_mode: string;
  ean?: string | null;
  sku?: string | null;
  quantity: number;
  product_id?: number | null;
  product_name?: string | null;
  shelf_label?: string | null;
};

export async function resolveBundleBarcode(
  tenantId: number,
  barcode: string,
): Promise<BundleBarcodeResolveOut> {
  const res = await api.get<BundleBarcodeResolveOut>("/bundles/logistics/resolve-barcode", {
    params: { tenant_id: tenantId, barcode },
  });
  return res.data;
}

export async function postPickingBundleScan(
  tenantId: number,
  body: BundlePickingScanBody,
): Promise<BundleScanOut> {
  const res = await api.post<BundleScanOut>("/bundles/logistics/picking/scan", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function postPackingBundleScan(
  tenantId: number,
  orderId: number,
  barcode: string,
): Promise<BundleScanOut> {
  const res = await api.post<BundleScanOut>(
    `/bundles/logistics/packing/scan/${orderId}`,
    { barcode },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function getReturnsBundleScan(
  tenantId: number,
  barcode: string,
): Promise<BundleScanOut> {
  const res = await api.get<BundleScanOut>("/bundles/logistics/returns/resolve-barcode", {
    params: { tenant_id: tenantId, barcode },
  });
  return res.data;
}

export async function getComplaintsBundleScan(
  tenantId: number,
  barcode: string,
): Promise<BundleScanOut> {
  const res = await api.get<BundleScanOut>("/bundles/logistics/complaints/resolve-barcode", {
    params: { tenant_id: tenantId, barcode },
  });
  return res.data;
}

export async function getConsolidationRackBundleView(
  orderId: number,
  shelfLabel?: string,
): Promise<ConsolidationRackBundleRowOut[]> {
  const res = await api.get<ConsolidationRackBundleRowOut[]>(
    `/bundles/logistics/consolidation-rack/${orderId}`,
    { params: { shelf_label: shelfLabel || undefined } },
  );
  return res.data;
}

export type BundleBulkStockScanBody = {
  barcode: string;
  scan_count: number;
};

export type BundleBulkStockScanOut = {
  scans: BundleScanOut[];
  lines_complete: number;
  target_scans: number;
};

export async function postBulkStockBundleScan(
  tenantId: number,
  body: BundleBulkStockScanBody,
): Promise<BundleBulkStockScanOut> {
  const res = await api.post<BundleBulkStockScanOut>("/bundles/logistics/picking/bulk-stock-scan", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function postSingleBulkStockScan(
  tenantId: number,
  barcode: string,
): Promise<BundleScanOut> {
  const out = await postBulkStockBundleScan(tenantId, { barcode, scan_count: 1 });
  return out.scans[0] ?? { found: false, domain: "picking", barcode, quantity: 0, missing_components: [], bundle_verified: false, traceability_links: {}, return_tree_order_ids: [] };
}
