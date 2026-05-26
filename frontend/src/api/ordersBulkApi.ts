import api from "./axios";
import type { OrderBulkListFiltersPayload } from "../utils/orderListBulkFilters";

export type OrderBulkSelectionDto =
  | { mode: "explicit_ids"; ids: number[] }
  | { mode: "filtered_query"; filters: OrderBulkListFiltersPayload };

export type OrdersBulkDeleteResult = {
  deleted: number;
  deleted_count: number;
  success_count?: number;
  soft_deleted_count?: number;
  blocked_count: number;
  blocked: { order_id: number; reason: string }[];
  errors: string[];
  skipped_not_found: number;
  messages?: string[];
};

export async function postOrdersBulkDelete(body: {
  tenant_id: number;
  warehouse_id: number;
  selection: OrderBulkSelectionDto;
}): Promise<OrdersBulkDeleteResult> {
  const res = await api.post<OrdersBulkDeleteResult>("/orders/bulk-delete", body);
  return res.data;
}

export async function postOrdersBulkPatch(body: {
  tenant_id: number;
  warehouse_id: number;
  selection: OrderBulkSelectionDto;
  document_type?: string | null;
  shipping_method_id?: string | null;
  internal_note_append?: string | null;
  customer_note_append?: string | null;
  operational_note_append?: string | null;
  priority_color?: "gray" | "blue" | "green" | "yellow" | "orange" | "red" | null;
  payment_method?: string | null;
  payment_status?: string | null;
}): Promise<{ updated: number }> {
  const res = await api.post<{ updated: number }>("/orders/bulk-patch", body);
  return res.data;
}
