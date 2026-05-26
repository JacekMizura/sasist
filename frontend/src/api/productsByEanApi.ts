import axios from "axios";
import api from "./axios";

/**
 * Dokładne dopasowanie ``Product.ean`` — ``GET /products/by-ean/{ean}``.
 * 404 / 409 → null (fallback do wyszukiwania).
 */
export async function getProductIdByExactEan(tenantId: number, ean: string): Promise<number | null> {
  const code = String(ean ?? "").trim();
  if (!code) return null;
  try {
    const res = await api.get<{ id: number }>(`/products/by-ean/${encodeURIComponent(code)}`, {
      params: { tenant_id: tenantId },
    });
    const id = Number(res.data?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const st = e.response?.status;
      if (st === 404 || st === 409) return null;
    }
    throw e;
  }
}
