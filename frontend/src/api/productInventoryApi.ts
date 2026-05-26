import axios from "axios";
import api from "./axios";

export type ProductInventoryRowApi = {
  inventory_id?: number | null;
  inventory_serial_ids?: number[];
  location_id: number;
  location_code: string;
  location_type: string;
  quantity: number;
  batch?: string | null;
  expiry?: string | null;
  serial_range_label?: string | null;
  serial_numbers?: string[];
  warehouse_id?: number;
  location_uuid?: string | null;
  stock_disposition?: string | null;
  disposition_badge?: string | null;
  warehouse_carrier_id?: number | null;
  carrier_code?: string | null;
  carrier_barcode?: string | null;
  carrier_is_mixed?: boolean;
};

export type PatchProductInventoryTraceabilityBody = {
  inventory_id?: number | null;
  inventory_serial_ids?: number[];
  batch_number?: string | null;
  expiry_date?: string | null;
  serial_number?: string | null;
  confirm_merge?: boolean;
};

export async function patchProductInventoryTraceability(
  tenantId: number,
  productId: number,
  body: PatchProductInventoryTraceabilityBody,
): Promise<ProductInventoryRowApi[]> {
  const res = await api.patch<{ inventory: ProductInventoryRowApi[] }>(
    `/products/${productId}/inventory-traceability/`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data.inventory ?? [];
}

export function inventoryTraceabilityErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: unknown } | undefined;
    const det = d?.detail;
    if (typeof det === "string" && det.trim()) return det.trim();
    if (det && typeof det === "object" && !Array.isArray(det)) {
      const msg = (det as { message?: string }).message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}

export function isInventoryIdentityConflict(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 409) return false;
  const d = err.response.data as { detail?: { code?: string } } | undefined;
  return d?.detail?.code === "IDENTITY_CONFLICT";
}
