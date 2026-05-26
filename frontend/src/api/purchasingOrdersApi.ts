import api from "./axios";

export type PoStatus =
  | "Draft"
  | "Sent"
  | "Confirmed"
  | "PartiallyReceived"
  | "Delivered"
  | "Closed"
  | "Cancelled";

export type PurchaseOrderListRow = {
  id: number;
  tenant_id: number;
  warehouse_id?: number | null;
  supplier_id: number;
  supplier_name: string;
  order_number: string;
  status: PoStatus;
  currency: string;
  tax_mode?: string;
  subtotal: number;
  shipping_cost: number;
  total_value: number;
  item_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  expected_date?: string | null;
  sent_at?: string | null;
  confirmed_at?: string | null;
  closed_at?: string | null;
};

export type PurchaseOrderLine = {
  id: number;
  purchase_order_id: number;
  product_id: number;
  product_name?: string | null;
  sku?: string | null;
  ean?: string | null;
  image_url?: string | null;
  qty: number;
  received_qty: number;
  unit_price?: number | null;
  line_total: number;
  notes?: string | null;
  current_stock?: number | null;
  sales_30d?: number | null;
  suggested_qty?: number | null;
  sell_price?: number | null;
  supplier_name?: string | null;
  lead_time_days?: number | null;
};

export type SupplierSnapshot = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  default_currency?: string | null;
  minimum_order_qty?: number | null;
  minimum_order_value?: number | null;
  free_shipping_threshold?: number | null;
  offers_free_shipping?: boolean;
  requires_moq?: boolean;
  lead_time_days?: number | null;
};

export type PurchaseOrderDetail = PurchaseOrderListRow & {
  supplier?: SupplierSnapshot | null;
  notes?: string | null;
  items: PurchaseOrderLine[];
  inbound_delivery_id?: number | null;
  invoice_date?: string | null;
  supplier_invoice_vat_rate_percent?: number;
  fx_basis_date?: string | null;
  fx_rate_to_pln?: number | null;
  fx_rate_effective_date?: string | null;
  fx_source_used?: string | null;
  document_net?: number | null;
  document_vat_supplier?: number | null;
  document_gross?: number | null;
  pln_net_total_sim?: number | null;
  pln_vat_23_sim?: number | null;
  pln_gross_sim?: number | null;
};

export type CreatedOrderBundle = {
  order: PurchaseOrderDetail;
  warnings: string[];
};

export type FromGeneratorResponse = {
  created_orders: CreatedOrderBundle[];
  skipped_product_ids: number[];
  /** Liczba pozycji pominiętych z powodu braku dostawcy w wierszu generatora. */
  skipped_no_supplier_count?: number;
};

export async function createPurchaseOrdersFromGenerator(payload: {
  tenant_id: number;
  warehouse_id?: number | null;
  product_ids: number[];
  override_qty_map?: Record<number, number>;
}): Promise<FromGeneratorResponse> {
  const res = await api.post<FromGeneratorResponse>("/purchasing/orders/from-generator", payload);
  return res.data;
}

export async function listPurchaseOrders(params: {
  tenant_id: number;
  supplier_id?: number | null;
  status?: PoStatus | null;
  page?: number;
  page_size?: number;
}): Promise<{ rows: PurchaseOrderListRow[]; total: number; page: number; page_size: number }> {
  const res = await api.get<{ rows: PurchaseOrderListRow[]; total: number; page: number; page_size: number }>(
    "/purchasing/orders",
    {
      params: {
        tenant_id: params.tenant_id,
        supplier_id: params.supplier_id ?? undefined,
        status: params.status ?? undefined,
        page: params.page ?? 1,
        page_size: params.page_size ?? 50,
      },
    },
  );
  return res.data;
}

export async function getPurchaseOrder(tenantId: number, orderId: number): Promise<PurchaseOrderDetail> {
  const res = await api.get<PurchaseOrderDetail>(`/purchasing/orders/${orderId}`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function patchPurchaseOrder(
  tenantId: number,
  orderId: number,
  body: {
    notes?: string | null;
    expected_date?: string | null;
    shipping_cost?: number | null;
    currency?: string | null;
    invoice_date?: string | null;
    tax_mode?: string | null;
    line_updates?: Array<{
      id: number;
      qty?: number;
      unit_price?: number | null;
      received_qty?: number;
      notes?: string | null;
    }>;
  },
): Promise<PurchaseOrderDetail> {
  const res = await api.patch<PurchaseOrderDetail>(`/purchasing/orders/${orderId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function postPurchasingFxManual(payload: {
  tenant_id: number;
  currency: string;
  rate_date: string;
  rate_to_pln: number;
}): Promise<{ id: number; tenant_id: number | null; currency: string; rate_date: string; rate_to_pln: number; source: string }> {
  const res = await api.post("/purchasing/fx/manual", payload);
  return res.data;
}

export async function postPurchasingFxNbpFetch(params: {
  tenant_id: number;
  currency: string;
  rate_date?: string;
}): Promise<{ id: number; tenant_id: number | null; currency: string; rate_date: string; rate_to_pln: number; source: string }> {
  const res = await api.post("/purchasing/fx/nbp/fetch", null, {
    params: {
      tenant_id: params.tenant_id,
      currency: params.currency,
      rate_date: params.rate_date ?? undefined,
    },
  });
  return res.data;
}

export async function patchPurchaseOrderStatus(
  tenantId: number,
  orderId: number,
  status: PoStatus,
): Promise<PurchaseOrderDetail> {
  const res = await api.patch<PurchaseOrderDetail>(
    `/purchasing/orders/${orderId}/status`,
    { status },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function createInboundDeliveryFromPurchaseOrder(
  tenantId: number,
  orderId: number,
): Promise<{ delivery_id: number; tenant_id: number }> {
  const res = await api.post<{ delivery_id: number; tenant_id: number }>(
    `/purchasing/orders/${orderId}/inbound-delivery`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function deletePurchaseOrder(
  tenantId: number,
  orderId: number,
): Promise<{ action: "deleted" | "archived"; order_id: number; hard_deleted: boolean; blocked_by_pz_receipts?: boolean; status?: string }> {
  const res = await api.delete<{ action: "deleted" | "archived"; order_id: number; hard_deleted: boolean; blocked_by_pz_receipts?: boolean; status?: string }>(
    `/purchasing/orders/${orderId}`,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}
