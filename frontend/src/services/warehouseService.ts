import api from "../api/axios";

export type Warehouse = {
  id: number;
  name: string;
  tenant_id?: number | null;
  address?: string | null;
  type?: string | null;
  requires_putaway?: boolean;
  created_at?: string;
};

export type TenantDto = {
  id: number;
  name: string;
  created_at: string;
  default_warehouse_id?: number | null;
};

export type TenantWarehouseAssignment = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  role: string;
  is_default: boolean;
  participates_in_network_stock?: boolean;
  fulfillment_eligible?: boolean;
  fulfillment_priority?: number;
};

export type TenantWarehouseAssignmentUpdate = {
  participates_in_network_stock?: boolean;
  fulfillment_eligible?: boolean;
  fulfillment_priority?: number;
};

export const ASSIGNMENT_ROLE_LABELS: Record<string, string> = {
  owner: "Właściciel",
  client: "Klient",
  operator: "Operator",
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

  updateWarehouse(warehouseId: number, data: { name?: string; requires_putaway?: boolean }) {
    return api.put<Warehouse>(`warehouses/${warehouseId}`, data);
  },

  getAssignments(params?: { tenant_id?: number; warehouse_id?: number }) {
    return api.get<TenantWarehouseAssignment[]>("/tenant-warehouses/", { params });
  },

  createAssignment(data: {
    tenant_id: number;
    warehouse_id: number;
    role?: string;
    is_default?: boolean;
    participates_in_network_stock?: boolean;
    fulfillment_eligible?: boolean;
    fulfillment_priority?: number;
  }) {
    return api.post<TenantWarehouseAssignment>("/tenant-warehouses/", data);
  },

  updateAssignment(assignmentId: number, data: TenantWarehouseAssignmentUpdate) {
    return api.patch<TenantWarehouseAssignment>(`/tenant-warehouses/${assignmentId}`, data);
  },

  listTenants() {
    return api.get<TenantDto[]>("/tenants/");
  },

  createTenant(name: string) {
    return api.post<TenantDto>("/tenants/", { name });
  },
};
