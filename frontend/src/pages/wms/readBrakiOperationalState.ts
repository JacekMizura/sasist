import type {
  BrakiActiveOperationsApi,
  BrakiOperationalStateApi,
  BrakiWorkstreamsApi,
  OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import type { BrakiWorkstreams } from "./brakiWorkflowCta";

const EMPTY_WORKSTREAMS: BrakiWorkstreams = {
  has_pick_work: false,
  has_relocation_work: false,
  has_packing_ready: false,
  has_oms_pending: false,
  pick_line_count: 0,
  relocation_line_count: 0,
  packing_ready_line_count: 0,
  oms_line_count: 0,
  collected_line_count: 0,
};

const EMPTY_LOCKS: BrakiActiveOperationsApi = {
  recovery_session: false,
  relocation_session: false,
  packing_session: false,
  oms_locked: false,
};

function safeInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function readWorkstreams(ws: BrakiWorkstreamsApi | null | undefined): BrakiWorkstreams {
  if (!ws) return { ...EMPTY_WORKSTREAMS };
  return {
    has_pick_work: Boolean(ws.has_pick_work),
    has_relocation_work: Boolean(ws.has_relocation_work),
    has_packing_ready: Boolean(ws.has_packing_ready),
    has_oms_pending: Boolean(ws.has_oms_pending),
    pick_line_count: safeInt(ws.pick_line_count),
    relocation_line_count: safeInt(ws.relocation_line_count),
    packing_ready_line_count: safeInt(ws.packing_ready_line_count),
    oms_line_count: safeInt(ws.oms_line_count),
    collected_line_count: safeInt(ws.collected_line_count),
  };
}

function readLocks(locks: BrakiActiveOperationsApi | null | undefined): BrakiActiveOperationsApi {
  if (!locks) return { ...EMPTY_LOCKS };
  return {
    recovery_session: Boolean(locks.recovery_session),
    relocation_session: Boolean(locks.relocation_session),
    packing_session: Boolean(locks.packing_session),
    oms_locked: Boolean(locks.oms_locked),
  };
}

export type BrakiOperationalStateView = {
  workflow_stage: string;
  queue_stage: string;
  operational_mode: string;
  can_remove_from_braki: boolean;
  can_close_shortage: boolean;
  active_operations: BrakiActiveOperationsApi;
  workstreams: BrakiWorkstreams;
  packing_allowed: boolean;
  relocation_required: boolean;
  recovery_required: boolean;
  warnings: string[];
  shortage_lifecycle_phase: string;
  relocation_task_id: number | null;
  relocation_mode: string | null;
  partial_data: boolean;
};

function fromOperationalState(
  op: BrakiOperationalStateApi,
  task: OrderIssueTaskListItemApi,
): BrakiOperationalStateView {
  return {
    workflow_stage: (op.workflow_stage ?? "").trim(),
    queue_stage: (op.queue_stage ?? task.braki_workflow_status ?? "awaiting").trim() || "awaiting",
    operational_mode: (op.operational_mode ?? "SINGLE").trim() || "SINGLE",
    can_remove_from_braki: Boolean(op.can_remove_from_braki),
    can_close_shortage: Boolean(op.can_close_shortage),
    active_operations: readLocks(op.active_operations),
    workstreams: readWorkstreams(op.braki_workstreams),
    packing_allowed: Boolean(op.packing_allowed),
    relocation_required: Boolean(op.relocation_required),
    recovery_required: Boolean(op.recovery_required),
    warnings: [...(op.warnings ?? [])],
    shortage_lifecycle_phase: (op.shortage_lifecycle_phase ?? task.shortage_lifecycle_phase ?? "").trim(),
    relocation_task_id:
      op.relocation_task_id != null && Number(op.relocation_task_id) > 0
        ? Number(op.relocation_task_id)
        : task.relocation_task_id != null && Number(task.relocation_task_id) > 0
          ? Number(task.relocation_task_id)
          : null,
    relocation_mode: op.relocation_mode ?? task.relocation_mode ?? null,
    partial_data: Boolean(task.partial_data),
  };
}

/** Jedyny odczyt stanu operacyjnego Braki — bez inferencji z order_context. */
export function readBrakiOperationalState(task: OrderIssueTaskListItemApi): BrakiOperationalStateView {
  const op = task.braki_operational_state;
  if (op) return fromOperationalState(op, task);

  return {
    workflow_stage: (task.braki_workflow_status_label ?? task.issue_queue_summary_line ?? "").trim(),
    queue_stage: (task.braki_workflow_status ?? "awaiting").trim() || "awaiting",
    operational_mode: "SINGLE",
    can_remove_from_braki: task.can_close_shortage === true,
    can_close_shortage: task.can_close_shortage === true,
    active_operations: { ...EMPTY_LOCKS },
    workstreams: readWorkstreams(task.braki_workstreams),
    packing_allowed: task.recovery_packing_allowed === true,
    relocation_required: task.recovery_has_relocation_work === true,
    recovery_required: (task.recovery_active_lines ?? 0) > 0,
    warnings: [...(task.queue_warnings ?? [])],
    shortage_lifecycle_phase: (task.shortage_lifecycle_phase ?? "").trim(),
    relocation_task_id:
      task.relocation_task_id != null && Number(task.relocation_task_id) > 0
        ? Number(task.relocation_task_id)
        : null,
    relocation_mode: task.relocation_mode ?? null,
    partial_data: Boolean(task.partial_data),
  };
}

export function readBrakiWorkstreams(task: OrderIssueTaskListItemApi): BrakiWorkstreams {
  return readBrakiOperationalState(task).workstreams;
}

export function readBrakiQueueStage(task: OrderIssueTaskListItemApi): string {
  return readBrakiOperationalState(task).queue_stage;
}
