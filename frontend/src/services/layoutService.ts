import api from "../api/axios";

export const layoutService = {
  getLayout(params?: { layout_id?: string | null; tenant_id?: number; warehouse_id?: number }) {
    return api.get("/warehouse/layout", { params });
  },

  /** Path must have no trailing slash (see `api/axios` — no auto-slash). */
  saveLayout(warehouseId: number, data: Record<string, unknown>, params?: { tenant_id: number }) {
    return api.put(`/warehouse/${warehouseId}/layout`, data, { params });
  },

  rebuildPreflight(
    params: { tenant_id: number; warehouse_id: number },
    body: { location_uuids: string[] }
  ) {
    return api.post<{
      blocked: boolean;
      active_operations: Array<{
        location_uuid: string;
        location_label: string;
        operation_type: string;
        document_number: string;
      }>;
    }>("/warehouse/layout/rebuild-preflight", body, { params });
  },
};
