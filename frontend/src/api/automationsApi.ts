/**
 * Backend Automation Engine API client (SSOT).
 * Legacy localStorage is migration-only — no new rule writes.
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
  group?: string;
  enabled: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions?: unknown[];
  metadata?: Record<string, unknown>;
  source: string;
  runtime_ready?: boolean;
  validation_issues?: Array<{
    code: string;
    message: string;
    condition_type?: string;
    effect_type?: string;
  }>;
  created_at?: string | null;
  updated_at?: string | null;
  effects: AutomationEffectDto[];
};

export type AutomationRuleCreateBody = {
  tenant_id: number;
  warehouse_id?: number | null;
  entity_type: AutomationEntityType;
  name: string;
  group?: string;
  enabled?: boolean;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  conditions?: unknown[];
  metadata?: Record<string, unknown>;
  source?: string;
  effects?: Omit<AutomationEffectDto, "id">[];
};

export type AutomationExecutionDto = {
  id: number;
  rule_id: number;
  entity_type: string;
  entity_id: number;
  trigger_event_id?: string | null;
  run_kind?: string;
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
  source?: string;
}): Promise<AutomationRuleDto[]> {
  const res = await api.get<AutomationRuleDto[]>("automations", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId ?? undefined,
      entity_type: params.entityType,
      enabled: params.enabled,
      source: params.source,
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

export async function duplicateAutomation(ruleId: number, tenantId: number): Promise<AutomationRuleDto> {
  const res = await api.post<AutomationRuleDto>(`automations/${ruleId}/duplicate`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function testAutomation(
  ruleId: number,
  body: {
    tenant_id: number;
    entity_type?: AutomationEntityType;
    entity_id?: number | null;
    dry_run?: boolean;
    check_conditions?: boolean;
  },
): Promise<Record<string, unknown>> {
  const res = await api.post<Record<string, unknown>>(`automations/${ruleId}/test`, body);
  return res.data;
}

export async function runAutomation(
  ruleId: number,
  body: {
    tenant_id: number;
    entity_type: AutomationEntityType;
    entity_id: number;
    check_conditions?: boolean;
    dry_run?: boolean;
  },
): Promise<Record<string, unknown>> {
  const res = await api.post<Record<string, unknown>>(`automations/${ruleId}/run`, body);
  return res.data;
}

export async function importLegacyAutomations(body: {
  tenant_id: number;
  warehouse_id: number;
  entity_type?: AutomationEntityType;
  rules: unknown[];
}): Promise<{ created: number; skipped: number; errors: string[]; rule_ids: number[] }> {
  const res = await api.post("automations/import-legacy", body);
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

export type StatusActionOverviewEffectDto = {
  enabled: boolean;
  template_id?: number | null;
  user_id?: number | null;
};

export type StatusActionsOverviewDto = {
  by_status_id: Record<string, Record<string, StatusActionOverviewEffectDto>>;
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

/** One request: map of status_id → managed_key → { enabled, template_id?, user_id? }. */
export async function listStatusActionsOverview(params: {
  tenantId: number;
  entityType: AutomationEntityType;
  warehouseId?: number | null;
}): Promise<StatusActionsOverviewDto> {
  const res = await api.get<StatusActionsOverviewDto>("automations/status-actions/overview", {
    params: {
      tenant_id: params.tenantId,
      entity_type: params.entityType,
      warehouse_id: params.warehouseId ?? undefined,
    },
  });
  return res.data;
}

export async function upsertStatusActions(body: {
  tenant_id: number;
  entity_type: AutomationEntityType;
  status_id: number;
  warehouse_id?: number | null;
  status_name?: string | null;
  effects: Omit<AutomationEffectDto, "id">[];
}): Promise<StatusActionRuleDto> {
  const res = await api.put<StatusActionRuleDto>("automations/status-actions", body);
  return res.data;
}
