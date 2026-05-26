import api from "./axios";

export type SupplierProductLinkRead = {
  id: number;
  supplier_id: number;
  product_id: number;
  supplier_name: string;
  product_name: string;
  product_symbol?: string | null;
  purchase_price?: number | null;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  is_default_supplier: boolean;
};

export async function listSupplierProductLinks(
  tenantId: number,
  params: { supplier_id?: number; product_id?: number },
): Promise<SupplierProductLinkRead[]> {
  const res = await api.get<SupplierProductLinkRead[]>("/supplier-product-links/", {
    params: {
      tenant_id: tenantId,
      supplier_id: params.supplier_id,
      product_id: params.product_id,
    },
  });
  return res.data;
}

export async function createSupplierProductLink(payload: {
  tenant_id: number;
  supplier_id: number;
  product_id: number;
  purchase_price?: number | null;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
}): Promise<SupplierProductLinkRead> {
  const res = await api.post<SupplierProductLinkRead>("/supplier-product-links/", payload);
  return res.data;
}

export async function patchSupplierProductLink(
  tenantId: number,
  linkId: number,
  body: { purchase_price?: number | null; lead_time_days?: number | null; min_order_qty?: number | null },
): Promise<SupplierProductLinkRead> {
  const res = await api.patch<SupplierProductLinkRead>(`/supplier-product-links/${linkId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteSupplierProductLink(tenantId: number, linkId: number): Promise<{ deleted: boolean }> {
  const res = await api.delete<{ deleted: boolean }>(`/supplier-product-links/${linkId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
