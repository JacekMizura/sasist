import api from "./axios";

import type { OrderStatusOption } from "../types/wmsPackingSettings";

export async function listOrderStatuses(tenantId: number, warehouseId: number): Promise<OrderStatusOption[]> {
  const res = await api.get<{ items: OrderStatusOption[] }>("order-statuses", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return Array.isArray(res.data?.items) ? res.data.items : [];
}
