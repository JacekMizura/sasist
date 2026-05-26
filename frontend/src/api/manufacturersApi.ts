import api from "./axios";

export type ManufacturerRead = {
  id: number;
  tenant_id: number;
  name: string;
  company_name?: string | null;
  tax_id?: string | null;
  logo_url?: string | null;
  country?: string | null;
  city?: string | null;
  postal_code?: string | null;
  street?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  active: boolean;
  responsible_person_name?: string | null;
  responsible_person_email?: string | null;
  /** Count of products where manufacturer_id = this producer (not inventory-based). */
  product_count: number;
  /** Sum of inventory.quantity for those products — use e.g. in modal Statystyki, not as product_count. */
  total_inventory_quantity?: number;
  /** Products among the above with zero or missing inventory quantity. */
  out_of_stock_product_count?: number;
};

export type ManufacturerProductBrief = {
  id: number;
  name?: string | null;
  symbol?: string | null;
  ean?: string | null;
};

export type ManufacturerDetailRead = ManufacturerRead & {
  products: ManufacturerProductBrief[];
  total_inventory_quantity?: number;
  out_of_stock_product_count?: number;
};

export type ManufacturerCreatePayload = {
  tenant_id: number;
  name: string;
  company_name?: string | null;
  tax_id?: string | null;
  logo_url?: string | null;
  country?: string | null;
  city?: string | null;
  postal_code?: string | null;
  street?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  active?: boolean;
  responsible_person_name?: string | null;
  responsible_person_email?: string | null;
};

export type ManufacturerUpdatePayload = Omit<ManufacturerCreatePayload, "tenant_id">;

export type ManufacturerListParams = {
  tenantId: number;
  name?: string;
  country?: string;
  status?: "all" | "active" | "inactive";
  sortBy?: "name" | "product_count";
  sortDir?: "asc" | "desc";
};

export async function listManufacturers(params: ManufacturerListParams): Promise<ManufacturerRead[]> {
  const { tenantId, name, country, status = "all", sortBy = "name", sortDir = "asc" } = params;
  const res = await api.get<ManufacturerRead[]>("/manufacturers/", {
    params: {
      tenant_id: tenantId,
      name: name?.trim() || undefined,
      country: country?.trim() || undefined,
      status,
      sort_by: sortBy,
      sort_dir: sortDir,
    },
  });
  return res.data;
}

export async function getManufacturer(
  tenantId: number,
  id: number,
  productsLimit = 500,
): Promise<ManufacturerDetailRead> {
  const res = await api.get<ManufacturerDetailRead>(`/manufacturers/${id}`, {
    params: { tenant_id: tenantId, products_limit: productsLimit },
  });
  return res.data;
}

export async function createManufacturer(payload: ManufacturerCreatePayload): Promise<ManufacturerRead> {
  const res = await api.post<ManufacturerRead>("/manufacturers/", payload);
  return res.data;
}

export async function updateManufacturer(
  tenantId: number,
  id: number,
  payload: ManufacturerUpdatePayload,
): Promise<ManufacturerRead> {
  const res = await api.put<ManufacturerRead>(`/manufacturers/${id}`, payload, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type ManufacturerSupplierBrief = {
  supplier_id: number;
  name: string;
  active: boolean;
  linked_product_count: number;
};

export async function listManufacturerSuppliers(tenantId: number, manufacturerId: number): Promise<ManufacturerSupplierBrief[]> {
  const res = await api.get<ManufacturerSupplierBrief[]>(`/manufacturers/${manufacturerId}/suppliers`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type ManufacturerDeleteResult =
  | { deleted: true; product_count: number }
  | { deactivated: true; product_count: number; detail: string };

export async function deleteManufacturer(tenantId: number, id: number): Promise<ManufacturerDeleteResult> {
  const res = await api.delete<ManufacturerDeleteResult>(`/manufacturers/${id}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
