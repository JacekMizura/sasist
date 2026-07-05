import api from "./axios";
import type { DocumentCreatedByRead } from "../utils/documentCreatedBy";

export type DocumentSeriesBrief = {
  id?: string | null;
  code: string;
  name?: string | null;
  prefix?: string | null;
};

export type DocumentEditMode = "full" | "metadata" | "none";

export type StockDocumentListRow = {
  id: number;
  tenant_id: number;
  document_type: string;
  document_number?: string | null;
  document_series_prefix?: string | null;
  series?: DocumentSeriesBrief | null;
  order_id?: number | null;
  order_number?: string | null;
  customer_name?: string | null;
  production_order_id?: number | null;
  production_order_number?: string | null;
  delivery_id: number;
  supplier_id: number;
  supplier_name: string;
  warehouse_id?: number | null;
  warehouse_name?: string;
  location_id?: number | null;
  location_name?: string;
  mm_from_location_name?: string;
  mm_to_location_name?: string;
  source_warehouse_id?: number | null;
  destination_warehouse_id?: number | null;
  source_warehouse_name?: string;
  destination_warehouse_name?: string;
  creation_source?: string;
  status: string;
  created_at: string;
  created_by?: DocumentCreatedByRead;
  line_count: number;
  total_ordered?: number;
  total_received?: number;
  receiving_status?: string;
  putaway_status?: string;
  relocation_status?: string;
  warehouse_workflow_status?: string;
  purchase_workflow_status?: string;
  is_fully_received?: boolean;
  is_fully_putaway?: boolean;
  currency?: string;
  total_net?: number | null;
  total_gross?: number | null;
  total_vat?: number | null;
  edit_mode?: DocumentEditMode;
  can_cancel?: boolean;
};

export type ReceivingPzCarrierRead = {
  carrier_id: number;
  code: string;
  barcode: string;
};

export type PutawayAllocationRead = {
  location_id: number;
  location_code: string;
  location_type: string;
  /** Canonical bin type (matches layout / LocationTypeBadge). */
  storage_type?: string;
  quantity: number;
  /** @deprecated same as location_code */
  location_name?: string;
  zone?: string | null;
  capacity_type?: string | null;
};

export type ReceivingScanLogRead = {
  id: number;
  admin_id: number;
  admin_display_name?: string;
  quantity_added: number;
  packaging_type: string;
  cartons_added?: number | null;
  loose_units_added?: number | null;
  created_at: string;
};

export type ReceiptLineType = "product" | "carton" | "packaging_material";

export type StockDocumentItemRead = {
  id: number;
  product_id?: number | null;
  receipt_line_type?: ReceiptLineType | null;
  item_type?: ReceiptLineType | null;
  item_id?: string | null;
  line_unit?: string | null;
  product_name?: string | null;
  product_image_url?: string | null;
  /** Snapshot → catalog; prefer over product_image_url for WMS. */
  image_url?: string | null;
  product_ean?: string | null;
  product_sku?: string | null;
  ordered_quantity: number;
  received_quantity: number;
  quantity: number;
  /** Persisted WMS receiving: cumulative full cartons for this line. */
  cartons_count?: number;
  /** Persisted WMS receiving: cumulative loose units for this line. */
  loose_units_count?: number;
  /** SALEABLE | OUTLET_B | REJECTED_STOCK | … — putaway / damaged bucket. */
  stock_disposition?: string | null;
  batch_number?: string;
  expiry_date?: string | null;
  track_batch?: boolean;
  track_expiry?: boolean;
  track_serial?: boolean;
  quantity_putaway?: number;
  putaway_updated_at?: string | null;
  putaway_last_location_name?: string | null;
  putaway_last_location_type?: string | null;
  putaway_last_admin_id?: number | null;
  putaway_last_operator_name?: string | null;
  putaway_last_quantity?: number | null;
  putaway_allocations?: PutawayAllocationRead[];
  putaway_remaining?: number;
  putaway_completed?: boolean;
  difference: number;
  value_net: number | null;
  unit_price_gross?: number | null;
  value_gross?: number | null;
  purchase_price_net?: number | null;
  vat_rate: number;
  mm_line_from_location_name?: string | null;
  delivery_item_id?: number | null;
  suggested_warehouse_carrier_id?: number | null;
  suggested_warehouse_carrier_barcode?: string | null;
  warehouse_carrier_id?: number | null;
  warehouse_carrier_code?: string | null;
  receiving_scan_logs?: ReceivingScanLogRead[];
  wms_extra_item?: boolean;
  wms_line_status?: string | null;
  wms_line_source?: string | null;
  serial_numbers?: string[];
  serial_range_label?: string | null;
  source_rmz_id?: number | null;
  source_rmz_number?: string | null;
  return_decision?: string | null;
  return_decision_label?: string | null;
  sales_blocked_qty?: number;
  sales_block_effective_qty?: number;
  sales_block_reason_code?: string | null;
  sales_block_reason_label?: string | null;
  sales_block_note?: string | null;
  sales_blocked_at?: string | null;
  sales_blocked_by_user_id?: number | null;
  line_commercial_available_qty?: number;
  line_remaining_qty?: number;
};

export type StockDocumentLinkedSaleDocumentRead = {
  id: string;
  document_number: string;
  document_subtype?: string | null;
  detail_path: string;
};

export type StockDocumentRead = {
  id: number;
  tenant_id: number;
  document_type: string;
  document_number?: string | null;
  document_series_prefix?: string | null;
  series?: DocumentSeriesBrief | null;
  order_id?: number | null;
  order_number?: string | null;
  customer_name?: string | null;
  source_sale_document_id?: string | null;
  linked_sale_document?: StockDocumentLinkedSaleDocumentRead | null;
  production_order_id?: number | null;
  production_order_number?: string | null;
  production_order_path?: string | null;
  production_batch_id?: number | null;
  production_batch_number?: string | null;
  production_batch_path?: string | null;
  supplier_id: number;
  supplier_name?: string;
  delivery_id?: number | null;
  creation_source?: string;
  warehouse_id?: number | null;
  warehouse_name?: string;
  location_id?: number | null;
  location_name?: string;
  mm_from_location_id?: number | null;
  mm_to_location_id?: number | null;
  mm_from_location_name?: string;
  mm_to_location_name?: string;
  source_warehouse_id?: number | null;
  destination_warehouse_id?: number | null;
  source_warehouse_name?: string;
  destination_warehouse_name?: string;
  status: string;
  receiving_status?: string;
  putaway_status?: string;
  relocation_status?: string;
  warehouse_workflow_status?: string;
  purchase_workflow_status?: string;
  is_fully_received?: boolean;
  is_fully_putaway?: boolean;
  total_ordered?: number;
  total_received?: number;
  total_putaway?: number;
  putaway_target_quantity?: number;
  currency?: string;
  total_net?: number | null;
  total_gross?: number | null;
  total_vat?: number | null;
  edit_mode?: DocumentEditMode;
  can_cancel?: boolean;
  can_wms_putaway?: boolean;
  created_at: string;
  updated_at?: string;
  closed_at?: string | null;
  created_by?: DocumentCreatedByRead;
  items: StockDocumentItemRead[];
  receiving_carriers?: ReceivingPzCarrierRead[];
};

export async function listStockDocuments(
  tenantId: number,
  params?: { document_type?: string; warehouse_id?: number },
): Promise<StockDocumentListRow[]> {
  const res = await api.get<StockDocumentListRow[]>("/stock-documents/", {
    params: {
      tenant_id: tenantId,
      document_type: params?.document_type,
      warehouse_id: params?.warehouse_id,
    },
  });
  return res.data;
}

function stockDocQueryParams(tenantId: number, warehouseId?: number) {
  return {
    tenant_id: tenantId,
    ...(warehouseId != null ? { warehouse_id: warehouseId } : {}),
  };
}

export async function getStockDocument(
  tenantId: number,
  documentId: number,
  warehouseId?: number,
): Promise<StockDocumentRead> {
  const res = await api.get<StockDocumentRead>(`/stock-documents/${documentId}`, {
    params: stockDocQueryParams(tenantId, warehouseId),
  });
  return res.data;
}

export async function patchStockDocumentItems(
  tenantId: number,
  documentId: number,
  body: {
    items: { id: number; received_quantity: number; suggested_warehouse_carrier_id?: number | null }[];
  },
  warehouseId?: number,
): Promise<StockDocumentRead> {
  const res = await api.patch<StockDocumentRead>(`/stock-documents/${documentId}`, body, {
    params: stockDocQueryParams(tenantId, warehouseId),
  });
  return res.data;
}

export async function patchStockDocumentReceivingTarget(
  tenantId: number,
  documentId: number,
  body: { warehouse_id: number; location_id: number },
  contextWarehouseId?: number,
): Promise<StockDocumentRead> {
  const res = await api.patch<StockDocumentRead>(`/stock-documents/${documentId}/receiving-target`, body, {
    params: stockDocQueryParams(tenantId, contextWarehouseId),
  });
  return res.data;
}

export async function acceptStockDocument(
  tenantId: number,
  documentId: number,
  warehouseId?: number,
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>(`/stock-documents/${documentId}/accept`, {}, {
    params: stockDocQueryParams(tenantId, warehouseId),
  });
  return res.data;
}

export type StockDocumentHardDeleteResult = { ok: boolean; id: number };

/** Trwałe usunięcie dokumentu (z odwróceniem operacji magazynowych, gdy występują). */
export async function deleteStockDocument(
  tenantId: number,
  documentId: number,
  warehouseId?: number,
): Promise<StockDocumentHardDeleteResult> {
  const res = await api.delete<StockDocumentHardDeleteResult>(`/documents/${documentId}`, {
    params: stockDocQueryParams(tenantId, warehouseId),
  });
  return res.data;
}

export async function duplicateStockDocument(
  tenantId: number,
  documentId: number,
  warehouseId?: number,
): Promise<StockDocumentRead> {
  const res = await api.post<StockDocumentRead>(`/stock-documents/${documentId}/duplicate`, {}, {
    params: stockDocQueryParams(tenantId, warehouseId),
  });
  return res.data;
}

export async function patchStockDocumentMetadata(
  tenantId: number,
  documentId: number,
  body: { currency?: string; total_net?: number | null; total_gross?: number | null },
  warehouseId?: number,
): Promise<StockDocumentRead> {
  const res = await api.patch<StockDocumentRead>(`/stock-documents/${documentId}/metadata`, body, {
    params: stockDocQueryParams(tenantId, warehouseId),
  });
  return res.data;
}

/** Same-origin URL for PDF (axios baseURL). */
export function stockDocumentPdfUrl(tenantId: number, documentId: number, warehouseId?: number): string {
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  const wh = warehouseId != null ? `&warehouse_id=${warehouseId}` : "";
  return `${base}/stock-documents/${documentId}/pdf?tenant_id=${tenantId}${wh}`;
}
