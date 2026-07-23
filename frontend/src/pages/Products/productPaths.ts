/**
 * Canonical Assortment product card route — full edit/detail page (not the legacy slim view).
 * Local catalog ``product.id`` only (never Sellasist/external IDs).
 */

export type ProductDetailsPathOptions = {
  tenantId?: number | null;
  /** Query ``tab`` (e.g. ``wms-validation`` → settings). */
  tab?: string | null;
};

export type ProductDetailsNavState = {
  tenantId?: number;
  warehouseId?: number;
  listStockQuantity?: number;
  /** Optional return path for back navigation (e.g. inventory document). */
  returnTo?: string;
};

/** Full product card in Asortyment: ``/products/:id/edit``. */
export function getProductDetailsPath(
  productId: number | string | null | undefined,
  opts?: ProductDetailsPathOptions,
): string {
  const id = Number(productId);
  if (!Number.isFinite(id) || id < 1) {
    return "/products/list";
  }
  const params = new URLSearchParams();
  if (opts?.tenantId != null && Number.isFinite(opts.tenantId) && Number(opts.tenantId) >= 1) {
    params.set("tenant_id", String(opts.tenantId));
  }
  const tab = (opts?.tab ?? "").trim();
  if (tab) params.set("tab", tab);
  const qs = params.toString();
  return `/products/${id}/edit${qs ? `?${qs}` : ""}`;
}

export function productDetailsNavState(
  opts?: ProductDetailsNavState | null,
): ProductDetailsNavState | undefined {
  if (!opts) return undefined;
  const out: ProductDetailsNavState = {};
  if (opts.tenantId != null && Number.isFinite(opts.tenantId) && opts.tenantId >= 1) {
    out.tenantId = opts.tenantId;
  }
  if (opts.warehouseId != null && Number.isFinite(opts.warehouseId) && opts.warehouseId >= 1) {
    out.warehouseId = opts.warehouseId;
  }
  if (opts.listStockQuantity != null && Number.isFinite(opts.listStockQuantity)) {
    out.listStockQuantity = opts.listStockQuantity;
  }
  if (opts.returnTo?.trim()) {
    out.returnTo = opts.returnTo.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
