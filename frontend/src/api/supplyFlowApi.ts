import api from "./axios";

export type SupplyFlowCta = {
  module?: string | null;
  path?: string | null;
  label?: string | null;
  delivery_id?: number | null;
  extras?: Record<string, unknown>;
};

export type SupplyFlowNextAction = {
  kind?: string | null;
  delivery_id?: number | null;
  line_id?: number | null;
  path?: string | null;
  label?: string | null;
  plan_version?: number | null;
  extras?: Record<string, unknown>;
};

export type SupplyFlowExplainable = {
  decision?: Record<string, unknown>;
  why?: string[];
  top_policies?: Array<{
    policy?: string;
    source?: string;
    score?: number;
    weight?: number;
    reason?: string;
  }>;
  inputs_used?: Record<string, unknown>;
  business_effect?: Record<string, unknown>;
  delivery_id?: number | null;
  priority?: number | null;
  meta?: Record<string, unknown>;
};

export type SupplyFlowRecommendation = {
  action?: string;
  delivery_id?: number | null;
  pz_id?: number | null;
  phase?: string | null;
  label?: string;
  module?: string;
  priority?: number;
  explanation?: SupplyFlowExplainable;
};

export type SupplyFlowExecutionStep = {
  seq: number;
  recommendation_index?: number;
  action?: string;
  label?: string;
  module?: string;
  goal?: string;
  status?: string;
  delivery_id?: number | null;
  pz_id?: number | null;
  phase?: string | null;
  priority?: number | null;
  recommendation_ref?: Record<string, unknown>;
};

export type SupplyFlowExecutionPlan = {
  steps?: SupplyFlowExecutionStep[];
  delivery_groups?: Array<{
    delivery_id?: number | null;
    step_seqs?: number[];
    step_count?: number;
    goals?: string[];
    actions?: string[];
    max_priority?: number | null;
  }>;
  status?: string;
  step_count?: number;
  meta?: Record<string, unknown>;
};

export type SupplyFlowStepState = {
  seq: number;
  status?: string;
  delivery_id?: number | null;
  pz_id?: number | null;
  action?: string | null;
  last_event?: string | null;
  updated_at?: string | null;
  note?: string | null;
};

export type SupplyFlowExecutionState = {
  steps?: SupplyFlowStepState[];
  status?: string;
  plan_step_count?: number;
  plan_version?: number | null;
  updated_at?: string | null;
  meta?: Record<string, unknown>;
};

export type SupplyFlowProjection = {
  recommendations?: SupplyFlowRecommendation[];
  delivery_priorities?: Record<string, number>;
  business_effect?: Record<string, unknown>;
  explainable_decisions?: SupplyFlowExplainable[];
  execution_plan?: SupplyFlowExecutionPlan;
  execution_state?: SupplyFlowExecutionState;
  rationale?: string[];
  unload_sequence?: Array<Record<string, unknown>>;
  putaway_sequence?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
};

export type SupplyFlowLivingPlan = {
  tenant_id: number;
  warehouse_id: number;
  plan_version: number;
  computed_at?: string | null;
  optimization_goal: string;
  planning_horizon_hours: number;
  projection: SupplyFlowProjection;
  cta?: SupplyFlowCta | null;
  next_action?: SupplyFlowNextAction | null;
  last_recompute_trigger?: string | null;
  has_plan: boolean;
};

export type SupplyFlowConfig = {
  tenant_id: number;
  warehouse_id: number;
  optimization_goal: string;
  planning_horizon_hours: number;
};

export async function getSupplyFlowPlan(
  tenantId: number,
  warehouseId: number,
): Promise<SupplyFlowLivingPlan> {
  const { data } = await api.get<SupplyFlowLivingPlan>("wms/supply-flow/plan", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function recomputeSupplyFlowPlan(
  tenantId: number,
  warehouseId: number,
  deliveryId?: number | null,
): Promise<SupplyFlowLivingPlan> {
  const { data } = await api.post<SupplyFlowLivingPlan>(
    "wms/supply-flow/recompute",
    deliveryId != null ? { delivery_id: deliveryId } : {},
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return data;
}

export async function getSupplyFlowConfig(
  tenantId: number,
  warehouseId: number,
): Promise<SupplyFlowConfig> {
  const { data } = await api.get<SupplyFlowConfig>("wms/supply-flow/config", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function patchSupplyFlowConfig(
  tenantId: number,
  warehouseId: number,
  body: { optimization_goal?: string; planning_horizon_hours?: number },
): Promise<SupplyFlowConfig> {
  const { data } = await api.patch<SupplyFlowConfig>("wms/supply-flow/config", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}
