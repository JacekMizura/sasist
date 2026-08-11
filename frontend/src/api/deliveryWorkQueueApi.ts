import { api } from "./client";

export type DeliveryWorkQueuePriority = "urgent" | "first" | "next" | "later";
export type DeliveryWorkPhase = "receiving" | "putaway";

export type DeliveryWorkQueueItem = {
  pz_id: number;
  document_number: string;
  document_type: string;
  supplier_name: string | null;
  delivery_id: number | null;
  delivery_name: string | null;
  status_label: string;
  warehouse_workflow_status: string;
  receiving_status: string;
  putaway_status: string;
  line_count: number;
  quantity_ordered: number;
  quantity_received: number;
  expected_date: string | null;
  created_at: string | null;
  queue_sort: number;
  priority: DeliveryWorkQueuePriority;
  work_phase: DeliveryWorkPhase;
  started: boolean;
  cta_label: string;
  cta_path: string;
};

export type DeliveryWorkQueueResponse = {
  tenant_id: number;
  warehouse_id: number;
  items: DeliveryWorkQueueItem[];
  total: number;
};

export async function getDeliveryWorkQueue(
  tenantId: number,
  warehouseId: number,
): Promise<DeliveryWorkQueueResponse> {
  const { data } = await api.get<DeliveryWorkQueueResponse>("wms/delivery-work-queue", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function reorderDeliveryWorkQueue(
  tenantId: number,
  warehouseId: number,
  orderedPzIds: number[],
): Promise<DeliveryWorkQueueResponse> {
  const { data } = await api.put<DeliveryWorkQueueResponse>(
    "wms/delivery-work-queue/reorder",
    { ordered_pz_ids: orderedPzIds },
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return data;
}

export async function setDeliveryWorkQueuePriority(
  tenantId: number,
  warehouseId: number,
  pzId: number,
  priority: DeliveryWorkQueuePriority,
): Promise<DeliveryWorkQueueItem> {
  const { data } = await api.patch<DeliveryWorkQueueItem>(
    `wms/delivery-work-queue/${pzId}/priority`,
    { priority },
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return data;
}
