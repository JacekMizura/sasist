import api from "./axios";

export type ShippingMethodDto = {
  id: string;
  tenant_id: number;
  warehouse_id: number;
  code: string;
  name: string;
  aliases: string[];
  logo_url: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function getShippingMethods(params: {
  tenant_id: number;
  warehouse_id: number;
  active_only?: boolean;
}): Promise<ShippingMethodDto[]> {
  const res = await api.get<ShippingMethodDto[]>("/shipping-methods/", {
    params: {
      tenant_id: params.tenant_id,
      warehouse_id: params.warehouse_id,
      active_only: params.active_only ?? false,
    },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createShippingMethod(payload: {
  tenant_id: number;
  warehouse_id: number;
  code: string;
  name: string;
  aliases?: string[];
  logo_url?: string | null;
  is_active?: boolean;
}): Promise<ShippingMethodDto> {
  const res = await api.post<ShippingMethodDto>("/shipping-methods/", payload);
  return res.data;
}

export async function updateShippingMethod(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
  payload: {
    code?: string;
    name?: string;
    aliases?: string[];
    logo_url?: string | null;
    is_active?: boolean;
  },
): Promise<ShippingMethodDto> {
  const res = await api.put<ShippingMethodDto>(`/shipping-methods/${id}/`, payload, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}

export async function deleteShippingMethod(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
): Promise<void> {
  await api.delete(`/shipping-methods/${id}/`, { params });
}
