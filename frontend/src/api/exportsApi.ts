import api from "./axios";

export type ExportEntityType =
  | "products"
  | "sets"
  | "orders"
  | "cartons"
  | "suppliers"
  | "manufacturers"
  | "customers"
  | "label_templates";

export type ExportTemplateDto = {
  id: number;
  tenant_id: number;
  name: string;
  type: ExportEntityType;
  fields_json: string[];
  is_active: boolean;
  created_at: string | null;
};

const tenant = (tenantId: number) => ({ tenant_id: tenantId });

export async function listExportTemplates(tenantId: number): Promise<ExportTemplateDto[]> {
  const res = await api.get<ExportTemplateDto[]>("/exports/", { params: tenant(tenantId) });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createExportTemplate(
  tenantId: number,
  body: { name: string; type: ExportEntityType; fields_json: string[]; is_active?: boolean }
): Promise<ExportTemplateDto> {
  const res = await api.post<ExportTemplateDto>("/exports/", { tenant_id: tenantId, ...body });
  return res.data;
}

export async function updateExportTemplate(
  tenantId: number,
  id: number,
  body: Partial<{ name: string; type: ExportEntityType; fields_json: string[]; is_active: boolean }>
): Promise<ExportTemplateDto> {
  const res = await api.put<ExportTemplateDto>(`/exports/${id}`, body, { params: tenant(tenantId) });
  return res.data;
}

export async function deleteExportTemplate(tenantId: number, id: number): Promise<void> {
  await api.delete(`/exports/${id}`, { params: tenant(tenantId) });
}

export async function cloneExportTemplate(tenantId: number, id: number): Promise<ExportTemplateDto> {
  const res = await api.post<ExportTemplateDto>(`/exports/${id}/clone`, {}, { params: tenant(tenantId) });
  return res.data;
}

export async function runExportDownload(tenantId: number, templateId: number, ids: unknown[]): Promise<void> {
  const res = await api.post<Blob>(
    "/exports/run",
    { tenant_id: tenantId, template_id: templateId, ids },
    { responseType: "blob" }
  );
  const blob = res.data;
  const ctype = (res.headers["content-type"] as string | undefined) || "";
  const dispo = res.headers["content-disposition"] as string | undefined;
  let filename = ctype.includes("application/json") ? "label_templates.json" : "export.csv";
  if (dispo && dispo.includes("filename=")) {
    const m = /filename="?([^";]+)"?/i.exec(dispo);
    if (m?.[1]) filename = m[1];
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const EXPORT_FIELD_OPTIONS: Record<ExportEntityType, readonly string[]> = {
  products: ["id", "name", "sku", "ean", "price", "stock", "location", "category", "brand", "supplier", "created_at"],
  orders: [
    "id",
    "external_id",
    "customer",
    "email",
    "phone",
    "address",
    "status",
    "payment",
    "delivery",
    "created_at",
    "total",
  ],
  sets: ["set_sku", "set_name", "child_sku", "qty"],
  suppliers: [
    "id",
    "name",
    "code",
    "full_company_name",
    "tax_id",
    "email",
    "phone",
    "website",
    "logo",
    "description",
    "address_country",
    "address_city",
    "address_postal_code",
    "address_street",
    "address_building_number",
    "products_count",
    "products_list",
    "products_ids",
    "created_at",
    "updated_at",
    "address",
  ],
  manufacturers: [
    "id",
    "name",
    "code",
    "full_company_name",
    "tax_id",
    "email",
    "phone",
    "website",
    "logo",
    "description",
    "address_country",
    "address_city",
    "address_postal_code",
    "address_street",
    "address_building_number",
    "products_count",
    "products_list",
    "products_ids",
    "created_at",
    "updated_at",
  ],
  cartons: ["name", "width", "height", "depth", "weight"],
  customers: [
    "id",
    "first_name",
    "last_name",
    "email",
    "phone",
    "company_name",
    "nip",
    "city",
    "postal_code",
    "country",
    "created_at",
    "orders_count",
    "orders_total",
    "status",
  ],
  label_templates: [],
};
