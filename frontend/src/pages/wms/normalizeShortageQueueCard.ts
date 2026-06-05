import type {
  OrderIssueTaskListItemApi,
  OrderIssueTaskSkippedItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { readBrakiOperationalState } from "./readBrakiOperationalState";

export type NormalizedShortageQueueCard = {
  task_id: number;
  order_id: number;
  status: string;
  order_number: string;
  customer_name: string;
  workflow_stage: string;
  queue_stage: string;
  picked_count: number;
  recovery_count: number;
  relocation_count: number;
  ready_to_pack_count: number;
  missing_count: number;
  warnings: string[];
  partial_data: boolean;
  raw: OrderIssueTaskListItemApi;
};

function safeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function safeStr(v: unknown, fallback = "—"): string {
  const s = (v ?? "").toString().trim();
  return s || fallback;
}

/** Bezpieczna normalizacja karty kolejki Braki — tylko odczyt pól z resolvera. */
export function normalizeShortageQueueCard(
  raw: Partial<OrderIssueTaskListItemApi> & { task_id?: number },
): NormalizedShortageQueueCard {
  const taskId = safeInt(raw.id ?? raw.task_id, 0);
  const orderId = safeInt(raw.order_id, 0);

  const fullRaw: OrderIssueTaskListItemApi = {
    id: taskId,
    order_id: orderId,
    order_number: safeStr(raw.order_number, orderId > 0 ? `#${orderId}` : "—"),
    order_status: safeStr(raw.order_status, ""),
    customer_name: safeStr(raw.customer_name, "—"),
    task_type: safeStr(raw.task_type, "MIXED"),
    recommended_action: safeStr(raw.recommended_action, "MIXED"),
    ui_decision: safeStr(raw.ui_decision, "PARTIAL"),
    new_product_lines: raw.new_product_lines ?? [],
    shortage_lines: raw.shortage_lines ?? [],
    order_context: raw.order_context,
    status: safeStr(raw.status, "OPEN"),
    missing_items: raw.missing_items ?? [],
    picked_items: raw.picked_items ?? [],
    missing_skus_label: safeStr(raw.missing_skus_label, ""),
    logs: raw.logs ?? [],
    created_at: safeStr(raw.created_at, ""),
    order_ui_status_name: raw.order_ui_status_name ?? null,
    braki_workflow_status: raw.braki_workflow_status,
    braki_workflow_status_label: raw.braki_workflow_status_label,
    braki_operational_state: raw.braki_operational_state,
    braki_workstreams: raw.braki_workstreams,
    unresolved_shortage_count: safeInt(raw.unresolved_shortage_count),
    replacement_pick_pending_count: safeInt(raw.replacement_pick_pending_count),
    recovery_active_lines: safeInt(raw.recovery_active_lines),
    recovery_packing_allowed: raw.recovery_packing_allowed,
    recovery_has_relocation_work: raw.recovery_has_relocation_work,
    can_close_shortage: raw.can_close_shortage,
    partial_data: Boolean(raw.partial_data),
    queue_warnings: raw.queue_warnings ?? [],
    issue_queue_summary_line: raw.issue_queue_summary_line,
    shortage_lifecycle_phase: raw.shortage_lifecycle_phase,
    shortage_priority_level: raw.shortage_priority_level,
    shortage_priority_label: raw.shortage_priority_label,
    shortage_priority_score: raw.shortage_priority_score,
  };

  const op = readBrakiOperationalState(fullRaw);
  const ws = op.workstreams;
  const warnings = [...op.warnings, ...(fullRaw.queue_warnings ?? [])];
  const partial = Boolean(fullRaw.partial_data) || warnings.length > 0;

  if (import.meta.env.DEV && partial) {
    console.warn("[braki.queue] partial card", { taskId, orderId, warnings });
  }

  return {
    task_id: taskId,
    order_id: orderId,
    status: fullRaw.status,
    order_number: fullRaw.order_number,
    customer_name: fullRaw.customer_name ?? "—",
    workflow_stage: op.workflow_stage || safeStr(fullRaw.braki_workflow_status_label, "Braki w realizacji"),
    queue_stage: op.queue_stage,
    picked_count: ws.collected_line_count,
    recovery_count: ws.pick_line_count,
    relocation_count: ws.relocation_line_count,
    ready_to_pack_count: ws.packing_ready_line_count,
    missing_count: ws.oms_line_count,
    warnings,
    partial_data: partial,
    raw: fullRaw,
  };
}

/** Karta z pominiętego zadania API — zawsze renderowalna. */
export function shortageCardFromSkipped(skip: OrderIssueTaskSkippedItemApi): NormalizedShortageQueueCard {
  return normalizeShortageQueueCard({
    task_id: skip.task_id,
    id: skip.task_id,
    order_id: skip.order_id,
    order_number: skip.order_number || `#${skip.order_id}`,
    customer_name: "—",
    status: "OPEN",
    task_type: "MIXED",
    recommended_action: "MIXED",
    ui_decision: "PARTIAL",
    partial_data: true,
    queue_warnings: [skip.error_message || "Niepełne dane operacyjne"],
    braki_workflow_status: "awaiting",
    braki_workflow_status_label: "Wymaga obsługi",
  });
}

