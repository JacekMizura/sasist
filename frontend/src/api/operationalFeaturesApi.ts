import api from "./axios";
import type { OperationalFeaturesPayload } from "../services/operational/operationalFeatureGuard";

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
