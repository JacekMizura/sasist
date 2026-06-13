import api from "./axios";

export type ConsolidationPlanListRow = {
  id: number;
  order_id: number;
  order_number: string;
  target_warehouse_id: number;
  target_warehouse_name: string | null;
  status: string;
  created_at: string | null;
  transfers_received: number;
  transfers_total: number;
  progress_label: string;
  pending_source_warehouses: string[];
};

export type ConsolidationSummary = {
  pending_count: number;
  in_progress_count: number;
  completed_count: number;
  active_count: number;
  exception_count: number;
  manual_review_count: number;
  problem_plan_count: number;
  critical_alert_count: number;
  unresolved_alert_count: number;
};

export type ConsolidationAlertRow = {
  id: number;
  plan_id: number;
  plan_item_id: number | null;
  order_id: number;
  order_number: string;
  plan_status: string;
  severity: string;
  code: string;
  message: string;
  resolved: boolean;
  created_at: string | null;
};

export type ConsolidationPlanDetail = {
  id: number;
  order_id: number;
  order_number: string | null;
  target_warehouse_id: number;
  target_warehouse_name: string | null;
  status: string;
  created_at: string | null;
  shelf_label: string | null;
  segment_id: number | null;
  transfers_received: number;
  transfers_total: number;
  progress_label: string;
  pending_source_warehouses: string[];
  mm_staged_count?: number;
  mm_staging_total?: number;
  mm_staging_label?: string;
  local_staged_count?: number;
  local_staging_total?: number;
  local_staging_label?: string;
  staged_count?: number;
  staging_total?: number;
  staging_label?: string;
  packing_ready?: boolean;
  packing_ready_label?: string;
  items: {
    id: number;
    product_id: number;
    product_name: string | null;
    quantity: number;
    source_warehouse_id: number;
    source_warehouse_name: string | null;
    target_warehouse_id: number;
    target_warehouse_name: string | null;
    status: string;
    stock_document_id: number | null;
  }[];
};

export async function fetchWmsConsolidationSummary(
  tenantId: number,
  warehouseId: number,
): Promise<ConsolidationSummary> {
  const { data } = await api.get<ConsolidationSummary>("/wms/consolidation-plans/summary", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function fetchWmsConsolidationPlans(
  tenantId: number,
  warehouseId: number,
  includeCompleted = false,
): Promise<ConsolidationPlanListRow[]> {
  const { data } = await api.get<{ plans: ConsolidationPlanListRow[] }>("/wms/consolidation-plans", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, include_completed: includeCompleted },
  });
  return data.plans ?? [];
}

export async function fetchWmsConsolidationPlanDetail(
  planId: number,
  tenantId: number,
): Promise<ConsolidationPlanDetail> {
  const { data } = await api.get<ConsolidationPlanDetail>(`/wms/consolidation-plans/${planId}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchWmsConsolidationAlerts(
  tenantId: number,
  warehouseId: number,
  unresolvedOnly = true,
): Promise<ConsolidationAlertRow[]> {
  const { data } = await api.get<{ alerts: ConsolidationAlertRow[] }>("/wms/consolidation-alerts", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, unresolved_only: unresolvedOnly },
  });
  return data.alerts ?? [];
}

export async function postConsolidationRecoveryAction(
  planId: number,
  planItemId: number,
  tenantId: number,
  action: "ADDITIONAL_MM" | "OPERATOR_DECISION" | "LOST_ESCALATION",
  note?: string,
): Promise<{ plan_id: number; status: string; message: string | null }> {
  const { data } = await api.post(`/consolidation-plans/${planId}/items/${planItemId}/recovery`, {
    action,
    note,
  }, { params: { tenant_id: tenantId } });
  return data;
}

export async function postCancelConsolidationPlan(
  planId: number,
  tenantId: number,
  reason: string,
): Promise<{ plan_id: number; status: string; message: string | null }> {
  const { data } = await api.post(
    `/consolidation-plans/${planId}/cancel`,
    { reason },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function postChangeConsolidationTargetWarehouse(
  planId: number,
  tenantId: number,
  warehouseId: number,
  reason: string,
): Promise<{ plan_id: number; status: string; message: string | null }> {
  const { data } = await api.post(
    `/consolidation-plans/${planId}/change-target-warehouse`,
    { warehouse_id: warehouseId, reason },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export type ConsolidationStagingQueueRow = {
  id: number;
  order_id: number;
  order_number: string;
  status: string;
  transfers_received: number;
  transfers_total: number;
  progress_label: string;
  staged_count: number;
  staging_total: number;
  staging_label: string;
  shelf_label: string | null;
  segment_id: number | null;
  can_start_staging: boolean;
};

export async function fetchConsolidationStagingQueue(
  tenantId: number,
  warehouseId: number,
): Promise<ConsolidationStagingQueueRow[]> {
  const { data } = await api.get<{ plans: ConsolidationStagingQueueRow[] }>(
    "/wms/consolidation-staging/queue",
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return data.plans ?? [];
}

export async function postStartConsolidationStaging(
  planId: number,
  tenantId: number,
): Promise<{ plan_id: number; status: string; segment_id: number; shelf_label: string; message: string | null }> {
  const { data } = await api.post(
    `/consolidation-plans/${planId}/start-staging`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function postStageConsolidationItem(
  planId: number,
  planItemId: number,
  tenantId: number,
): Promise<{ plan_id: number; plan_item_id: number; status: string; completed: boolean; plan_status: string | null }> {
  const { data } = await api.post(
    `/consolidation-plans/${planId}/items/${planItemId}/stage`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function resolveConsolidationShelf(
  tenantId: number,
  warehouseId: number,
  code: string,
): Promise<{ segment_id: number; shelf_label: string; order_id: number; order_number: string | null; packing_ready: boolean }> {
  const { data } = await api.get("/wms/consolidation-staging/resolve", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, code },
  });
  return data;
}

export type ConsolidationRackSegmentDashboard = {
  segment_id: number;
  slot_label: string;
  shelf_label: string;
  state: "FREE" | "STAGING" | "READY_TO_PACK" | "EXCEPTION" | string;
  fill_percent: number;
  order_id: number | null;
  order_number: string | null;
  customer_name: string | null;
  order_status: string | null;
  plan_id: number | null;
  plan_status: string | null;
  fulfillment_state: string | null;
  packing_ready: boolean;
  packing_ready_label: string | null;
  completion_percent: number;
  mm_staging_label: string | null;
  local_staging_label: string | null;
};

export type ConsolidationRackDashboard = {
  warehouse_id: number;
  racks: {
    rack_id: number;
    rack_name: string;
    levels: {
      level_id: number;
      level_index: number;
      level_name: string | null;
      is_segmented: boolean;
      segments: ConsolidationRackSegmentDashboard[];
    }[];
  }[];
  summary: {
    total_segments: number;
    free_count: number;
    occupied_count: number;
    ready_to_pack_count: number;
    exception_count: number;
    remaining_percent: number;
  };
};

export function consolidationStagingErrorMessage(e: unknown, fallback: string): string {
  const detail =
    e && typeof e === "object" && "response" in e
      ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      : null;
  if (detail && typeof detail === "object" && detail !== null && "code" in detail) {
    const row = detail as { code?: string; error?: string };
    if (row.code === "NO_FREE_CONSOLIDATION_SHELF") {
      return "Brak wolnych półek kompletacyjnych. Plan pozostaje gotowy do rozkładania.";
    }
    if (typeof row.error === "string" && row.error.trim()) {
      return row.error;
    }
  }
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  return fallback;
}

export async function fetchConsolidationRacksDashboard(
  tenantId: number,
  warehouseId: number,
): Promise<ConsolidationRackDashboard> {
  const { data } = await api.get<ConsolidationRackDashboard>("/wms/consolidation-racks/dashboard", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export type ConsolidationControlTowerMissingItem = {
  plan_item_id: number;
  product_id: number;
  product_name: string;
  source_warehouse_id: number;
  source_warehouse_name: string | null;
  status: string;
};

export type ConsolidationControlTowerAlert = {
  code: string;
  severity: string;
  label: string;
  alert_id?: number | null;
};

export type ConsolidationControlTowerShelf = {
  segment_id: number;
  shelf_label: string;
  order_id: number;
  order_number: string | null;
  customer_name: string | null;
  plan_id: number | null;
  plan_status: string | null;
  order_status: string | null;
  target_warehouse_id: number;
  target_warehouse_name: string | null;
  state: string;
  sort_tier: number;
  occupied_since: string | null;
  occupied_minutes: number | null;
  occupied_label: string | null;
  ready_to_pack_since: string | null;
  ready_to_pack_minutes: number | null;
  ready_to_pack_label: string | null;
  mm_progress_label: string | null;
  local_progress_label: string | null;
  total_progress_label: string | null;
  missing_items: ConsolidationControlTowerMissingItem[];
  alerts: ConsolidationControlTowerAlert[];
  unresolved_alert_count: number;
};

export type ConsolidationControlTower = {
  warehouse_id: number;
  kpi: {
    total_segments: number;
    free_count: number;
    occupied_count: number;
    ready_to_pack_count: number;
    exception_count: number;
    avg_occupation_minutes: number;
  };
  shelves: ConsolidationControlTowerShelf[];
};

export async function fetchConsolidationRacksControlTower(
  tenantId: number,
  warehouseId: number,
): Promise<ConsolidationControlTower> {
  const { data } = await api.get<ConsolidationControlTower>("/wms/consolidation-racks/control-tower", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export type ConsolidationTowerSummary = {
  warehouse_id: number;
  counts: {
    READY_FOR_STAGING: number;
    STAGING: number;
    READY_TO_PACK: number;
    EXCEPTION: number;
    MANUAL_REVIEW_REQUIRED: number;
  };
  avg_minutes: {
    ready_for_staging_to_staging: number | null;
    staging_to_completed: number | null;
    completed_to_packing: number | null;
  };
  rack_summary: {
    total_segments: number;
    occupied_segments: number;
    free_segments: number;
    occupancy_percent: number;
  };
  alert_counts: { warning: number; critical: number };
};

export type ConsolidationTowerQueues = {
  warehouse_id: number;
  ready_for_staging: Array<{
    plan_id: number;
    order_id: number;
    order_number: string;
    target_warehouse_name: string | null;
    item_count: number;
    waiting_minutes: number | null;
    waiting_label: string | null;
    pending_source_warehouses: string[];
    alerts: ConsolidationControlTowerAlert[];
  }>;
  staging: Array<{
    plan_id: number;
    order_id: number;
    order_number: string;
    shelf_label: string | null;
    progress_percent: number;
    staged_count: number;
    pending_count: number;
    waiting_minutes: number | null;
    mm_progress_label: string | null;
    local_progress_label: string | null;
    last_activity_at: string | null;
    last_operator_name: string | null;
    alerts: ConsolidationControlTowerAlert[];
  }>;
  ready_to_pack: Array<{
    plan_id: number;
    order_id: number;
    order_number: string;
    shelf_label: string | null;
    waiting_minutes: number | null;
    last_activity_at: string | null;
    last_operator_name: string | null;
    alerts: ConsolidationControlTowerAlert[];
  }>;
  bottlenecks: Array<{
    plan_id: number;
    order_id: number;
    order_number: string;
    queue_status: string;
    waiting_minutes: number | null;
    waiting_label: string | null;
    shelf_label: string | null;
    alerts: ConsolidationControlTowerAlert[];
  }>;
};

export type ConsolidationTowerRacks = {
  warehouse_id: number;
  racks: Array<{
    rack_id: number;
    rack_name: string;
    total_segments: number;
    occupied_segments: number;
    free_segments: number;
    occupancy_percent: number;
    segments: Array<{
      segment_id: number;
      shelf_label: string;
      order_number: string | null;
      plan_status: string | null;
      occupied_minutes: number | null;
      state: string;
    }>;
  }>;
};

export type ConsolidationTowerAlerts = {
  warehouse_id: number;
  alerts: Array<
    ConsolidationControlTowerAlert & {
      plan_id: number;
      order_id: number;
      order_number: string | null;
      queue_status: string | null;
      shelf_label: string | null;
      waiting_minutes: number | null;
    }
  >;
};

export async function fetchConsolidationTowerSummary(
  tenantId: number,
  warehouseId: number,
): Promise<ConsolidationTowerSummary> {
  const { data } = await api.get<ConsolidationTowerSummary>("/wms/consolidation-control-tower/summary", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function fetchConsolidationTowerQueues(
  tenantId: number,
  warehouseId: number,
): Promise<ConsolidationTowerQueues> {
  const { data } = await api.get<ConsolidationTowerQueues>("/wms/consolidation-control-tower/queues", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function fetchConsolidationTowerRacks(
  tenantId: number,
  warehouseId: number,
): Promise<ConsolidationTowerRacks> {
  const { data } = await api.get<ConsolidationTowerRacks>("/wms/consolidation-control-tower/racks", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function fetchConsolidationTowerAlerts(
  tenantId: number,
  warehouseId: number,
): Promise<ConsolidationTowerAlerts> {
  const { data } = await api.get<ConsolidationTowerAlerts>("/wms/consolidation-control-tower/alerts", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}
