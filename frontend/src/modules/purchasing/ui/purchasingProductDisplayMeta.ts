import api from "../../../api/axios";

export type ProductDisplayMeta = {
  name?: string | null;
  imageUrl?: string | null;
  ean?: string | null;
  sku?: string | null;
  category?: string | null;
  brand?: string | null;
};

export function resolveProductImageUrl(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  for (const key of ["image_url", "photo_url", "image"]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function categoryFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const o = meta as Record<string, unknown>;
  for (const key of ["category", "category_name", "kategoria", "product_category"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function brandFromPayload(p: Record<string, unknown>): string | null {
  const brief = p.manufacturer_brief;
  if (brief && typeof brief === "object") {
    const name = (brief as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  for (const key of ["manufacturer", "manufacturer_name", "brand"]) {
    const v = p[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function productDisplayMetaFromPayload(raw: Record<string, unknown>): ProductDisplayMeta {
  const symbol = raw.symbol ?? raw.sku;
  return {
    name: typeof raw.name === "string" ? raw.name : null,
    imageUrl: resolveProductImageUrl(raw),
    ean: typeof raw.ean === "string" ? raw.ean : null,
    sku: typeof symbol === "string" ? symbol : null,
    category: categoryFromMeta(raw.metadata_json),
    brand: brandFromPayload(raw),
  };
}

export async function fetchProductDisplayMeta(tenantId: number, productId: number): Promise<ProductDisplayMeta> {
  const res = await api.get<Record<string, unknown>>(`/products/${productId}/`, {
    params: { tenant_id: tenantId },
  });
  return productDisplayMetaFromPayload(res.data);
}
