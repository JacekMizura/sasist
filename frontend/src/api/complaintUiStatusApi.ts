import api from "./axios";

import type {
  ComplaintUiStatusCreatePayload,
  ComplaintUiStatusPanelSummary,
  ComplaintUiStatusRead,
  ComplaintUiStatusUpdatePayload,
} from "../types/complaintUiStatus";
import type { ComplaintDetail } from "../types/complaint";

export async function getComplaintUiStatusSummary(
  tenantId: number,
  warehouseId: number,
): Promise<ComplaintUiStatusPanelSummary> {
  const res = await api.get<ComplaintUiStatusPanelSummary>("office/complaint-ui/summary", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function createComplaintUiStatus(
  tenantId: number,
  body: ComplaintUiStatusCreatePayload,
): Promise<ComplaintUiStatusRead> {
  const res = await api.post<ComplaintUiStatusRead>("office/complaint-ui/statuses", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateComplaintUiStatus(
  statusId: number,
  tenantId: number,
  body: ComplaintUiStatusUpdatePayload,
): Promise<ComplaintUiStatusRead> {
  const res = await api.patch<ComplaintUiStatusRead>(`office/complaint-ui/statuses/${statusId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteComplaintUiStatus(statusId: number, tenantId: number): Promise<void> {
  await api.delete(`office/complaint-ui/statuses/${statusId}`, {
    params: { tenant_id: tenantId },
  });
}

export async function patchComplaintUiStatus(
  complaintId: number,
  tenantId: number,
  warehouseId: number,
  subStatusId: number | null,
): Promise<ComplaintDetail> {
  const res = await api.patch<ComplaintDetail>(
    `office/complaint-ui/complaints/${complaintId}/ui-status`,
    { sub_status_id: subStatusId },
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return res.data;
}
