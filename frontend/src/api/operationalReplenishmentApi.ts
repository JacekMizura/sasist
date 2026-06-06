import api from "./axios";

export type ReplenishmentRule = {
  id: number;
  warehouse_id: number;
  product_id: number | null;
  zone_type: string;
  task_type: string;
  min_qty: number;
  max_qty: number | null;
  target_qty: number | null;
  preferred_source_zone_type: string | null;
  priority: number;
  is_active: boolean;
  updated_at?: string | null;
};

export type ReplenishmentScanResult = {
  created: number;
  tasks: Array<Record<string, unknown>>;
  skipped?: string | null;
};

export async function fetchReplenishmentRules(
  tenantId: number,
  warehouseId: number,
): Promise<ReplenishmentRule[]> {
  const { data } = await api.get<ReplenishmentRule[]>("operational-replenishment/rules", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function scanReplenishment(
  tenantId: number,
  warehouseId: number,
  productId?: number,
): Promise<ReplenishmentScanResult> {
  const { data } = await api.post<ReplenishmentScanResult>(
    "operational-replenishment/scan",
    null,
    {
      params: {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        ...(productId != null ? { product_id: productId } : {}),
      },
    },
  );
  return data;
}

export type ReplenishmentExecuteStepResult = {
  task_id: number;
  orchestration_state: string | null;
  status: string;
  quantity_done: number;
  task_payload: Record<string, unknown>;
};

export async function executeReplenishmentStep(
  tenantId: number,
  taskId: number,
  body: { step: string; scan_code?: string; note?: string },
): Promise<ReplenishmentExecuteStepResult> {
  const { data } = await api.post<ReplenishmentExecuteStepResult>(
    `operational-replenishment/tasks/${taskId}/execute-step`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return data;
}
