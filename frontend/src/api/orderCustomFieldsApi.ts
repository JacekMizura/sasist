import api from "./axios";

export const ORDER_CUSTOM_FIELD_TYPES = [
  "TEXT",
  "NUMBER",
  "FILES",
  "SELECT_SINGLE",
  "SELECT_MULTI",
  "SALES_DOCUMENT",
  "SHIPPING_LABEL",
] as const;

export type OrderCustomFieldType = (typeof ORDER_CUSTOM_FIELD_TYPES)[number];

export type OrderCustomFieldOptionDto = {
  id: number;
  label: string;
  icon_file_id?: number | null;
  sort_order: number;
};

export type OrderCustomFieldDto = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  name: string;
  slug: string;
  type: string;
  settings_json?: Record<string, unknown> | null;
  icon_file_id?: number | null;
  sort_order: number;
  is_active: boolean;
  options: OrderCustomFieldOptionDto[];
};

export type OrderCustomFieldValueStateDto = {
  field_id: number;
  string_value?: string | null;
  number_value?: number | null;
  json_value?: unknown;
};

export type OrderCustomFieldWithValueDto = {
  field: OrderCustomFieldDto;
  value: OrderCustomFieldValueStateDto | null;
};

export type OrderCustomFieldWritePayload = {
  name: string;
  slug?: string | null;
  type: string;
  settings_json?: Record<string, unknown> | null;
  icon_file_id?: number | null;
  sort_order: number;
  is_active: boolean;
  options: { id?: number | null; label: string; icon_file_id?: number | null; sort_order: number }[];
};

export type OrderCustomFieldValueStorePayload = {
  field_id: number;
  string_value?: string | null;
  number_value?: number | null;
  json_value?: unknown;
};

export async function listOrderCustomFields(params: {
  tenant_id: number;
  warehouse_id: number;
  active_only?: boolean;
  sort?: "sort_order" | "name" | "-name";
}): Promise<OrderCustomFieldDto[]> {
  const res = await api.get<OrderCustomFieldDto[]>("/order-custom-fields/", { params });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createOrderCustomField(
  params: { tenant_id: number; warehouse_id: number },
  body: OrderCustomFieldWritePayload,
): Promise<OrderCustomFieldDto> {
  const res = await api.post<OrderCustomFieldDto>("/order-custom-fields/", body, { params });
  return res.data;
}

export async function updateOrderCustomField(
  fieldId: number,
  params: { tenant_id: number; warehouse_id: number },
  body: OrderCustomFieldWritePayload,
): Promise<OrderCustomFieldDto> {
  const res = await api.put<OrderCustomFieldDto>(`/order-custom-fields/${fieldId}/`, body, { params });
  return res.data;
}

export async function deleteOrderCustomField(
  fieldId: number,
  params: { tenant_id: number; warehouse_id: number },
): Promise<void> {
  await api.delete(`/order-custom-fields/${fieldId}/`, { params });
}

export async function bulkDeleteOrderCustomFields(
  params: { tenant_id: number; warehouse_id: number },
  ids: number[],
): Promise<{ deleted: number }> {
  const res = await api.post<{ deleted: number }>("/order-custom-fields/bulk-delete/", { ids }, { params });
  return res.data;
}

export async function getOrderCustomFieldsWithValues(orderId: number): Promise<OrderCustomFieldWithValueDto[]> {
  const res = await api.get<OrderCustomFieldWithValueDto[]>(`/orders/${orderId}/custom-fields/`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function putOrderCustomFieldValues(
  orderId: number,
  values: OrderCustomFieldValueStorePayload[],
): Promise<{ ok: boolean }> {
  const res = await api.put<{ ok: boolean }>(`/orders/${orderId}/custom-fields/`, { values });
  return res.data;
}

export async function uploadOrderCustomFieldFile(orderId: number, fieldId: number, file: File): Promise<Record<string, unknown>> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post<Record<string, unknown>>(`/orders/${orderId}/custom-fields/${fieldId}/files/`, fd);
  return res.data;
}

export async function uploadOrderCustomFieldDefinitionIcon(
  fieldId: number,
  params: { tenant_id: number; warehouse_id: number },
  file: File,
): Promise<OrderCustomFieldDto> {
  const fd = new FormData();
  // Backend accepts multipart field "file" (primary) or "icon" (alias).
  fd.append("file", file);
  const res = await api.post<OrderCustomFieldDto>(`/order-custom-fields/${fieldId}/definition-icon/`, fd, {
    params,
    // Let the browser set multipart boundary — do not set Content-Type manually.
  });
  return res.data;
}

export async function removeOrderCustomFieldDefinitionIcon(
  fieldId: number,
  params: { tenant_id: number; warehouse_id: number },
): Promise<OrderCustomFieldDto> {
  const res = await api.delete<OrderCustomFieldDto>(`/order-custom-fields/${fieldId}/definition-icon/`, { params });
  return res.data;
}
