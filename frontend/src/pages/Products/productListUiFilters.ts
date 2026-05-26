export type ProductListUiFilters = {
  name: string;
  eanSku: string;
  stockMin: string;
  stockMax: string;
  priceMin: string;
  priceMax: string;
  weightMin: string;
  weightMax: string;
  producer: string;
  status: "all" | "complete" | "incomplete";
  hasLocations: "all" | "with" | "without";
  mismatch: "all" | "yes" | "no";
};

export const DEFAULT_PRODUCT_LIST_UI_FILTERS: ProductListUiFilters = {
  name: "",
  eanSku: "",
  stockMin: "",
  stockMax: "",
  priceMin: "",
  priceMax: "",
  weightMin: "",
  weightMax: "",
  producer: "all",
  status: "all",
  hasLocations: "all",
  mismatch: "all",
};
