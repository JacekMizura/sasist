/**
 * Backend Automation Engine API client (SSOT).
 * FE localStorage orderAutomation* remains LEGACY until a dedicated migration task.
 */
import api from "./axios";

export type AutomationEntityType = "ORDER" | "RETURN" | "COMPLAINT";

export type AutomationEffectDto = {
  id?: number;
  position: number;
  effect_type: string;
  config: Record<string, unknown>;
  enabled: boolean;
};

export type AutomationRuleDto = {
  id: number;
  tenant_id: number;
  warehouse_id: number | null;
  entity_type: AutomationEntityType | string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  source: string;
  created_at?: string | null;
  updated_at?: string | null;
  effects: AutomationEffectDto[];
};

export type AutomationRuleCreateBody = {
  tenant_id: number;
  warehouse_id?: number | null;
  entity_type: AutomationEntityType;
  name: string;
  enabled?: boolean;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  source?: string;
  effects?: Omit<AutomationEffectDto, "id">[];
};

export type AutomationExecutionDto = {
  id: number;
  rule_id: number;
  entity_type: string;
  entity_id: number;
  trigger_event_id: string;
  idempotency_key: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  effect_executions: Array<{
    id: number;
    effect_id?: number | null;
    position: number;
    effect_type: string;
    status: string;
    started_at?: string | null;
    completed_at?: string | null;
    error?: string | null;
    result?: Record<string, unknown> | null;
  }>;
};

export async function listAutomations(params: {
  tenantId: number;
  warehouseId?: number | null;
  entityType?: string;
  enabled?: boolean;
}): Promise<AutomationRuleDto[]> {
  const res = await api.get<AutomationRuleDto[]>("automations", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId ?? undefined,
      entity_type: params.entityType,
      enabled: params.enabled,
    },
  });
  return res.data;
}

export async function getAutomation(ruleId: number, tenantId: number): Promise<AutomationRuleDto> {
  const res = await api.get<AutomationRuleDto>(`automations/${ruleId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function createAutomation(body: AutomationRuleCreateBody): Promise<AutomationRuleDto> {
  const res = await api.post<AutomationRuleDto>("automations", body);
  return res.data;
}

export async function updateAutomation(
  ruleId: number,
  tenantId: number,
  body: Partial<AutomationRuleCreateBody> & { clear_warehouse?: boolean },
): Promise<AutomationRuleDto> {
  const res = await api.patch<AutomationRuleDto>(`automations/${ruleId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteAutomation(ruleId: number, tenantId: number): Promise<void> {
  await api.delete(`automations/${ruleId}`, { params: { tenant_id: tenantId } });
}

export async function enableAutomation(ruleId: number, tenantId: number): Promise<AutomationRuleDto> {
  const res = await api.post<AutomationRuleDto>(`automations/${ruleId}/enable`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function disableAutomation(ruleId: number, tenantId: number): Promise<AutomationRuleDto> {
  const res = await api.post<AutomationRuleDto>(`automations/${ruleId}/disable`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function listAutomationExecutions(
  ruleId: number,
  tenantId: number,
  limit = 50,
): Promise<AutomationExecutionDto[]> {
  const res = await api.get<AutomationExecutionDto[]>(`automations/${ruleId}/executions`, {
    params: { tenant_id: tenantId, limit },
  });
  return res.data;
}

export type StatusActionRuleDto = AutomationRuleDto & {
  last_execution_status?: string | null;
  last_run_at?: string | null;
};

export async function listStatusActions(params: {
  tenantId: number;
  entityType: AutomationEntityType;
  statusId: number;
  warehouseId?: number | null;
}): Promise<StatusActionRuleDto[]> {
  const res = await api.get<StatusActionRuleDto[]>("automations/status-actions", {
    params: {
      tenant_id: params.tenantId,
      entity_type: params.entityType,
      status_id: params.statusId,
      warehouse_id: params.warehouseId ?? undefined,
    },
  });
  return res.data;
}
