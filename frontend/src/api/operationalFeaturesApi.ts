import api from "./axios";
import type { OperationalFeaturesPayload } from "../services/operational/operationalFeatureGuard";

export type OperationalFeaturesDebugPayload = {
  env: Record<string, boolean>;
  tenant: Record<string, boolean>;
  warehouse: Record<string, boolean>;
  resolved: {
    direct_sales: boolean;
    runtime: boolean;
    replenishment: boolean;
    operational_sales?: boolean;
    operational_sales_sessions?: boolean;
    resolution_scope?: string;
  };
};

export async function fetchOperationalFeatures(
  tenantId: number,
  warehouseId: number,
): Promise<OperationalFeaturesPayload> {
  const { data } = await api.get<OperationalFeaturesPayload>("operational/features", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return {
    direct_sales: Boolean(data?.direct_sales),
    runtime: Boolean(data?.runtime),
    replenishment: Boolean(data?.replenishment),
  };
}

export async function fetchOperationalFeaturesDebug(
  tenantId: number,
  warehouseId: number,
): Promise<OperationalFeaturesDebugPayload | null> {
  try {
    const { data } = await api.get<OperationalFeaturesDebugPayload>("operational/features/debug", {
      params: { tenant_id: tenantId, warehouse_id: warehouseId },
    });
    console.info("[operational.features.debug]", data);
    return data;
  } catch {
    return null;
  }
}
