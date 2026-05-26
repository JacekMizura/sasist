/** Mirrors backend ``ProductBulkListFilters`` (POST /products/bulk-*). */
export type ProductBulkListFiltersPayload = {
  manufacturer_id?: number | null;
  name?: string | null;
  ean?: string | null;
  symbol?: string | null;
  search?: string | null;
  volume_min?: number | null;
  volume_max?: number | null;
  weight_min?: number | null;
  weight_max?: number | null;
  default_supplier_id?: number | null;
};

type EanSymbol = { ean?: string; symbol?: string };

/** Same heuristic as ProductList ``serverParamsFromEanSku``. */
export function serverParamsFromEanSku(q: string): EanSymbol {
  const t = q.trim().replace(/\s+/g, "");
  if (!t) return {};
  if (/^\d+$/.test(t) && t.length >= 4) return { ean: t };
  return { symbol: t };
}

export function buildProductBulkListFiltersPayload(input: {
  manufacturerId: number | null;
  name: string;
  eanSku: string;
}): ProductBulkListFiltersPayload {
  const o: ProductBulkListFiltersPayload = {};
  if (input.manufacturerId != null) o.manufacturer_id = input.manufacturerId;
  if (input.name.trim()) o.name = input.name.trim();
  const { ean, symbol } = serverParamsFromEanSku(input.eanSku);
  if (ean) o.ean = ean;
  if (symbol) o.symbol = symbol;
  return o;
}
