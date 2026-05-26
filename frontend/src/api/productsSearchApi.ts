import api from "./axios";

export type ProductSearchHit = {
  id: number;
  name?: string | null;
  ean?: string | null;
  symbol?: string | null;
  sku?: string | null;
  sale_price?: number | null;
  unit?: string | null;
  metadata_json?: Record<string, unknown> | null;
  image_url?: string | null;
};

export async function searchProductsCatalog(
  tenantId: number,
  q: string,
  limit = 25,
): Promise<ProductSearchHit[]> {
  const term = q.trim();
  if (!term) return [];
  const res = await api.get<unknown>("/products/", {
    params: { tenant_id: tenantId, search: term, limit },
  });
  const data = res.data as ProductSearchHit[] | { items?: ProductSearchHit[] };
  const items = Array.isArray(data) ? data : data?.items;
  return Array.isArray(items) ? items : [];
}

/** Try common VAT keys from product metadata (catalog may vary). */
export function vatFromProductMetadata(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const o = meta as Record<string, unknown>;
  for (const k of ["vat_rate", "vat", "vat_percent", "VAT", "stawka_vat"]) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = parseFloat(v.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}
