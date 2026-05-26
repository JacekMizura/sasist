import api from "./axios";

export type WarehouseCarrierGroupRead = {
  id: number;
  tenant_id: number;
  name: string;
  code: string;
  color?: string | null;
  default_weight?: number | null;
  default_width?: number | null;
  default_height?: number | null;
  default_depth?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WarehouseCarrierRead = {
  id: number;
  tenant_id: number;
  code: string;
  barcode: string;
  name?: string | null;
  carrier_group_id?: number | null;
  carrier_group_code?: string | null;
  current_location_id?: number | null;
  current_location_code?: string | null;
  status: string;
  notes?: string | null;
  is_mixed: boolean;
  sku_count: number;
  total_qty: number;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type WarehouseCarrierItemRead = {
  id: number;
  product_id: number;
  product_sku?: string | null;
  product_ean?: string | null;
  product_name?: string | null;
  product_image_url?: string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  serial_number?: string | null;
  quantity: number;
  warehouse_stock_id?: number | null;
};

export type WarehouseCarrierDetailRead = WarehouseCarrierRead & {
  items: WarehouseCarrierItemRead[];
};

export type WarehouseCarrierLogRead = {
  id: number;
  operation_type: string;
  operation_type_label?: string | null;
  performed_by_user_id?: number | null;
  performed_by_name: string;
  metadata_json?: string | null;
  created_at?: string | null;
};

export type WarehouseCarrierScanOut = {
  found: boolean;
  carrier?: WarehouseCarrierRead | null;
};

export type WarehouseCarrierBulkCreateResult = {
  created_count: number;
  first_barcode: string;
  last_barcode: string;
  first_id: number;
  last_id: number;
};

export async function listWmsCarrierGroups(tenantId: number): Promise<WarehouseCarrierGroupRead[]> {
  const res = await api.get<WarehouseCarrierGroupRead[]>("/wms/carrier-groups", {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function createWmsCarrierGroup(
  tenantId: number,
  body: { name: string; code: string; color?: string | null },
): Promise<WarehouseCarrierGroupRead> {
  const res = await api.post<WarehouseCarrierGroupRead>("/wms/carrier-groups", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function bulkCreateWmsCarriers(
  tenantId: number,
  body: {
    group_id: number;
    prefix: string;
    quantity: number;
    status?: string;
    location_id?: number | null;
    notes?: string | null;
  },
): Promise<WarehouseCarrierBulkCreateResult> {
  const payload: Record<string, unknown> = {
    group_id: body.group_id,
    prefix: body.prefix,
    quantity: body.quantity,
  };
  if (body.status) payload.status = body.status;
  if (body.location_id != null && body.location_id >= 1) payload.location_id = body.location_id;
  if (body.notes != null && String(body.notes).trim()) payload.notes = String(body.notes).trim();
  const res = await api.post<WarehouseCarrierBulkCreateResult>("/wms/carriers/bulk-create", payload, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function listWmsCarriers(tenantId: number, includeDeleted = false): Promise<WarehouseCarrierRead[]> {
  const res = await api.get<WarehouseCarrierRead[]>("/wms/carriers", {
    params: { tenant_id: tenantId, include_deleted: includeDeleted },
  });
  return res.data;
}

export async function getWmsCarrier(tenantId: number, id: number): Promise<WarehouseCarrierDetailRead> {
  const res = await api.get<WarehouseCarrierDetailRead>(`/wms/carriers/${id}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function scanWmsCarrierByBarcode(tenantId: number, barcode: string): Promise<WarehouseCarrierScanOut> {
  const enc = encodeURIComponent(barcode.trim());
  const res = await api.get<WarehouseCarrierScanOut>(`/wms/carriers/scan/${enc}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function listWmsCarrierLogs(tenantId: number, carrierId: number): Promise<WarehouseCarrierLogRead[]> {
  const res = await api.get<WarehouseCarrierLogRead[]>(`/wms/carriers/${carrierId}/logs`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function createWmsCarrier(
  tenantId: number,
  body: {
    barcode_prefix?: string;
    code?: string | null;
    name?: string | null;
    carrier_group_id?: number | null;
    status?: string;
    current_location_id?: number | null;
    notes?: string | null;
  },
): Promise<WarehouseCarrierRead> {
  const res = await api.post<WarehouseCarrierRead>("/wms/carriers", body, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function patchWmsCarrier(
  tenantId: number,
  id: number,
  body: Partial<{
    name: string | null;
    status: string | null;
    current_location_id: number | null;
    carrier_group_id: number | null;
    notes: string | null;
    is_mixed: boolean | null;
  }>,
): Promise<WarehouseCarrierRead> {
  const res = await api.patch<WarehouseCarrierRead>(`/wms/carriers/${id}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteWmsCarrier(tenantId: number, id: number): Promise<void> {
  await api.delete(`/wms/carriers/${id}`, { params: { tenant_id: tenantId } });
}

export async function moveWmsCarrier(tenantId: number, id: number, toLocationId: number): Promise<WarehouseCarrierRead> {
  const res = await api.post<WarehouseCarrierRead>(
    `/wms/carriers/${id}/move`,
    { to_location_id: toLocationId },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function emptyWmsCarrier(tenantId: number, id: number): Promise<WarehouseCarrierRead> {
  const res = await api.post<WarehouseCarrierRead>(`/wms/carriers/${id}/empty`, {}, { params: { tenant_id: tenantId } });
  return res.data;
}
