import api from "./axios";

export type ProductCustomFieldType =
  | "TEXT"
  | "NUMBER"
  | "FILES"
  | "SELECT_SINGLE"
  | "SELECT_MULTI"
  | "GPSR_ATTACHMENTS"
  | "ATTACHMENTS";

export type ProductCustomFieldOption = {
  id?: number;
  label: string;
  sort_order?: number;
};

export type ProductCustomFieldDto = {
  id: number;
  tenant_id: number;
  name: string;
  slug: string;
  type: ProductCustomFieldType | string;
  settings_json?: Record<string, unknown> | null;
  sort_order: number;
  is_active: boolean;
  options: Array<ProductCustomFieldOption & { id: number }>;
};

export type ProductCustomFieldWrite = {
  name: string;
  slug?: string | null;
  type: string;
  settings_json?: Record<string, unknown> | null;
  sort_order?: number;
  is_active?: boolean;
  options?: ProductCustomFieldOption[];
};

export type ProductCustomFieldValueState = {
  field_id: number;
  string_value?: string | null;
  number_value?: number | null;
  json_value?: unknown;
};

export type ProductCustomFieldWithValue = {
  field: ProductCustomFieldDto;
  value?: ProductCustomFieldValueState | null;
};

export type ProductAttachmentKind = { value: string; label: string };

export type ProductCustomFieldFileMeta = {
  original_filename: string;
  stored_filename: string;
  file_url: string;
  size: number;
};

export async function listProductAttachmentKinds(): Promise<ProductAttachmentKind[]> {
  const res = await api.get<ProductAttachmentKind[]>("/product-custom-fields/attachment-kinds");
  return res.data;
}

export async function listProductCustomFields(
  tenantId: number,
  opts?: { includeInactive?: boolean },
): Promise<ProductCustomFieldDto[]> {
  const res = await api.get<ProductCustomFieldDto[]>("/product-custom-fields", {
    params: { tenant_id: tenantId, include_inactive: opts?.includeInactive ?? true },
  });
  return res.data;
}

export async function getProductCustomField(tenantId: number, fieldId: number): Promise<ProductCustomFieldDto> {
  const res = await api.get<ProductCustomFieldDto>(`/product-custom-fields/${fieldId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function createProductCustomField(
  tenantId: number,
  body: ProductCustomFieldWrite,
): Promise<ProductCustomFieldDto> {
  const res = await api.post<ProductCustomFieldDto>("/product-custom-fields", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateProductCustomField(
  tenantId: number,
  fieldId: number,
  body: ProductCustomFieldWrite,
): Promise<ProductCustomFieldDto> {
  const res = await api.put<ProductCustomFieldDto>(`/product-custom-fields/${fieldId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteProductCustomField(tenantId: number, fieldId: number): Promise<void> {
  await api.delete(`/product-custom-fields/${fieldId}`, { params: { tenant_id: tenantId } });
}

export async function getProductCustomFieldsWithValues(
  tenantId: number,
  productId: number,
): Promise<ProductCustomFieldWithValue[]> {
  const res = await api.get<ProductCustomFieldWithValue[]>(`/products/${productId}/custom-fields`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function putProductCustomFieldValues(
  tenantId: number,
  productId: number,
  values: Array<{
    field_id: number;
    string_value?: string | null;
    number_value?: number | null;
    json_value?: unknown;
  }>,
): Promise<ProductCustomFieldWithValue[]> {
  const res = await api.put<ProductCustomFieldWithValue[]>(
    `/products/${productId}/custom-fields`,
    { values },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function uploadProductCustomFieldFile(
  tenantId: number,
  productId: number,
  fieldId: number,
  file: File,
): Promise<ProductCustomFieldFileMeta> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<ProductCustomFieldFileMeta>(
    `/products/${productId}/custom-fields/${fieldId}/files`,
    form,
    {
      params: { tenant_id: tenantId },
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return res.data;
}
