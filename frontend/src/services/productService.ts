import api from "../api/axios";

export const productService = {
  getProducts(params?: Record<string, string | number>) {
    return api.get("/products/", { params });
  },

  createProduct(data: Record<string, unknown>, params?: { tenant_id: number }) {
    return api.post("/products/", data, { params });
  },

  updateProduct(id: number | string, data: Record<string, unknown>, params?: { tenant_id: number }) {
    return api.put(`/products/${id}/`, data, { params });
  },

  deleteBulk(tenantId: number, ids: number[]) {
    return api.delete(`/products/bulk?tenant_id=${tenantId}&ids=${ids.join(",")}`);
  },
};
