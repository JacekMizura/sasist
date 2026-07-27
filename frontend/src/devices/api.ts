import api from "../api/axios";
import type { EdgeDevice, EdgeDeviceAction, EdgeDeviceEvent, EdgeModule } from "./types";

export type ListDevicesParams = {
  tenantId: number;
  warehouseId?: number | null;
  agentId?: number | null;
  type?: string | null;
};

export async function fetchEdgeDevices(params: ListDevicesParams): Promise<EdgeDevice[]> {
  const { data } = await api.get<EdgeDevice[]>("/agent/devices", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId ?? undefined,
      agent_id: params.agentId ?? undefined,
      type: params.type ?? undefined,
    },
  });
  return data;
}

export async function fetchEdgeDevice(tenantId: number, deviceId: string): Promise<EdgeDevice> {
  const { data } = await api.get<EdgeDevice>(`/agent/device/${encodeURIComponent(deviceId)}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchEdgeModules(
  tenantId: number,
  warehouseId?: number | null,
): Promise<EdgeModule[]> {
  const { data } = await api.get<EdgeModule[]>("/agent/modules", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId ?? undefined,
    },
  });
  return data;
}

export async function fetchDeviceEvents(
  tenantId: number,
  agentId?: number | null,
): Promise<EdgeDeviceEvent[]> {
  const { data } = await api.get<EdgeDeviceEvent[]>("/agent/events", {
    params: { tenant_id: tenantId, agent_id: agentId ?? undefined },
  });
  return data;
}

export async function enqueueDeviceAction(args: {
  tenantId: number;
  agentId: number;
  action: string;
  moduleId?: string;
  deviceId?: string;
  parameters?: Record<string, unknown>;
}): Promise<EdgeDeviceAction> {
  const { data } = await api.post<EdgeDeviceAction>(
    "/agent/actions",
    {
      action: args.action,
      agent_id: args.agentId,
      module_id: args.moduleId,
      device_id: args.deviceId,
      parameters: args.parameters,
    },
    { params: { tenant_id: args.tenantId } },
  );
  return data;
}

export async function updateDeviceConfiguration(
  tenantId: number,
  deviceId: string,
  values: Record<string, unknown>,
  agentId?: number | null,
  configurationVersion?: string,
): Promise<EdgeDevice> {
  const { data } = await api.put<EdgeDevice>(
    `/agent/device/${encodeURIComponent(deviceId)}/configuration`,
    { values, configuration_version: configurationVersion },
    {
      params: {
        tenant_id: tenantId,
        agent_id: agentId ?? undefined,
      },
    },
  );
  return data;
}
