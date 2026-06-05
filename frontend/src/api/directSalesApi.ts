import api from "./axios";

export type DirectSaleSessionLine = {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number | null;
  discount_amount: number;
  source_location_id: number | null;
  suggested_location_id: number | null;
  sort_order: number;
};

export type DirectSaleSession = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  operator_user_id: number | null;
  workstation_id: number | null;
  operational_zone_id: number | null;
  status: string;
  order_id: number | null;
  issue_strategy: string;
  reservation_scope: string;
  customer_id: number | null;
  expires_at: string | null;
  lines: DirectSaleSessionLine[];
};

export type DirectSaleScanResult = {
  session_id: number;
  line_id: number;
  product_id: number;
  quantity: number;
  suggested_locations: Array<{ location_id: number; suggested_qty?: number; available?: number }>;
};

export type DirectSaleCompleteResult = {
  session_id: number;
  order_id: number;
  payment_id: number;
  document_job_id: number | null;
  document_number: string | null;
  total_amount: number;
};

export async function createDirectSaleSession(params: {
  tenantId: number;
  warehouseId: number;
  workstationId?: number | null;
}): Promise<DirectSaleSession> {
  const { data } = await api.post<DirectSaleSession>(
    "direct-sales/session",
    { workstation_id: params.workstationId ?? null },
    { params: { tenant_id: params.tenantId, warehouse_id: params.warehouseId } },
  );
  return data;
}

export async function getDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.get<DirectSaleSession>(`direct-sales/session/${params.sessionId}`, {
    params: { tenant_id: params.tenantId },
  });
  return data;
}

export async function scanDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
  code: string;
  quantity?: number;
}): Promise<DirectSaleScanResult> {
  const { data } = await api.post<DirectSaleScanResult>(
    `direct-sales/session/${params.sessionId}/scan`,
    { code: params.code, quantity: params.quantity ?? 1 },
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}

export async function suspendDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.post<DirectSaleSession>(
    `direct-sales/session/${params.sessionId}/suspend`,
    {},
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}

export async function startDirectSalePayment(params: {
  tenantId: number;
  sessionId: number;
  paymentMethod?: string;
}): Promise<DirectSaleSession> {
  const { data } = await api.post<DirectSaleSession>(
    `direct-sales/session/${params.sessionId}/start-payment`,
    { payment_method: params.paymentMethod ?? "CASH" },
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}

export async function completeDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
  paymentMethod?: string;
  documentSubtype?: string;
}): Promise<DirectSaleCompleteResult> {
  const { data } = await api.post<DirectSaleCompleteResult>(
    `direct-sales/session/${params.sessionId}/complete`,
    {
      payment_method: params.paymentMethod ?? "CASH",
      document_subtype: params.documentSubtype ?? "RECEIPT",
    },
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}
