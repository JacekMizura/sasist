import api from "./axios";

import type {
  CustomerInsightsRead,
  OrderLookupHit,
  ReturnStatusRead,
  WmsReturnCreate,
  WmsReturnLineProcess,
  WmsReturnLineSplitProcess,
  WmsReturnListItem,
  WmsReturnRead,
  WmsSettingsRead,
  WmsSettingsSave,
  WmsRefundCreate,
} from "../types/wmsReturn";
import type { AppliedReturnListFilters } from "../components/returns/returnList/returnListFilterTypes";

const tenantOnly = (tenantId: number) => ({ tenant_id: tenantId });

/** Trim i usuń wiodące znaki # (np. „#13” → „13”). Pełna normalizacja ORD-/RET- jest po stronie API. */
export function normalizeWmsReturnsSearchQuery(raw: string): string {
  let t = raw.trim();
  while (t.startsWith("#")) {
    t = t.slice(1).trim();
  }
  return t;
}

export async function lookupOrdersForWms(
  q: string,
  tenantId: number,
  warehouseId?: number | null,
): Promise<OrderLookupHit[]> {
  console.log("returns lookup start", q);
  const params: Record<string, string | number> = { tenant_id: tenantId, q };
  if (warehouseId != null && Number.isFinite(warehouseId) && warehouseId > 0) {
    params.warehouse_id = warehouseId;
  }
  try {
    const res = await api.get<OrderLookupHit[]>("wms/returns/orders/lookup", { params });
    console.log("returns lookup response", res.data);
    return Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    console.error("returns lookup failed", error);
    throw error;
  }
}

export async function listWmsReturnsForOrder(orderId: number, tenantId: number): Promise<WmsReturnListItem[]> {
  const res = await api.get<WmsReturnListItem[]>(`wms/returns/orders/${orderId}/returns`, {
    params: tenantOnly(tenantId),
  });
  return Array.isArray(res.data) ? res.data : [];
}

export type WmsReturnsSidebarPanelArg =
  | undefined
  | { kind: "unassigned" }
  | { kind: "sub"; subStatusId: number }
  | { kind: "group"; mainGroup: "NEW" | "IN_PROGRESS" | "DONE" };

/**
 * Office overview: all RMZ documents (newest first, server-limited).
 * Pass `warehouseId` when known — must match `getReturnUiStatusSummary` or sidebar counts vs list diverge.
 * When `filters.panelStatusIds` is non-empty, sidebar panel query params are omitted (same rule as Orders).
 */
/** Operational work-queue tab keys (Orders → Returns list); mirrored in backend RETURN_QUEUE_TAB_KEYS. */
export const RETURN_OPERATIONAL_QUEUE_KEYS = [
  "wszystkie",
  "nowe",
  "w_toku",
  "do_decyzji",
  "uszkodzone",
  "odrzucone",
  "rozliczone",
  "refundacje",
  "reklamacje",
] as const;

export type ReturnOperationalQueueKey = (typeof RETURN_OPERATIONAL_QUEUE_KEYS)[number];

export type WmsReturnQueueCountsRead = {
  counts: Partial<Record<ReturnOperationalQueueKey, number>>;
};

export async function getWmsReturnQueueCounts(args: {
  tenantId: number;
  warehouseId?: number | null;
  sidebarPanel: WmsReturnsSidebarPanelArg;
  filters: AppliedReturnListFilters;
}): Promise<WmsReturnQueueCountsRead> {
  const { tenantId, warehouseId, sidebarPanel, filters } = args;
  const params: Record<string, string | number | boolean> = { tenant_id: tenantId };
  if (warehouseId != null && Number.isFinite(warehouseId) && warehouseId > 0) {
    params.warehouse_id = warehouseId;
  }

  if (filters.panelStatusIds.length > 0) {
    params.panel_ui_status_ids = filters.panelStatusIds.join(",");
  } else if (sidebarPanel?.kind === "unassigned") {
    params.panel_ui_unassigned = true;
  } else if (sidebarPanel?.kind === "sub") {
    params.panel_ui_status_id = sidebarPanel.subStatusId;
  } else if (sidebarPanel?.kind === "group") {
    params.panel_ui_main_group = sidebarPanel.mainGroup;
  }

  if (filters.archiveScope && filters.archiveScope !== "active") {
    params.archive_scope = filters.archiveScope;
  }
  const s = filters.search.trim();
  if (s) params.search = s;
  if (filters.dateFrom.trim()) params.created_from = filters.dateFrom.trim();
  if (filters.dateTo.trim()) params.created_to = filters.dateTo.trim();
  const rs = filters.returnStatusId.trim();
  if (rs && Number.isFinite(Number(rs))) params.return_status_id = Number(rs);
  const sm = filters.shippingMethodId.trim();
  if (sm) params.shipping_method_id = sm;
  const on = filters.orderNumber.trim();
  if (on) params.order_number = on;
  const cu = filters.customer.trim();
  if (cu) params.customer_search = cu;
  const tr = filters.tracking.trim();
  if (tr) params.tracking = tr;
  if (filters.hasPanelLabel === "yes" || filters.hasPanelLabel === "no") {
    params.has_panel_label = filters.hasPanelLabel;
  }
  const res = await api.get<WmsReturnQueueCountsRead>("wms/returns/queue-counts", { params });
  return res.data && typeof res.data === "object" && res.data.counts
    ? res.data
    : { counts: {} };
}

export async function listAllWmsReturns(args: {
  tenantId: number;
  warehouseId?: number | null;
  sidebarPanel: WmsReturnsSidebarPanelArg;
  filters: AppliedReturnListFilters;
  operationalQueue: ReturnOperationalQueueKey;
}): Promise<WmsReturnListItem[]> {
  const { tenantId, warehouseId, sidebarPanel, filters, operationalQueue } = args;
  const params: Record<string, string | number | boolean> = { tenant_id: tenantId };
  if (warehouseId != null && Number.isFinite(warehouseId) && warehouseId > 0) {
    params.warehouse_id = warehouseId;
  }

  if (filters.panelStatusIds.length > 0) {
    params.panel_ui_status_ids = filters.panelStatusIds.join(",");
  } else if (sidebarPanel?.kind === "unassigned") {
    params.panel_ui_unassigned = true;
  } else if (sidebarPanel?.kind === "sub") {
    params.panel_ui_status_id = sidebarPanel.subStatusId;
  } else if (sidebarPanel?.kind === "group") {
    params.panel_ui_main_group = sidebarPanel.mainGroup;
  }

  const s = filters.search.trim();
  if (s) params.search = s;
  if (filters.dateFrom.trim()) params.created_from = filters.dateFrom.trim();
  if (filters.dateTo.trim()) params.created_to = filters.dateTo.trim();
  const rs = filters.returnStatusId.trim();
  if (rs && Number.isFinite(Number(rs))) params.return_status_id = Number(rs);
  const sm = filters.shippingMethodId.trim();
  if (sm) params.shipping_method_id = sm;
  const on = filters.orderNumber.trim();
  if (on) params.order_number = on;
  const cu = filters.customer.trim();
  if (cu) params.customer_search = cu;
  const tr = filters.tracking.trim();
  if (tr) params.tracking = tr;
  if (filters.hasPanelLabel === "yes" || filters.hasPanelLabel === "no") {
    params.has_panel_label = filters.hasPanelLabel;
  }
  if (filters.archiveScope && filters.archiveScope !== "active") {
    params.archive_scope = filters.archiveScope;
  }
  if (operationalQueue && operationalQueue !== "wszystkie") {
    params.operational_queue = operationalQueue;
  }

  const res = await api.get<WmsReturnListItem[]>("wms/returns/", { params });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createWmsReturn(body: WmsReturnCreate): Promise<WmsReturnRead> {
  const res = await api.post<WmsReturnRead>("wms/returns/", body);
  return res.data;
}

export async function getWmsSettings(tenantId: number): Promise<WmsSettingsRead> {
  const res = await api.get<WmsSettingsRead>("wms/settings", {
    params: tenantOnly(tenantId),
  });
  return res.data;
}

export async function saveWmsSettings(payload: WmsSettingsSave): Promise<WmsSettingsRead> {
  const res = await api.post<WmsSettingsRead>("wms/settings", payload);
  return res.data;
}

/**
 * Tryb zwrotów RMZ — GET bez tenant_id używa domyślnego tenanta (backend).
 * Opcjonalnie `warehouseId` z nagłówka magazynu — inaczej magazyn domyślny tenanta.
 */
export async function getWmsReturnsModeSettings(opts?: {
  tenantId?: number | null;
  warehouseId?: number | null;
}): Promise<WmsSettingsRead> {
  const params: Record<string, number> = {};
  if (opts?.tenantId != null && Number.isFinite(Number(opts.tenantId)) && Number(opts.tenantId) > 0) {
    params.tenant_id = Math.floor(Number(opts.tenantId));
  }
  if (opts?.warehouseId != null && Number.isFinite(Number(opts.warehouseId)) && Number(opts.warehouseId) > 0) {
    params.warehouse_id = Math.floor(Number(opts.warehouseId));
  }
  const res = await api.get<WmsSettingsRead>("wms/settings/returns-mode", { params });
  return res.data;
}

export async function setWmsReturnsModeSettings(payload: {
  tenant_id?: number | null;
  warehouse_id?: number | null;
  returns_mode: string;
}): Promise<WmsSettingsRead> {
  const body: Record<string, unknown> = { returns_mode: payload.returns_mode };
  if (payload.tenant_id != null && Number.isFinite(Number(payload.tenant_id)) && Number(payload.tenant_id) > 0) {
    body.tenant_id = Math.floor(Number(payload.tenant_id));
  }
  if (payload.warehouse_id != null && Number.isFinite(Number(payload.warehouse_id)) && Number(payload.warehouse_id) > 0) {
    body.warehouse_id = Math.floor(Number(payload.warehouse_id));
  }
  const res = await api.put<WmsSettingsRead>(`wms/settings/returns-mode`, body);
  return res.data;
}

export async function processWmsReturnLine(
  returnId: number,
  orderItemId: number,
  tenantId: number,
  payload: WmsReturnLineProcess,
): Promise<WmsReturnRead> {
  const res = await api.post<WmsReturnRead>(`wms/returns/${returnId}/lines/${orderItemId}/process`, payload, {
    params: tenantOnly(tenantId),
  });
  return res.data;
}

export async function processWmsReturnLineSplit(
  returnId: number,
  orderItemId: number,
  tenantId: number,
  payload: WmsReturnLineSplitProcess,
): Promise<WmsReturnRead> {
  const res = await api.post<WmsReturnRead>(`wms/returns/${returnId}/lines/${orderItemId}/split-process`, payload, {
    params: tenantOnly(tenantId),
  });
  return res.data;
}

export async function processWmsReturnRefund(
  returnId: number,
  tenantId: number,
  payload: WmsRefundCreate,
  warehouseId?: number | null,
): Promise<WmsReturnRead> {
  const params: Record<string, string | number> = { tenant_id: tenantId };
  if (warehouseId != null && Number.isFinite(Number(warehouseId)) && Number(warehouseId) > 0) {
    params.warehouse_id = Number(warehouseId);
  }
  const res = await api.post<WmsReturnRead>(`wms/returns/${returnId}/refund`, payload, {
    params,
  });
  return res.data;
}

/** Konfigurowalne statusy workflow RMZ (`ReturnStatus`) dla magazynu — lista do ręcznej zmiany na WMS. */
export async function listWmsReturnWorkflowStatuses(
  tenantId: number,
  warehouseId: number,
): Promise<ReturnStatusRead[]> {
  const res = await api.get<ReturnStatusRead[]>("wms/return-statuses", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function patchWmsReturnWorkflowStatus(
  returnId: number,
  tenantId: number,
  statusId: number,
  warehouseId?: number | null,
): Promise<WmsReturnRead> {
  const params: Record<string, string | number> = { tenant_id: tenantId };
  if (warehouseId != null && Number.isFinite(Number(warehouseId)) && Number(warehouseId) > 0) {
    params.warehouse_id = Number(warehouseId);
  }
  const res = await api.patch<WmsReturnRead>(
    `wms/returns/${returnId}/status`,
    { status_id: statusId },
    { params },
  );
  return res.data;
}

export async function getWmsReturn(returnId: number, tenantId: number): Promise<WmsReturnRead> {
  const res = await api.get<WmsReturnRead>(`wms/returns/${returnId}`, {
    params: tenantOnly(tenantId),
  });
  return res.data;
}

export async function getWmsCustomerInsights(
  tenantId: number,
  opts: { email?: string | null; external_id?: string | null },
): Promise<CustomerInsightsRead> {
  const email = typeof opts.email === "string" && opts.email.trim() !== "" ? opts.email.trim() : undefined;
  const external_id =
    typeof opts.external_id === "string" && opts.external_id.trim() !== "" ? opts.external_id.trim() : undefined;
  const res = await api.get<CustomerInsightsRead>("wms/returns/customer-insights", {
    params: {
      tenant_id: tenantId,
      ...(email ? { email } : {}),
      ...(external_id && !email ? { external_id } : {}),
    },
  });
  return res.data;
}
