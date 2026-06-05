import api from "./axios";
import { createRequestDeduper } from "../utils/wmsRefresh";

const orderIssueTasksListDeduper = createRequestDeduper();
const orderIssueTaskDetailDeduper = createRequestDeduper();

export type OrderIssueTaskLogEntryApi = {
  at: string;
  message: string;
  kind: string;
};

export type NewProductLineHintApi = {
  product_id: number;
  order_item_id: number;
  sku: string;
  ean: string;
  location_code: string;
};

export type OrderIssuePickedLocationRowApi = {
  location_label: string;
  quantity: number;
  batch_number?: string | null;
  expiry_date?: string | null;
};

export type OrderIssueShortageLineApi = {
  order_item_id: number;
  product_id: number;
  product_name: string;
  image_url: string | null;
  ordered_qty: number;
  picked_qty: number;
  missing_qty: number;
  location_code: string;
  nearest_location_code?: string;
  nearest_location_id?: number | null;
  available_qty?: number;
  oms_action_summary?: string;
  remaining_qty?: number;
  sku?: string;
  ean?: string;
  pick_audit_summary?: string | null;
};

export type OrderIssueDetailLineApi = OrderIssueShortageLineApi & {
  sku?: string;
  ean?: string;
  line_kind: string;
  badge_label?: string;
  shortage_display_kind?: string;
  oms_line_status?: string | null;
  pick_audit_summary?: string | null;
  picked_locations?: OrderIssuePickedLocationRowApi[];
  substitute_for_product_name?: string | null;
  remaining_qty?: number;
};

export type BrakiWorkstreamsApi = {
  has_pick_work?: boolean;
  has_relocation_work?: boolean;
  has_packing_ready?: boolean;
  has_oms_pending?: boolean;
  pick_line_count?: number;
  relocation_line_count?: number;
  packing_ready_line_count?: number;
  oms_line_count?: number;
  collected_line_count?: number;
};

export type OrderIssueOrderContextApi = {
  collected_lines: OrderIssueDetailLineApi[];
  shortage_decision_lines: OrderIssueDetailLineApi[];
  remaining_pick_lines: OrderIssueDetailLineApi[];
  relocation_lines?: OrderIssueDetailLineApi[];
  packing_ready_lines?: OrderIssueDetailLineApi[];
};

export type OrderIssueTaskListItemApi = {
  id: number;
  order_id: number;
  order_number: string;
  order_status: string;
  customer_name?: string;
  delivery_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  unresolved_shortage_count?: number;
  replacement_pick_pending_count?: number;
  issue_queue_summary_line?: string;
  issue_queue_status_label?: string;
  substitute_product_id?: number;
  substitute_product_name?: string;
  order_ui_status_name: string | null;
  task_type: string;
  recommended_action: string;
  /** CANCELLED_RETURN | READY_PACK | NEW_PRODUCT | ALL_MISSING | PARTIAL */
  ui_decision: string;
  new_product_lines: NewProductLineHintApi[];
  shortage_lines: OrderIssueShortageLineApi[];
  order_context?: OrderIssueOrderContextApi;
  status: string;
  /** awaiting_oms | recovery_ready | waiting_customer */
  braki_queue_bucket?: string;
  /** awaiting | relocation | relocation_partial | pick | ready_pack | pick_and_relocation */
  braki_workflow_status?: string;
  braki_workflow_status_label?: string;
  missing_items: Record<string, unknown>[];
  picked_items: Record<string, unknown>[];
  missing_skus_label: string;
  logs: OrderIssueTaskLogEntryApi[];
  created_at: string;
  /** Ostatnie zgłoszenie braku (log) lub utworzenie zadania — ISO. */
  last_shortage_at?: string;
  /** Resolver: zamówienie gotowe do pakowania */
  recovery_packing_allowed?: boolean;
  recovery_active_lines?: number;
  recovery_unresolved_lines?: number;
  recovery_has_relocation_work?: boolean;
  /** Aktywne zadanie RELOCATION (po self-heal resolvera). */
  relocation_task_id?: number | null;
  /** Canonical lifecycle phase — RecoveryWorkflowService SSOT. */
  shortage_lifecycle_phase?:
    | "SHORTAGE_DETECTED"
    | "AWAITING_OMS"
    | "WAITING_SUPPLY"
    | "RECOVERY_PICK"
    | "RELOCATION_REQUIRED"
    | "READY_TO_PACK"
    | "DONE";
  /** RELOCATION execution mode (CARRIER = nośniki); not a separate workflow. */
  relocation_mode?: "CARRIER" | "LOCATION" | null;
  /** Resolver: pokaż „Zamknij brak” / „Usuń z Braków” */
  can_close_shortage?: boolean;
  recovery_state_hash?: string;
  braki_workstreams?: BrakiWorkstreamsApi;
};

export type OrderIssueTaskSkippedItemApi = {
  task_id: number;
  order_id: number;
  order_number: string;
  error_code?: string;
  error_message: string;
};

export type OrderIssueTaskListResult = {
  success?: boolean;
  tasks: OrderIssueTaskListItemApi[];
  skipped_tasks: OrderIssueTaskSkippedItemApi[];
  filter_counts?: Record<string, number>;
};

export type ListWmsOrderIssueTasksOptions = {
  /** Pełne przeliczenie stanów braków — wolniejsze; użyj przy ręcznym „Odśwież”. */
  sync?: boolean;
};

export async function listWmsOrderIssueTasks(
  tenantId: number,
  warehouseId: number,
  options?: ListWmsOrderIssueTasksOptions,
): Promise<OrderIssueTaskListResult> {
  const params = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    sync: options?.sync ? true : undefined,
  };
  const key = JSON.stringify(params);
  return orderIssueTasksListDeduper(key, async () => {
    const res = await api.get<OrderIssueTaskListResult>("/wms/order-issue-tasks", { params });
    return {
      success: res.data?.success ?? true,
      tasks: res.data?.tasks ?? [],
      skipped_tasks: res.data?.skipped_tasks ?? [],
      filter_counts: res.data?.filter_counts ?? {},
    };
  });
}

export async function getWmsOrderIssueTask(
  tenantId: number,
  warehouseId: number,
  taskId: number,
): Promise<OrderIssueTaskListItemApi> {
  const key = `${tenantId}:${warehouseId}:${taskId}`;
  return orderIssueTaskDetailDeduper(key, async () => {
    const res = await api.get<OrderIssueTaskListItemApi>(`/wms/order-issue-tasks/${taskId}`, {
      params: { tenant_id: tenantId, warehouse_id: warehouseId },
    });
    return res.data;
  });
}

export async function resolveWmsOrderIssueTaskScan(
  tenantId: number,
  warehouseId: number,
  scan: string,
): Promise<OrderIssueTaskListItemApi> {
  const res = await api.get<OrderIssueTaskListItemApi>("/wms/order-issue-tasks/resolve-scan", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, scan: scan.trim() },
  });
  return res.data;
}

export async function postWmsOrderIssueTaskLog(
  tenantId: number,
  warehouseId: number,
  taskId: number,
  body: { message: string; kind: string },
): Promise<void> {
  await api.post(`/wms/order-issue-tasks/${taskId}/log`, body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
}

export async function postWmsOrderIssueTaskArchive(
  tenantId: number,
  warehouseId: number,
  taskId: number,
  message?: string,
): Promise<void> {
  await api.post(
    `/wms/order-issue-tasks/${taskId}/archive`,
    message ? { message } : {},
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
}

export async function postWmsOrderIssueTaskDone(
  tenantId: number,
  warehouseId: number,
  taskId: number,
  message?: string,
): Promise<void> {
  await api.post(
    `/wms/order-issue-tasks/${taskId}/done`,
    message ? { message } : {},
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
}
