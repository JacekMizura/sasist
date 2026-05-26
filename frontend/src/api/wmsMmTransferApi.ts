import api from "./axios";
import type { WmsReceivingPzListRow } from "./wmsReceivingApi";
import type { StockDocumentRead } from "./stockDocumentsApi";

export async function listWmsMmRelocation(tenantId: number): Promise<WmsReceivingPzListRow[]> {
  const res = await api.get<WmsReceivingPzListRow[]>("/wms/mm/relocation", {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function getWmsMmRelocationDocument(
  tenantId: number,
  documentId: number,
): Promise<StockDocumentRead> {
  const res = await api.get<StockDocumentRead>(`/wms/mm/relocation/${documentId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function getWmsMmDraft(
  tenantId: number,
  warehouseId: number,
): Promise<StockDocumentRead | null> {
  const res = await api.get<StockDocumentRead | null>("/wms/mm/draft", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data ?? null;
}

export async function appendMmDraftLine(
  tenantId: number,
  body: {
    warehouse_id: number;
    from_location_id: number;
    product_id: number;
    quantity: number;
  },
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>("/wms/mm/draft/lines", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type WmsMmResolveLocation = {
  found: boolean;
  location_id?: number | null;
  location_name?: string;
};

export type WmsMmLocationInventoryRow = {
  product_id: number;
  product_name?: string;
  product_ean?: string | null;
  product_sku?: string | null;
  product_image_url?: string | null;
  quantity_total: number;
  track_batch?: boolean;
  track_expiry?: boolean;
  units_per_carton?: number | null;
};

export async function resolveWmsMmLocation(
  tenantId: number,
  warehouseId: number,
  code: string,
): Promise<WmsMmResolveLocation> {
  const res = await api.get<WmsMmResolveLocation>("/wms/mm/resolve-location", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, code },
  });
  return res.data;
}

export async function fetchWmsMmLocationInventory(
  tenantId: number,
  warehouseId: number,
  locationId: number,
): Promise<WmsMmLocationInventoryRow[]> {
  const res = await api.get<WmsMmLocationInventoryRow[]>("/wms/mm/location-inventory", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, location_id: locationId },
  });
  return res.data;
}

export async function postWmsMmTransfer(
  tenantId: number,
  body: {
    warehouse_id: number;
    from_location_id: number;
    to_location_id: number;
    product_id: number;
    quantity: number;
  },
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>("/wms/mm/transfer", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
