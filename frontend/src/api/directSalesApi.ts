import api from "./axios";
import type { DirectSaleCompletion, DirectSaleHistoryEntry } from "../types/directSalesCompletion";
import { directSalesQuery, type DirectSalesScope } from "../modules/directSales/api/directSalesQueryParams";
import {
  normalizeCompleteResult,
  normalizeDirectSaleSession,
  normalizeProductSearchHit,
  type DirectSaleCompleteResult,
  type DirectSaleProductSearchHit,
  type DirectSaleSession,
} from "../utils/normalizeDirectSales";
import { normalizeCompletion, normalizeHistoryEntry } from "../utils/normalizeDirectSalesCompletion";

export type { DirectSaleSession, DirectSaleSessionLine, DirectSaleCompleteResult, DirectSaleProductSearchHit } from "../utils/normalizeDirectSales";
export type { DirectSalesScope } from "../modules/directSales/api/directSalesQueryParams";

export type DirectSaleScanResult = {
  session_id: number;
  line_id: number;
  product_id: number;
  quantity: number;
  suggested_locations: Array<{ location_id: number; suggested_qty?: number; available?: number }>;
};

export async function createDirectSaleSession(params: DirectSalesScope & {
  workstationId?: number | null;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    "direct-sales/session",
    { workstation_id: params.workstationId ?? null },
    { params: directSalesQuery(params) },
  );
  return normalizeDirectSaleSession(data);
}

export async function getDirectSaleSession(params: DirectSalesScope & {
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.get(`direct-sales/session/${params.sessionId}`, {
    params: directSalesQuery(params),
  });
  return normalizeDirectSaleSession(data);
}

export async function searchDirectSaleProducts(params: DirectSalesScope & {
  q: string;
  limit?: number;
}): Promise<DirectSaleProductSearchHit[]> {
  const { data } = await api.get("direct-sales/products/search", {
    params: {
      ...directSalesQuery(params),
      q: params.q,
      limit: params.limit ?? 12,
    },
  });
  return Array.isArray(data) ? data.map(normalizeProductSearchHit) : [];
}

export async function scanDirectSaleSession(params: DirectSalesScope & {
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
    { params: directSalesQuery(params) },
  );
  return data;
}

export { addProductToDirectSaleSession } from "./directSales/addProductApi";
export { setDirectSaleCustomer, clearDirectSaleCustomer } from "./directSales/setCustomerApi";
export type {
  AddDirectSalesProductParams,
  AddDirectSalesProductRequest,
  SetDirectSalesCustomerRequest,
} from "../modules/directSales/contracts/directSalesContracts";

export async function patchDirectSaleLine(params: DirectSalesScope & {
  sessionId: number;
  lineId: number;
  quantity?: number;
  sourceLocationId?: number | null;
}): Promise<DirectSaleSession> {
  const body: Record<string, number | null> = {};
  if (params.quantity != null) body.quantity = params.quantity;
  if (params.sourceLocationId !== undefined) body.source_location_id = params.sourceLocationId;
  const { data } = await api.patch(`direct-sales/session/${params.sessionId}/lines/${params.lineId}`, body, {
    params: directSalesQuery(params),
  });
  return normalizeDirectSaleSession(data);
}

export async function deleteDirectSaleLine(params: DirectSalesScope & {
  sessionId: number;
  lineId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.delete(`direct-sales/session/${params.sessionId}/lines/${params.lineId}`, {
    params: directSalesQuery(params),
  });
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

export async function listSuspendedDirectSaleSessions(params: DirectSalesScope & {
  limit?: number;
}): Promise<DirectSaleSuspendedSummary[]> {
  const { data } = await api.get<DirectSaleSuspendedSummary[]>("direct-sales/sessions/suspended", {
    params: {
      ...directSalesQuery(params),
      limit: params.limit ?? 20,
    },
  });
  return Array.isArray(data) ? data : [];
}

export async function resumeDirectSaleSession(params: DirectSalesScope & {
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/resume`,
    {},
    { params: directSalesQuery(params) },
  );
  return normalizeDirectSaleSession(data);
}

export async function cancelDirectSaleSession(params: DirectSalesScope & {
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/cancel`,
    {},
    { params: directSalesQuery(params) },
  );
  return normalizeDirectSaleSession(data);
}

export async function suspendDirectSaleSession(params: DirectSalesScope & {
  sessionId: number;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/suspend`,
    {},
    { params: directSalesQuery(params) },
  );
  return normalizeDirectSaleSession(data);
}

export async function startDirectSalePayment(params: DirectSalesScope & {
  sessionId: number;
  paymentMethod?: string;
}): Promise<DirectSaleSession> {
  const { data } = await api.post(
    `direct-sales/session/${params.sessionId}/start-payment`,
    { payment_method: params.paymentMethod ?? "CASH" },
    { params: directSalesQuery(params) },
  );
  return normalizeDirectSaleSession(data);
}

export async function completeDirectSaleSession(params: DirectSalesScope & {
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
    { params: directSalesQuery(params) },
  );
  return normalizeCompleteResult(data);
}

export async function fetchDirectSaleCompletion(params: DirectSalesScope & {
  sessionId: number;
}): Promise<DirectSaleCompletion | null> {
  const { data } = await api.get(`direct-sales/session/${params.sessionId}/completion`, {
    params: directSalesQuery(params),
  });
  return normalizeCompletion(data);
}

export async function fetchDirectSaleHistory(params: DirectSalesScope & {
  todayOnly?: boolean;
  limit?: number;
}): Promise<DirectSaleHistoryEntry[]> {
  const { data } = await api.get<unknown[]>("direct-sales/history", {
    params: {
      ...directSalesQuery(params),
      today_only: params.todayOnly ?? false,
      limit: params.limit ?? 30,
    },
  });
  return Array.isArray(data) ? data.map(normalizeHistoryEntry) : [];
}

export async function reprintDirectSaleDocument(params: DirectSalesScope & {
  jobId: number;
}): Promise<{ new_job_id: number; message: string }> {
  const { data } = await api.post(
    `direct-sales/documents/${params.jobId}/reprint`,
    {},
    { params: directSalesQuery(params) },
  );
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    new_job_id: Number(d.new_job_id) || 0,
    message: String(d.message ?? "Zlecono ponowne generowanie."),
  };
}
