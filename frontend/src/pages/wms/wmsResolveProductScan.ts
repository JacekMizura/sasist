import api from "../../api/axios";
import { getProductIdByExactEan } from "../../api/productsByEanApi";
import { classifyWmsScanCode } from "../../utils/wmsScanClassify";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";

type ProductRow = { id?: unknown; ean?: string | null; symbol?: string | null; sku?: string | null };

/** Rozpoznanie produktu po skanie (EAN / SKU / symbol / id) — lekki GET /products/?search=. */
export async function resolveWmsProductIdFromScan(
  tenantId: number,
  raw: string,
): Promise<{ ok: true; productId: number } | { ok: false; reason: "not_found" | "ambiguous"; count?: number }> {
  const s = normalizeScanEan(raw);
  if (!s) return { ok: false, reason: "not_found" };

  if (classifyWmsScanCode(s) === "ean_gtin") {
    const id = await getProductIdByExactEan(tenantId, s);
    if (id != null) return { ok: true, productId: id };
  }

  const res = await api.get<unknown>("/products/", {
    params: { tenant_id: tenantId, search: s, limit: 25 },
  });
  const rows = Array.isArray(res.data) ? res.data : [];
  const list = rows as ProductRow[];

  const byEan = list.find((p) => normalizeScanEan(String(p.ean ?? "")) === s);
  if (byEan?.id != null && Number.isFinite(Number(byEan.id))) {
    return { ok: true, productId: Number(byEan.id) };
  }

  const up = s.toUpperCase();
  const bySku = list.find((p) => String(p.symbol ?? p.sku ?? "").toUpperCase() === up);
  if (bySku?.id != null && Number.isFinite(Number(bySku.id))) {
    return { ok: true, productId: Number(bySku.id) };
  }

  const n = Number(s);
  if (Number.isFinite(n) && n > 0) {
    const byId = list.find((p) => Number(p.id) === n);
    if (byId?.id != null) return { ok: true, productId: n };
  }

  if (list.length === 1 && list[0]?.id != null) {
    return { ok: true, productId: Number(list[0].id) };
  }
  if (list.length > 1) return { ok: false, reason: "ambiguous", count: list.length };
  return { ok: false, reason: "not_found" };
}

/**
 * Ścieżka podglądu WMS: najpierw dokładny EAN (gdy wygląda jak GTIN), potem wyszukiwanie jak dotąd.
 */
export async function resolveWmsPreviewScanToProductId(
  tenantId: number,
  raw: string,
): Promise<{ ok: true; productId: number } | { ok: false; reason: "not_found" | "ambiguous"; count?: number }> {
  const s = normalizeScanEan(raw);
  if (!s) return { ok: false, reason: "not_found" };

  if (classifyWmsScanCode(s) === "ean_gtin") {
    const id = await getProductIdByExactEan(tenantId, s);
    if (id != null) return { ok: true, productId: id };
  }

  return resolveWmsProductIdFromScan(tenantId, s);
}
