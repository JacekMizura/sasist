import api from "./axios";
import type { StockDocumentRead } from "./stockDocumentsApi";

/** Row from Inventory after putaway (lot key = product + location + batch + expiry). */
export type WmsPutawayInventorySnapshot = {
  product_id: number;
  location_id: number;
  location_uuid: string | null;
  quantity: number;
  batch: string | null;
  expiration_date: string | null;
};

export type WmsPutawayPatchLocationRow = {
  location_id: number;
  code: string;
  quantity: number;
  location_type: string;
  storage_type: string;
  zone?: string | null;
  capacity_type?: string | null;
};

/** PATCH /wms/putaway/{item_id} — line split + full refreshed PZ document. */
export type WmsPutawayPatchResult = {
  item_id: number;
  total_putaway_quantity: number;
  locations: WmsPutawayPatchLocationRow[];
  document: StockDocumentRead;
  inventory_snapshot?: WmsPutawayInventorySnapshot | null;
};

export type WmsPutawaySuggestLocation = {
  location_id: number | null;
  location_name: string | null;
  source: "none" | "existing_stock_lot" | "existing_stock" | "first_location";
};

export type WmsPutawayLocationSuggestionRow = {
  location_id: number;
  code: string;
  current_quantity: number;
  free_capacity: number | null;
  warehouse_zone: string | null;
  priority_score: number;
  location_type: string;
  storage_type: string;
  max_fit_quantity?: number | null;
  remaining_capacity_percent?: number | null;
  same_sku_present?: boolean;
  reason_tags?: string[];
  capacity_fits?: boolean;
  capacity_warnings?: string[];
  total_capacity?: number | null;
  additional_capacity?: number | null;
  utilization_percent?: number | null;
  confidence?: string | null;
  method?: string | null;
  limiting_factor?: string | null;
  limiting_factor_label?: string | null;
  additional_capacity_label?: string | null;
  capacity_ratio_label?: string | null;
};

export type PutawayDistributionAllocation = {
  location_id: number;
  location_code: string;
  current_quantity: number;
  total_capacity: number;
  additional_capacity: number;
  allocated_quantity: number;
  confidence: string;
  reason: string;
  limiting_factor_label?: string | null;
  same_sku_present?: boolean;
};

export type PutawayDistributionPlan = {
  product_id: number;
  warehouse_id: number;
  requested_quantity: number;
  allocated_quantity: number;
  remaining_quantity: number;
  method?: string;
  note?: string;
  warnings?: string[];
  allocations: PutawayDistributionAllocation[];
};

export type WmsPutawayLocationSuggestions = {
  suggested_primary_locations: WmsPutawayLocationSuggestionRow[];
  suggested_overflow_locations: WmsPutawayLocationSuggestionRow[];
  existing_stock_locations: WmsPutawayLocationSuggestionRow[];
  distribution_plan?: PutawayDistributionPlan | null;
};

/** GET /wms/putaway/pz/{documentId} — same shape as GET /stock-documents/{id} (rich putaway_allocations). */
export async function getWmsPutawayPzDocument(tenantId: number, documentId: number): Promise<StockDocumentRead> {
  const res = await api.get<StockDocumentRead>(`/wms/putaway/pz/${documentId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function getWmsPutawaySuggestLocation(
  tenantId: number,
  itemId: number,
): Promise<WmsPutawaySuggestLocation> {
  const res = await api.get<WmsPutawaySuggestLocation>(`/wms/putaway/items/${itemId}/suggest-location`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function getWmsPutawayLocationSuggestions(
  tenantId: number,
  itemId: number,
): Promise<WmsPutawayLocationSuggestions> {
  const res = await api.get<WmsPutawayLocationSuggestions>(
    `/wms/putaway/items/${itemId}/location-suggestions`,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export type WmsPutawayCarrierBulkResult = {
  lines_putaway: number;
  total_quantity: number;
  document: StockDocumentRead;
};

export async function patchWmsPutawayCarrierBulk(
  tenantId: number,
  body: { document_id: number; warehouse_carrier_id: number; location_id: number },
): Promise<WmsPutawayCarrierBulkResult> {
  const res = await api.patch<WmsPutawayCarrierBulkResult>("/wms/putaway/carrier-bulk", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function patchWmsPutawayItem(
  tenantId: number,
  itemId: number,
  body: { location_id: number; quantity: number; warehouse_carrier_id?: number | null },
): Promise<WmsPutawayPatchResult> {
  const res = await api.patch<WmsPutawayPatchResult>(`/wms/putaway/${itemId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

/** Zamknięcie procesu rozlokowania w WMS (ukrywa PZ z listy; bez zmiany stanów). */
export async function finalizeWmsRelocationPz(tenantId: number, documentId: number) {
  const res = await api.patch<StockDocumentRead>(`/wms/relocation/pz/${documentId}/finalize`, {}, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
