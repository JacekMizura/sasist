import api from "./axios";
import type { ProductBulkListFiltersPayload } from "../utils/productListBulkFilters";

export type BulkUpdateAction =
  | "set_manufacturer"
  | "set_supplier"
  | "set_price"
  | "increase_price_percent"
  | "set_vat_rate"
  | "set_weight"
  | "set_dimensions"
  | "set_min_stock"
  | "patch_logistics_fields"
  | "clear_logistics_data"
  | "toggle_master_carton_pack";

export type BulkUpdatePayload =
  | {
      selection_mode: "explicit_ids";
      product_ids: number[];
      action: BulkUpdateAction | string;
      value: unknown;
    }
  | {
      selection_mode: "filtered_query";
      filters: ProductBulkListFiltersPayload;
      action: BulkUpdateAction | string;
      value: unknown;
    };

export type ProductBulkSelectionDto =
  | { mode: "explicit_ids"; ids: number[] }
  | { mode: "filtered_query"; filters: ProductBulkListFiltersPayload };

export type ProductsBulkDeleteResult = {
  success_count: number;
  soft_deleted_count: number;
  blocked_count: number;
  blocked: { order_id?: number; reason?: string; product_id?: number }[];
  errors: string[];
  skipped_not_found: number;
  skipped_already_archived?: number;
  messages: string[];
  deleted: number;
};

export async function bulkUpdateProducts(
  tenantId: number,
  payload: BulkUpdatePayload,
): Promise<{ updated: number; action: string }> {
  const res = await api.post<{ updated: number; action: string }>("/products/bulk-update", payload, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function postProductsBulkDelete(body: {
  tenant_id: number;
  selection: ProductBulkSelectionDto;
}): Promise<ProductsBulkDeleteResult> {
  const res = await api.post<ProductsBulkDeleteResult>("/products/bulk-delete", body);
  return res.data;
}
