import api from "./axios";
import type { StockDocumentRead } from "./stockDocumentsApi";
import type { DocumentCreatedByRead } from "../utils/documentCreatedBy";

export type { StockDocumentRead };

export type WmsReceivingPzListRow = {
  id: number;
  number: string;
  status: string;
  created_at: string;
  updated_at: string;
  total_ordered: number;
  total_received: number;
  receiving_status: string;
  putaway_status?: string;
  relocation_status?: string;
  is_fully_received?: boolean;
  is_fully_putaway?: boolean;
  carrier_count?: number;
  total_putaway?: number;
  putaway_target_quantity?: number;
  creation_source?: string;
  supplier_name?: string;
  created_by?: DocumentCreatedByRead;
  /** stock_documents.document_type — PZ | Z_PZ | … */
  document_type?: string;
  is_return_receipt?: boolean;
};

export type WmsCreateReceivingPzBody = {
  supplier_name: string;
  supplier_id?: number;
};

export async function createWmsReceivingPz(
  tenantId: number,
  body: WmsCreateReceivingPzBody,
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>("/wms/receiving/pz", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type WmsEnsureProductLineResponse = {
  document: StockDocumentRead;
  item_id: number;
  auto_received: boolean;
};

export async function ensureWmsReceivingPzProductLine(
  tenantId: number,
  pzId: number,
  productId: number,
): Promise<WmsEnsureProductLineResponse> {
  const res = await api.post<WmsEnsureProductLineResponse>(
    `/wms/receiving/pz/${pzId}/ensure-product`,
    { product_id: productId },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export type WmsCreateReceivingProductBody = {
  name: string;
  ean?: string;
  sku?: string;
  unit?: string;
  create_in_assortment?: boolean;
};

export async function createWmsReceivingProduct(
  tenantId: number,
  pzId: number,
  body: WmsCreateReceivingProductBody,
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>(
    `/wms/receiving/pz/${pzId}/create-product`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function listWmsReceivingPz(tenantId: number): Promise<WmsReceivingPzListRow[]> {
  const res = await api.get<WmsReceivingPzListRow[]>("/wms/receiving/pz", {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

/** Rozlokowanie: PZ z otwartym procesem (relocation_status ≠ DONE) */
export async function listWmsPutawayPz(tenantId: number): Promise<WmsReceivingPzListRow[]> {
  const res = await api.get<WmsReceivingPzListRow[]>("/wms/putaway/pz", {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function finishWmsReceivingPz(
  tenantId: number,
  pzId: number,
  body: { items: { id: number; received_quantity: number }[] },
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>(`/wms/receiving/pz/${pzId}/finish`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function postWmsReceive(
  tenantId: number,
  body: { pz_id: number; lines: { pz_item_id: number; quantity: number }[] },
) {
  const res = await api.post("/wms/receive", body, { params: { tenant_id: tenantId } });
  return res.data;
}

export type ReceivingScanResolve = {
  found: boolean;
  product_id?: number | null;
  default_quantity: number;
  match_kind?: string | null;
  product_name?: string | null;
  product_ean?: string | null;
  image_url?: string | null;
  track_batch?: boolean;
  track_expiry?: boolean;
  track_serial?: boolean;
  parsed_serial?: string | null;
  parsed_batch?: string | null;
  parsed_expiry?: string | null;
  is_gs1?: boolean;
  requires_data_completion?: boolean;
  receiving_data_complete?: boolean;
  missing_data_labels?: string[];
};

export type WmsReceiveSerialBody = {
  product_id: number;
  serial_number: string;
  batch_number?: string;
  expiry_date?: string;
  warehouse_carrier_id?: number;
  raw_scan?: string;
};

export async function receiveWmsPzSerial(
  tenantId: number,
  pzId: number,
  body: WmsReceiveSerialBody,
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>(`/wms/receiving/pz/${pzId}/receive-serial`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function resolveWmsReceivingScan(tenantId: number, ean: string): Promise<ReceivingScanResolve> {
  const res = await api.get<ReceivingScanResolve>("/wms/receiving/resolve-scan", {
    params: { tenant_id: tenantId, ean },
  });
  return res.data;
}

export type WmsReceivingItemPatchBody = {
  /** Amount to add on this save; backend merges rows by lot. */
  quantity_received: number;
  batch_number: string | null;
  expiry_date: string | null;
  /** Full cartons counted on this save (delta). */
  cartons_count: number;
  /** Loose retail units counted on this save (delta). */
  loose_units_count: number;
  /** Przyjęcie na nośnik (stan na rampie z carrier_id). */
  warehouse_carrier_id?: number | null;
};

/** Add qty to a lot row (or create one). Draft PZ only; no inventory. */
export type WmsReceivingMarkDamagedBody = {
  quantity: number;
  damage_type?: string;
  description?: string;
  photo_urls?: string[];
};

/** Transfer saleable received qty into damaged bucket (REJECTED_STOCK) on draft PZ. */
export type WmsReceivingMoveCarrierBody = {
  warehouse_carrier_id?: number | null;
};

export async function postWmsReceivingPzItemMoveCarrier(
  tenantId: number,
  pzId: number,
  itemId: number,
  body: WmsReceivingMoveCarrierBody,
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>(
    `/wms/receiving/pz/${pzId}/items/${itemId}/move-carrier`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function postWmsReceivingPzItemMarkDamaged(
  tenantId: number,
  pzId: number,
  itemId: number,
  body: WmsReceivingMarkDamagedBody,
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>(
    `/wms/receiving/pz/${pzId}/items/${itemId}/mark-damaged`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function patchWmsReceivingPzItemQuantity(
  tenantId: number,
  pzId: number,
  itemId: number,
  body: WmsReceivingItemPatchBody,
): Promise<StockDocumentRead> {
  const res = await api.patch<StockDocumentRead>(`/wms/receiving/pz/${pzId}/items/${itemId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type PostReceivingPzCarriersBody =
  | { warehouse_carrier_id: number }
  | {
      bulk_create: {
        group_id: number;
        prefix: string;
        quantity: number;
        location_id?: number | null;
      };
    };

/** Przypisz istniejący nośnik do PZ lub utwórz serię (bulk) i przypisz wszystkie. */
export async function postReceivingPzCarriers(
  tenantId: number,
  pzId: number,
  body: PostReceivingPzCarriersBody,
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>(`/wms/receiving/pz/${pzId}/carriers`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
