import api from "./axios";

export type TaskOrchestrationState = {
  task_id: number;
  orchestration_state: string | null;
  status: string;
  assigned_user_id: number | null;
  blocked_reason: string | null;
};

export async function assignOperationalTask(
  tenantId: number,
  taskId: number,
  operatorUserId: number,
  activate = false,
): Promise<TaskOrchestrationState> {
  const { data } = await api.post<TaskOrchestrationState>(
    `operational-orchestration/tasks/${taskId}/assign`,
    { operator_user_id: operatorUserId, activate },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function transitionOperationalTask(
  tenantId: number,
  taskId: number,
  newState: string,
  blockedReason?: string,
): Promise<TaskOrchestrationState> {
  const { data } = await api.post<TaskOrchestrationState>(
    `operational-orchestration/tasks/${taskId}/transition`,
    { new_state: newState, blocked_reason: blockedReason ?? null },
    { params: { tenant_id: tenantId } },
  );
  return data;
}
