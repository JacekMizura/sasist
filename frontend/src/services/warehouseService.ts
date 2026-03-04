import api from "../api/axios";

export const warehouseService = {
  getWarehouses(tenantId: number) {
    return api.get(`/tenants/${tenantId}/warehouses/`);
  },

  createWarehouse(tenantId: number, data: { name: string }) {
    return api.post(`/tenants/${tenantId}/warehouses/`, data);
  },
};
