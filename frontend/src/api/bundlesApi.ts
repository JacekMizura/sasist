import api from "./axios";
import type { EntityBulkDeleteResult } from "../types/entityBulkDelete";

export type BundleItemRead = {
  id: number;
  product_id: number;
  quantity: number;
  sort_order: number;
  product_name?: string | null;
  product_sku?: string | null;
  /** Physical stock (inventory sum) for tooltip / breakdown */
  product_stock?: number | null;
  product_purchase_price?: number | null;
  /** Import CSV — JSON z dodatkowymi polami składnika */
  metadata_json?: string | null;
};

export type BundleRead = {
  id: number;
  tenant_id: number;
  name: string;
  sku?: string | null;
  ean?: string | null;
  sale_price?: number | null;
  extra_cost_packaging_net?: number | null;
  production_cost_net?: number | null;
  purchase_cost?: number | null;
  materials_cost?: number | null;
  packaging_cost?: number | null;
  production_cost?: number | null;
  total_cost?: number | null;
  selling_price_net?: number | null;
  selling_price_gross?: number | null;
  margin_value?: number | null;
  margin_percent?: number | null;
  active: boolean;
  image_url?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  weight_kg?: number | null;
  metadata_json?: string | null;
  bundle_fulfillment_mode?: "ON_DEMAND_ASSEMBLY" | "STOCK_PRODUCTION" | string;
  /** @deprecated legacy — use bundle_fulfillment_mode */
  fulfillment_mode?: "assembly" | "manufacturing" | string;
  /** @deprecated legacy — use bundle_fulfillment_mode */
  stock_mode?: "physical" | "virtual" | string;
  /** @internal B1 — ustawiane automatycznie przez backend; nie wysyłać z formularza */
  linked_product_id?: number | null;
  physical_stock?: number | null;
  /** min(floor(stock/qty)) over components */
  calculated_stock?: number | null;
  items: BundleItemRead[];
};

export type BundleItemWrite = {
  product_id: number;
  quantity: number;
  sort_order?: number;
};

export type BundleCreatePayload = {
  tenant_id: number;
  name: string;
  sku?: string | null;
  ean?: string | null;
  sale_price?: number | null;
  extra_cost_packaging_net?: number | null;
  production_cost_net?: number | null;
  active?: boolean;
  image_url?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  weight_kg?: number | null;
  metadata_json?: string | null;
  bundle_fulfillment_mode?: "ON_DEMAND_ASSEMBLY" | "STOCK_PRODUCTION";
  fulfillment_mode?: "assembly" | "manufacturing";
  stock_mode?: "physical" | "virtual";
  items: BundleItemWrite[];
};

export type BundleUpdatePayload = {
  name: string;
  sku?: string | null;
  ean?: string | null;
  sale_price?: number | null;
  extra_cost_packaging_net?: number | null;
  production_cost_net?: number | null;
  active?: boolean;
  image_url?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  weight_kg?: number | null;
  metadata_json?: string | null;
  bundle_fulfillment_mode?: "ON_DEMAND_ASSEMBLY" | "STOCK_PRODUCTION";
  fulfillment_mode?: "assembly" | "manufacturing";
  stock_mode?: "physical" | "virtual";
  items: BundleItemWrite[];
};

export type BundleWarehouseStockRead = {
  name?: string;
  stock_quantity?: number | null;
  unallocated_quantity?: number | null;
  locations_load_incomplete?: boolean;
  inventory?: unknown[];
  disposition_stock?: unknown;
  commercially_sellable_qty?: number | null;
  sales_blocked_qty?: number | null;
  network_commercially_sellable_qty?: number | null;
};

export type BundleListParams = {
  tenantId: number;
  /** Single-field search (e.g. order picker); not used with name+eanSku */
  search?: string;
  name?: string;
  eanSku?: string;
  /** default active */
  activeFilter?: "all" | "active" | "inactive";
  priceMin?: number;
  priceMax?: number;
  stockMin?: number;
  stockMax?: number;
};

export async function getBundleWarehouseStock(
  tenantId: number,
  bundleId: number,
  warehouseId?: number | null,
): Promise<BundleWarehouseStockRead> {
  const res = await api.get<BundleWarehouseStockRead>(`/bundles/${bundleId}/warehouse-stock`, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
    },
  });
  return res.data;
}

export async function listBundles(params: BundleListParams): Promise<BundleRead[]> {
  const {
    tenantId,
    search,
    name,
    eanSku,
    activeFilter = "active",
    priceMin,
    priceMax,
    stockMin,
    stockMax,
  } = params;
  const res = await api.get<BundleRead[]>("/bundles/", {
    params: {
      tenant_id: tenantId,
      search: search?.trim() || undefined,
      name: name?.trim() || undefined,
      ean_sku: eanSku?.trim() || undefined,
      active_filter: activeFilter,
      price_min: priceMin != null && Number.isFinite(priceMin) ? priceMin : undefined,
      price_max: priceMax != null && Number.isFinite(priceMax) ? priceMax : undefined,
      stock_min: stockMin != null && Number.isFinite(stockMin) ? Math.floor(stockMin) : undefined,
      stock_max: stockMax != null && Number.isFinite(stockMax) ? Math.floor(stockMax) : undefined,
    },
  });
  return res.data;
}

export async function getBundle(tenantId: number, bundleId: number): Promise<BundleRead> {
  const res = await api.get<BundleRead>(`/bundles/${bundleId}`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function createBundle(payload: BundleCreatePayload): Promise<BundleRead> {
  const res = await api.post<BundleRead>("/bundles/", payload);
  return res.data;
}

export async function updateBundle(
  tenantId: number,
  bundleId: number,
  payload: BundleUpdatePayload,
): Promise<BundleRead> {
  const res = await api.put<BundleRead>(`/bundles/${bundleId}`, payload, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteBundle(tenantId: number, bundleId: number): Promise<EntityBulkDeleteResult> {
  const res = await api.delete<EntityBulkDeleteResult>(`/bundles/${bundleId}`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function postBundlesBulkDelete(body: {
  tenant_id: number;
  ids: number[];
}): Promise<EntityBulkDeleteResult> {
  const res = await api.post<EntityBulkDeleteResult>("/bundles/bulk-delete", body);
  return res.data;
}
