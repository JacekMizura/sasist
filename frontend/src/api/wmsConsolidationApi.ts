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
  transfers_received: number;
  transfers_total: number;
  progress_label: string;
  pending_source_warehouses: string[];
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
