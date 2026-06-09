import api from "./axios";

export type WorkforceActionBuckets = {
  picking_events: number;
  packing_events: number;
  scan_events: number;
  receiving_events?: number;
  putaway_events?: number;
  movement_events?: number;
  document_events?: number;
  inventory_events?: number;
  admin_events?: number;
};

export type WorkforceModuleCount = { module: string; count: number };
export type WorkforceHourlyBucket = { hour: number; count: number };
export type WorkforceDailyBucket = { date: string; count: number };

export type WorkforceDashboardResponse = {
  dashboard: {
    range: { from: string; to: string };
    session_gap_minutes?: number;
    total_events: number;
    distinct_users: number;
    approx_sessions_computed: number;
    total_active_minutes_approx?: number;
    total_active_hours_approx?: number;
    action_buckets: WorkforceActionBuckets;
    top_modules?: WorkforceModuleCount[];
    hourly_heatmap?: WorkforceHourlyBucket[];
    daily_breakdown?: WorkforceDailyBucket[];
    per_user: Array<{ user_id: number; events: number; active_minutes_approx: number; sessions_count?: number }>;
  };
  costs: {
    total_estimated_cost_pln: number;
    estimated_cost_per_event_pln: number | null;
    per_user: Array<{
      user_id: number;
      employer_hourly_pln: number | null;
      active_hours_approx: number;
      estimated_cost_pln: number;
      estimated_cost_per_event_pln: number | null;
    }>;
    disclaimer: string;
  };
};

export type WorkforceAnalyticsResponse = WorkforceDashboardResponse["dashboard"] & {
  user_id?: number | null;
  sessions: Array<{
    index: number;
    session_id: string | null;
    started_at: string | null;
    last_at: string | null;
    events: number;
    active_minutes_approx: number;
    top_modules: WorkforceModuleCount[];
  }>;
  recent_timeline: Array<{
    id: number;
    user_id: number | null;
    login: string | null;
    module: string;
    action_type: string;
    warehouse_id: number | null;
    session_id: string | null;
    created_at: string | null;
  }>;
  throughput: {
    events_per_active_hour: number;
    events_per_user: number;
  };
};

export type WorkforceActivityRow = {
  id: number;
  user_id: number | null;
  login: string | null;
  tenant_id: number | null;
  warehouse_id?: number | null;
  session_id?: string | null;
  action_type: string;
  module: string;
  entity_type: string | null;
  entity_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
};

export type WorkforceStatusAccessRow = {
  id: number | null;
  tenant_id: number;
  warehouse_id: number;
  role: string;
  order_ui_status_id: number;
  status_name?: string | null;
  main_group?: string | null;
  can_visible: boolean;
  can_edit: boolean;
  can_transition: boolean;
  can_process: boolean;
  can_print: boolean;
  can_complete: boolean;
};

export async function fetchWorkforceDashboard(params?: {
  tenant_id?: number;
  date_from?: string;
  date_to?: string;
}): Promise<WorkforceDashboardResponse> {
  const res = await api.get<WorkforceDashboardResponse>("/workforce/dashboard", { params });
  return res.data;
}

export async function fetchWorkforceAnalytics(params?: {
  tenant_id?: number;
  user_id?: number;
  date_from?: string;
  date_to?: string;
}): Promise<WorkforceAnalyticsResponse> {
  const res = await api.get<WorkforceAnalyticsResponse>("/workforce/analytics", { params });
  return res.data;
}

export async function fetchWorkforceActivityLogs(params?: {
  tenant_id?: number;
  user_id?: number;
  module?: string;
  limit?: number;
}): Promise<WorkforceActivityRow[]> {
  const res = await api.get<WorkforceActivityRow[]>("/workforce/activity-logs", { params });
  return res.data;
}

export async function postWorkforceActivity(body: {
  action_type: string;
  module: string;
  tenant_id?: number;
  warehouse_id?: number;
  entity_type?: string;
  entity_id?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await api.post("/workforce/activity", body);
}

export async function fetchStatusAccessMatrix(tenantId: number, warehouseId: number): Promise<WorkforceStatusAccessRow[]> {
  const res = await api.get<WorkforceStatusAccessRow[]>("/workforce/status-access", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function putStatusAccessMatrix(
  items: Array<{
    tenant_id: number;
    warehouse_id: number;
    role: string;
    order_ui_status_id: number;
    can_visible: boolean;
    can_edit: boolean;
    can_transition: boolean;
    can_process: boolean;
    can_print: boolean;
    can_complete: boolean;
  }>
): Promise<{ updated: number }> {
  const res = await api.put<{ updated: number }>("/workforce/status-access", items);
  return res.data;
}

export type WorkforceUserStatusEffectiveRow = {
  order_ui_status_id: number;
  status_name: string | null;
  main_group: string | null;
  role: string;
  role_can_visible: boolean;
  role_can_edit: boolean;
  role_can_transition: boolean;
  role_can_process: boolean;
  role_can_print: boolean;
  role_can_complete: boolean;
  effective_can_visible: boolean;
  effective_can_edit: boolean;
  effective_can_transition: boolean;
  effective_can_process: boolean;
  effective_can_print: boolean;
  effective_can_complete: boolean;
  has_user_override: boolean;
};

export async function fetchUserEffectiveStatusAccess(params: {
  tenant_id: number;
  warehouse_id: number;
  user_id: number;
}): Promise<WorkforceUserStatusEffectiveRow[]> {
  const res = await api.get<WorkforceUserStatusEffectiveRow[]>("/workforce/status-access/user-effective", { params });
  return res.data;
}

export async function putUserStatusAccessOverrides(body: {
  tenant_id: number;
  warehouse_id: number;
  user_id: number;
  items: Array<{
    order_ui_status_id: number;
    can_visible: boolean;
    can_edit: boolean;
    can_transition: boolean;
    can_process: boolean;
    can_print: boolean;
    can_complete: boolean;
  }>;
}): Promise<{ updated: number }> {
  const res = await api.put<{ updated: number }>("/workforce/status-access/user", body);
  return res.data;
}

export type WmsOperationalModeCatalogItem = { key: string; label_pl: string };

export async function fetchWmsOperationalModesCatalog(): Promise<WmsOperationalModeCatalogItem[]> {
  const res = await api.get<WmsOperationalModeCatalogItem[]>("/workforce/wms-operational-modes");
  return res.data;
}

export type EmployeeCostProfileRead = {
  user_id: number;
  tenant_id: number | null;
  contract_type: string;
  gross_monthly_pln: number | null;
  employer_total_monthly_pln: number | null;
  net_monthly_pln: number | null;
  default_hours_per_month: number;
  hourly_pln: number | null;
  employer_hourly_pln: number | null;
  ppk_enabled: boolean;
  employer_side_rate_override: number | null;
  notes: string | null;
  is_active: boolean;
  assumptions: Record<string, unknown>;
};

export async function fetchEmployeeCostProfile(userId: number): Promise<EmployeeCostProfileRead> {
  const res = await api.get<EmployeeCostProfileRead>(`/workforce/cost-profile/${userId}`);
  return res.data;
}

export async function putEmployeeCostProfile(
  userId: number,
  body: {
    tenant_id?: number | null;
    contract_type: string;
    gross_monthly_pln?: number | null;
    employer_total_monthly_pln?: number | null;
    net_monthly_pln?: number | null;
    default_hours_per_month?: number;
    ppk_enabled?: boolean;
    employer_side_rate_override?: number | null;
    notes?: string | null;
    is_active?: boolean;
  }
): Promise<EmployeeCostProfileRead> {
  const res = await api.put<EmployeeCostProfileRead>(`/workforce/cost-profile/${userId}`, body);
  return res.data;
}

export type EmployeeCostOverviewRow = {
  user_id: number;
  login: string;
  full_name: string | null;
  workstation: string | null;
  employment_label: string | null;
  contract_type: string;
  net_monthly_pln: number | null;
  gross_monthly_pln: number | null;
  employer_total_monthly_pln: number | null;
  hourly_pln: number | null;
  employer_hourly_pln: number | null;
  is_active_account: boolean;
  has_cost_profile: boolean;
};

export type EmployeeCostOverviewRead = {
  disclaimer_pl: string;
  rows: EmployeeCostOverviewRow[];
  total_employees: number;
  employees_with_cost_numbers: number;
  sum_net_monthly_pln: number;
  sum_gross_monthly_pln: number;
  sum_employer_total_monthly_pln: number;
  avg_employer_total_monthly_pln: number | null;
};

export async function fetchWorkforceCostOverview(): Promise<EmployeeCostOverviewRead> {
  const res = await api.get<EmployeeCostOverviewRead>("/workforce/cost-profiles-overview");
  return res.data;
}
