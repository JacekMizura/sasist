import api from "./axios";

export type WmsOperationalTaskApi = {
  id: number;
  task_type: string;
  status: string;
  queue: string;
  product_id?: number | null;
  product_name: string;
  product_sku?: string | null;
  product_ean?: string | null;
  image_url?: string | null;
  order_id?: number | null;
  order_number?: string | null;
  order_item_id?: number | null;
  quantity_required: number;
  quantity_done: number;
  quantity_remaining: number;
  location_hint?: string | null;
  substitute_product_id?: number | null;
  substitute_for_product_name?: string | null;
  group_key: string;
  priority: number;
  summary_line: string;
  created_at?: string | null;
  updated_at?: string | null;
  picked_from_location?: string | null;
  relocation_order_count?: number;
  relocation_allocation_count?: number;
  /** CARRIER = nośnik logistyczny; LOCATION = lokacja (z payload zadania RELOCATION). */
  relocation_mode?: "CARRIER" | "LOCATION" | null;
  target_zones?: string[];
  waiting_order_count?: number;
  waiting_oldest_at?: string | null;
};

export type WmsOperationalRelocationAllocationApi = {
  order_id: number;
  order_item_id: number;
  qty: number;
  target_zone?: string | null;
  order_number?: string | null;
  carrier_id?: number | null;
  carrier_label?: string | null;
  relocated_qty: number;
  remaining_qty: number;
  relocated_at?: string | null;
  relocated_by?: number | null;
  done: boolean;
  status: "pending" | "partial" | "done" | string;
};

export type WmsRelocationSessionApi = {
  operator_id: number;
  operator_name: string;
  device_id?: string | null;
  started_at?: string | null;
  last_activity_at?: string | null;
  active_carrier_id?: number | null;
  active_carrier_label?: string | null;
  is_holder: boolean;
  is_expired: boolean;
  can_edit: boolean;
  can_takeover: boolean;
};

export type WmsRelocationCarrierStatsApi = {
  product_count: number;
  order_count: number;
  total_qty: number;
};

export type WmsOperationalEventApi = {
  at: string;
  action: string;
  operator_id: number;
  operator_name: string;
  qty?: number | null;
  carrier_id?: number | null;
  carrier_label?: string | null;
  order_id?: number | null;
  order_item_id?: number | null;
};

export type WmsOperationalTaskRefApi = {
  order_id: number;
  order_item_id: number;
  qty: number;
};

export type WmsOperationalTaskDetailApi = WmsOperationalTaskApi & {
  relocation_allocations?: WmsOperationalRelocationAllocationApi[];
  relocation_allocations_total?: number;
  relocation_total_qty?: number;
  related_order_numbers?: string[];
  payload_refs?: WmsOperationalTaskRefApi[];
  lock_version?: number;
  relocation_session?: WmsRelocationSessionApi | null;
  relocation_history?: WmsOperationalEventApi[];
  operational_events?: WmsOperationalEventApi[];
  can_edit_relocation?: boolean;
  active_carrier_stats?: WmsRelocationCarrierStatsApi | null;
};

export type WmsRelocationAllocationsPageApi = {
  items: WmsOperationalRelocationAllocationApi[];
  total: number;
  offset: number;
  limit: number;
};

export type RelocationSessionLockedDetail = {
  message?: string;
  holder_name?: string;
  holder_id?: number;
  can_takeover?: boolean;
};

function relocationDeviceId(): string {
  const key = "wms_relocation_device_id";
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}

export type WmsOperationalQueueSummaryApi = {
  queue: string;
  label: string;
  count: number;
};

export type WmsOperationalTaskListResponseApi = {
  items: WmsOperationalTaskApi[];
  total: number;
  queue_summaries: WmsOperationalQueueSummaryApi[];
};

export const OPERATIONAL_QUEUES = [
  { id: "DO_DECYZJI", label: "Do decyzji", icon: "decision", routeHint: "Strefa decyzji OMS" },
  { id: "DO_DOGRYWKI", label: "Dogrywka", icon: "recollect", routeHint: "Trasa zbierania — domknięcie braków" },
  { id: "OCZEKUJE_NA_DOSTAWE", label: "Na dostawę", icon: "waiting", routeHint: "Inbound → auto promote" },
  { id: "DO_ROZLOKOWANIA", label: "Rozlokowanie produktów", icon: "relocation", routeHint: "Przypisanie towaru do celu: nośnik (PAL, BOX…) lub lokacja" },
] as const;

export type OperationalQueueId = (typeof OPERATIONAL_QUEUES)[number]["id"];

export async function listWmsOperationalTasks(
  tenantId: number,
  warehouseId: number,
  opts?: { queue?: string; limit?: number; sync?: boolean },
): Promise<WmsOperationalTaskListResponseApi> {
  const res = await api.get<WmsOperationalTaskListResponseApi>("/wms/operational-tasks", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      queue: opts?.queue,
      limit: opts?.limit ?? 200,
      sync: opts?.sync !== false,
    },
  });
  return res.data;
}

export async function getWmsOperationalTaskDetail(
  tenantId: number,
  taskId: number,
): Promise<WmsOperationalTaskDetailApi> {
  const res = await api.get<WmsOperationalTaskDetailApi>(`/wms/operational-tasks/${taskId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function resolveWmsOperationalTaskScan(
  tenantId: number,
  warehouseId: number,
  scan: string,
): Promise<WmsOperationalTaskDetailApi> {
  const res = await api.get<WmsOperationalTaskDetailApi>("/wms/operational-tasks/resolve-scan", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, scan },
  });
  return res.data;
}

export async function startWmsOperationalTask(tenantId: number, taskId: number): Promise<void> {
  await api.post(`/wms/operational-tasks/${taskId}/start`, null, {
    params: { tenant_id: tenantId },
  });
}

export async function acquireWmsRelocationSession(
  tenantId: number,
  taskId: number,
  opts?: { takeover?: boolean },
): Promise<WmsOperationalTaskDetailApi> {
  const res = await api.post<WmsOperationalTaskDetailApi>(
    `/wms/operational-tasks/${taskId}/relocation/session`,
    {
      tenant_id: tenantId,
      device_id: relocationDeviceId(),
      takeover: Boolean(opts?.takeover),
    },
  );
  return res.data;
}

export async function releaseWmsRelocationSession(tenantId: number, taskId: number): Promise<void> {
  await api.post(`/wms/operational-tasks/${taskId}/relocation/session/release`, {
    tenant_id: tenantId,
  });
}

export async function fetchWmsRelocationAllocationsPage(
  tenantId: number,
  taskId: number,
  opts?: { offset?: number; limit?: number; status_filter?: string },
): Promise<WmsRelocationAllocationsPageApi> {
  const res = await api.get<WmsRelocationAllocationsPageApi>(
    `/wms/operational-tasks/${taskId}/relocation/allocations`,
    {
      params: {
        tenant_id: tenantId,
        offset: opts?.offset ?? 0,
        limit: opts?.limit ?? 40,
        status_filter: opts?.status_filter,
      },
    },
  );
  return res.data;
}

export async function assignWmsRelocationAllocation(
  tenantId: number,
  taskId: number,
  body: {
    order_id: number;
    order_item_id: number;
    carrier_id: number;
    qty?: number;
    lock_version?: number;
  },
): Promise<WmsOperationalTaskDetailApi> {
  const res = await api.post<WmsOperationalTaskDetailApi>(
    `/wms/operational-tasks/${taskId}/relocation/assign`,
    { tenant_id: tenantId, ...body },
  );
  return res.data;
}

export async function bulkAssignWmsRelocation(
  tenantId: number,
  taskId: number,
  body: { carrier_id: number; order_item_ids?: number[]; lock_version?: number },
): Promise<WmsOperationalTaskDetailApi> {
  const res = await api.post<WmsOperationalTaskDetailApi>(
    `/wms/operational-tasks/${taskId}/relocation/bulk-assign`,
    { tenant_id: tenantId, ...body },
  );
  return res.data;
}

export async function completeWmsRelocationByGroupKey(
  tenantId: number,
  warehouseId: number,
  groupKey: string,
  quantityDone?: number,
): Promise<void> {
  await api.post(
    `/wms/operational-tasks/relocation/${encodeURIComponent(groupKey)}/complete`,
    {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      quantity_done: quantityDone,
    },
  );
}
