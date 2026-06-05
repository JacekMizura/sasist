import type {
  OrderIssueTaskListItemApi,
  OrderIssueTaskSkippedItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { deriveBrakiWorkstreams } from "./brakiWorkflowCta";

export type NormalizedShortageQueueCard = {
  task_id: number;
  order_id: number;
  status: string;
  order_number: string;
  customer_name: string;
  workflow_stage: string;
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

/** Bezpieczna normalizacja karty kolejki Braki — nigdy nie rzuca. */
export function normalizeShortageQueueCard(
  raw: Partial<OrderIssueTaskListItemApi> & { task_id?: number },
): NormalizedShortageQueueCard {
  const taskId = safeInt(raw.id ?? raw.task_id, 0);
  const orderId = safeInt(raw.order_id, 0);
  const ws = raw.braki_workstreams
    ? {
        has_pick_work: Boolean(raw.braki_workstreams.has_pick_work),
        has_relocation_work: Boolean(raw.braki_workstreams.has_relocation_work),
        has_packing_ready: Boolean(raw.braki_workstreams.has_packing_ready),
        has_oms_pending: Boolean(raw.braki_workstreams.has_oms_pending),
        pick_line_count: safeInt(raw.braki_workstreams.pick_line_count),
        relocation_line_count: safeInt(raw.braki_workstreams.relocation_line_count),
        packing_ready_line_count: safeInt(raw.braki_workstreams.packing_ready_line_count),
        oms_line_count: safeInt(raw.braki_workstreams.oms_line_count),
        collected_line_count: safeInt(raw.braki_workstreams.collected_line_count),
      }
    : null;

  const derived = raw.id != null && raw.order_id != null ? deriveBrakiWorkstreams(raw as OrderIssueTaskListItemApi) : null;
  const counts = ws ?? derived;

  const recoveryCount =
    safeInt(raw.recovery_active_lines) ||
    safeInt(counts?.pick_line_count) ||
    safeInt(raw.unresolved_shortage_count) ||
    safeInt(raw.replacement_pick_pending_count);

  const relocationCount =
    safeInt(counts?.relocation_line_count) || safeInt(raw.replacement_pick_pending_count);

  const readyToPackCount =
    safeInt(counts?.packing_ready_line_count) || (raw.recovery_packing_allowed ? 1 : 0);

  const pickedCount = safeInt(counts?.collected_line_count);
  const missingCount =
    safeInt(counts?.oms_line_count) || safeInt(raw.unresolved_shortage_count) || recoveryCount;

  const warnings = [...(raw.queue_warnings ?? [])];
  const partial = Boolean(raw.partial_data) || warnings.length > 0;
  if (partial && !warnings.some((w) => w.includes("Niepełne dane"))) {
    warnings.push("Niepełne dane operacyjne");
  }

  const workflowStage =
    safeStr(raw.braki_workflow_status_label, "") ||
    safeStr(raw.issue_queue_summary_line, "") ||
    safeStr(raw.braki_workflow_status, "awaiting");

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
    braki_workstreams: raw.braki_workstreams,
    unresolved_shortage_count: safeInt(raw.unresolved_shortage_count),
    replacement_pick_pending_count: safeInt(raw.replacement_pick_pending_count),
    recovery_active_lines: safeInt(raw.recovery_active_lines),
    recovery_packing_allowed: raw.recovery_packing_allowed,
    recovery_has_relocation_work: raw.recovery_has_relocation_work,
    partial_data: partial,
    queue_warnings: warnings,
    issue_queue_summary_line: raw.issue_queue_summary_line,
    shortage_lifecycle_phase: raw.shortage_lifecycle_phase,
    shortage_priority_level: raw.shortage_priority_level,
    shortage_priority_label: raw.shortage_priority_label,
    shortage_priority_score: raw.shortage_priority_score,
  };

  if (import.meta.env.DEV && partial) {
    console.warn("[braki.queue] partial card", { taskId, orderId, warnings });
  }

  return {
    task_id: taskId,
    order_id: orderId,
    status: fullRaw.status,
    order_number: fullRaw.order_number,
    customer_name: fullRaw.customer_name ?? "—",
    workflow_stage: workflowStage,
    picked_count: pickedCount,
    recovery_count: recoveryCount,
    relocation_count: relocationCount,
    ready_to_pack_count: readyToPackCount,
    missing_count: missingCount,
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

export function mergeQueueCards(
  tasks: OrderIssueTaskListItemApi[],
  skipped: OrderIssueTaskSkippedItemApi[],
): NormalizedShortageQueueCard[] {
  const seen = new Set<number>();
  const out: NormalizedShortageQueueCard[] = [];
  for (const t of tasks) {
    const card = normalizeShortageQueueCard(t);
    if (card.task_id > 0) {
      seen.add(card.task_id);
      out.push(card);
    }
  }
  for (const s of skipped) {
    if (seen.has(s.task_id)) continue;
    out.push(shortageCardFromSkipped(s));
  }
  return out;
}
