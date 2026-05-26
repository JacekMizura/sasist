import api from "./axios";
import type { StockDocumentRead } from "./stockDocumentsApi";

export type WmsProductSearchLocationRow = {
  location_id: number;
  location_code: string;
  quantity: number;
  carrier_code?: string | null;
};

export type WmsProductSearchHit = {
  product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_ean?: string | null;
  product_image_url?: string | null;
  total_quantity: number;
  locations: WmsProductSearchLocationRow[];
  created_in_wms?: boolean;
};

export async function searchWmsProducts(
  tenantId: number,
  warehouseId: number,
  q: string,
  limit = 20,
): Promise<WmsProductSearchHit[]> {
  const res = await api.get<WmsProductSearchHit[]>("/wms/products/search", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, q, limit },
  });
  return res.data;
}

export type WmsCreateMinimalProductBody = {
  name: string;
  ean?: string;
  sku?: string;
  unit?: string;
  create_in_assortment?: boolean;
  pz_id?: number;
};

export type WmsCreateMinimalProductResponse = {
  product_id: number;
  product_name: string;
  product_ean?: string | null;
  document?: StockDocumentRead | null;
};

export async function createWmsMinimalProduct(
  tenantId: number,
  body: WmsCreateMinimalProductBody,
): Promise<WmsCreateMinimalProductResponse> {
  const res = await api.post<WmsCreateMinimalProductResponse>("/wms/products/minimal", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type WmsProductIncompleteRow = {
  product_id: number;
  sku?: string | null;
  ean?: string | null;
  name: string;
  image_url?: string | null;
  location_label?: string | null;
  location_zone?: string | null;
  stock: number;
  missing_fields: string[];
  missing_field_labels: string[];
  required_rules: Record<string, boolean>;
  editable_values: Record<string, unknown>;
  force_wms_completion: boolean;
  /** Legacy aliases */
  product_name?: string;
  product_ean?: string | null;
  product_sku?: string | null;
  warehouse_qty?: number;
  missing_labels?: string[];
};

export type WmsProductIncompleteListOut = {
  items: WmsProductIncompleteRow[];
  total: number;
  without_location_count?: number;
};

export type WmsProductIncompleteScanResolve = {
  product_id: number;
  location_label?: string | null;
};

function normalizeIncompleteReceivingListPayload(raw: unknown): WmsProductIncompleteListOut {
  if (raw == null) {
    return { items: [], total: 0, without_location_count: 0 };
  }
  if (Array.isArray(raw)) {
    return { items: raw as WmsProductIncompleteRow[], total: raw.length, without_location_count: 0 };
  }
  if (typeof raw !== "object") {
    return { items: [], total: 0, without_location_count: 0 };
  }
  const body = raw as Partial<WmsProductIncompleteListOut> & { products?: WmsProductIncompleteRow[] };
  const items = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.products)
      ? body.products
      : [];
  const total =
    typeof body.total === "number" && Number.isFinite(body.total) ? Math.max(0, body.total) : items.length;
  return {
    items,
    total,
    without_location_count:
      typeof body.without_location_count === "number" ? body.without_location_count : 0,
  };
}

export async function listIncompleteReceivingProducts(
  tenantId: number,
  opts?: { warehouseId?: number; limit?: number },
): Promise<WmsProductIncompleteListOut> {
  const res = await api.get<unknown>("/wms/products/incomplete-receiving-data", {
    params: {
      tenant_id: tenantId,
      warehouse_id: opts?.warehouseId,
      limit: opts?.limit ?? 200,
    },
  });
  return normalizeIncompleteReceivingListPayload(res.data);
}

export async function resolveIncompleteProductScan(
  tenantId: number,
  warehouseId: number,
  code: string,
): Promise<WmsProductIncompleteScanResolve> {
  const res = await api.get<WmsProductIncompleteScanResolve>(
    "/wms/products/incomplete-receiving-data/resolve-scan",
    {
      params: { tenant_id: tenantId, warehouse_id: warehouseId, code },
    },
  );
  return res.data;
}
