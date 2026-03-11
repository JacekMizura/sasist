import api from "../api/axios";

export type Warehouse = { id: number; name: string; tenant_id?: number | null };
export type Tenant = { id: number; name: string };
export type TenantWarehouseAssignment = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  role: string;
  is_default: boolean;
};

export const warehouseService = {
  getWarehouses(tenantId: number) {
    return api.get<Warehouse[]>(`/tenants/${tenantId}/warehouses/`);
  },

  createWarehouse(tenantId: number, data: { name: string }) {
    return api.post<Warehouse>(`/tenants/${tenantId}/warehouses/`, data);
  },

  getAllWarehouses() {
    return api.get<Warehouse[]>("/warehouses/");
  },

  createWarehouseStandalone(data: { name: string; owner_tenant_id?: number }) {
    return api.post<Warehouse>("/warehouses/", data);
  },

  getAssignments(params?: { tenant_id?: number; warehouse_id?: number }) {
    return api.get<TenantWarehouseAssignment[]>("/tenant-warehouses/", { params });
  },

  createAssignment(data: {
    tenant_id: number;
    warehouse_id: number;
    role?: string;
    is_default?: boolean;
  }) {
    return api.post<TenantWarehouseAssignment>("/tenant-warehouses/", data);
  },
};
