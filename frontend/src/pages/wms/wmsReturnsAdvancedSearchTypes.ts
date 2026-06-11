export type WmsReturnsAdvancedSearchFilters = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  orderNumber: string;
  trackingNumber: string;
  rmzNumber: string;
  dateFrom: string;
  dateTo: string;
};

export const EMPTY_WMS_RETURNS_ADVANCED_FILTERS: WmsReturnsAdvancedSearchFilters = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  orderNumber: "",
  trackingNumber: "",
  rmzNumber: "",
  dateFrom: "",
  dateTo: "",
};

export function wmsReturnsAdvancedSearchHasCriteria(filters: WmsReturnsAdvancedSearchFilters): boolean {
  return Object.values(filters).some((v) => String(v ?? "").trim() !== "");
}
