import api from "./axios";
import {
  normalizeCompleteResult,
  normalizeDirectSaleSession,
  normalizeProductSearchHit,
  type DirectSaleCompleteResult,
  type DirectSaleProductSearchHit,
  type DirectSaleSession,
} from "../utils/normalizeDirectSales";

export type { DirectSaleSession, DirectSaleSessionLine, DirectSaleCompleteResult, DirectSaleProductSearchHit } from "../utils/normalizeDirectSales";

export type DirectSaleScanResult = {
  session_id: number;
  line_id: number;
  product_id: number;
  quantity: number;
  suggested_locations: Array<{ location_id: number; suggested_qty?: number; available?: number }>;
};

export async function createDirectSaleSession(params: {
  tenantId: number;
  warehouseId: number;
  workstationId?: number | null;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    "direct-sales/session",
    { workstation_id: params.workstationId ?? null },
    { params: { tenant_id: params.tenantId, warehouse_id: params.warehouseId } },
  );
  return normalizeDirectSaleSession(data);
}

export async function getDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.get(`direct-sales/session/${params.sessionId}`, {
    params: { tenant_id: params.tenantId },
  });
  return normalizeDirectSaleSession(data);
}

export async function searchDirectSaleProducts(params: {
  tenantId: number;
  warehouseId: number;
  q: string;
  limit?: number;
}): Promise<DirectSaleProductSearchHit[]> {
  const { data } = await api.get("direct-sales/products/search", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      q: params.q,
      limit: params.limit ?? 12,
    },
  });
  return Array.isArray(data) ? data.map(normalizeProductSearchHit) : [];
}

export async function scanDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
  code: string;
  quantity?: number;
  sourceLocationId?: number | null;
}): Promise<DirectSaleScanResult> {
  const { data } = await api.post<DirectSaleScanResult>(
    `direct-sales/session/${params.sessionId}/scan`,
    {
      code: params.code,
      quantity: params.quantity ?? 1,
      source_location_id: params.sourceLocationId ?? null,
    },
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}

export async function addProductToDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
  productId: number;
  quantity?: number;
  sourceLocationId?: number | null;
}): Promise<DirectSaleScanResult> {
  const { data } = await api.post<DirectSaleScanResult>(
    `direct-sales/session/${params.sessionId}/add-product`,
    {
      product_id: params.productId,
      quantity: params.quantity ?? 1,
      source_location_id: params.sourceLocationId ?? null,
    },
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}

export async function patchDirectSaleLine(params: {
  tenantId: number;
  sessionId: number;
  lineId: number;
  quantity?: number;
  sourceLocationId?: number | null;
}): Promise<DirectSaleSession> {
  const body: Record<string, number | null> = {};
  if (params.quantity != null) body.quantity = params.quantity;
  if (params.sourceLocationId !== undefined) body.source_location_id = params.sourceLocationId;
  const { data } = await api.patch(`direct-sales/session/${params.sessionId}/lines/${params.lineId}`, body, {
    params: { tenant_id: params.tenantId },
  });
  return normalizeDirectSaleSession(data);
}

export async function deleteDirectSaleLine(params: {
  tenantId: number;
  sessionId: number;
  lineId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.delete(`direct-sales/session/${params.sessionId}/lines/${params.lineId}`, {
    params: { tenant_id: params.tenantId },
  });
  return normalizeDirectSaleSession(data);
}

export async function setDirectSaleCustomer(params: {
  tenantId: number;
  sessionId: number;
  customerId: number | null;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/set-customer`,
    { customer_id: params.customerId },
    { params: { tenant_id: params.tenantId } },
  );
  return normalizeDirectSaleSession(data);
}

export type DirectSaleSuspendedSummary = {
  id: number;
  operator_user_id: number | null;
  operator_label: string | null;
  line_count: number;
  total_amount: number;
  suspended_at: string | null;
  started_at: string | null;
  age_minutes: number | null;
};

export async function listSuspendedDirectSaleSessions(params: {
  tenantId: number;
  warehouseId: number;
  limit?: number;
}): Promise<DirectSaleSuspendedSummary[]> {
  const { data } = await api.get<DirectSaleSuspendedSummary[]>("direct-sales/sessions/suspended", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      limit: params.limit ?? 20,
    },
  });
  return Array.isArray(data) ? data : [];
}

export async function resumeDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/resume`,
    {},
    { params: { tenant_id: params.tenantId } },
  );
  return normalizeDirectSaleSession(data);
}

export async function cancelDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/cancel`,
    {},
    { params: { tenant_id: params.tenantId } },
  );
  return normalizeDirectSaleSession(data);
}

export async function suspendDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/suspend`,
    {},
    { params: { tenant_id: params.tenantId } },
  );
  return normalizeDirectSaleSession(data);
}

export async function startDirectSalePayment(params: {
  tenantId: number;
  sessionId: number;
  paymentMethod?: string;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/start-payment`,
    { payment_method: params.paymentMethod ?? "CASH" },
    { params: { tenant_id: params.tenantId } },
  );
  return normalizeDirectSaleSession(data);
}

export async function completeDirectSaleSession(params: {
  tenantId: number;
  sessionId: number;
  paymentMethod?: string;
  documentSubtype?: string;
}): Promise<DirectSaleCompleteResult> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/complete`,
    {
      payment_method: params.paymentMethod ?? "CASH",
      document_subtype: params.documentSubtype ?? "RECEIPT",
    },
    { params: { tenant_id: params.tenantId } },
  );
  return normalizeCompleteResult(data);
}
