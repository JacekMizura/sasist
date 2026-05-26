import api from "../api/axios";

export const layoutService = {
  getLayout(params?: { layout_id?: string | null; tenant_id?: number; warehouse_id?: number }) {
    return api.get("/warehouse/layout", { params });
  },

  /** Path must have no trailing slash (see `api/axios` — no auto-slash). */
  saveLayout(warehouseId: number, data: Record<string, unknown>, params?: { tenant_id: number }) {
    return api.put(`/warehouse/${warehouseId}/layout`, data, { params });
  },
};
