import api from "./axios";

import type {
  ReturnUiMainGroup,
  ReturnUiPanelSubgroupRead,
  ReturnUiStatusCreatePayload,
  ReturnUiStatusPanelSummary,
  ReturnUiStatusRead,
  ReturnUiStatusUpdatePayload,
  WmsReturnRead,
} from "../types/wmsReturn";

function officeReturnUiParams(tenantId: number, warehouseId?: number | null, extra?: Record<string, boolean>) {
  const p: Record<string, number | boolean> = { tenant_id: tenantId };
  if (warehouseId != null && Number.isFinite(warehouseId)) {
    p.warehouse_id = warehouseId;
  }
  if (extra) Object.assign(p, extra);
  return { params: p };
}

export async function getReturnPanelSubgroups(
  tenantId: number,
  warehouseId?: number | null,
): Promise<ReturnUiPanelSubgroupRead[]> {
  const res = await api.get<ReturnUiPanelSubgroupRead[]>("office/return-ui/panel-subgroups", officeReturnUiParams(tenantId, warehouseId));
  return res.data;
}

export async function createReturnPanelSubgroup(
  tenantId: number,
  body: { main_group: ReturnUiMainGroup; name: string },
  warehouseId?: number | null,
): Promise<ReturnUiPanelSubgroupRead> {
  const res = await api.post<ReturnUiPanelSubgroupRead>("office/return-ui/panel-subgroups", body, officeReturnUiParams(tenantId, warehouseId));
  return res.data;
}

export async function updateReturnPanelSubgroup(
  subgroupId: number,
  tenantId: number,
  body: { name?: string; sort_order?: number },
  warehouseId?: number | null,
): Promise<ReturnUiPanelSubgroupRead> {
  const res = await api.patch<ReturnUiPanelSubgroupRead>(
    `office/return-ui/panel-subgroups/${subgroupId}`,
    body,
    officeReturnUiParams(tenantId, warehouseId),
  );
  return res.data;
}

export async function deleteReturnPanelSubgroup(
  subgroupId: number,
  tenantId: number,
  warehouseId?: number | null,
): Promise<void> {
  await api.delete(`office/return-ui/panel-subgroups/${subgroupId}`, officeReturnUiParams(tenantId, warehouseId));
}

export async function reorderReturnPanelSubgroups(
  tenantId: number,
  body: { main_group: ReturnUiMainGroup; subgroup_id: number; direction: "up" | "down" },
  warehouseId?: number | null,
): Promise<ReturnUiPanelSubgroupRead[]> {
  const res = await api.post<ReturnUiPanelSubgroupRead[]>(
    "office/return-ui/panel-subgroups/reorder",
    body,
    officeReturnUiParams(tenantId, warehouseId),
  );
  return res.data;
}

/** When `warehouseId` is omitted, the server uses the tenant default warehouse. */
export async function getReturnUiStatusSummary(
  tenantId: number,
  warehouseId?: number | null,
  opts?: { includeInactive?: boolean },
): Promise<ReturnUiStatusPanelSummary> {
  const res = await api.get<ReturnUiStatusPanelSummary>(
    "office/return-ui/summary",
    officeReturnUiParams(tenantId, warehouseId, opts?.includeInactive ? { include_inactive: true } : {}),
  );
  return res.data;
}

export async function uploadReturnUiStatusImage(
  statusId: number,
  tenantId: number,
  file: File,
  warehouseId?: number | null,
): Promise<ReturnUiStatusRead> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post<ReturnUiStatusRead>(`office/return-ui/statuses/${statusId}/image`, fd, {
    ...officeReturnUiParams(tenantId, warehouseId),
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function createReturnUiStatus(
  tenantId: number,
  body: ReturnUiStatusCreatePayload,
  warehouseId?: number | null,
): Promise<ReturnUiStatusRead> {
  const res = await api.post<ReturnUiStatusRead>("office/return-ui/statuses", body, officeReturnUiParams(tenantId, warehouseId));
  return res.data;
}

export async function updateReturnUiStatus(
  statusId: number,
  tenantId: number,
  body: ReturnUiStatusUpdatePayload,
  warehouseId?: number | null,
): Promise<ReturnUiStatusRead> {
  const res = await api.patch<ReturnUiStatusRead>(
    `office/return-ui/statuses/${statusId}`,
    body,
    officeReturnUiParams(tenantId, warehouseId),
  );
  return res.data;
}

export async function deleteReturnUiStatus(statusId: number, tenantId: number, warehouseId?: number | null): Promise<void> {
  await api.delete(`office/return-ui/statuses/${statusId}`, officeReturnUiParams(tenantId, warehouseId));
}

export async function patchReturnRmzUiStatus(
  rmzId: number,
  tenantId: number,
  uiStatusId: number | null,
  warehouseId?: number | null,
): Promise<WmsReturnRead> {
  const res = await api.patch<WmsReturnRead>(
    `office/return-ui/returns/${rmzId}/ui-status`,
    { sub_status_id: uiStatusId },
    officeReturnUiParams(tenantId, warehouseId),
  );
  return res.data;
}
