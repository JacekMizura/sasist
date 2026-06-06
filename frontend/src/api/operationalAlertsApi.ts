import { normalizeOperationalAlert } from "../utils/normalizeOperationalApi";
import api from "./axios";

export type OperationalAlert = {
  id: number;
  alert_type: string;
  severity: string;
  status: string;
  title: string;
  message?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

export async function fetchOperationalAlerts(
  tenantId: number,
  warehouseId: number,
  limit = 50,
): Promise<OperationalAlert[]> {
  const { data } = await api.get<OperationalAlert[]>("operational-alerts", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, limit },
  });
  return (data ?? []).map(normalizeOperationalAlert);
}

export async function ackOperationalAlert(tenantId: number, alertId: number): Promise<OperationalAlert> {
  const { data } = await api.post<OperationalAlert>(`operational-alerts/${alertId}/ack`, null, {
    params: { tenant_id: tenantId },
  });
  return normalizeOperationalAlert(data);
}
