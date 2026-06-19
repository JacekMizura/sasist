import api from "./axios";

import type { ReturnModuleConfigDto, WmsReturnModuleConfigDto } from "../types/returnModuleConfig";

function params(tenantId: number, warehouseId?: number | null) {
  const p: Record<string, number> = { tenant_id: tenantId };
  if (warehouseId != null && Number.isFinite(warehouseId) && warehouseId > 0) {
    p.warehouse_id = Math.floor(warehouseId);
  }
  return { params: p };
}

export async function getOfficeReturnModuleConfig(args: {
  tenantId: number;
  warehouseId?: number | null;
}): Promise<ReturnModuleConfigDto> {
  const res = await api.get<ReturnModuleConfigDto>("office/return-module/config", params(args.tenantId, args.warehouseId));
  return res.data;
}

export async function putOfficeReturnModuleConfig(
  body: ReturnModuleConfigDto,
  args: { tenantId: number; warehouseId?: number | null },
): Promise<ReturnModuleConfigDto> {
  const res = await api.put<ReturnModuleConfigDto>("office/return-module/config", body, params(args.tenantId, args.warehouseId));
  return res.data;
}

export async function getWmsReturnModuleConfig(args: {
  tenantId: number;
  warehouseId?: number | null;
}): Promise<WmsReturnModuleConfigDto> {
  const res = await api.get<WmsReturnModuleConfigDto>("wms/return-module/config", params(args.tenantId, args.warehouseId));
  return res.data;
}

export async function uploadReturnOrderSourceLogo(
  file: File,
  args: { tenantId: number; warehouseId?: number | null },
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<{ logo_url: string }>("office/return-module/order-sources/logo", form, {
    ...params(args.tenantId, args.warehouseId),
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.logo_url;
}
