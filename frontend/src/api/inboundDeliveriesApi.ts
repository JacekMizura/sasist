import api from "./axios";

export type DeliveryStatus = "draft" | "ordered" | "in_transit" | "received" | "cancelled";

export type DeliveryItemRead = {
  id: number;
  delivery_id: number;
  product_id?: number | null;
  wm_kind?: "carton" | "packaging" | null;
  wm_id?: string | null;
  wm_name?: string | null;
  product_name?: string | null;
  product_symbol?: string | null;
  product_ean?: string | null;
  product_image_url?: string | null;
  /** Snapshot-first label (products + WM); never ``Produkt #null``. */
  display_name?: string;
  line_item_type?: string | null;
  line_item_ref_id?: string | null;
  item_name?: string | null;
  item_sku?: string | null;
  item_ean?: string | null;
  item_unit?: string | null;
  source_label?: string | null;
  display_sku?: string | null;
  display_ean?: string | null;
  quantity_ordered: number;
  quantity_received: number;
  purchase_price?: number | null;
  purchase_price_net?: number | null;
  vat_rate?: number;
  line_total_value: number;
  line_total_net?: number;
  line_vat_amount?: number;
  line_total_gross?: number;
  purchase_price_manual?: boolean;
  pricing_hint?: string | null;
  pricing_warning?: string | null;
  /** Unit net at qty 1 (list) for savings vs negotiated line price */
  catalog_compare_unit_net?: number | null;
};

export type DeliveryRead = {
  id: number;
  tenant_id: number;
  supplier_id: number;
  supplier_name: string;
  name?: string | null;
  status: DeliveryStatus;
  created_at: string;
  updated_at: string;
  expected_date?: string | null;
  received_at?: string | null;
  notes?: string | null;
  item_count: number;
  total_value: number;
  total_net?: number;
  total_vat?: number;
  total_gross?: number;
  items: DeliveryItemRead[];
};

export type DeliveryListRow = {
  id: number;
  tenant_id: number;
  supplier_id: number;
  supplier_name: string;
  name?: string | null;
  status: DeliveryStatus;
  created_at: string;
  expected_date?: string | null;
  received_at?: string | null;
  item_count: number;
  total_value: number;
  total_net?: number;
  total_vat?: number;
  total_gross?: number;
  items_preview?: string[];
};

export async function listDeliveries(
  tenantId: number,
  params?: {
    supplier_id?: number;
    status?: DeliveryStatus;
    search?: string;
    created_from?: string;
    created_to?: string;
  },
): Promise<DeliveryListRow[]> {
  const res = await api.get<DeliveryListRow[]>("/deliveries/", {
    params: {
      tenant_id: tenantId,
      supplier_id: params?.supplier_id,
      status: params?.status,
      search: params?.search?.trim() || undefined,
      created_from: params?.created_from?.trim() || undefined,
      created_to: params?.created_to?.trim() || undefined,
    },
  });
  return res.data;
}

export async function getDelivery(tenantId: number, id: number): Promise<DeliveryRead> {
  const res = await api.get<DeliveryRead>(`/deliveries/${id}`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function createDelivery(payload: {
  tenant_id: number;
  supplier_id: number;
  name?: string | null;
  status?: DeliveryStatus;
  expected_date?: string | null;
  notes?: string | null;
}): Promise<DeliveryRead> {
  const res = await api.post<DeliveryRead>("/deliveries/", payload);
  return res.data;
}

export async function updateDelivery(
  tenantId: number,
  id: number,
  payload: {
    supplier_id?: number;
    name?: string | null;
    status?: DeliveryStatus;
    expected_date?: string | null;
    notes?: string | null;
  },
): Promise<DeliveryRead> {
  const res = await api.put<DeliveryRead>(`/deliveries/${id}`, payload, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function deleteDelivery(tenantId: number, id: number): Promise<{ deleted: boolean }> {
  const res = await api.delete<{ deleted: boolean }>(`/deliveries/${id}`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function addDeliveryItem(
  tenantId: number,
  deliveryId: number,
  payload:
    | {
        product_id: number;
        quantity_ordered: number;
        purchase_price?: number | null;
        purchase_price_manual?: boolean;
      }
    | {
        wm_kind: "carton" | "packaging";
        wm_id: string;
        quantity_ordered: number;
        purchase_price?: number | null;
        purchase_price_manual?: boolean;
      },
): Promise<DeliveryRead> {
  const res = await api.post<DeliveryRead>(`/deliveries/${deliveryId}/items`, payload, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function removeDeliveryItem(tenantId: number, deliveryId: number, itemId: number): Promise<DeliveryRead> {
  const res = await api.delete<DeliveryRead>(`/deliveries/${deliveryId}/items/${itemId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function patchDeliveryItem(
  tenantId: number,
  deliveryId: number,
  itemId: number,
  payload: {
    quantity_ordered?: number;
    purchase_price?: number | null;
    /** Server recalculates from supplier tiers and clears manual flag */
    restore_catalog_price?: boolean;
  },
): Promise<DeliveryRead> {
  const res = await api.patch<DeliveryRead>(`/deliveries/${deliveryId}/items/${itemId}`, payload, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

/** Assortment: draft purchase order with one line (no warehouse / inventory). */
export async function quickPurchaseOrderFromProduct(payload: {
  tenant_id: number;
  product_id: number;
  supplier_id?: number;
  quantity?: number;
}): Promise<DeliveryRead> {
  const res = await api.post<DeliveryRead>("/deliveries/quick-from-product", payload);
  return res.data;
}

/** Triggers browser download of supplier order PDF (`supplier_order_{id}.pdf`). */
export type StockDocumentItemRead = {
  id: number;
  product_id: number;
  product_name?: string | null;
  product_image_url?: string | null;
  product_ean?: string | null;
  product_sku?: string | null;
  ordered_quantity: number;
  received_quantity: number;
  quantity: number;
  difference: number;
  value_net: number | null;
  purchase_price_net?: number | null;
  vat_rate: number;
  delivery_item_id?: number | null;
};

export type StockDocumentRead = {
  id: number;
  tenant_id: number;
  document_type: string;
  supplier_id: number;
  supplier_name?: string;
  delivery_id: number;
  warehouse_id: number;
  warehouse_name?: string;
  location_id: number;
  location_name?: string;
  status: string;
  receiving_status?: string;
  created_at: string;
  items: StockDocumentItemRead[];
};

export type CreatePzResult = {
  id: number;
  number: string;
  status: "draft";
};

export async function createPzFromDelivery(tenantId: number, deliveryId: number): Promise<CreatePzResult> {
  const res = await api.post<CreatePzResult>(`/deliveries/${deliveryId}/create-pz`, {}, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

/** Same-origin URL for supplier order PDF (axios baseURL). */
export function supplierOrderPdfUrl(tenantId: number, orderId: number): string {
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${base}/supplier-orders/${orderId}/pdf?tenant_id=${tenantId}`;
}

export async function downloadSupplierOrderPdf(tenantId: number, orderId: number): Promise<void> {
  const res = await api.get<Blob>(`/supplier-orders/${orderId}/pdf`, {
    params: { tenant_id: tenantId },
    responseType: "blob",
  });
  const blob = new Blob([res.data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `supplier_order_${orderId}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
