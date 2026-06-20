import type { ProductListUiFilters } from "../../../pages/Products/productListUiFilters";
import { DEFAULT_PRODUCT_LIST_UI_FILTERS } from "../../../pages/Products/productListUiFilters";

export function countActiveProductListFilters(filters: ProductListUiFilters): number {
  let count = 0;
  if (filters.name.trim()) count += 1;
  if (filters.eanSku.trim()) count += 1;
  if (filters.stockMin.trim() || filters.stockMax.trim()) count += 1;
  if (filters.priceMin.trim() || filters.priceMax.trim()) count += 1;
  if (filters.weightMin.trim() || filters.weightMax.trim()) count += 1;
  if (filters.producer !== "all") count += 1;
  if (filters.status !== "all") count += 1;
  if (filters.hasLocations !== "all") count += 1;
  if (filters.mismatch !== "all") count += 1;
  return count;
}

export function productListFilterToggleLabel(activeCount: number): string {
  return activeCount > 0 ? `Filtry (${activeCount})` : "Filtry";
}

export { DEFAULT_PRODUCT_LIST_UI_FILTERS };
