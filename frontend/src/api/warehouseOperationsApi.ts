import api from "./axios";
import { createRequestDeduper } from "../utils/wmsRequestDeduper";

const priorityTasksDeduper = createRequestDeduper();

export type WarehouseOperationsMainMode = "KOMPLETACJA" | "PAKOWANIE" | "OPERACJE MAGAZYNOWE" | "BRAKI";
export type WarehouseOperationsStatusColor = "green" | "gray" | "red";
export type WarehouseOperationsAlertLevel = "info" | "warning" | "critical";

export type WarehouseOperationsConfig = {
  short_break_minutes: number;
  long_break_minutes: number;
};

export type WarehouseOperationsSummary = {
  active_operators: number;
  picking: number;
  packing: number;
  warehouse_operations: number;
  shortages: number;
  idle_operators: number;
  orders_completed_today: number;
  warehouse_efficiency_percent: number;
  average_picking_minutes: number | null;
  average_packing_minutes: number | null;
  products_waiting_putaway: number;
  inbound_deliveries_waiting: number;
  delayed_operations: number;
  blocked_orders: number;
  sla_risk_percent: number;
  generated_at: string;
};

export type WarehouseOperatorIdleStats = {
  total_idle_minutes: number;
  total_idle_label: string;
  short_idle_periods: number;
  long_idle_periods: number;
};

export type WarehouseOperatorTimelineEvent = {
  at: string;
  time_label: string;
  title: string;
  main_mode: WarehouseOperationsMainMode;
  submode: string;
  location: string | null;
  metadata: Record<string, unknown>;
};

export type WarehouseOperatorOrderProgress = {
  order_id: number | null;
  order_number: string;
  picked_products: number;
  total_products: number;
  products_completed: number;
  products_total: number;
  progress_percent: number;
  status: "completed" | "active" | "blocked" | "inactive";
  status_label: string;
  progress_tone: "blue" | "green" | "amber" | "red";
  last_activity_at: string | null;
  last_activity_label: string | null;
  navigation_path: string | null;
  navigation_state: Record<string, unknown>;
};

export type WarehouseOperatorCard = {
  user_id: number;
  user_name: string;
  initials: string;
  main_mode: WarehouseOperationsMainMode;
  submode: string;
  last_activity_at: string;
  last_activity_label: string;
  minutes_since_activity: number;
  status_color: WarehouseOperationsStatusColor;
  activity_status_label: string;
  device_name: string | null;
  cart_code: string | null;
  assigned_order: string | null;
  assigned_orders: string[];
  document: string | null;
  carrier: string | null;
  current_location: string | null;
  progress_percent: number | null;
  progress_tone: "blue" | "green" | "amber" | "red";
  products_completed: number;
  products_total: number;
  orders_completed: number;
  orders_total: number;
  active_reference_type: "order" | "document" | "task" | null;
  active_reference_id: string | null;
  active_reference_label: string | null;
  orders_picked: number;
  products_picked: number;
  first_activity_at: string | null;
  idle: WarehouseOperatorIdleStats;
  packing_progress_percent: number | null;
  last_packed_order: string | null;
  packed_orders_per_hour: number | null;
  operation_count: number;
  timeline: WarehouseOperatorTimelineEvent[];
  order_progress: WarehouseOperatorOrderProgress[];
};

export type WarehouseOperationsQueue = {
  key: string;
  label: string;
  value: number;
  detail: string | null;
  tone: "neutral" | "blue" | "amber" | "red" | "green";
};

export type WarehouseOperationsAlert = {
  id: string;
  level: WarehouseOperationsAlertLevel;
  message: string;
  created_at: string;
  minutes_ago: number;
  area: string | null;
  affected_users: number[];
  affected_orders: number[];
  resolution_status: string;
  title: string | null;
  description: string | null;
  category:
    | "Braki"
    | "Kompletacja"
    | "Pakowanie"
    | "Rozlokowanie PZ"
    | "Rozlokowanie produktów"
    | "Dostawy"
    | "Przewoźnicy"
    | "Operatorzy"
    | "System";
  priority_group: "critical_now" | "requires_action" | "informational";
  severity_label: string | null;
  responsible_area: string | null;
  responsible_operator: string | null;
  recommended_action: string | null;
  impact: Array<{ label: string; value: string; detail: string | null; tone: "neutral" | "blue" | "amber" | "red" | "green" }>;
  context: Array<{ label: string; value: string; detail: string | null; tone: "neutral" | "blue" | "amber" | "red" | "green" }>;
  actions: Array<{
    label: string;
    action_type: "navigate" | "switch_tab" | "create_task" | "assign_operator" | "review";
    target_path: string | null;
    target_tab: string | null;
    tone: "primary" | "secondary" | "warning" | "danger";
    payload: Record<string, unknown>;
  }>;
  related_entities: Array<{ kind: "order" | "product" | "sku" | "zone" | "operator" | "document" | "carrier" | "task"; label: string; id: string | null }>;
  prediction_label: string | null;
  manager_focus: boolean;
};

export type WarehouseReplenishmentAlert = {
  id: string;
  product_id: number;
  product_name: string;
  sku: string | null;
  ean: string | null;
  image_url: string | null;
  source_location: string | null;
  target_location: string | null;
  missing_quantity: number;
  current_picking_stock: number;
  reserve_stock: number;
  blocked_orders: number;
  priority: "red" | "orange" | "blue";
  priority_label: string;
  minutes_since_detected: number;
  zone: string | null;
  assigned_operator: string | null;
  category: string | null;
  action_label: string;
};

export type WarehouseInboundDelivery = {
  id: string;
  supplier: string;
  eta: string | null;
  status_label: string;
  status_color: "green" | "orange" | "red";
  sku_count: number;
  total_quantity: number;
  carriers_count: number;
  receiving_progress_percent: number;
  assigned_operator: string | null;
  waiting_minutes: number;
};

export type WarehouseInboundSummary = {
  active_deliveries: number;
  delayed_deliveries: number;
  products_waiting_receiving: number;
  products_waiting_putaway: number;
  oldest_waiting_minutes: number;
};

export type WarehousePutawayZoneLoad = {
  zone: string;
  waiting_products: number;
  waiting_quantity: number;
  heat_percent: number;
  tone: "green" | "orange" | "red";
};

export type WarehousePutawayLoad = {
  products_waiting: number;
  pallets_waiting: number;
  oldest_unprocessed_carrier_minutes: number;
  active_putaway_operators: number;
  average_putaway_minutes: number | null;
  queue_growth_trend: number;
  zones: WarehousePutawayZoneLoad[];
};

export type WarehouseCarrierIssue = {
  id: string;
  order_id: number | null;
  carrier: string | null;
  error_message: string;
  time: string;
  retry_count: number;
  current_status: string;
  severity: "warning" | "critical" | "blocked";
};

export type WarehouseEmployeeRanking = {
  user_id: number;
  user_name: string;
  mode: WarehouseOperationsMainMode;
  products_per_hour: number;
  orders_per_hour: number;
  average_operation_minutes: number | null;
  inactivity_minutes: number;
  errors_count: number;
  shortages_created: number;
  successful_completions: number;
  packing_quality_percent: number | null;
  return_ratio_percent: number | null;
  scan_efficiency_percent: number;
  efficiency_score: number;
};

export type WarehouseBottleneck = {
  id: string;
  area: string;
  message: string;
  level: WarehouseOperationsAlertLevel;
  average_waiting_minutes: number;
  queue_growth: number;
  oldest_waiting_minutes: number;
  processing_speed: number;
  sla_risk_percent: number;
  pressure_percent: number;
  trend_label: string | null;
};

export type WarehouseOperationsSnapshot = {
  config: WarehouseOperationsConfig;
  summary: WarehouseOperationsSummary;
  operators: WarehouseOperatorCard[];
  picking_operators: WarehouseOperatorCard[];
  packing_operators: WarehouseOperatorCard[];
  warehouse_operation_operators: WarehouseOperatorCard[];
  shortage_operators: WarehouseOperatorCard[];
  queues: WarehouseOperationsQueue[];
  alerts: WarehouseOperationsAlert[];
  activity_stream: WarehouseOperatorTimelineEvent[];
  replenishments: WarehouseReplenishmentAlert[];
  inbound_summary: WarehouseInboundSummary;
  inbound_deliveries: WarehouseInboundDelivery[];
  putaway_load: WarehousePutawayLoad;
  carrier_issues: WarehouseCarrierIssue[];
  employee_rankings: WarehouseEmployeeRanking[];
  bottlenecks: WarehouseBottleneck[];
};

export type WarehouseOperationsSnapshotQuery = {
  tenantId: number;
  warehouseId: number;
  shortBreakMinutes?: number;
  longBreakMinutes?: number;
};

export async function getWarehouseOperationsSnapshot(
  query: WarehouseOperationsSnapshotQuery,
): Promise<WarehouseOperationsSnapshot | null> {
  try {
    const res = await api.get<WarehouseOperationsSnapshot>("/wms/warehouse-operations/snapshot", {
      params: {
        tenant_id: query.tenantId,
        warehouse_id: query.warehouseId,
        short_break_minutes: query.shortBreakMinutes,
        long_break_minutes: query.longBreakMinutes,
      },
    });
    return res.data;
  } catch {
    return null;
  }
}

export type CreateReplenishmentRelocationPayload = {
  productId: number;
  quantityRequired: number;
  sourceLocation?: string | null;
  targetLocation?: string | null;
  priority: WarehouseReplenishmentAlert["priority"];
};

export async function createReplenishmentRelocationTask(
  query: WarehouseOperationsSnapshotQuery,
  payload: CreateReplenishmentRelocationPayload,
): Promise<{ task_id: number; status: string; created: boolean }> {
  const res = await api.post<{ task_id: number; status: string; created: boolean }>(
    "/wms/warehouse-operations/replenishments/create-relocation",
    {
      product_id: payload.productId,
      quantity_required: payload.quantityRequired,
      source_location: payload.sourceLocation || undefined,
      target_location: payload.targetLocation || undefined,
      priority: payload.priority,
    },
    {
      params: {
        tenant_id: query.tenantId,
        warehouse_id: query.warehouseId,
        short_break_minutes: query.shortBreakMinutes,
        long_break_minutes: query.longBreakMinutes,
      },
    },
  );
  return res.data;
}

export type WarehousePriorityTask = {
  id: number;
  alert_id: string | null;
  task_type: string;
  title: string;
  description: string | null;
  status: "NOWE" | "PRZYJĘTE" | "W_TRAKCIE" | "WYKONANE" | "ODRZUCONE" | "ESKALOWANE";
  priority: "critical" | "high" | "normal";
  assigned_operator_id: number | null;
  assigned_operator_name: string | null;
  assigned_by_user_id: number | null;
  assigned_by_name: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  rejection_reason?: string | null;
  escalated_at: string | null;
  deadline_at: string | null;
  escalation_state: string | null;
  sla_countdown_minutes: number | null;
  target_path: string | null;
  recommended_action: string | null;
  comment: string | null;
  history?: Array<Record<string, unknown>>;
  payload: Record<string, unknown>;
};

export type CreatePriorityTaskPayload = {
  alertId: string;
  taskType: string;
  title: string;
  description?: string | null;
  assignedOperatorId?: number | null;
  assignedOperatorName?: string | null;
  priority: "critical" | "high" | "normal";
  deadlineAt?: string | null;
  comment?: string | null;
  targetPath?: string | null;
  payload?: Record<string, unknown>;
};

export async function createWarehousePriorityTask(
  query: Pick<WarehouseOperationsSnapshotQuery, "tenantId" | "warehouseId">,
  payload: CreatePriorityTaskPayload,
): Promise<WarehousePriorityTask> {
  const res = await api.post<WarehousePriorityTask>(
    "/wms/warehouse-operations/priority-tasks",
    {
      alert_id: payload.alertId,
      task_type: payload.taskType,
      title: payload.title,
      description: payload.description || undefined,
      assigned_operator_id: payload.assignedOperatorId || undefined,
      assigned_operator_name: payload.assignedOperatorName || undefined,
      priority: payload.priority,
      deadline_at: payload.deadlineAt || undefined,
      comment: payload.comment || undefined,
      target_path: payload.targetPath || undefined,
      payload: payload.payload || {},
    },
    { params: { tenant_id: query.tenantId, warehouse_id: query.warehouseId } },
  );
  return res.data;
}

export async function listWarehousePriorityTasks(
  query: Pick<WarehouseOperationsSnapshotQuery, "tenantId" | "warehouseId"> & { scope?: "assigned" | "all" },
): Promise<WarehousePriorityTask[]> {
  const params = {
    tenant_id: query.tenantId,
    warehouse_id: query.warehouseId,
    scope: query.scope || "assigned",
  };
  const key = JSON.stringify(params);
  return priorityTasksDeduper(key, async () => {
    const res = await api.get<WarehousePriorityTask[]>("/wms/warehouse-operations/priority-tasks", { params });
    return res.data;
  });
}

export async function updateWarehousePriorityTask(
  query: { tenantId: number; taskId: number },
  payload: { action: "accept" | "start" | "complete" | "reject" | "escalate"; rejectionReason?: string; comment?: string },
): Promise<WarehousePriorityTask> {
  const res = await api.patch<WarehousePriorityTask>(
    `/wms/warehouse-operations/priority-tasks/${query.taskId}`,
    {
      action: payload.action,
      rejection_reason: payload.rejectionReason || undefined,
      comment: payload.comment || undefined,
    },
    { params: { tenant_id: query.tenantId } },
  );
  return res.data;
}

export type WarehouseOperationsExportQuery = WarehouseOperationsSnapshotQuery & {
  format: "csv" | "xlsx";
  dateFrom?: string;
  dateTo?: string;
  operatorId?: number;
  mode?: WarehouseOperationsMainMode | "";
  zone?: string;
};

export async function downloadWarehouseOperationsExport(query: WarehouseOperationsExportQuery): Promise<void> {
  const res = await api.get<Blob>("/wms/warehouse-operations/export", {
    params: {
      tenant_id: query.tenantId,
      warehouse_id: query.warehouseId,
      format: query.format,
      date_from: query.dateFrom || undefined,
      date_to: query.dateTo || undefined,
      operator_id: query.operatorId || undefined,
      mode: query.mode || undefined,
      zone: query.zone || undefined,
      short_break_minutes: query.shortBreakMinutes,
      long_break_minutes: query.longBreakMinutes,
    },
    responseType: "blob",
  });
  const contentDisposition = String(res.headers["content-disposition"] || "");
  const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filenameMatch?.[1] || `warehouse-operations.${query.format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
