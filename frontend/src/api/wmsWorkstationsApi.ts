import api from "./axios";
import type {
  DevicesGrouped,
  HistoryEvent,
  PairingResponse,
  PrintersConfig,
  StationType,
  WorkstationDetail,
  WorkstationListItem,
} from "../types/wmsWorkstations";

export async function fetchWorkstations(
  tenantId: number,
  warehouseId?: number | null,
): Promise<WorkstationListItem[]> {
  const { data } = await api.get<{ items: WorkstationListItem[] }>("/wms/workstations", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId ?? undefined },
  });
  return Array.isArray(data.items) ? data.items : [];
}

/** Packing-allowed workstations for the logged-in operator. */
export async function fetchWorkstationsAvailableForMe(
  tenantId: number,
): Promise<WorkstationListItem[]> {
  const { data } = await api.get<{ items: WorkstationListItem[] }>("/wms/workstations/available-for-me", {
    params: { tenant_id: tenantId },
  });
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchWorkstation(
  tenantId: number,
  workstationId: number,
): Promise<WorkstationDetail> {
  const { data } = await api.get<WorkstationDetail>(`/wms/workstations/${workstationId}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function createWorkstation(
  tenantId: number,
  body: {
    name: string;
    warehouse_id: number;
    station_type?: StationType | string;
    description?: string | null;
    is_default?: boolean;
    is_active?: boolean;
  },
): Promise<WorkstationDetail> {
  const { data } = await api.post<WorkstationDetail>("/wms/workstations", body, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function updateWorkstation(
  tenantId: number,
  workstationId: number,
  body: Partial<{
    name: string;
    station_type: StationType | string;
    description: string | null;
    warehouse_id: number;
    is_default: boolean;
    is_active: boolean;
  }>,
): Promise<WorkstationDetail> {
  const { data } = await api.patch<WorkstationDetail>(
    `/wms/workstations/${workstationId}`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function deleteWorkstation(tenantId: number, workstationId: number): Promise<void> {
  await api.delete(`/wms/workstations/${workstationId}`, {
    params: { tenant_id: tenantId },
  });
}

export async function pairWorkstation(
  tenantId: number,
  workstationId: number,
): Promise<PairingResponse> {
  const { data } = await api.post<PairingResponse>(
    `/wms/workstations/${workstationId}/pair`,
    null,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function disconnectWorkstation(
  tenantId: number,
  workstationId: number,
): Promise<WorkstationDetail> {
  const { data } = await api.post<WorkstationDetail>(
    `/wms/workstations/${workstationId}/disconnect`,
    null,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function fetchWorkstationDevices(
  tenantId: number,
  workstationId: number,
): Promise<DevicesGrouped> {
  const { data } = await api.get<DevicesGrouped>(
    `/wms/workstations/${workstationId}/devices`,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function fetchWorkstationPrinters(
  tenantId: number,
  workstationId: number,
): Promise<PrintersConfig> {
  const { data } = await api.get<PrintersConfig>(
    `/wms/workstations/${workstationId}/printers`,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function putWorkstationPrinterMapping(
  tenantId: number,
  workstationId: number,
  mappings: { print_type: string; agent_printer_id: number | null }[],
): Promise<PrintersConfig> {
  const { data } = await api.put<PrintersConfig>(
    `/wms/workstations/${workstationId}/printer-mapping`,
    { mappings },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function fetchWorkstationPairingStatus(
  tenantId: number,
  workstationId: number,
): Promise<{
  id: number;
  connection_status: string;
  pairing_active: boolean;
  pairing_expires_at: string | null;
  computer_name: string | null;
  agent: WorkstationDetail["agent"];
}> {
  const { data } = await api.get<{
    id: number;
    connection_status: string;
    pairing_active: boolean;
    pairing_expires_at: string | null;
    computer_name: string | null;
    agent: WorkstationDetail["agent"];
  }>(`/wms/workstations/${workstationId}/pairing-status`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchWorkstationHistory(
  tenantId: number,
  workstationId: number,
  opts?: { limit?: number; offset?: number },
): Promise<HistoryEvent[]> {
  const { data } = await api.get<{ items: HistoryEvent[] }>(
    `/wms/workstations/${workstationId}/history`,
    {
      params: {
        tenant_id: tenantId,
        limit: opts?.limit ?? 100,
        offset: opts?.offset ?? 0,
      },
    },
  );
  return Array.isArray(data.items) ? data.items : [];
}
